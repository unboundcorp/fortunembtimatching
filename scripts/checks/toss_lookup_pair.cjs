#!/usr/bin/env node
/* =====================================================================
   토스 결제 조회 — 운영자 [주문 확인] 의 짝 (빠른 층 · 가짜 토스로 실제 함수를 돌린다)
   ---------------------------------------------------------------------
   2026-09-22 첫 실결제가 INVALID_UNREGISTERED_SUBMALL 로 거절됐는데 우리 기록에는 오류 코드뿐이라
   결제수단·카드사를 알 길이 없었다(대표님이 "국민 페이로 했다"고 알려 주셔야 했다). 그래서
   api/_lib/toss.js 의 lookupPaymentByOrder 가 GET /v1/payments/orders/{orderId} 를 읽어
   api/stats.js action:'order' 가 함께 내려준다.

   여기서 보는 것
   ① 함수가 토스 주문 조회 주소를 GET 으로, 시크릿 키 Basic 헤더로 부른다 (주문번호는 URL 인코딩)
   ② 응답을 운영자용으로 추린다 — 카드사 코드 → 이름(11=KB국민카드 · W1=우리카드 · 모르면 코드 그대로) ·
      실패 사유 · 간편결제사
   ③ 404/오류면 found:false + 토스 코드 (터뜨리지 않는다)
   ④ **돌려주는 값에 시크릿 키가 한 글자도 없다**
   ⑤ 승인(confirmPayment)은 그대로다 — 조회를 붙이면서 승인 경로를 건드리지 않았다
   ⑥ stats.js 가 운영자 관문 **뒤**에서 부르고, 화면이 그 값을 실제로 그린다(소스)
===================================================================== */
const fs = require('fs');
const path = require('path');
const { ROOT, reporter } = require('../_lib.cjs');

const R = reporter('토스 결제 조회');
const SECRET = 'live_sk_FAKE_' + 'x'.repeat(24);

(async function(){
  process.env.TOSS_SECRET_KEY = SECRET;
  const calls = [];
  let mode = 'aborted';
  globalThis.fetch = async (url, opt) => {
    calls.push({ url: String(url), opt: opt || {} });
    if(mode === '404') return { ok:false, status:404, json: async () => ({ code:'NOT_FOUND_PAYMENT', message:'존재하지 않는 결제 정보 입니다.' }) };
    if(mode === 'garbage') return { ok:false, status:500, json: async () => { throw new Error('no json'); } };
    if(mode === 'done') return { ok:true, status:200, json: async () => ({
      status:'DONE', method:'카드', requestedAt:'2026-09-22T20:33:50+09:00', approvedAt:'2026-09-22T20:36:39+09:00',
      totalAmount:1900, card:{ issuerCode:'W1', acquirerCode:'31', number:'5310****1234', cardType:'체크', ownerType:'개인', approveNo:'12345678' },
      easyPay:{ provider:'토스페이', amount:0 }, failure:null, receipt:{ url:'https://dashboard.tosspayments.com/receipt/x' } }) };
    return { ok:true, status:200, json: async () => ({
      mId:'inyeon_test_mid', status:'ABORTED', method:'카드', requestedAt:'2026-09-22T20:33:50+09:00', approvedAt:null, totalAmount:1900,
      card:{ issuerCode:'11', acquirerCode:'11', number:'9410****0001', cardType:'신용', ownerType:'개인', approveNo:'' },
      easyPay:null, failure:{ code:'INVALID_UNREGISTERED_SUBMALL', message:'등록되지 않은 서브몰입니다.' }, receipt:null }) };
  };

  let m;
  try{ m = await import('file://' + path.join(ROOT, 'api/_lib/toss.js')); }
  catch(e){ R.bad('toss.js 를 못 불러옴', String(e && e.message).slice(0,120)); R.done(); return; }

  R.head('── ① 부르는 모양');
  R.note(typeof m.lookupPaymentByOrder === 'function', 'lookupPaymentByOrder 가 내보내진다');
  R.note(typeof m.confirmPayment === 'function', 'confirmPayment 가 그대로 있다');
  const ORDER = 'Rr_WGc-V5oJ/특수 문자';
  const a = await m.lookupPaymentByOrder(ORDER);
  const c = calls[calls.length - 1];
  R.note(c && c.url === 'https://api.tosspayments.com/v1/payments/orders/' + encodeURIComponent(ORDER),
         '토스 주문 조회 주소를 부르고 주문번호를 URL 인코딩한다', c && c.url);
  R.note(c && String(c.opt.method).toUpperCase() === 'GET', 'GET 이다', c && c.opt.method);
  const auth = c && c.opt.headers && (c.opt.headers.Authorization || c.opt.headers.authorization);
  R.note(auth === 'Basic ' + Buffer.from(SECRET + ':').toString('base64'), '시크릿 키를 Basic 헤더로 보낸다 (키 뒤에 콜론)');
  R.note(!c.opt.body, '본문을 보내지 않는다 (읽기만)');

  R.head('── ② 추리기 — 승인 실패 건');
  R.note(a && a.found === true && a.payment, 'found:true 와 payment 를 돌려준다');
  const p = a && a.payment || {};
  R.note(p.status === 'ABORTED', '상태 ABORTED 가 그대로 온다', p.status);
  R.note(p.mId === 'inyeon_test_mid', '어느 MID 로 나갔는지(mId) 가 온다', p.mId);
  R.note(p.card && p.card.issuer === 'KB국민카드(11)', '카드사 코드 11 → KB국민카드(11)', p.card && p.card.issuer);
  R.note(p.failure && p.failure.code === 'INVALID_UNREGISTERED_SUBMALL' && /서브몰/.test(p.failure.message),
         '실패 코드와 문장이 온다', JSON.stringify(p.failure));
  R.note(p.easyPay === null, '간편결제가 아니면 null', JSON.stringify(p.easyPay));
  R.note(p.receiptUrl === '', '영수증이 없으면 빈 문자열');

  R.head('── ③ 추리기 — 승인 완료 · 간편결제 · 매입사 다름');
  mode = 'done';
  const b = await m.lookupPaymentByOrder('ORD-DONE');
  const q = b && b.payment || {};
  R.note(q.status === 'DONE' && q.approvedAt === '2026-09-22T20:36:39+09:00', '승인 완료 건의 승인 시각', q.approvedAt);
  R.note(q.card && q.card.issuer === '우리카드(W1)' && q.card.acquirer === 'BC카드(31)', '발급사 W1 · 매입사 31 을 각각 이름으로', JSON.stringify(q.card));
  R.note(q.easyPay && q.easyPay.provider === '토스페이', '간편결제사 이름이 온다', JSON.stringify(q.easyPay));
  R.note(q.failure === null, '실패가 없으면 null');
  R.note(q.receiptUrl === 'https://dashboard.tosspayments.com/receipt/x', '영수증 주소가 온다');
  R.note(m.cardCompanyName('ZZ') === 'ZZ', '모르는 카드사 코드는 코드 그대로 (지어내지 않는다)', m.cardCompanyName('ZZ'));
  R.note(m.cardCompanyName('') === '', '코드가 없으면 빈 문자열');
  const known = ['11','41','51','61','71','21','91','31','33','W1','15','24','3A','4V','4M'];
  R.note(known.every(k => m.CARD_COMPANY[k]), '주요 카드사 코드 ' + known.length + '개가 표에 있다');

  R.head('── ④ 못 찾거나 터져도 조용히');
  mode = '404';
  const nf = await m.lookupPaymentByOrder('ORD-NONE');
  R.note(nf && nf.found === false && nf.code === 'NOT_FOUND_PAYMENT', '404 면 found:false + 토스 코드', JSON.stringify(nf));
  mode = 'garbage';
  const gb = await m.lookupPaymentByOrder('ORD-BAD');
  R.note(gb && gb.found === false && gb.code === 'HTTP_500', '본문이 JSON 이 아니어도 터지지 않는다', JSON.stringify(gb));
  const empty = await m.lookupPaymentByOrder('   ');
  R.note(empty && empty.found === false && empty.code === 'bad_request', '주문번호가 비면 부르지 않는다');

  R.head('── ⑤ 시크릿 키가 새지 않는다');
  mode = 'aborted';
  const again = await m.lookupPaymentByOrder('ORD-1');
  const dump = JSON.stringify([a, b, nf, gb, again]);
  R.note(dump.indexOf(SECRET) < 0 && dump.indexOf(Buffer.from(SECRET + ':').toString('base64')) < 0,
         '돌려주는 값 어디에도 시크릿 키(원문·base64)가 없다');
  const tossSrc = fs.readFileSync(path.join(ROOT, 'api/_lib/toss.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  R.note(!/console\.(log|error|warn)\([^)]*key/i.test(tossSrc), 'toss.js 가 키를 로그로 찍지 않는다');
  R.note((tossSrc.match(/process\.env\.TOSS_SECRET_KEY/g) || []).length === 1, '시크릿 키를 읽는 자리는 authHeader 하나뿐이다');

  R.head('── ⑥ 창구와 화면이 실제로 쓴다 (소스)');
  const stats = fs.readFileSync(path.join(ROOT, 'api/stats.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  R.note(/import\s*\{[^}]*\blookupPaymentByOrder\b[^}]*\}\s*from\s*'\.\/_lib\/toss\.js'/.test(stats), 'stats.js 가 lookupPaymentByOrder 를 가져온다');
  const gate = stats.indexOf('adminAccessOf(sessionId)'), call = stats.indexOf('lookupPaymentByOrder(order.order_id)');
  R.note(gate > 0 && call > gate, '운영자 관문 뒤에서 부른다');
  const orderBranch = stats.indexOf("body.action === 'order'"), nextBranch = stats.indexOf("body.action === 'customerOrders'");
  R.note(call > orderBranch && call < nextBranch, "action:'order' 갈래 안에서만 부른다");
  R.note(/try\s*\{\s*toss = await lookupPaymentByOrder/.test(stats), '조회가 터져도 주문 확인은 살아야 한다 (try)');
  R.note(/found:\s*true,\s*\n?\s*toss,/.test(stats), '응답에 toss 를 싣는다');
  const html = fs.readFileSync(path.join(ROOT, 'fortune.html'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const fn = html.slice(html.indexOf('function openOrderLookup('), html.indexOf('function renderLanding('));
  R.note(fn.indexOf("'토스 결제 조회'") > 0, '주문 확인 창에 「토스 결제 조회」 절이 있다');
  ['pm.mId', 'pm.card.issuer', 'pm.failure', 'pm.easyPay', 'pm.receiptUrl', 'tz.found'].forEach(function(k){
    R.note(fn.indexOf(k) > 0, '화면이 ' + k + ' 를 읽는다');
  });
  R.note(fn.indexOf("이 배포본은 토스 조회를 안 내려줘요") > 0, '옛 배포본(toss 없음)에서도 창이 산다');
  for(const f of ['api/confirm.js', 'api/payfail.js']){
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    R.note(src.indexOf('lookupPaymentByOrder') < 0, f + ' 는 조회를 쓰지 않는다 (승인 경로 불변)');
  }
  R.done();
})();
