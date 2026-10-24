#!/usr/bin/env node
/* =====================================================================
   이용 기록 — 화면이 실제로 무엇을 보내나 (느린 층 · 2026-10-24)
   ---------------------------------------------------------------------
   /api/visit 를 가로채 셉니다(진짜 서버로는 아무것도 안 나감).
   ① 열면 'open' + 그 화면 'tab:<ROUTE>' 를 한 번에 묶어 보낸다
   ② 탭을 옮기면 새 화면만 보낸다 · 같은 화면을 다시 열어도 안 보낸다
   ③ 같은 날 다시 열면(새로고침) 'open' 을 또 안 보낸다
   ④ 모임 링크(/g/)로 열면 'in:group' · 광고 꼬리면 'in:ad'
   ⑤ 이름·생년이 안 실린다 · 우리 주소가 아니면(검사 표식 없음) 아무것도 안 보낸다
===================================================================== */
const { chromePath, puppeteer, serve, reporter, openPage, wait, makeState, ROOT } = require('../_lib.cjs');
const R = reporter('이용 기록(화면)');
(async function(){
  const pptr = puppeteer(), chrome = chromePath();
  if(!pptr || !chrome){ console.log('크롬을 못 찾았습니다 — 건너뜁니다'); process.exit(0); }
  const base = process.argv[2];
  const site = base ? {url:base, close:function(){}} : await serve(ROOT, 0);
  const browser = await pptr.launch({executablePath: chrome, headless:'new', args:['--no-sandbox','--disable-dev-shm-usage']});
  const errs = [];
  let posts = [];
  async function open(opt){
    const p = await openPage(browser, {hook:true, state: makeState(opt.state || {})});
    p.on('pageerror', e => errs.push(String(e)));
    if(opt.mark !== false) await p.evaluateOnNewDocument(function(){ window.__VISIT_TEST__ = true; });
    /* 창마다 그날 보낸 목록을 비우고 시작한다(같은 브라우저라 localStorage 를 나눠 씀). 새로고침 때는 안 비운다 */
    await p.evaluateOnNewDocument(function(){ try{ if(!sessionStorage.getItem('__vk')){ localStorage.removeItem('inyeon.visit'); sessionStorage.setItem('__vk','1'); } }catch(e){} });
    await p.setRequestInterception(true);
    p.on('request', function(req){
      const u = req.url();
      if(u.indexOf('/api/visit') >= 0){ try{ posts.push(JSON.parse(req.postData() || '{}').items || []); }catch(e){} return req.respond({status:200, contentType:'application/json', body:'{"ok":true}'}); }
      if(opt.loggedOut && u.indexOf('/api/kakao') >= 0) return req.respond({status:200, contentType:'application/json', body:'{"ready":true,"linked":false}'});
      if(u.indexOf('/api/group') >= 0) return req.respond({status:404, contentType:'application/json', body:'{"error":"not_found"}'});
      req.continue();
    });
    await p.goto(site.url + (opt.path || '/fortune.html') + (opt.q || ''), {waitUntil:'domcontentloaded'}); await wait(opt.wait || 2600);
    return p;
  }
  const flat = () => [].concat.apply([], posts);
  try{
    /* ① */
    posts = [];
    let p = await open({});
    const route = await p.evaluate(function(){ return window.__INYEON_TEST__ ? document.querySelector('.tab-btn[aria-current="page"]') && document.querySelector('.tab-btn[aria-current="page"]').getAttribute('data-route') : null; });
    R.note(posts.length === 1 && flat()[0] === 'open' && flat().indexOf('tab:home') >= 0 && flat().indexOf('tab:gate') < 0, '① 열면 open + 그 화면을 한 번에 (부팅 기다림을 동의 화면으로 안 셈)', JSON.stringify(posts) + ' ' + route);
    /* ② */
    await p.click('.tab-btn[data-route="compat"]'); await wait(300);
    await p.click('.tab-btn[data-route="today"]'); await wait(300);
    await p.click('.tab-btn[data-route="compat"]'); await wait(2200);
    const f2 = flat();
    R.note(f2.filter(x => x === 'tab:compat').length === 1 && f2.indexOf('tab:today') >= 0, '② 옮긴 화면을 보내되 같은 화면은 하루 한 번', JSON.stringify(posts));
    const nm = await p.evaluate(function(){ var m = window.__INYEON_TEST__.activeProfile(); return {n:m.name, y:String(m.year)}; });
    R.note(JSON.stringify(posts).indexOf(nm.n) < 0 && JSON.stringify(posts).indexOf(nm.y) < 0, '⑤ 이름·태어난 해가 안 실린다');
    /* ③ */
    posts = [];
    await p.reload({waitUntil:'domcontentloaded'}); await wait(2600);
    R.note(flat().indexOf('open') < 0 && flat().indexOf('tab:home') < 0, '③ 같은 날 다시 열면(새로고침) open·같은 화면을 또 안 보낸다', JSON.stringify(posts));
    await p.close();
    /* ④ */
    posts = [];
    p = await open({q:'#g=abcdefgh1234'});
    R.note(flat().indexOf('in:group') >= 0, '④ 모임 링크로 열면 in:group', JSON.stringify(posts));
    await p.close();
    posts = [];
    p = await open({q:'?fbclid=IwAR0abc&utm_source=instagram'});
    R.note(flat().indexOf('in:ad') >= 0, '④ 광고 꼬리면 in:ad', JSON.stringify(posts));
    await p.close();
    /* ⑥ 로그인 안 된 분 — 동의·로그인 화면에 머물면 tab:gate */
    posts = [];
    p = await open({loggedOut:true, state:{kakaoSeen:false}, wait:3200});
    R.note(flat().indexOf('tab:gate') >= 0 && !flat().some(x => /^tab:(home|today)$/.test(x)), '⑥ 로그인 안 된 분은 tab:gate (서비스 화면으로 안 셈)', JSON.stringify(posts));
    await p.close();
    /* ⑤ 우리 주소가 아니면 */
    posts = [];
    p = await open({mark:false});
    R.note(posts.length === 0, '⑤ 우리 주소(inyeonjeom.kr)가 아니면 안 보낸다', JSON.stringify(posts));
    await p.close();
    R.note(errs.length === 0, 'JS 오류 0', errs.join(' | ').slice(0,200));
  }catch(e){ R.bad('검사 중 오류', String(e && e.stack || e).slice(0,300)); }
  await browser.close(); site.close();
  R.done();
})();
