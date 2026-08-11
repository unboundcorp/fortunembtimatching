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

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function page({ body, title }) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<style>
  :root{ --base:#F3F0E9; --panel:#FCFAF6; --ink:#231F18; --ink-dim:#494334; --gold:#584416; --line:rgba(88,68,22,.28); }
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
</style></head><body><div class="card">${body}</div></body></html>`;
}

function errorPage(res, status, message) {
  res.status(status);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.send(page({
    title: '결제를 열 수 없어요',
    body: `<h1>결제를 열 수 없어요</h1>
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

  res.status(200);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.send(page({
    title: `${product.name} 결제`,
    body: `
      <h1>${esc(product.name)}</h1>
      <p class="sub">결제가 끝나면 앱으로 자동으로 돌아옵니다.</p>
      <div class="row"><span>상품</span><span>${esc(product.name)}</span></div>
      <div class="row"><span>결제 금액</span><span class="v">${amount.toLocaleString('ko-KR')}원</span></div>
      <button id="payBtn">${amount.toLocaleString('ko-KR')}원 결제하기</button>
      <button class="ghost" onclick="location.href='/fortune.html'">취소하고 돌아가기</button>
      <p class="err" id="err" hidden></p>
      <p class="note">결제 후 나오는 <b>영수증 번호</b>를 저장해 두세요. 브라우저 데이터를 지우거나 기기를 바꿨을 때 그 번호로 이용권을 되살릴 수 있습니다.</p>
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
