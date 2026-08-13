/* =====================================================================
   결제창 페이지 — /pay?order=<주문번호>
   ---------------------------------------------------------------------
   토스 결제창은 브라우저에서 SDK로 열어야 한다(카드사 앱·인증 창 때문에 서버가 대신 못 연다).
   그래서 이 페이지가 필요하다. 하는 일은 셋뿐이다.
     ① 주문번호로 서버에 물어 상품명·금액을 가져온다 (브라우저가 보낸 값을 쓰지 않는다)
     ② 토스 SDK로 결제창을 연다
     ③ 결과는 successUrl(/api/confirm) 이 받아서 서버가 승인한다

   ★ 여기 들어가는 것은 클라이언트 키(TOSS_CLIENT_KEY)뿐이다. 원래 브라우저에 공개되는 값이라
     노출돼도 결제를 조작할 수 없다. 시크릿 키는 이 페이지에 절대 오지 않는다.
   ★ 금액을 화면에서 만들지 않는다. 서버 원장의 값을 그대로 읽어서 표시하고 그대로 요청한다.
     화면에 적힌 금액과 실제 청구액이 다르면 그 자체가 사고다.
   ★ 결제창을 iframe 안에서 부르지 않는다(토스 문서 경고 — 모바일에서 일부 수단이 동작하지 않는다).

   ★ 앱(fortune.html)의 디자인 토큰을 그대로 옮겨 왔다. 결제 직전에 화면 분위기가 바뀌면
     "다른 사이트로 넘어간 건가" 싶어 이탈한다. 색·모서리·글꼴을 같은 값으로 맞춘다.
===================================================================== */
import { getOrder } from './_lib/store.js';
import { productOf } from './_lib/products.js';
import { COMPANY, isTossTestKey } from './_lib/company.js';

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function page({ body, title }) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<style>
  /* ★ fortune.html 의 값을 그대로 옮겼다. 예전에는 베이지(#F3F0E9)였는데, 앱이 분홍으로
     바뀐 뒤에도 여기가 그대로여서 결제 직전에 "다른 사이트로 넘어왔나" 싶은 화면이 됐다
     (외부 실사 지적). 소액결제에서 손님이 가장 많이 빠져나가는 지점이다. */
  :root{ --base:#FFF7F9; --panel:#FFFFFF; --ink:#2A1F24; --ink-dim:#4E3D46;
         --gold:#98003C; --line:rgba(247,99,145,.30); --gold-soft:rgba(247,99,145,.055); }
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
  body{background:var(--base);color:var(--ink);min-height:100vh;line-height:1.75;
    font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Pretendard","Malgun Gothic",sans-serif;
    display:flex;align-items:center;justify-content:center;padding:24px;}
  .card{background:var(--panel);border-radius:18px;box-shadow:0 6px 24px rgba(88,68,22,.10);
    padding:28px 22px;max-width:420px;width:100%;text-align:center;}
  h1{font-size:1.15rem;margin-bottom:6px;}
  .sub{font-size:.86rem;color:var(--ink-dim);margin-bottom:20px;}
  .row{display:flex;justify-content:space-between;gap:10px;padding:12px 0;border-top:1px dashed var(--line);font-size:.92rem;text-align:left;}
  .row:last-of-type{border-bottom:1px dashed var(--line);margin-bottom:20px;}
  .row .v{font-weight:700;color:var(--gold);white-space:nowrap;}
  button{width:100%;padding:15px;border:0;border-radius:12px;background:var(--gold);color:#FCFAF6;
    font-size:1rem;font-weight:700;cursor:pointer;font-family:inherit;}
  button:disabled{opacity:.45;cursor:default;}
  .ghost{background:none;color:var(--ink-dim);font-weight:400;font-size:.85rem;margin-top:10px;text-decoration:underline;}
  .err{color:#8F2413;font-size:.88rem;margin-top:14px;}
  .note{font-size:.76rem;color:var(--ink-dim);margin-top:18px;}
  /* 브랜드 — 여기가 우리 화면이라는 것을 한눈에 알리는 자리 */
  .brand{display:flex;align-items:center;justify-content:center;gap:7px;margin-bottom:14px;}
  .brand span{font-size:1.05rem;font-weight:800;color:var(--gold);letter-spacing:-.02em;}
  /* 테스트 키일 때만 뜨는 띠 — 눈에 안 띄면 뜻이 없으므로 맨 위에 크게 */
  .testbar{background:#8F2413;color:#fff;border-radius:12px;padding:12px 14px;margin-bottom:16px;
    font-size:.86rem;font-weight:700;line-height:1.6;text-align:left;}
  .testbar b{display:block;font-size:.95rem;margin-bottom:4px;}
  /* 법정 표시사항 — 전자상거래법 제13조 */
  .legal{margin-top:20px;padding-top:14px;border-top:1px solid var(--line);
    font-size:.7rem;color:var(--ink-dim);line-height:1.7;text-align:left;}
  .legal b{color:var(--ink);}
</style></head><body><div class="card">${body}</div></body></html>`;
}

/* 앱 로고와 같은 하트 모양. 파일을 부르지 않고 그려 넣는다 — 결제 페이지가 바깥 요청을
   하나라도 더 하면 그만큼 느려지고, 막히면 브랜드가 통째로 사라진다. */
const LOGO = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">'
  + '<path d="M12 21s-7.5-4.7-9.3-9.2C1.2 8.1 3.4 4.5 7 4.5c2 0 3.7 1.1 5 2.8 1.3-1.7 3-2.8 5-2.8'
  + ' 3.6 0 5.8 3.6 4.3 7.3C19.5 16.3 12 21 12 21z" stroke="#98003C" stroke-width="1.7"'
  + ' stroke-linejoin="round"/></svg>';

const BRAND = '<div class="brand">' + LOGO + '<span>' + COMPANY.serviceName + '</span></div>';

/* 전자상거래법 제13조 표시의무 — 청약을 받는 화면에 있어야 한다.
   앱 맨 아래에만 있고 정작 돈 내는 화면에 없으면 지킨 것이 아니다. */
const LEGAL = '<div class="legal">'
  + '<b>' + COMPANY.legalName + '</b> · 대표 ' + COMPANY.ceo + '<br>'
  + '사업자등록번호 ' + COMPANY.bizRegNo + ' · 통신판매업신고 ' + COMPANY.mailOrderNo + '<br>'
  + COMPANY.address + '<br>'
  + COMPANY.supportPhone + ' · ' + COMPANY.supportEmail + '<br><br>'
  + '<b>청약철회 안내</b> — 결제 후 콘텐츠를 열어보지 않으셨다면 7일 이내에 청약철회하실 수 있습니다. '
  + '열어보신 콘텐츠는 전자상거래법 제17조 제2항에 따라 청약철회가 제한됩니다. '
  + '자세한 내용은 앱의 이용약관에서 보실 수 있어요.'
  + '</div>';

function errorPage(res, status, message) {
  res.status(status);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.send(page({
    title: '결제를 열 수 없어요',
    body: `${BRAND}<h1>결제를 열 수 없어요</h1>
      <p class="sub">${esc(message)}</p>
      <button onclick="location.href='/fortune.html'">앱으로 돌아가기</button>`,
  }));
}

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const orderId = url.searchParams.get('order');
  if (!orderId) return errorPage(res, 400, '주문 정보가 없습니다.');

  let order;
  try {
    order = await getOrder(orderId);
  } catch (err) {
    console.error('pay 조회 실패:', err?.message);
    return errorPage(res, 500, '주문을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
  if (!order) return errorPage(res, 404, '주문을 찾을 수 없습니다.');
  if (order.status === 'paid') {
    res.statusCode = 302;
    res.setHeader('Location', `/fortune.html?receipt=${encodeURIComponent(orderId)}&product=${encodeURIComponent(order.product_id)}`);
    return res.end();
  }
  if (order.status !== 'created') return errorPage(res, 409, '이미 처리된 주문입니다.');

  const product = productOf(order.product_id);
  if (!product) return errorPage(res, 409, '판매하지 않는 상품입니다.');

  const clientKey = process.env.TOSS_CLIENT_KEY;
  if (!clientKey) {
    console.error('TOSS_CLIENT_KEY 환경변수가 없습니다.');
    return errorPage(res, 503, '결제 준비가 끝나지 않았습니다.');
  }

  const amount = order.amount; /* ★ 서버 원장의 값 */

  /* ★ 테스트 키면 그 사실을 맨 위에 크게 알린다 (외부 실사 지적).
     이 안내가 없으면 손님은 토스 결제창에 들어가서야 테스트인 걸 알게 되고,
     그 전까지 카드번호와 주민등록번호를 진짜 결제인 줄 알고 입력한다. */
  const testBar = isTossTestKey()
    ? `<div class="testbar"><b>테스트 결제입니다 — 실제로 결제되지 않습니다</b>
       실제 카드로는 결제가 되지 않습니다. <u>카드번호나 주민등록번호를 넣지 마세요.</u>
       판매 준비 중이며, 정식으로 열리면 이 안내가 사라집니다.</div>`
    : '';

  res.status(200);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.send(page({
    title: `${product.name} 결제`,
    body: `
      ${BRAND}
      ${testBar}
      <h1>${esc(product.name)}</h1>
      <p class="sub">결제가 끝나면 앱으로 자동으로 돌아옵니다.</p>
      <div class="row"><span>상품</span><span>${esc(product.name)}</span></div>
      <div class="row"><span>결제 금액</span><span class="v">${amount.toLocaleString('ko-KR')}원</span></div>
      <button id="payBtn">${amount.toLocaleString('ko-KR')}원 결제하기</button>
      <button class="ghost" onclick="location.href='/fortune.html'">취소하고 돌아가기</button>
      <p class="err" id="err" hidden></p>
      <p class="note">결제 후 나오는 <b>영수증 번호</b>를 저장해 두세요. 브라우저 데이터를 지우거나 기기를 바꿨을 때 그 번호로 이용권을 되살릴 수 있습니다.</p>
      ${LEGAL}
      <script src="https://js.tosspayments.com/v2/standard"></script>
      <script>
        (function(){
          var btn = document.getElementById('payBtn');
          var errBox = document.getElementById('err');
          function showErr(m){ errBox.textContent = m; errBox.hidden = false; btn.disabled = false; }
          var payment;
          try{
            /* 로그인이 없는 앱이라 비회원 결제로 연다. */
            payment = TossPayments(${JSON.stringify(clientKey)}).payment({ customerKey: TossPayments.ANONYMOUS });
          }catch(e){ showErr('결제 모듈을 불러오지 못했어요. 새로고침해 주세요.'); return; }

          btn.addEventListener('click', function(){
            btn.disabled = true; errBox.hidden = true;
            payment.requestPayment({
              method: 'CARD',
              amount: { currency: 'KRW', value: ${amount} },
              orderId: ${JSON.stringify(orderId)},
              orderName: ${JSON.stringify(product.name)},
              successUrl: window.location.origin + '/api/confirm',
              failUrl: window.location.origin + '/api/payfail',
              card: { useEscrow: false, flowMode: 'DEFAULT', useCardPoint: false, useAppCardOnly: false }
            }).catch(function(err){
              /* 사용자가 창을 닫은 경우도 여기로 온다 — 그건 오류가 아니므로 조용히 되돌린다. */
              if(err && (err.code === 'USER_CANCEL' || err.code === 'PAY_PROCESS_CANCELED')){ btn.disabled = false; return; }
              showErr((err && err.message) || '결제를 시작하지 못했어요.');
            });
          });
        })();
      </script>`,
  }));
}
