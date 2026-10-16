/* =====================================================================
   광고 주소 ?go=2027 — 로그인 · 정보 입력 뒤 그 해의 사주 풀이로 곧장 (느린 층)
   ---------------------------------------------------------------------
   2026-10-15 대표님 지시 "광고를 누르면 로그인하고 정보 입략하고 2027년 화면으로 바로 가는 주소".
   ① 새 손님: ?go=2027 로 열고 마법사 저장 → report13 · 2027년 · 쪽지 지워짐 · 주소에 go 없음
   ② 이미 쓰시던 분(로그인·프로필 있음): ?go=2027&fbclid=… → 곧장 report13 · fbclid 는 주소에 남음
   ③ 로그인 끝(finishConsent)에서 프로필이 이미 있으면 → report13 (궁합 카드를 눌렀어도)
   ④ go 없이 열면 예전대로(홈) — 쪽지 없음 */
const L = require('../_lib.cjs');
const wait = L.wait;
const NEXT = (new Date()).getFullYear() + 1;

async function open(browser, srv, q, state, errs){
  const p = await L.openPage(browser, {hook:true, state: L.makeState(state || {}), width:390, height:900});
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(srv.url + '/fortune.html' + q, {waitUntil:'networkidle0'}); await wait(1200);
  return p;
}
const look = p => p.evaluate(function(){
  var T = window.__INYEON_TEST__;
  var yrBtn = Array.prototype.filter.call(document.querySelectorAll('#main button[aria-pressed="true"]'), function(b){ return /년/.test(b.textContent); })[0];
  return {route: T.route(), year: T.viewYear(), pend: !!T.adGoPending(), url: location.search, picked: yrBtn ? yrBtn.textContent.trim() : null};
});

(async () => {
  const R = L.reporter('광고 주소 ?go=');
  const srv = await L.serve(L.ROOT, 0);
  const browser = await L.puppeteer().launch({executablePath: L.chromePath(), headless:'new', args:['--no-sandbox']});
  const errs = [];
  try{
    /* ① */
    let p = await open(browser, srv, '?go=' + NEXT, {profiles:[], activeProfileId:null}, errs);
    let a = await look(p);
    R.note(a.pend && a.url.indexOf('go=') < 0, '① 쪽지를 적고 주소에서 go 를 걷었다', JSON.stringify(a));
    await p.evaluate(function(){ window.__INYEON_TEST__.startService('self'); }); await wait(500);
    await p.evaluate(function(){ window.__INYEON_TEST__.setupFill({name:'광고손님', mbti:'ENFP', gender:'F', year:1992, month:3, day:4, timeUnknown:true, birthLonKey:'seoul', birthLon:126.98}); }); await wait(600);
    const clicked = await L.clickText(p, /^저장하고 (시작하기|[0-9]+년 사주 풀이 보기)$/); await wait(1200);
    a = await look(p);
    R.note(!!clicked, '① 저장 단추를 눌렀다');
    R.note(a.route === 'report13' && a.year === NEXT, '① 저장하면 ' + NEXT + '년 사주 풀이로 간다', JSON.stringify(a));
    R.note(a.picked === NEXT + '년 🔒' || a.picked === NEXT + '년', '① 화면의 연도 고르기도 ' + NEXT + '년', String(a.picked));
    R.note(!a.pend, '① 화면을 그린 뒤 쪽지를 지웠다');
    await p.close();
    /* ② */
    p = await open(browser, srv, '?go=' + NEXT + '&fbclid=IwAR0abc', {}, errs);
    a = await look(p);
    R.note(a.route === 'report13' && a.year === NEXT, '② 쓰시던 분은 곧장 ' + NEXT + '년 사주 풀이', JSON.stringify(a));
    R.note(a.url === '?fbclid=IwAR0abc', '② 광고 꼬리는 주소에 남는다', a.url);
    await p.close();
    /* ③ */
    p = await open(browser, srv, '?go=' + NEXT, {}, errs);
    await p.evaluate(function(){ var T = window.__INYEON_TEST__; T.goRoute('home'); localStorage.setItem('inyeon.adGo', JSON.stringify({year: (new Date()).getFullYear()+1, at: Date.now()})); T.finishConsent('compat'); }); await wait(800);
    a = await look(p);
    R.note(a.route === 'report13' && a.year === NEXT, '③ 로그인 끝에서 궁합 카드를 눌렀어도 사주 풀이로', JSON.stringify(a));
    await p.close();
    /* ④ */
    p = await open(browser, srv, '', {}, errs);
    a = await look(p);
    R.note(a.route !== 'report13' && !a.pend, '④ go 없이 열면 예전대로', JSON.stringify(a));
    await p.close();
    R.note(errs.length === 0, 'JS 오류 0건', errs.join(' | ') || '없음');
  } catch(e){ R.note(false, '검사기 자체 오류', String(e && e.stack || e)); }
  await browser.close(); srv.close && srv.close();
  process.exit(R.done());
})();
