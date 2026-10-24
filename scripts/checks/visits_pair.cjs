/* =====================================================================
   이용 기록 — 재방문 · 화면별 조회 · 들어온 길 (빠른 층 · 2026-10-24)
   ---------------------------------------------------------------------
   ① 받는 글자 규칙이 화면 visitNote 와 서버 VISIT_WHAT 에서 같은가
   ② /api/visit 가 이상한 글자를 버리고 · 날짜를 서버가 정하고 · 표가 없어도 200 인가
   ③ summarizeVisits 를 실제로 돌려 재방문율·주기·화면·들어온 길·결제가 맞는가
   ④ stats action:'visits' 가 운영자 관문 뒤에 있고 · 운영자·테스터 세션을 빼는가
   ⑤ render 가 화면마다 적고 · 관리자 화면은 안 적는가 · 방침에 적었는가
===================================================================== */
const fs = require('fs'), path = require('path');
const { ROOT, reporter } = require('../_lib.cjs');
const R = reporter('이용 기록');
const html = fs.readFileSync(path.join(ROOT, 'fortune.html'), 'utf8');
const statsSrc = fs.readFileSync(path.join(ROOT, 'api/stats.js'), 'utf8');

function resp(status, obj){ const t = JSON.stringify(obj); return { ok: status < 400, status, json: async () => obj, text: async () => t }; }

(async function(){
  process.env.SUPABASE_URL = 'https://fake.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'x'.repeat(40);
  process.env.SESSION_SECRET = 's'.repeat(40);
  const V = await import('file://' + path.join(ROOT, 'api/_lib/visits.js'));

  R.head('① 글자 규칙이 한 쌍인가');
  const cm = /if\(!visitAllowed\(\) \|\| !\/(.+?)\/\.test\(what\)\) return;/.exec(html);
  R.note(cm && cm[1] === V.VISIT_WHAT.source, '화면 visitNote 의 규칙 = 서버 VISIT_WHAT', cm ? cm[1] : '못 찾음');
  R.note(JSON.stringify(V.cleanItems(['open','tab:home','tab:home','in:ad','in:evil','tab:<script>','x'])) === '["open","tab:home","in:ad"]',
    '이상한 글자·겹친 글자는 버린다');

  R.head('② /api/visit');
  let sent = null, TABLE_MISSING = false;
  globalThis.fetch = async (url, init) => {
    const u = new URL(String(url)); const table = u.pathname.split('/rest/v1/')[1];
    if(table === 'kakao_links') return resp(200, [{kakao_id:'777', created_at:'2026-10-01T00:00:00Z'}]);
    if(table === 'visit_log' && init && init.method === 'POST'){
      if(TABLE_MISSING) return resp(404, {message:'relation "visit_log" does not exist'});
      sent = {url:u, body:JSON.parse(init.body), prefer:init.headers.Prefer}; return resp(201, null);
    }
    return resp(200, []);
  };
  const visit = (await import('file://' + path.join(ROOT, 'api/visit.js'))).default;
  async function callVisit(body){
    const out = {status:0, body:null};
    const res = { status(s){ out.status = s; return this; }, setHeader(){}, send(t){ try{ out.body = JSON.parse(t); }catch(e){ out.body = t; } }, end(){} };
    await visit({method:'POST', headers:{}, body}, res); return out;
  }
  const r1 = await callVisit({items:['open','tab:today','in:evil'], day:'1999-01-01'});
  R.note(r1.status === 200 && sent && sent.body.length === 2, '받을 것 둘만 저장한다', JSON.stringify(sent && sent.body.map(x => x.what)));
  R.note(sent && sent.body.every(x => x.day === V.kstDay() && x.kakao_id === '777'), '날짜는 서버 KST · 카카오 회원번호를 붙인다', sent && sent.body[0].day);
  R.note(sent && /ignore-duplicates/.test(sent.prefer) && sent.url.searchParams.get('on_conflict') === 'day,session_id,what', '같은 날 같은 것은 한 줄(겹치면 무시)');
  TABLE_MISSING = true;
  const r2 = await callVisit({items:['open']});
  R.note(r2.status === 200 && r2.body.ready === false, '표가 아직 없어도 200 (손님 화면 영향 없음)', JSON.stringify(r2.body));

  R.head('③ 요약 계산');
  const rows = [
    /* a: 10/20 처음(둘이서 링크) → 10/22 다시 → 10/25 다시. 로그인 전 줄(세션만)도 같은 사람으로 */
    {day:'2026-10-20', session_id:'sa', kakao_id:null, what:'open'}, {day:'2026-10-20', session_id:'sa', kakao_id:null, what:'in:pair'},
    {day:'2026-10-20', session_id:'sa', kakao_id:null, what:'tab:gate'}, {day:'2026-10-20', session_id:'sa', kakao_id:'A', what:'tab:home'},
    {day:'2026-10-22', session_id:'sa2', kakao_id:'A', what:'open'}, {day:'2026-10-22', session_id:'sa2', kakao_id:'A', what:'tab:home'},
    {day:'2026-10-25', session_id:'sa2', kakao_id:'A', what:'open'},
    /* b: 10/21 처음(광고) · 한 번뿐 · 결제 */
    {day:'2026-10-21', session_id:'sb', kakao_id:'B', what:'open'}, {day:'2026-10-21', session_id:'sb', kakao_id:'B', what:'in:ad'},
    {day:'2026-10-21', session_id:'sb', kakao_id:'B', what:'tab:report13'},
    /* c: 로그인 전에 나감 */
    {day:'2026-10-21', session_id:'sc', kakao_id:null, what:'open'}, {day:'2026-10-21', session_id:'sc', kakao_id:null, what:'tab:gate'},
    /* d: 기간 전(10/10)에 처음 → 10/21 다시. 기간 안 '처음 온 분'이 아니다 */
    {day:'2026-10-10', session_id:'sd', kakao_id:'D', what:'open'}, {day:'2026-10-21', session_id:'sd', kakao_id:'D', what:'open'},
  ];
  const links = [{kakao_id:'A', session_id:'sa'}, {kakao_id:'B', session_id:'sb'}];
  const orders = [{session_id:'sb', amount:1900, status:'paid'}, {session_id:'sc', amount:990, status:'failed'}];
  const S = V.summarizeVisits(rows, links, orders, '2026-10-20', '2026-10-23');
  R.note(S.visitors === 4 && S.members === 3, '방문한 사람 4 · 회원 3 (세션만 있던 줄은 로그인한 그분으로 묶음)', S.visitors + '/' + S.members);
  R.note(S.newcomers === 3 && S.returned === 1 && S.returnRate === 33.3, '처음 온 분 3 · 다시 온 분 1 · 33.3%', JSON.stringify([S.newcomers, S.returned, S.returnRate]));
  R.note(S.avgDaysToReturn === 2, '다시 오기까지 2일', S.avgDaysToReturn);
  R.note(S.avgGap === 2 && S.multiDay === 1, '기간 안 방문 사이 평균 2일 (기간 밖 10/25 는 안 셈)', S.avgGap + '/' + S.multiDay);
  const tab = (t) => (S.tabs.find(x => x.tab === t) || {}).people;
  R.note(tab('home') === 1 && tab('gate') === 2 && tab('report13') === 1, '화면별 연 사람 (홈 1 · 동의 2 · 사주 풀이 1)', JSON.stringify(S.tabs));
  const src = {}; S.sources.forEach(x => { src[x.src] = x; });
  R.note(src.pair && src.pair.people === 1 && src.ad && src.ad.buyers === 1 && src.ad.revenue === 1900 && src.direct && src.direct.people === 1 && src.direct.members === 0,
    '들어온 길: 둘이서 링크 1 · 광고 1(결제 1,900) · 그 밖 1(로그인 안 함) · 실패 결제는 안 셈', JSON.stringify(S.sources));
  R.note(S.firstLogged === '2026-10-10' && S.daily.length === 3, '기록 시작일 · 날마다 줄', S.firstLogged + ' ' + S.daily.length);

  R.head('④ 관리자 창구');
  const gateAt = statsSrc.indexOf('const grant = await adminAccessOf(sessionId)');
  const visAt = statsSrc.indexOf("body.action === 'visits'");
  R.note(gateAt > 0 && visAt > gateAt, '이용 기록 요약은 운영자 관문 뒤에 있다');
  globalThis.fetch = async (url) => {
    const u = new URL(String(url)); const table = u.pathname.split('/rest/v1/')[1];
    if(table === 'test_grants') return resp(200, [{session_id:'staff', role:'admin', expires_at: new Date(Date.now()+86400000).toISOString()}]);
    if(table === 'visit_log') return resp(200, rows.concat([
      {day:'2026-10-21', session_id:'staff', kakao_id:'Z', what:'open'}, {day:'2026-10-22', session_id:'staff2', kakao_id:'Z', what:'open'}]));
    if(table === 'kakao_links') return resp(200, links.concat([{kakao_id:'Z', session_id:'staff'}]));
    if(table === 'orders') return resp(200, orders.filter(o => o.status === 'paid'));
    return resp(200, []);
  };
  const stats = (await import('file://' + path.join(ROOT, 'api/stats.js'))).default;
  const out = {status:0, body:null};
  const res = { status(s){ out.status = s; return this; }, setHeader(){}, send(t){ try{ out.body = JSON.parse(t); }catch(e){ out.body = t; } }, end(){} };
  await stats({method:'POST', headers:{}, body:{action:'visits', since:'2026-10-20', until:'2026-10-23'}}, res);
  R.note(out.status === 200 && out.body.ready === true && out.body.visitors === 4 && out.body.staffDropped === 2,
    '운영자 세션과 그 회원의 다른 세션 줄은 뺀다', JSON.stringify({s:out.status, v:out.body && out.body.visitors, d:out.body && out.body.staffDropped}));

  R.head('⑤ 화면과 방침');
  R.note(/if\(!vGate\) visitNote\('tab:' \+ ROUTE\)/.test(html) && /if\(loginGateBlocks\(\) && KAKAO\.loaded && !CONSENT_WAIT\) visitNote\('tab:gate'\)/.test(html) && /if\(!ADMIN_ROUTES\[ROUTE\]\)\{/.test(html),
    'render 가 화면마다 적고, 관리자 화면은 안 적는다');
  R.note(/visitNote\('open'\)/.test(html) && /if\(VISIT_IN\) visitNote\(VISIT_IN\)/.test(html), '연 날 · 들어온 길을 적는다');
  R.note(/서비스를 연 날짜, 그날 연 화면의 이름/.test(html) && /이용 기록 \(연 날짜·화면·들어온 길\) — 1년/.test(html) && !/이용 행태를 수집하지 않습니다/.test(html),
    '처리방침 제1조·제2조에 적었고 "행태를 수집하지 않는다" 문장은 없다');
  R.note(/visit_log\?day=lt\./.test(fs.readFileSync(path.join(ROOT, 'api/visit.js'), 'utf8')), '1년 지난 줄을 지우는 자리가 있다(방침 제2조)');
  R.done();
})();
