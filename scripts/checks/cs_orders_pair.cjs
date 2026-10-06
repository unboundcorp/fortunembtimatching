/* =====================================================================
   문의 목록에 그 손님의 결제 내역이 붙는다 (빠른 층)
   ---------------------------------------------------------------------
   2026-10-06 대표님 지시 "아무거도 안적으면 어떻게 환불해줘야되냐 admin에 주문번호를 적어줘야지".
   api/feedback.js 의 attachOrders 를 가짜 저장소로 **실제로 돌려** 봅니다.
   ① 문의를 보낸 세션의 결제가 붙는다
   ② 카카오 계정이 지금 가리키는 (다른) 세션의 결제도 붙는다 — 로그인 때 결제가 최신 세션으로 옮겨지므로
   ③ **남의 결제는 안 붙는다** — 이 자리의 가장 나쁜 실패
   ④ 결제가 없으면 빈 배열(화면이 '결제 내역 없음'과 '안 내려줌'을 가른다)
   ⑤ 화면이 그 값을 읽는 자리(csOrdersBlock)가 있다
===================================================================== */
const fs = require('fs');
const path = require('path');
const { ROOT, reporter } = require('../_lib.cjs');
const R = reporter('문의에 결제 붙이기');

const ORDERS = [
  {session_id:'s-a',   order_id:'ORD-A',  product_id:'compat_full', amount:990,  status:'paid', created_at:'2026-10-06T11:00:00Z', paid_at:'2026-10-06T11:01:00Z'},
  {session_id:'s-k2',  order_id:'ORD-K',  product_id:'mbti_full',   amount:1900, status:'paid', created_at:'2026-10-06T10:00:00Z', paid_at:'2026-10-06T10:01:00Z'},
  {session_id:'s-x',   order_id:'ORD-X',  product_id:'compat_full', amount:990,  status:'paid', created_at:'2026-10-06T09:00:00Z', paid_at:'2026-10-06T09:01:00Z'},
];
const LINKS = [{kakao_id:'k1', session_id:'s-k2'}];

function inVals(v){ return v && v.startsWith('in.(') ? v.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g,'')) : null; }
function fakeRows(url){
  const u = new URL(url);
  const table = u.pathname.split('/rest/v1/')[1];
  const q = u.searchParams;
  if(table === 'kakao_links'){ const ks = inVals(q.get('kakao_id')) || []; return LINKS.filter(l => ks.includes(l.kakao_id)); }
  if(table === 'orders'){
    const ss = inVals(q.get('session_id')) || [];
    const sv = q.get('status') || '';
    const sts = inVals(sv) || (sv ? [sv.replace(/^eq\./,'')] : null);
    return ORDERS.filter(o => ss.includes(o.session_id) && (!sts || sts.includes(o.status)));
  }
  return [];
}

(async function(){
  process.env.SUPABASE_URL = 'https://fake.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'x'.repeat(40);
  globalThis.fetch = async (url) => ({ ok:true, status:200, json: async () => fakeRows(String(url)), text: async () => JSON.stringify(fakeRows(String(url))) });
  let m;
  try{ m = await import('file://' + path.join(ROOT, 'api/feedback.js')); }
  catch(e){ R.bad('feedback.js 를 못 불러옴', String(e && e.message).slice(0,160)); R.done(); return; }
  R.note(typeof m.attachOrders === 'function', 'attachOrders 가 내보내진다');
  if(typeof m.attachOrders !== 'function'){ R.done(); return; }

  const rows = [
    {id:1, session_id:'s-a',  kakao_id:null},
    {id:2, session_id:'s-k1', kakao_id:'k1'},
    {id:3, session_id:'s-none', kakao_id:null},
  ];
  await m.attachOrders(rows);
  const ids = (r) => (r.orders || []).map(o => o.orderId).join(',');
  R.note(ids(rows[0]) === 'ORD-A', '① 문의 보낸 세션의 결제가 붙는다', ids(rows[0]));
  R.note(ids(rows[1]) === 'ORD-K', '② 카카오 계정이 가리키는 세션의 결제가 붙는다', ids(rows[1]));
  R.note(!rows.some(r => ids(r).indexOf('ORD-X') >= 0), '③ 남의 결제(ORD-X)는 어디에도 안 붙는다');
  R.note(Array.isArray(rows[2].orders) && rows[2].orders.length === 0, '④ 결제가 없으면 빈 배열', JSON.stringify(rows[2].orders));
  const o = (rows[0].orders || [])[0] || {};
  R.note(o.amount === 990 && o.productId === 'compat_full' && !!o.paidAt, '주문번호·상품·금액·결제 시각이 실린다', JSON.stringify(o));

  const html = fs.readFileSync(path.join(ROOT, 'fortune.html'), 'utf8');
  R.note(/function csOrdersBlock\(cur\)/.test(html) && /talk\.appendChild\(csOrdersBlock\(cur\)\)/.test(html), '⑤ 문의 상세가 csOrdersBlock 으로 결제를 그린다');
  const fb = fs.readFileSync(path.join(ROOT, 'api/feedback.js'), 'utf8');
  const li = fb.indexOf("if (action === 'list')"), gi = fb.indexOf('adminAccessOf(sessionId)', li), ai = fb.indexOf('attachOrders(rows', li);
  R.note(li > 0 && gi > li && ai > gi, '결제 붙이기는 운영자 관문 뒤에서만 돈다');
  R.done();
})();
