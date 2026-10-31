/* =====================================================================
   궁합 광고 주소 ?go=compat (느린 층 · 2026-10-31 대표님)
   ---------------------------------------------------------------------
   ① 새 손님 첫 화면: '우리 궁합, 몇 점일까요?' · 카드 하나(궁합) · 카카오 단추 첫 화면 안 · 주소에서 go 걷힘
   ② 로그인 끝(finishConsent)에서 어느 카드를 눌렀든 → 정보 입력 → 저장 단추 '저장하고 궁합 보기' → 궁합(둘이서) 화면
   ③ 이미 쓰시던 분(프로필 있음)은 곧장 궁합 화면 · 쪽지는 그린 뒤 지워짐
   ④ go 없이 열면 예전 그대로 · ?go=2027 은 여전히 사주 풀이
===================================================================== */
const L = require('../_lib.cjs');
const wait = L.wait;
(async () => {
  const R = L.reporter('궁합 광고 주소 ?go=compat');
  const srv = await L.serve(L.ROOT, 0);
  const browser = await L.puppeteer().launch({executablePath: L.chromePath(), headless:'new', args:['--no-sandbox']});
  const errs = [];
  async function open(q, state, loggedOut){
    const p = await L.openPage(browser, {hook:true, width:390, height:844, state: state});
    p.on('pageerror', e => errs.push(String(e)));
    await p.evaluateOnNewDocument(function(){ try{ if(!sessionStorage.getItem('__c')){ localStorage.removeItem('inyeon.adGo'); sessionStorage.setItem('__c','1'); } }catch(e){} });
    if(loggedOut){ await p.setRequestInterception(true);
      p.on('request', r => { if(r.url().indexOf('/api/kakao') >= 0) return r.respond({status:200, contentType:'application/json', body:'{"ready":true,"linked":false}'}); r.continue(); }); }
    await p.goto(srv.url + '/fortune.html' + q, {waitUntil:'networkidle0'}); await wait(1200);
    return p;
  }
  try{
    let p = await open('?go=compat&fbclid=IwAR0abc', {}, true);
    let a = await p.evaluate(function(){
      var k = Array.prototype.filter.call(document.querySelectorAll('#main button'), function(b){ return /카카오로 로그인하기/.test(b.textContent); })[0];
      return {lead: (document.querySelector('.onboard-lead')||{}).textContent, cards: Array.prototype.map.call(document.querySelectorAll('#main .svc-card .svc-title'), function(x){ return x.textContent; }),
        kakaoTop: k ? k.getBoundingClientRect().top : null, url: location.search, ov: document.documentElement.scrollWidth > document.documentElement.clientWidth};
    });
    R.note(a.lead === '우리 궁합, 몇 점일까요?', '① 제목', a.lead);
    R.note(a.cards.length === 1 && /궁합/.test(a.cards[0]), '① 카드는 궁합 하나', a.cards.join(','));
    R.note(a.kakaoTop != null && a.kakaoTop < 844, '① 카카오 단추가 첫 화면 안', String(a.kakaoTop));
    R.note(a.url === '?fbclid=IwAR0abc' && !a.ov, '① 주소에서 go 를 걷고 광고 꼬리는 남김 · 넘침 없음', a.url);
    await p.close();
    /* ② 로그인 끝 · 프로필 없음 */
    p = await open('?go=compat', L.makeState({profiles:[], activeProfileId:null}));
    await p.evaluate(function(){ window.__INYEON_TEST__.finishConsent('self'); }); await wait(700);
    await p.evaluate(function(){ window.__INYEON_TEST__.setupFill({name:'궁합광고', mbti:'ISFJ', gender:'M', year:1993, month:8, day:2, timeUnknown:true, birthLonKey:'seoul', birthLon:126.98}); }); await wait(700);
    const lab = await p.evaluate(function(){ var b = Array.prototype.filter.call(document.querySelectorAll('#main button'), function(x){ return /^저장하고/.test(x.textContent.trim()); })[0]; return b ? b.textContent.trim() : ''; });
    R.note(lab === '저장하고 궁합 보기', '② 저장 단추 글자', lab);
    await L.clickText(p, /^저장하고/); await wait(1500);
    a = await p.evaluate(function(){ var T = window.__INYEON_TEST__; return {route: T.route(), pend: !!localStorage.getItem('inyeon.adGo'), link: /상대방에게 궁합 링크 보내기/.test(document.querySelector('#main').textContent)}; });
    R.note(a.route === 'compat' && a.link, '② 저장하면 궁합 링크 보내기 화면', JSON.stringify(a));
    R.note(!a.pend, '② 화면을 그린 뒤 쪽지를 지웠다');
    await p.close();
    /* ③ 쓰시던 분 */
    p = await open('?go=compat', L.makeState({}));
    a = await p.evaluate(function(){ return {route: window.__INYEON_TEST__.route()}; });
    R.note(a.route === 'compat', '③ 쓰시던 분은 곧장 궁합 화면', JSON.stringify(a));
    await p.close();
    /* ④ */
    p = await open('', L.makeState({}));
    a = await p.evaluate(function(){ return {route: window.__INYEON_TEST__.route()}; });
    R.note(a.route === 'home', '④ go 없이 열면 예전대로 홈', JSON.stringify(a));
    await p.close();
    p = await open('?go=' + (new Date().getFullYear()+1), L.makeState({}));
    a = await p.evaluate(function(){ return {route: window.__INYEON_TEST__.route()}; });
    R.note(a.route === 'report13', '④ ?go=YYYY 는 여전히 사주 풀이', JSON.stringify(a));
    await p.close();
    R.note(errs.length === 0, 'JS 오류 0건', errs.slice(0,2).join(' / ') || '없음');
  } finally { await browser.close(); srv.close(); }
  R.done();
})();
