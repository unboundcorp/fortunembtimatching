/* =====================================================================
   관리자 대시보드 회원 분포 — 서버가 실제로 내려주는 people[] (빠른 층)
   ---------------------------------------------------------------------
   2026-10-19 대표님 지시 "결과값이 구체적이었으면 · 성별 연령대 정도는 더 추가 안돼?".
   가짜 DB 로 api/stats.js 의 전체 현황(action 없음)을 실제로 돌려 people[] 를 봅니다.
   ① 회원(카카오) 한 분당 한 줄 · 첫 프로필의 성별·만 나이(KST 오늘, 생일 지났나까지)·유형·대표 기운
   ② 결제는 그 회원 세션의 paid 주문만(실패·환불 안 셈) · 상품은 연도 뗀 이름
   ③ 이름·생년월일은 안 내려간다 ④ 프로필 없는 회원은 성별 ''·나이 null
===================================================================== */
const path = require('path');
const { ROOT, reporter } = require('../_lib.cjs');
const R = reporter('대시보드 회원 분포');
const now = new Date(Date.now() + 9*3600*1000);
const ty = now.getUTCFullYear(), tm = now.getUTCMonth() + 1, td = now.getUTCDate();
/* 생일이 내일인 사람(아직 안 지남)과 어제인 사람(지남) — 만 나이 경계 */
const tmr = new Date(Date.UTC(ty, tm-1, td+1)), yst = new Date(Date.UTC(ty, tm-1, td-1));
const P = (name, g, y, m, d, mbti, el) => ({name, gender:g, year:y, month:m, day:d, mbti, element:el});
const KAKAO = [
  {kakao_id:'k1', session_id:'s1', created_at:'2026-10-18T00:00:00Z'},
  {kakao_id:'k2', session_id:'s2', created_at:'2026-10-18T00:00:00Z'},
  {kakao_id:'k3', session_id:'s3', created_at:'2026-10-18T00:00:00Z'},
];
const SYNC = [
  {kakao_id:'k1', profiles:[P('가영','F', ty-25, tmr.getUTCMonth()+1, tmr.getUTCDate(), 'ENFP', '목(木)'), P('친구','M', 1970, 1, 1, 'ISTJ', '금(金)')]},
  {kakao_id:'k2', profiles:[P('민수','M', ty-25, yst.getUTCMonth()+1, yst.getUTCDate(), 'ISTJ', '수(水)')]},
  {kakao_id:'k3', profiles:null},
];
const ORDERS = [
  {order_id:'A', session_id:'s1', product_id:'saju_full:2026', amount:1900, status:'paid', created_at:'2026-10-18T01:00:00Z', paid_at:'2026-10-18T01:01:00Z'},
  {order_id:'B', session_id:'s1', product_id:'compat_full', amount:990, status:'failed', created_at:'2026-10-18T01:00:00Z', paid_at:null},
  {order_id:'C', session_id:'s2', product_id:'compat_full', amount:990, status:'refunded', created_at:'2026-10-18T01:00:00Z', paid_at:'2026-10-18T01:01:00Z'},
];
function resp(status, obj){ const t = JSON.stringify(obj); return { ok: status < 400, status, json: async () => obj, text: async () => t }; }
(async function(){
  process.env.SUPABASE_URL = 'https://fake.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'x'.repeat(40);
  process.env.SESSION_SECRET = 's'.repeat(40);
  globalThis.fetch = async (url) => {
    const u = new URL(String(url)); const table = u.pathname.split('/rest/v1/')[1];
    if(table === 'test_grants') return resp(200, [{session_id:'x', role:'admin', expires_at: new Date(Date.now()+86400000).toISOString()}]);
    if(table === 'orders') return resp(200, ORDERS);
    if(table === 'kakao_links') return resp(200, KAKAO);
    if(table === 'user_sync') return resp(200, /profiles/.test(u.searchParams.get('select') || '') ? SYNC : []);
    return resp(200, []);
  };
  let stats;
  try{ stats = (await import('file://' + path.join(ROOT, 'api/stats.js'))).default; }
  catch(e){ R.bad('api/stats.js 를 못 불러옴', String(e && e.message).slice(0,200)); R.done(); return; }
  const out = { status:0, body:null };
  const res = { status(s){ out.status = s; return this; }, setHeader(){}, send(t){ try{ out.body = JSON.parse(t); }catch(e){ out.body = t; } }, end(){} };
  await stats({ method:'POST', headers:{}, body:{} }, res);
  const ppl = (out.body && out.body.people) || null;
  R.note(out.status === 200 && Array.isArray(ppl) && ppl.length === 3, '① 회원 셋이 한 줄씩', out.status + ' ' + JSON.stringify(ppl && ppl.length));
  if(!ppl){ R.done(); return; }
  const [a, b, c] = ppl;
  R.note(a.g === 'F' && a.mbti === 'ENFP' && a.elem === '목(木)', '① 첫 프로필 기준(봐 준 친구 프로필이 아님)', JSON.stringify(a));
  R.note(a.age === 24, '① 생일이 아직 안 지났으면 만 나이 하나 적게', a.age);
  R.note(b.age === 25, '① 생일이 지났으면 그대로', b.age);
  R.note(a.np === 2, '① 프로필 개수', a.np);
  R.note(a.orders.length === 1 && a.orders[0].amt === 1900 && a.orders[0].base === 'saju_full', '② paid 만 · 상품은 연도 뗀 이름', JSON.stringify(a.orders));
  R.note(b.orders.length === 0, '② 환불된 주문은 안 셈', JSON.stringify(b.orders));
  R.note(c.g === '' && c.age === null && c.orders.length === 0, '④ 프로필 없는 회원 — 성별 빈칸 · 나이 null', JSON.stringify(c));
  const txt = JSON.stringify(ppl);
  R.note(!/가영|민수|친구/.test(txt) && !/"year"|"month"|"birth"/.test(txt), '③ 이름·생년월일은 안 내려감');
  R.done();
})();
