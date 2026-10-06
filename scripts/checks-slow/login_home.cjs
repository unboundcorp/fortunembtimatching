/* =====================================================================
   로그인 뒤 처음 만든 프로필을 저장하면 홈에 선다 (느린 층)
   ---------------------------------------------------------------------
   2026-10-06 대표님 지시 "로그인하고 초기 화면은 오늘탭이 아닌 홈탭으로 가자".
   ① 사주 쪽(self)으로 마법사에 들어온 새 손님 → 저장하면 home
   ② 궁합 쪽(compat)으로 들어온 손님 → 저장하면 compat (고른 것을 지키는 갈래 · 그대로)
   마법사 입력은 SETUP 에 직접 채우고 마지막 단계의 저장 단추를 실제로 누릅니다. */
const L = require('../_lib.cjs');
const wait = L.wait;

async function run(browser, srv, mode, errs){
  const p = await L.openPage(browser, {hook:true, state: L.makeState({profiles:[], activeProfileId:null}), width:390, height:900});
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(srv.url + '/fortune.html', {waitUntil:'networkidle0'}); await wait(1200);
  await p.evaluate(function(m){ window.__INYEON_TEST__.startService(m); }, mode); await wait(500);
  await p.evaluate(function(){
    window.__INYEON_TEST__.setupFill({name:'새손님', mbti:'ENFP', gender:'F', year:1992, month:3, day:4,
      timeUnknown:true, birthLonKey:'seoul', birthLon:126.98});
  }); await wait(600);
  const label = mode==='compat' ? /^저장하고 궁합 보기$/ : /^저장하고 내 운세 보기$/;
  const clicked = await L.clickText(p, label); await wait(1000);
  const r = await p.evaluate(function(){
    var st={}; try{ st=JSON.parse(localStorage.getItem('inyeonjeom.v2')||'{}'); }catch(e){}
    return {route: window.__INYEON_TEST__.route(), n:(st.profiles||[]).length, sy: window.scrollY};
  });
  await p.close();
  return {clicked, r};
}

(async () => {
  const R = L.reporter('로그인 뒤 홈에 서기');
  const srv = await L.serve(L.ROOT, 0);
  const browser = await L.puppeteer().launch({executablePath: L.chromePath(), headless:'new', args:['--no-sandbox']});
  const errs = [];
  try{
    const a = await run(browser, srv, 'self', errs);
    R.note(!!a.clicked, '사주 쪽 — 저장 단추를 눌렀다');
    R.note(a.r.n === 1, '사주 쪽 — 프로필이 저장됐다', JSON.stringify(a.r));
    R.note(a.r.route === 'home', '사주 쪽 — 저장하면 홈에 선다(오늘 탭이 아니다)', a.r.route);
    const b = await run(browser, srv, 'compat', errs);
    R.note(b.r.n === 1, '궁합 쪽 — 프로필이 저장됐다', JSON.stringify(b.r));
    R.note(b.r.route === 'compat', '궁합 쪽 — 저장하면 궁합으로 간다(고른 것 그대로)', b.r.route);
    R.note(errs.length === 0, 'JS 오류 0건', errs.join(' | ') || '없음');
  } catch(e){ R.note(false, '검사기 자체 오류', String(e && e.stack || e)); }
  await browser.close(); srv.close && srv.close();
  process.exit(R.done());
})();
