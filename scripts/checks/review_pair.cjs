/* =====================================================================
   후기 창구 (빠른 층) — 2026-10-19 대표님 "3) 후기 해라"
   가짜 DB 로 api/review.js 를 실제로 돌린다.
   ① 산 적 없으면 못 쓴다(403) ② 산 사람은 쓴다 — 이름은 가려서, 상태는 대기로
   ③ 이용권으로 산 사람도 쓴다 ④ 테스트 허가로 쓰면 tester=true
   ⑤ 손님 'public' 은 status=public 만 묻는다 ⑥ 관리자 창구는 운영자 아니면 404
   ⑦ 표가 아직 없으면 손님 화면은 '없음'(터지지 않음)
===================================================================== */
const path = require('path');
const { ROOT, reporter } = require('../_lib.cjs');
const R = reporter('후기 창구');
function resp(status, obj){ const t = typeof obj === 'string' ? obj : JSON.stringify(obj); return { ok: status < 400, status, json: async () => obj, text: async () => t }; }
let ORDERS = [], GRANT = null, TABLE = true, WRITES = [], QUERIES = [];
(async function(){
  process.env.SUPABASE_URL = 'https://fake.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'x'.repeat(40);
  process.env.SESSION_SECRET = 's'.repeat(40);
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url)); const table = u.pathname.split('/rest/v1/')[1];
    if(table === 'test_grants') return resp(200, GRANT ? [GRANT] : []);
    if(table === 'orders') return resp(200, ORDERS);
    if(table === 'kakao_links') return resp(200, [{kakao_id:'k9', created_at:'2026-10-18T00:00:00Z'}]);
    if(table === 'reviews'){
      if(!TABLE) return resp(404, '{"code":"42P01","message":"relation \\"reviews\\" does not exist"}');
      QUERIES.push(u.search);
      if(init && init.method === 'POST'){ WRITES.push(JSON.parse(init.body)); return resp(201, ''); }
      if(init && init.method === 'PATCH') return resp(204, '');
      return resp(200, []);
    }
    return resp(200, []);
  };
  let h, mod;
  try{ mod = await import('file://' + path.join(ROOT, 'api/review.js')); h = mod.default; }
  catch(e){ R.bad('api/review.js 를 못 불러옴', String(e && e.message).slice(0,200)); R.done(); return; }
  async function call(body){
    const out = { status:0, body:null };
    const res = { status(s){ out.status = s; return this; }, setHeader(){}, send(t){ try{ out.body = JSON.parse(t); }catch(e){ out.body = t; } }, end(){} };
    await h({ method:'POST', headers:{}, body }, res);
    return out;
  }
  const W = {action:'write', product:'saju_full', stars:5, text:'  어린 시절 얘기가   딱 맞았어요 ', nick:'김가영'};

  ORDERS = []; GRANT = null;
  let o = await call(W);
  R.note(o.status === 403 && WRITES.length === 0, '① 산 적 없으면 못 쓴다', o.status);

  ORDERS = [{product_id:'saju_full:2027', status:'paid'}];
  o = await call(W);
  const w = WRITES[WRITES.length-1] || {};
  R.note(o.status === 200 && w.status === 'pending' && w.tester === false && w.stars === 5, '② 산 사람은 쓴다 · 상태 대기 · 테스트 아님', JSON.stringify(w));
  R.note(w.nick === '김**' && !/가영/.test(JSON.stringify(w)), '② 이름은 첫 글자만', w.nick);
  R.note(w.body === '어린 시절 얘기가 딱 맞았어요' && w.kakao_id === 'k9', '② 글 다듬기 · 카카오 번호', JSON.stringify(w.body));
  R.note(QUERIES.some(q => /on_conflict=session_id%2Cproduct|on_conflict=session_id,product/.test(q)), '② 상품마다 한 번(고치면 덮어씀)');

  o = await call({action:'write', product:'mbti_full', stars:4, text:'좋아요', nick:''});
  R.note(o.status === 403, '② 사주를 샀다고 성격유형 후기를 쓸 수는 없다', o.status);

  ORDERS = [{product_id:'premium_pass:2026', status:'paid'}];
  o = await call({action:'write', product:'compat_full', stars:4, text:'좋아요', nick:''});
  R.note(o.status === 200, '③ 이용권으로 산 사람도 쓴다', o.status);

  ORDERS = []; GRANT = {session_id:'x', role:'tester', expires_at:new Date(Date.now()+86400000).toISOString()};
  o = await call(W);
  R.note(o.status === 200 && (WRITES[WRITES.length-1]||{}).tester === true, '④ 테스트 허가로 쓰면 테스트 표시', JSON.stringify(WRITES[WRITES.length-1]));

  o = await call({action:'write', product:'saju_full', stars:9, text:'좋아요'});
  R.note(o.status === 400, '별점 범위 밖이면 거절', o.status);

  QUERIES = []; GRANT = null;
  o = await call({action:'public', product:'saju_full'});
  R.note(o.status === 200 && QUERIES.some(q => /status=eq\.public/.test(q)) && Array.isArray(o.body.items), '⑤ 손님에게는 공개로 고른 것만', QUERIES.join(' | '));

  o = await call({action:'list'});
  R.note(o.status === 404, '⑥ 관리자 목록은 운영자 아니면 404', o.status);
  o = await call({action:'set', id:1, status:'public'});
  R.note(o.status === 404, '⑥ 공개 바꾸기도 운영자만', o.status);
  GRANT = {session_id:'x', role:'admin', expires_at:new Date(Date.now()+86400000).toISOString()};
  o = await call({action:'list'});
  R.note(o.status === 200 && o.body.ready === true, '⑥ 운영자는 목록을 본다', o.status);

  TABLE = false; GRANT = null;
  o = await call({action:'public', product:'saju_full'});
  R.note(o.status === 200 && o.body.items.length === 0, '⑦ 표가 없어도 손님 공개 후기는 빈 목록', o.status);
  o = await call({action:'mine', product:'saju_full'});
  R.note(o.status === 200 && o.body.ready === false, '⑦ 표가 없으면 후기 칸을 안 그린다(ready:false)', JSON.stringify(o.body));

  const html = require('fs').readFileSync(path.join(ROOT, 'fortune.html'), 'utf8');
  R.note(/var rvPub = buildPublicReviews\(product\)/.test(html) && /buildReviewBox\(product\)/.test(html), '화면 — 잠금 카드에 공개 후기 · 결제한 풀이 끝에 후기 칸');
  R.note(/key:'reviews'/.test(html) && /function adminReviews\(/.test(html), '관리자 [후기] 탭');
  R.done();
})();
