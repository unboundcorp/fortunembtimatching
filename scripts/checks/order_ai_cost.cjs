/* =====================================================================
   관리자 결제 표 — 주문마다 AI 비용이 나갔나 (빠른 층)
   ---------------------------------------------------------------------
   2026-10-07 대표님 지시 "결제 탭에 비용을 넣어서 열람여부와 함께 비용이 나갔는지 안나갔는지 열 하나 추가해".
   가짜 DB 로 api/stats.js action:'rows' kind:'orders' 를 실제로 돌립니다.
   ① 같은 세션·같은 상품·결제 뒤에 만든 풀이 → 그 주문에 붙는다(토큰이면 tokenCostKrw 값)
   ② 결제 전에 만든 풀이 · 다른 세션 · 다른 상품 → 안 붙는다
   ③ 사주는 연도까지 같아야 붙는다 · 이용권은 세 상품을 다 받는다
   ④ 같은 상품을 두 번 샀으면 풀이는 그 시각 직전의 주문 하나에만
   ⑤ 실패한 주문에는 안 붙는다 · 토큰 없는 옛 줄은 추정(estimated)
===================================================================== */
const path = require('path');
const { ROOT, reporter } = require('../_lib.cjs');
const R = reporter('결제 표 AI 비용');

const ORDERS = [
  {order_id:'A', session_id:'s1', product_id:'compat_full', amount:990, status:'paid', created_at:'2026-10-01T00:00:00Z', paid_at:'2026-10-01T00:01:00Z'},
  {order_id:'B', session_id:'s1', product_id:'mbti_full', amount:1900, status:'paid', created_at:'2026-10-01T00:00:00Z', paid_at:'2026-10-01T00:01:00Z'},
  {order_id:'C', session_id:'s2', product_id:'saju_full:2026', amount:1900, status:'paid', created_at:'2026-10-01T00:00:00Z', paid_at:'2026-10-01T00:01:00Z'},
  {order_id:'D', session_id:'s3', product_id:'premium_pass:2026', amount:3900, status:'paid', created_at:'2026-10-01T00:00:00Z', paid_at:'2026-10-01T00:01:00Z'},
  {order_id:'E1', session_id:'s4', product_id:'compat_full', amount:990, status:'paid', created_at:'2026-10-01T00:00:00Z', paid_at:'2026-10-01T00:01:00Z'},
  {order_id:'E2', session_id:'s4', product_id:'compat_full', amount:990, status:'paid', created_at:'2026-10-02T00:00:00Z', paid_at:'2026-10-02T00:01:00Z'},
  {order_id:'F', session_id:'s5', product_id:'compat_full', amount:990, status:'failed', created_at:'2026-10-01T00:00:00Z', paid_at:null},
  {order_id:'G', session_id:'s6', product_id:'compat_full', amount:990, status:'refunded', created_at:'2026-10-01T00:00:00Z', paid_at:'2026-10-01T00:01:00Z'},
];
const TOK = {in_tokens:121981, out_tokens:7310, cache_read_tokens:96024, cache_write_tokens:24006};
const USAGE = [
  Object.assign({session_id:'s1', cache_key:'k-compat', created_at:'2026-10-01T00:05:00Z'}, TOK),   // → A
  Object.assign({session_id:'s1', cache_key:'k-compat-early', created_at:'2026-09-30T00:00:00Z'}, TOK), // 결제 전 → 안 붙음
  Object.assign({session_id:'s2', cache_key:'k-saju2027', created_at:'2026-10-01T00:05:00Z'}, TOK),  // 다른 해 → 안 붙음
  Object.assign({session_id:'s2', cache_key:'k-saju2026', created_at:'2026-10-01T00:06:00Z'}, TOK),  // → C
  Object.assign({session_id:'s3', cache_key:'k-mbti3', created_at:'2026-10-01T00:05:00Z'}, TOK),     // 이용권 → D
  Object.assign({session_id:'s3', cache_key:'k-compat3', created_at:'2026-10-01T00:06:00Z'}, TOK),   // 이용권 → D
  Object.assign({session_id:'s4', cache_key:'k-c41', created_at:'2026-10-01T12:00:00Z'}, TOK),       // → E1
  Object.assign({session_id:'s4', cache_key:'k-c42', created_at:'2026-10-02T12:00:00Z'}, TOK),       // → E2
  {session_id:'s5', cache_key:'k-c5', created_at:'2026-10-01T12:00:00Z', in_tokens:0, out_tokens:0}, // 실패 주문 → 안 붙음
  {session_id:'s6', cache_key:'k-c6', created_at:'2026-10-01T12:00:00Z', in_tokens:0, out_tokens:0}, // 환불 주문 · 토큰 없음 → 추정
];
const CACHE = {'k-compat':'compat_full','k-compat-early':'compat_full','k-saju2027':'saju_full:2027','k-saju2026':'saju_full:2026',
  'k-mbti3':'mbti_full','k-compat3':'compat_full','k-c41':'compat_full','k-c42':'compat_full','k-c5':'compat_full','k-c6':'compat_full'};

function resp(status, obj){ const t = JSON.stringify(obj); return { ok: status < 400, status, json: async () => obj, text: async () => t }; }
function inList(u, key){ const v = u.searchParams.get(key) || ''; const m = v.match(/^in\.\((.*)\)$/); return m ? m[1].split(',').map(s => s.replace(/^"|"$/g,'')) : null; }

(async function(){
  process.env.SUPABASE_URL = 'https://fake.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'x'.repeat(40);
  process.env.SESSION_SECRET = 's'.repeat(40);
  let FAIL_USAGE = false;
  globalThis.fetch = async (url) => {
    const u = new URL(String(url)); const table = u.pathname.split('/rest/v1/')[1];
    if(table === 'test_grants') return resp(200, [{session_id:'x', role:'admin', expires_at: new Date(Date.now()+86400000).toISOString()}]);
    if(table === 'orders') return resp(200, ORDERS);
    if(table === 'ai_usage'){
      if(FAIL_USAGE) return resp(500, {message:'boom'});
      const s = inList(u, 'session_id'); return resp(200, USAGE.filter(x => !s || s.indexOf(x.session_id) >= 0));
    }
    if(table === 'ai_cache'){ const k = inList(u, 'cache_key') || []; return resp(200, k.filter(x => CACHE[x]).map(x => ({cache_key:x, product_id:CACHE[x]}))); }
    return resp(200, []);
  };
  let stats;
  try{ stats = (await import('file://' + path.join(ROOT, 'api/stats.js'))).default; }
  catch(e){ R.bad('api/stats.js 를 못 불러옴', String(e && e.message).slice(0,200)); R.done(); return; }
  async function call(){
    const req = { method:'POST', headers:{}, body:{action:'rows', kind:'orders'} };
    let out = { status:0, body:null };
    const res = { status(s){ out.status = s; return this; }, setHeader(){}, send(t){ try{ out.body = JSON.parse(t); }catch(e){ out.body = t; } }, end(){} };
    await stats(req, res); return out;
  }
  const r = await call();
  const m = {}; ((r.body && r.body.rows) || []).forEach(o => { m[o.id] = o.aiCost; });
  const one = m.A && m.A.krw;
  R.note(r.status === 200 && Object.keys(m).length === ORDERS.length, '창구가 주문 여덟 줄을 준다', r.status + ' ' + Object.keys(m).join(','));
  R.note(m.A && m.A.n === 1 && one > 150 && one < 300 && !m.A.estimated, '① 결제 뒤 만든 궁합 풀이 1편이 그 주문에 붙는다(토큰 값)', JSON.stringify(m.A));
  R.note(m.B && m.B.n === 0, '② 같은 세션이라도 다른 상품(성격유형)은 「안 나감」', JSON.stringify(m.B));
  R.note(m.C && m.C.n === 1 && m.C.krw === one, '③ 사주는 같은 해 풀이만 붙는다(2027 풀이는 안 붙음)', JSON.stringify(m.C));
  R.note(m.D && m.D.n === 2 && Math.abs(m.D.krw - one * 2) <= 1, '③ 이용권은 세 상품 풀이를 다 받는다', JSON.stringify(m.D));
  R.note(m.E1 && m.E1.n === 1 && m.E2 && m.E2.n === 1, '④ 같은 상품을 두 번 샀으면 풀이는 직전 주문 하나에만', JSON.stringify([m.E1, m.E2]));
  R.note(m.F && m.F.n === 0, '⑤ 실패한 주문에는 안 붙는다', JSON.stringify(m.F));
  R.note(m.G && m.G.n === 1 && m.G.estimated === true, '⑤ 환불된 주문도 원가는 보인다 · 토큰 없는 줄은 추정', JSON.stringify(m.G));
  FAIL_USAGE = true;
  const r2 = await call();
  R.note(r2.status === 200 && (r2.body.rows || []).every(o => o.aiCost === null), '맞대기에 실패하면 표는 나가고 비용 칸은 null(확인 못 함)', JSON.stringify((r2.body.rows||[])[0]));
  R.done();
})();
