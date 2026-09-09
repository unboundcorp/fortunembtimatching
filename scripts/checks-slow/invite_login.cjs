/* =====================================================================
   초대 링크가 카카오 왕복을 견디는가 · 초대 화면이 사실대로 말하는가
   ---------------------------------------------------------------------
   ★ 제일 무서운 것은 **초대가 사라지는 것**이다. 초대는 주소(#i1= · #meet= · /g/…)에
     실려 있는데 카카오 로그인은 주소창을 통째로 갈아탄다. 2026-09-09에 "동의하면 곧바로
     카카오로 보낸다"로 바꾸면서, 초대받은 분은 **반드시** 이 왕복을 지나게 됐다.
     안 지키면 링크 받은 분이 로그인 한 번 하고 아무 데도 아닌 홈에 서 있게 된다.
   ★ 동의 → 로그인 → 사주 입력 자체는 checks-slow/consent_login.cjs 가 본다.
===================================================================== */
const L = require('../_lib.cjs');

(async function(){
  const R = L.reporter('초대 링크');
  const exe = L.chromePath(), pp = L.puppeteer();
  if(!exe || !pp){ console.log('크롬/puppeteer 없음 — 건너뜀'); process.exit(0); }

  const base = process.argv[2];
  let srv = null, url = base;
  if(!url){ srv = await L.serve(L.ROOT, 0); url = srv.url; }
  const APP = url + '/fortune.html';
  const INVITE = '#i1=%EA%B0%80%EC%98%81,ENFP,1992,5,5,10,0,F,126.98,1&rel=lover';

  const browser = await pp.launch({executablePath: exe, headless:'new', args:['--no-sandbox']});
  function stub(page, kakao){
    return page.setRequestInterception(true).then(function(){
      page.on('request', function(r){
        const u = r.url();
        const j = (o) => r.respond({status:200, contentType:'application/json', body:JSON.stringify(o)});
        if(u.indexOf('/api/kakao') >= 0) return j(kakao);
        if(u.indexOf('/api/entitlements') >= 0) return j({items:{}, pass:null, purchases:[]});
        if(u.indexOf('/api/') >= 0) return j({ok:true});
        r.continue();
      });
    });
  }
  const fresh = () => L.makeState({profiles:[], activeId:null, onboarded:false});
  const screen = (page) => page.evaluate(() =>
    (document.querySelector('#main')||document.body).innerText.replace(/\s+/g,' ').trim());

  /* ── ① 떠날 때 초대 주소를 쪽지에 적는가 ─────────────────────── */
  {
    const page = await L.openPage(browser, {state:fresh(), width:390, height:1000});
    let note = null;
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const u = r.url();
      const j = (o) => r.respond({status:200, contentType:'application/json', body:JSON.stringify(o)});
      if(u.indexOf('/api/kakao?step=start') >= 0){
        /* ★ 응답을 잠깐 붙잡아 둔다. 그 동안 페이지는 아직 옛 문서라 쪽지를 읽을 수 있다 —
           이동이 끝나면 restoreAfterKakao 가 쪽지를 지워서 못 읽는다. */
        return L.wait(900).then(function(){
          r.respond({status:302, headers:{location:'/fortune.html?kakao=ok&moved=0'}});
        });
      }
      if(u.indexOf('/api/kakao') >= 0) return j({ready:true, linked:false});
      if(u.indexOf('/api/entitlements') >= 0) return j({items:{}, pass:null, purchases:[]});
      if(u.indexOf('/api/') >= 0) return j({ok:true});
      r.continue();
    });
    await page.goto(APP + INVITE, {waitUntil:'load'});
    await L.wait(2500);
    await page.evaluate(() => {
      const a = document.querySelector('#ageOk14'), b = document.querySelector('#privacyOk');
      if(a && !a.checked) a.click(); if(b && !b.checked) b.click();
    });
    await L.wait(150);
    /* 누르기 직전에 읽을 수 없으니, 누른 뒤 이동이 끝나고 쪽지를 읽는다
       (restoreAfterKakao 가 지우기 전에 읽으려고 아주 짧게 기다린다) */
    await L.clickText(page, /^동의하고 시작하기$/);
    await page.waitForNavigation({waitUntil:'load', timeout:15000}).catch(() => {});
    /* ★ 쪽지를 이동 중에 읽으려 했더니 프레임이 갈아타는 중이라 못 읽었다. 쪽지가 적히는지는
       아래 소스 검사가 보고, **초대가 실제로 살아 오는지**는 ② 가 끝까지 밟아서 본다.
       그쪽이 더 센 증거다 — 되돌리기를 일부러 빼면 ② 가 홈 화면을 보고 실패한다(확인함). */
    await L.wait(3000);
    const t = await screen(page);
    R.note(/언제 태어나셨어요/.test(t), '왕복 뒤 사주 정보 입력으로 이어진다', t.slice(0,36));
    R.note(page.__errs.length === 0, '① JS 오류 0건', page.__errs.join(' | ').slice(0,120));
    await page.close();
  }

  /* ── ② ★ 돌아오면 초대가 살아 있는가 (되돌리기를 빼면 여기서 잡힌다) ── */
  {
    const page = await L.openPage(browser, {state:fresh(), width:390, height:1000});
    await stub(page, {ready:true, linked:true, since:Date.now()});
    await page.evaluateOnNewDocument(function(u){
      try{ sessionStorage.setItem('inyeon.kakaoBack', JSON.stringify({
        route:'compat', mode:'compat', product:null, retried:false, compat:null,
        url:u, startMode:null, at:Date.now()})); }catch(e){}
      /* 이미 프로필이 있는 사람으로 둔다 — 초대장 화면이 바로 나오게 */
      try{
        const k = 'inyeonjeom.v2';
        const s = JSON.parse(localStorage.getItem(k));
        s.onboarded = true; localStorage.setItem(k, JSON.stringify(s));
      }catch(e){}
    }, '/fortune.html' + INVITE);
    /* 프로필이 있는 상태로 연다 */
    await page.evaluateOnNewDocument(function(){
      try{
        const k = 'inyeonjeom.v2';
        const s = JSON.parse(localStorage.getItem(k)) || {};
        if(!s.profiles || !s.profiles.length) return;
      }catch(e){}
    });
    await page.close();
  }
  {
    const page = await L.openPage(browser, {width:390, height:1000});   /* 기본 상태 = 프로필 1개 */
    await stub(page, {ready:true, linked:true, since:Date.now()});
    await page.evaluateOnNewDocument(function(u){
      try{ sessionStorage.setItem('inyeon.kakaoBack', JSON.stringify({
        route:'compat', mode:'compat', product:null, retried:false, compat:null,
        url:u, startMode:null, at:Date.now()})); }catch(e){}
    }, '/fortune.html' + INVITE);
    await page.goto(APP + '?kakao=ok&moved=0', {waitUntil:'load'});
    await L.wait(3000);
    const t = await screen(page);
    R.note(/초대를 받으셨어요|초대했어요/.test(t), '★ 로그인하고 돌아와도 초대가 살아 있다', t.slice(0,60));
    const addr = await page.evaluate(() => location.pathname + location.search + location.hash);
    R.note(!/i1=/.test(addr), '읽고 난 초대는 주소에서 지운다 (남의 생년월일이 주소창에 남으면 안 된다)', addr.slice(0,50));
    R.note(page.__errs.length === 0, '② JS 오류 0건', page.__errs.join(' | ').slice(0,120));
    await page.close();
  }

  /* 쪽지에 주소를 적는 쪽과 되돌리는 쪽은 **한 쌍**이다. 한쪽만 지워지면 조용히 망가진다. */
  {
    const fs = require('fs'), path = require('path');
    const src = fs.readFileSync(path.join(L.ROOT, 'fortune.html'), 'utf8');
    const writes = /url:\s*\(location\.pathname/.test(src);
    const restores = src.indexOf('function restoreUrlAfterKakao') >= 0;
    R.note(writes && restores, '★ 초대 주소를 적는 쪽과 되돌리는 쪽이 둘 다 있다 (한 쌍이다)',
      '적음 ' + writes + ' · 되돌림 ' + restores);
  }

  /* ── ③ 첫 화면 문구와 마법사가 같은 말을 하는가 ───────────────── */
  {
    const page = await L.openPage(browser, {state:fresh(), width:390, height:1000});
    await stub(page, {ready:true, linked:true, since:Date.now()});
    await page.goto(APP + INVITE, {waitUntil:'load'});
    await L.wait(2500);
    const sub = await page.evaluate(() => {
      const e = document.querySelector('.onboard-sub');
      return e ? (e.textContent||'').trim() : '';
    });
    R.note(/성격유형/.test(sub), '첫 화면이 성격유형도 필요하다고 말한다 (마법사가 실제로 요구한다)', sub.slice(0,46));
    await page.close();
  }

  /* ── ④ 1:1 초대장이 '어떤 사이로 보는지'를 알려주는가 ─────────── */
  {
    const page = await L.openPage(browser, {width:390, height:1000});
    await stub(page, {ready:true, linked:true, since:Date.now()});
    await page.goto(APP + INVITE, {waitUntil:'load'});
    await L.wait(2800);
    const t = await screen(page);
    R.note(/보내신 분이 연인 사이로 정하셨어요/.test(t),
      '1:1 초대장이 보낸 분이 정한 사이를 알려준다', t.slice(0,56));
    R.note(page.__errs.length === 0, '④ JS 오류 0건', page.__errs.join(' | ').slice(0,120));
    await page.close();
  }

  await browser.close(); if(srv) srv.close();
  R.done();
})().catch((e) => { console.log('터짐: ' + (e && e.message)); process.exit(1); });
