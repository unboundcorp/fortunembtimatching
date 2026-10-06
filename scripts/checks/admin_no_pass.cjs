/* =====================================================================
   운영자 허가는 관리자 화면만 연다 · 결제 복귀가 다른 브라우저여도 구매는 계정에 남는다 (빠른 층)
   ---------------------------------------------------------------------
   2026-10-06 대표님 결정 "1로 해라" — 운영자(admin) 허가가 유료까지 전부 열어서 대표님이 손님 화면
   (환불하면 닫히는지)을 볼 수 없었다. 가짜 DB 로 **실제 함수를 돌립니다**.
   ① 역할별: admin → 관리자 O · 유료 X / tester → 관리자 X · 유료 O / both → 둘 다
   ② 권한 창구(api/entitlements.js)가 admin 에게 이용권을 안 내려준다 · tester 에게는 내려준다
   ③ 코드 합치기: admin 에 테스터 코드 → both · tester 에 운영자 코드 → both · 'both' 를 표가 거절하면 admin 으로
   ④ rebindOrder: 카카오 세션의 주문을 로그인 안 된 세션으로 안 옮긴다 · 로그인 된 세션으로는 옮긴다
===================================================================== */
const path = require('path');
const { ROOT, reporter } = require('../_lib.cjs');
const R = reporter('운영자는 유료를 안 연다');

let GRANT = null, LINKS = {}, ORDER = null, writes = [], rejectBoth = false, patches = [];
function resp(status, obj){ const t = JSON.stringify(obj); return { ok: status < 400, status, json: async () => obj, text: async () => t }; }

(async function(){
  process.env.SUPABASE_URL = 'https://fake.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'x'.repeat(40);
  process.env.SESSION_SECRET = 's'.repeat(40);
  process.env.ADMIN_UNLOCK_CODE = 'a'.repeat(12);
  globalThis.fetch = async (url, init) => {
    url = String(url); init = init || {};
    const u = new URL(url); const table = u.pathname.split('/rest/v1/')[1];
    if(table === 'test_grants'){
      if(init.method === 'POST'){
        const b = JSON.parse(init.body); writes.push(b.role);
        if(b.role === 'both' && rejectBoth) return resp(400, {message:'violates check constraint "test_grants_role_check"'});
        GRANT = {session_id:b.session_id, role:b.role, expires_at:b.expires_at}; return resp(201, []);
      }
      return resp(200, GRANT ? [GRANT] : []);
    }
    if(table === 'kakao_links'){
      const sid = (u.searchParams.get('session_id')||'').replace(/^eq\./,'');
      return resp(200, LINKS[sid] ? [{kakao_id:LINKS[sid], created_at:'x'}] : []);
    }
    if(table === 'orders'){
      if(init.method === 'PATCH'){ patches.push(url); const b = JSON.parse(init.body||'{}'); if(ORDER) Object.assign(ORDER, b); return resp(200, ORDER ? [ORDER] : []); }
      if(u.searchParams.get('order_id')) return resp(200, ORDER ? [ORDER] : []);
      return resp(200, []);
    }
    return resp(200, []);
  };
  let store, ai, entH;
  try{
    store = await import('file://' + path.join(ROOT, 'api/_lib/store.js'));
    ai = await import('file://' + path.join(ROOT, 'api/_lib/aiprompt.js'));
    entH = (await import('file://' + path.join(ROOT, 'api/entitlements.js'))).default;
  } catch(e){ R.bad('모듈을 못 불러옴', String(e && e.message).slice(0,200)); R.done(); return; }
  const exp = new Date(Date.now()+86400000).toISOString();
  async function callEnt(){
    let body = null;
    const res = { statusCode:200, headers:{}, status(c){ this.statusCode=c; return this; }, send(b){ body = b; }, setHeader(k,v){ this.headers[k]=v; }, getHeader(k){ return this.headers[k]; }, end(b){ body = b; } };
    await entH({ method:'POST', headers:{ cookie:'' }, body:{kind:'entitlements'} }, res);
    try{ return JSON.parse(body); }catch(e){ return null; }
  }

  R.head('── ① 역할별');
  for(const [role, adm, pass] of [['admin', true, false], ['tester', false, true], ['both', true, true]]){
    GRANT = {session_id:'s', role, expires_at:exp};
    const a = !!(await store.adminAccessOf('s')), p = !!(await store.testPassOf('s'));
    const h = await ai.hasAiAccess('s', 'compat_full');
    R.note(a === adm && p === pass && !!h.ok === pass, role + ' — 관리자 ' + (adm?'O':'X') + ' · 유료 ' + (pass?'O':'X'), JSON.stringify({a, p, ai:!!h.ok}));
  }

  R.head('── ② 권한 창구');
  GRANT = {session_id:'any', role:'admin', expires_at:exp};
  let e = await callEnt();
  R.note(e && !e.pass && e.adminAccess === true && e.testAccess === false, '운영자 — 이용권 없음 · 관리자 입구는 있음', JSON.stringify(e && {pass:e.pass, adminAccess:e.adminAccess, testAccess:e.testAccess}));
  GRANT = {session_id:'any', role:'tester', expires_at:exp};
  e = await callEnt();
  R.note(e && e.pass && e.pass.allYears && e.adminAccess === false, '테스터 — 모든 해 이용권 · 관리자 입구 없음');

  R.head('── ③ 코드 합치기');
  GRANT = {session_id:'s', role:'admin', expires_at:exp}; writes = [];
  await store.grantTestAccess('s', 24, 'tester');
  R.note(GRANT.role === 'both', '운영자에 테스터 코드 → both', writes.join(','));
  GRANT = {session_id:'s', role:'tester', expires_at:exp};
  await store.grantTestAccess('s', 24, 'admin');
  R.note(GRANT.role === 'both', '테스터에 운영자 코드 → both');
  GRANT = null;
  await store.grantTestAccess('s', 24, 'tester');
  R.note(GRANT.role === 'tester', '처음 테스터 코드 → tester');
  GRANT = {session_id:'s', role:'admin', expires_at:exp}; rejectBoth = true; writes = [];
  await store.grantTestAccess('s', 24, 'tester');
  R.note(GRANT.role === 'admin', "표가 'both' 를 아직 안 받으면 운영자를 지킨다", writes.join(','));
  rejectBoth = false;

  R.head('── ④ 결제 복귀 세션');
  LINKS = {acct:'k1'}; ORDER = {order_id:'O1', product_id:'compat_full', status:'paid', session_id:'acct'}; patches = [];
  await store.rebindOrder('O1', 'stranger');
  R.note(ORDER.session_id === 'acct' && patches.length === 0, '카카오 세션의 주문을 로그인 안 된 세션으로 안 옮긴다', ORDER.session_id);
  LINKS = {acct:'k1', other:'k1'};
  await store.rebindOrder('O1', 'other');
  R.note(ORDER.session_id === 'other', '로그인 된 세션으로는 옮긴다(기기 바꿈 · 영수증 복원)');
  LINKS = {}; ORDER = {order_id:'O2', product_id:'compat_full', status:'paid', session_id:'anon'};
  await store.rebindOrder('O2', 'anon2');
  R.note(ORDER.session_id === 'anon2', '옛 세션이 로그인 안 된 세션이면 예전대로 옮긴다');
  R.done();
})();
