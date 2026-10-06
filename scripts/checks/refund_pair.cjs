/* =====================================================================
   [환불 처리] — 토스 취소 → 주문 '환불됨' → 유료 화면(만든 AI 풀이 포함)이 닫힌다 (빠른 층)
   ---------------------------------------------------------------------
   2026-10-06 대표님 결정 A. 가짜 토스·가짜 DB 로 **실제 함수와 창구를 돌립니다**(돈은 안 나갑니다).
   ① cancelPayment: 취소 완료(CANCELED) · 이미 취소됨 · 거절 세 갈래
   ② 창구(api/stats.js action:'refund'): 성공 시 주문 PATCH 가 'refunded' 로 나간다
      · DB 에 환불 칸이 없으면 **토스를 부르지 않는다** · 토스가 거절하면 주문을 안 바꾼다 · 결제 전 주문은 거절
   ③ refundClosed: 환불한 상품은 닫힘 · 같은 상품을 한 번 더 사 둔 게 남아 있으면 열림 · 이용권 환불은 세 상품 다 닫음
   ④ 두 자리(R76 · ownAiOf)가 refundClosed 를 실제로 쓴다(소스)
===================================================================== */
const fs = require('fs');
const path = require('path');
const { ROOT, reporter } = require('../_lib.cjs');
const R = reporter('환불 처리');

let DB = {}, TOSS = {}, calls = [];
function reset(o){
  DB = Object.assign({ schemaReady:true, order:{order_id:'ORD1', product_id:'compat_full', amount:990, status:'paid', payment_key:'PK1', session_id:'s1'} }, o||{});
  TOSS = { mode:'ok' }; calls = [];
}
function resp(status, obj){ const t = JSON.stringify(obj); return { ok: status < 400, status, json: async () => obj, text: async () => t }; }

(async function(){
  process.env.SUPABASE_URL = 'https://fake.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'x'.repeat(40);
  process.env.SESSION_SECRET = 's'.repeat(40);
  process.env.TOSS_SECRET_KEY = 'test_sk_' + 'f'.repeat(24);
  globalThis.fetch = async (url, init) => {
    url = String(url); init = init || {};
    calls.push((init.method||'GET') + ' ' + url);
    if(url.indexOf('api.tosspayments.com') >= 0){
      if(TOSS.mode === 'ok') return resp(200, {status:'CANCELED', cancels:[{canceledAt:'2026-10-06T22:00:00+09:00', cancelAmount:990}]});
      if(TOSS.mode === 'already') return resp(400, {code:'ALREADY_CANCELED_PAYMENT', message:'이미 취소된 결제 입니다.'});
      return resp(400, {code:'NOT_CANCELABLE_PAYMENT', message:'취소 할 수 없는 결제 입니다.'});
    }
    const u = new URL(url); const table = u.pathname.split('/rest/v1/')[1];
    if(table === 'test_grants') return resp(200, [{session_id:'x', role:'admin', expires_at: new Date(Date.now()+86400000).toISOString()}]);
    if(table === 'orders'){
      if(u.searchParams.get('select') === 'refunded_at' && !DB.schemaReady) return resp(400, {message:'column orders.refunded_at does not exist'});
      if(init.method === 'PATCH'){
        const b = JSON.parse(init.body || '{}');
        if(DB.order.status !== 'paid') return resp(200, []);
        if(!DB.schemaReady) return resp(400, {message:'violates check constraint'});
        Object.assign(DB.order, b); return resp(200, [DB.order]);
      }
      return resp(200, [DB.order]);
    }
    return resp(200, []);
  };

  let toss, ent, stats;
  try{
    toss = await import('file://' + path.join(ROOT, 'api/_lib/toss.js'));
    ent = await import('file://' + path.join(ROOT, 'api/_lib/entitlements.js'));
    stats = (await import('file://' + path.join(ROOT, 'api/stats.js'))).default;
  } catch(e){ R.bad('모듈을 못 불러옴', String(e && e.message).slice(0,200)); R.done(); return; }

  R.head('── ① cancelPayment');
  reset(); let c = await toss.cancelPayment('PK1', '고객 요청', 'refund-ORD1');
  R.note(c.ok && c.status === 'CANCELED' && !c.already, '취소 완료면 ok', JSON.stringify(c));
  R.note(calls.some(x => /POST https:\/\/api\.tosspayments\.com\/v1\/payments\/PK1\/cancel/.test(x)), '토스 취소 주소로 POST 한다');
  reset(); TOSS.mode = 'already'; c = await toss.cancelPayment('PK1', 'r', 'k');
  R.note(c.ok && c.already, '이미 취소된 결제는 취소된 것으로 본다', JSON.stringify(c));
  reset(); TOSS.mode = 'deny'; c = await toss.cancelPayment('PK1', 'r', 'k');
  R.note(!c.ok && c.code === 'NOT_CANCELABLE_PAYMENT', '토스가 거절하면 ok 가 아니다', JSON.stringify(c));

  async function call(body){
    const req = { method:'POST', headers:{}, body };
    let out = { status:0, body:null };
    const res = { status(s){ out.status = s; return this; }, setHeader(){}, send(t){ try{ out.body = JSON.parse(t); }catch(e){ out.body = t; } }, end(){} };
    await stats(req, res); return out;
  }
  R.head('── ② 창구 action:refund');
  reset(); let r = await call({action:'refund', receiptId:'ORD1', reason:'테스트 환불'});
  R.note(r.status === 200 && r.body && r.body.ok && DB.order.status === 'refunded', '성공하면 주문이 refunded 가 된다', r.status + ' ' + JSON.stringify(r.body));
  R.note(DB.order.refund_reason === '테스트 환불' && !!DB.order.refunded_at, '사유와 환불 시각이 적힌다');
  const tossCalls = calls.filter(x => x.indexOf('tosspayments') >= 0).length;
  r = await call({action:'refund', receiptId:'ORD1'});
  R.note(r.body && r.body.ok && r.body.already && calls.filter(x => x.indexOf('tosspayments') >= 0).length === tossCalls, '이미 환불된 주문은 토스를 다시 부르지 않는다');

  reset({schemaReady:false}); r = await call({action:'refund', receiptId:'ORD1'});
  R.note(r.status === 503 && !calls.some(x => x.indexOf('tosspayments') >= 0), 'DB 에 환불 칸이 없으면 토스를 부르지 않는다', r.status + ' ' + (r.body && r.body.error));

  reset(); TOSS.mode = 'deny'; r = await call({action:'refund', receiptId:'ORD1'});
  R.note(r.status === 502 && DB.order.status === 'paid', '토스가 거절하면 주문은 paid 그대로', r.status + ' ' + DB.order.status);

  reset({order:{order_id:'ORD1', product_id:'compat_full', amount:990, status:'created', payment_key:null, session_id:'s1'}});
  r = await call({action:'refund', receiptId:'ORD1'});
  R.note(r.status === 409 && !calls.some(x => x.indexOf('tosspayments') >= 0), '결제 전 주문은 거절하고 토스를 안 부른다', String(r.status));

  R.head('── ③ refundClosed');
  const none = ent.buildEntitlements([]);
  const twoCompat = ent.buildEntitlements([{order_id:'O2', product_id:'compat_full', amount:990, status:'paid', paid_at:new Date().toISOString(), session_id:'s1'}]);
  R.note(ent.refundClosed(['compat_full'], 'compat_full', none) === true, '환불한 상품은 닫힌다');
  R.note(ent.refundClosed(['compat_full'], 'compat_full', twoCompat) === false, '같은 상품을 한 번 더 사 둔 게 남아 있으면 열림');
  R.note(ent.refundClosed(['compat_full'], 'mbti_full', none) === false, '다른 상품은 안 닫는다');
  R.note(ent.refundClosed(['premium_pass:2026'], 'mbti_full', none) === true && ent.refundClosed(['premium_pass:2026'], 'saju_full:2026', none) === true, '이용권을 환불하면 세 상품이 다 닫힌다');
  R.note(ent.refundClosed(['saju_full:2026'], 'saju_full:2027', none) === true, '연도 상품은 밑동으로 본다');
  R.note(ent.refundClosed([], 'compat_full', none) === false, '환불이 없으면 안 닫는다');

  R.head('── ④ 두 자리가 실제로 쓴다(소스)');
  const strip = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const e1 = strip('api/entitlements.js'), a1 = strip('api/_lib/aiprompt.js'), s1 = strip('api/stats.js');
  R.note(/refundClosed\(refunded, p\.id, paidOnly\)\) continue/.test(e1), 'R76(만든 글 영구)이 환불 상품을 건너뛴다');
  R.note(/refundClosed\(refunded, productId, paidOnly\)\) return null/.test(a1), 'ownAiOf 가 환불 상품의 글을 안 준다');
  const ri = s1.indexOf("body.action === 'refund'"), gi = s1.indexOf('adminAccessOf(sessionId)');
  R.note(gi > 0 && ri > gi, '환불 창구는 운영자 관문 뒤에만 있다');
  const pub = ['api/entitlements.js','api/interpret.js','api/content.js','api/confirm.js','api/feedback.js'].filter(f => /cancelPayment/.test(strip(f)));
  R.note(pub.length === 0, '토스 취소는 stats.js 밖 어디서도 안 부른다', pub.join(','));
  R.done();
})();
