/* =====================================================================
   링크로 들어오신 분께 로그인을 먼저 권한다 (2026-09-09 대표님 지시)
   ---------------------------------------------------------------------
   ★ 여기서 제일 무서운 것은 로그인 창이 뜨느냐가 아니라, **로그인하고 돌아왔을 때
     초대가 남아 있느냐**다. 초대는 주소(#i1= · #meet= · /g/…)에 실려 있는데
     카카오 로그인은 주소창을 통째로 갈아탄다. 안 지키면 초대받은 분이 로그인 한 번
     하고 나서 아무 데도 아닌 홈에 서 있게 된다.
===================================================================== */
const L = require('../_lib.cjs');

(async function(){
  const R = L.reporter('초대 로그인');
  const exe = L.chromePath(), pp = L.puppeteer();
  if(!exe || !pp){ console.log('크롬/puppeteer 없음 — 건너뜀'); process.exit(0); }

  const base = process.argv[2];
  let srv = null, url = base;
  if(!url){ srv = await L.serve(L.ROOT, 0); url = srv.url; }
  const APP = url + '/fortune.html';

  const browser = await pp.launch({executablePath: exe, headless:'new', args:['--no-sandbox']});

  /* /api/* 를 가짜로 받는다 — 진짜 서버를 안 부른다 */
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

  /* 손님 프로필이 하나도 없는 상태 — 링크를 처음 받은 분이 바로 이 상태다 */
  const fresh = L.makeState({profiles:[], activeId:null, onboarded:false});
  const INVITE = '#i1=%EA%B0%80%EC%98%81,ENFP,1992,5,5,10,0,F,126.98,1&rel=friend';

  /* 만 14세 확인에 체크하고 [시작하기]를 누른다 — 손님이 실제로 밟는 순서다 */
  async function passAgeGate(page){
    await page.evaluate(() => {
      const box = document.querySelector('#ageOk14');
      if(box && !box.checked){ box.click(); }
    });
    await L.wait(250);
    return L.clickText(page, /^(시작하기|정보 넣고 궁합 보기)$/, {all:true});
  }

  /* ── ① 만 14세 확인 **전에는** 묻지 않는다 ─────────────────────
     ★ 나이를 확인하기도 전에 카카오 계정을 붙이면 처리방침 제9조("만 14세 미만의
       개인정보는 알면서 수집하지 않는다")와 어긋난다. 순서가 곧 규칙이다. */
  {
    const page = await L.openPage(browser, {state:fresh, width:390, height:900});
    await stub(page, {ready:true, linked:false});
    await page.goto(APP + INVITE, {waitUntil:'load'});
    await L.wait(3500);
    const has = await page.evaluate(() => !!document.querySelector('.modal-box'));
    R.note(!has, '★ 만 14세 확인 전에는 로그인을 권하지 않는다');
    await page.close();
  }

  /* ── ② 동의한 뒤에는 권한다 ──────────────────────────────────── */
  {
    const page = await L.openPage(browser, {state:fresh, width:390, height:900});
    await stub(page, {ready:true, linked:false});
    await page.goto(APP + INVITE, {waitUntil:'load'});
    await L.wait(3500);
    await passAgeGate(page);
    await L.wait(800);
    const m = await page.evaluate(() => {
      const b = document.querySelector('.modal-box');
      return b ? (b.innerText||'').replace(/\s+/g,' ').trim() : '';
    });
    R.note(/카카오로 시작하기/.test(m), '동의한 뒤에는 로그인을 먼저 권한다', m.slice(0,44));
    R.note(/나중에 하기/.test(m), '안 하고 넘어갈 길도 함께 준다 (막지 않는다)');
    R.note(page.__errs.length === 0, '② JS 오류 0건', page.__errs.join(' | ').slice(0,120));
    await page.close();
  }

  /* ── ② 그냥 들어온 분에게는 안 묻는다 ─────────────────────────── */
  {
    const page = await L.openPage(browser, {state:fresh, width:390, height:900});
    await stub(page, {ready:true, linked:false});
    await page.goto(APP, {waitUntil:'load'});
    await L.wait(3500);
    await passAgeGate(page); await L.wait(800);
    const has = await page.evaluate(() => !!document.querySelector('.modal-box'));
    R.note(!has, '링크 없이 들어온 분에게는 안 묻는다');
    await page.close();
  }

  /* ── ③ 이미 로그인한 분에게는 안 묻는다 ───────────────────────── */
  {
    const page = await L.openPage(browser, {state:fresh, width:390, height:900});
    await stub(page, {ready:true, linked:true, since:Date.now()});
    await page.goto(APP + INVITE, {waitUntil:'load'});
    await L.wait(3500);
    await passAgeGate(page); await L.wait(800);
    const has = await page.evaluate(() => !!document.querySelector('.modal-box'));
    R.note(!has, '이미 로그인한 분에게는 안 묻는다');
    await page.close();
  }

  /* ── ④ 카카오가 안 열려 있으면 안 묻는다 ──────────────────────── */
  {
    const page = await L.openPage(browser, {state:fresh, width:390, height:900});
    await stub(page, {ready:false, linked:false});
    await page.goto(APP + INVITE, {waitUntil:'load'});
    await L.wait(3500);
    await passAgeGate(page); await L.wait(800);
    const has = await page.evaluate(() => !!document.querySelector('.modal-box'));
    R.note(!has, '카카오가 안 열려 있으면 권하지 않는다 (눌러도 안 되는 것을 권하지 않는다)');
    await page.close();
  }

  /* ── ⑤ ★ 로그인하러 갈 때 초대 주소를 적어 두는가 ─────────────── */
  let noteUrl = null;
  {
    const page = await L.openPage(browser, {state:fresh, width:390, height:900});
    await stub(page, {ready:true, linked:false});
    await page.goto(APP + INVITE, {waitUntil:'load'});
    await L.wait(3500);
    await passAgeGate(page);
    await L.wait(800);
    /* 카카오로 나가는 이동을 막고, 나가기 직전에 적어 둔 쪽지를 읽는다 */
    await page.evaluate(() => {
      const d = Object.getOwnPropertyDescriptor(window, 'location');
      try{ delete window.location; }catch(e){}
      window.__went = null;
      try{ Object.defineProperty(window, 'location', {
        configurable:true,
        get(){ return new Proxy(d ? d.value : document.location, {
          set(t, k, v){ if(k === 'href'){ window.__went = v; return true; } t[k] = v; return true; },
          get(t, k){ const x = t[k]; return typeof x === 'function' ? x.bind(t) : x; } }); }
      }); }catch(e){}
    });
    const clicked = await L.clickText(page, /^카카오로 시작하기$/);
    await L.wait(400);
    const r = await page.evaluate(() => {
      let note = null;
      try{ note = JSON.parse(sessionStorage.getItem('inyeon.kakaoBack')||'null'); }catch(e){}
      return {went: window.__went, note};
    });
    noteUrl = r.note && r.note.url;
    R.note(!!clicked, '[카카오로 시작하기]를 누를 수 있다', clicked || '못 찾음');
    R.note(!!(r.note && r.note.url && r.note.url.indexOf('#i1=') >= 0),
      '★ 떠나기 전에 초대 주소를 적어 둔다 (안 적으면 돌아왔을 때 초대가 사라진다)',
      (r.note && r.note.url ? r.note.url.slice(0, 40) : '안 적혔음'));
    await page.close();
  }

  /* ── ⑥ ★ 돌아오면 초대가 살아 있는가 ──────────────────────────── */
  if(noteUrl){
    const page = await L.openPage(browser, {state:fresh, width:390, height:900});
    await stub(page, {ready:true, linked:true, since:Date.now()});
    await page.evaluateOnNewDocument(function(u){
      try{ sessionStorage.setItem('inyeon.kakaoBack', JSON.stringify({
        route:'compat', mode:'compat', product:null, retried:false, compat:null,
        url:u, at:Date.now()})); }catch(e){}
    }, noteUrl);
    await page.goto(APP + '?kakao=ok&moved=0', {waitUntil:'load'});
    await L.wait(3500);
    const seen = await page.evaluate(() => (document.body.innerText||'').replace(/\s+/g,' '));
    /* 초대가 살아 있으면 '궁합 초대를 받으셨어요' 화면이 나온다. 잃어버리면 그냥 첫 화면이다. */
    R.note(/초대를 받으셨어요/.test(seen), '★ 로그인하고 돌아와도 초대가 살아 있다', seen.slice(0,60));
    /* ★ 주소에 kakao=ok 가 남았는지는 보지 않는다 — handleKakaoReturn() 이 읽고 나서
       일부러 지운다(새로고침할 때마다 같은 안내가 뜨면 안 되기 때문). 초대 해시도 같은
       이유로 지워진다. 여기서 볼 것은 **화면에 초대가 살아 있느냐** 하나다. */
    const url = await page.evaluate(() => location.pathname + location.search + location.hash);
    R.note(!/i1=/.test(url), '읽고 난 초대는 주소에서 지운다 (남의 생년월일이 주소창에 남으면 안 된다)', url.slice(0,60));
    R.note(page.__errs.length === 0, '⑥ JS 오류 0건', page.__errs.join(' | ').slice(0,120));
    await page.close();
  } else {
    R.bad('돌아와서 초대가 살아 있다', '적어 둔 주소가 없어 재 볼 수 없었음');
  }

  /* ── ⑦ 화면이 실제 순서와 같은 말을 하는가 (2026-09-09 대표님 지시) ────
     ★ "생년월일만 넣으면 된다"고 해 놓고 다음 화면에서 성격유형을 요구하면, 들어와서
       두 번째 화면에 안 적힌 것을 요구받는 것이다. 문구와 마법사는 한 쌍이다. */
  {
    const page = await L.openPage(browser, {state:fresh, width:390, height:900});
    await stub(page, {ready:true, linked:true, since:Date.now()});
    await page.goto(APP + INVITE, {waitUntil:'load'});
    await L.wait(3000);
    const sub = await page.evaluate(() => {
      const e = document.querySelector('.onboard-sub');
      return e ? (e.textContent||'').trim() : '';
    });
    R.note(/성격유형/.test(sub), '첫 화면이 성격유형도 필요하다고 말한다 (마법사가 실제로 요구한다)',
      sub.slice(0,50));
    /* 정말 요구하는지도 함께 본다 — 요구하지 않게 바뀌면 위 문구도 고쳐야 한다 */
    await page.evaluate(() => { const c = document.querySelector('#ageOk14'); if(c && !c.checked) c.click(); });
    await L.wait(200);
    await L.clickText(page, /^(시작하기|정보 넣고 궁합 보기)$/, {all:true});
    await L.wait(900);
    const gate = await page.evaluate(() => (document.body.innerText||'').indexOf('성격유형') >= 0);
    R.note(gate, '마법사에 성격유형 단계가 실제로 있다');
    await page.close();
  }

  /* ── ⑧ 1:1 초대장이 '어떤 사이로 보는지'를 알려주는가 ──────────
     ★ 사이에 따라 점수 비중과 풀이가 달라진다. 안 알리고 적용하면, 연인으로 보낸 링크를
       연 분은 아무 설명 없이 연인 궁합을 보게 된다. 그룹 참여 화면에는 있었는데
       1:1 초대장에만 빠져 있었다 — 같은 사실을 한쪽에서만 알리고 있었다. */
  {
    const page = await L.openPage(browser, {width:390, height:900});   /* 프로필이 있는 상태 */
    await stub(page, {ready:true, linked:true, since:Date.now()});
    await page.goto(APP + '#i1=%EA%B0%80%EC%98%81,ENFP,1992,5,5,10,0,F,126.98,1&rel=lover',
      {waitUntil:'load'});
    await L.wait(3000);
    const t = await page.evaluate(() => (document.querySelector('#main')||document.body).innerText.replace(/\s+/g,' '));
    R.note(/보내신 분이 연인 사이로 정하셨어요/.test(t),
      '1:1 초대장이 보낸 분이 정한 사이를 알려준다', t.slice(0,60));
    R.note(page.__errs.length === 0, '⑧ JS 오류 0건', page.__errs.join(' | ').slice(0,120));
    await page.close();
  }

  await browser.close(); if(srv) srv.close();
  R.done();
})().catch((e) => { console.log('터짐: ' + (e && e.message)); process.exit(1); });
