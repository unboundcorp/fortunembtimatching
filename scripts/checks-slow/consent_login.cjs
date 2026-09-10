/* =====================================================================
   동의 → 카카오 로그인 → 사주 정보 입력 (2026-09-09 대표님 지시)
   ---------------------------------------------------------------------
   > "궁합 링크 받은 사람, 개인 사주 보는 사람 모드 예외없이 카카오톡 로그인 하게
   >  프로세스 만들어라 / 만 14세 이상, 사주 분석 목적 개인정보 제공 동의 버튼 누르고
   >  바로 카카오 로그인되게해라 그리고 사주정보 입력하게 해라"

   ★ 여기서 제일 무서운 것은 **막다른 길**이다. 로그인을 필수로 걸어 놓고 카카오가
     멈추면 아무도 서비스를 못 쓴다. 그래서 "카카오를 쓸 수 없을 때는 요구하지 않는다"를
     검사로 못 박는다.
   ★ 카카오 왕복을 통째로 흉내 낸다 — `/api/kakao?step=start` 를 302 로 돌려보내면
     진짜와 같은 경로(주소 갈아타기 → ?kakao=ok 로 복귀)를 밟는다. 진짜 카카오를 안 부른다.
===================================================================== */
const L = require('../_lib.cjs');

(async function(){
  const R = L.reporter('동의·로그인·입력');
  const exe = L.chromePath(), pp = L.puppeteer();
  if(!exe || !pp){ console.log('크롬/puppeteer 없음 — 건너뜀'); process.exit(0); }

  const base = process.argv[2];
  let srv = null, url = base;
  if(!url){ srv = await L.serve(L.ROOT, 0); url = srv.url; }
  const APP = url + '/fortune.html';
  const INVITE = '#i1=%EA%B0%80%EC%98%81,ENFP,1992,5,5,10,0,F,126.98,1&rel=lover';

  const browser = await pp.launch({executablePath: exe, headless:'new', args:['--no-sandbox']});
  const fresh = () => L.makeState({profiles:[], activeId:null, onboarded:false});

  /* 화면 소스에 적힌 표식을 그대로 읽어 온다 — 검사기에 손으로 베껴 두면 어긋난다 */
  const RESET_ID = (function(){
    const fs = require('fs'), path = require('path');
    const src = fs.readFileSync(path.join(L.ROOT, 'fortune.html'), 'utf8');
    const m = /var STATE_RESET_ID = '([^']+)'/.exec(src);
    return m ? m[1] : null;
  })();
  R.note(!!RESET_ID, '기기 비우기 표식(STATE_RESET_ID)이 있다', RESET_ID || '없음');

  function stubLinked(page){
    return page.setRequestInterception(true).then(function(){
      page.on('request', function(r){
        const u = r.url();
        const j = (o) => r.respond({status:200, contentType:'application/json', body:JSON.stringify(o)});
        if(u.indexOf('/api/kakao') >= 0) return j({ready:true, linked:true, since:Date.now()});
        if(u.indexOf('/api/entitlements') >= 0) return j({items:{}, pass:null, purchases:[]});
        if(u.indexOf('/api/sync') >= 0) return j({ok:true, data:{}});
        if(u.indexOf('/api/') >= 0) return j({ok:true});
        r.continue();
      });
    });
  }

  /* kakaoReady=false 면 카카오가 꺼진 상태를 흉내 낸다 */
  async function open(hash, kakaoReady){
    const page = await L.openPage(browser, {state:fresh(), width:390, height:1000});
    page.__went = 0;
    let linked = false;
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const u = r.url();
      const j = (o) => r.respond({status:200, contentType:'application/json', body:JSON.stringify(o)});
      if(u.indexOf('/api/kakao?step=start') >= 0){
        page.__went++; linked = true;
        return r.respond({status:302, headers:{location:'/fortune.html?kakao=ok&moved=0'}});
      }
      if(u.indexOf('/api/kakao') >= 0) return j({ready:kakaoReady, linked:linked, since:Date.now()});
      if(u.indexOf('/api/entitlements') >= 0) return j({items:{}, pass:null, purchases:[]});
      if(u.indexOf('/api/') >= 0) return j({ok:true});
      r.continue();
    });
    await page.goto(APP + (hash||''), {waitUntil:'load'});
    await L.wait(2500);
    return page;
  }
  const consent = (page) => page.evaluate(() => {
    const a = document.querySelector('#ageOk14'), b = document.querySelector('#privacyOk');
    if(a && !a.checked) a.click();
    if(b && !b.checked) b.click();
    return !!(a && b);
  });
  const screen = (page) => page.evaluate(() =>
    (document.querySelector('#main')||document.body).innerText.replace(/\s+/g,' ').trim());

  /* ── ① 동의 칸이 둘이고, 둘 다 눌러야 시작할 수 있다 ──────────── */
  {
    const page = await open('', true);
    const t = await screen(page);
    R.note(/만 14세 이상이에요/.test(t), '만 14세 확인을 묻는다');
    R.note(/사주 분석에 필요한 정보 제공에 동의해요/.test(t)
        && /생년월일, 태어난 시각, 성별, 출생지/.test(t),
      '사주 분석 목적으로 무엇을 받는지 적고 따로 동의를 받는다');
    const left = await page.evaluate(() => {
      const l = document.querySelector('.chk-list label[for="privacyOk"]');
      if(!l) return null;
      const row = l.closest('.chk-row'), list = document.querySelector('.chk-list');
      return { align: getComputedStyle(l).textAlign,
               flush: Math.round(row.getBoundingClientRect().left - list.getBoundingClientRect().left) };
    });
    R.note(!!left && left.align === 'left' && left.flush <= 1,
      '동의 줄이 왼쪽으로 가지런히 선다',
      left ? (left.align + ' · 왼쪽 여백 ' + left.flush) : '못 찾음');
    const both = await page.evaluate(() => !!(document.querySelector('#ageOk14') && document.querySelector('#privacyOk')));
    R.note(both, '동의 칸이 두 개다 (나이 확인과 개인정보 동의는 별개다)');

    const off = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /동의하고 시작하기/.test(x.textContent||''));
      return b ? b.disabled : null;
    });
    R.note(off === true, '동의 전에는 [동의하고 시작하기]가 안 눌린다');

    /* 하나만 켜도 안 열려야 한다 */
    await page.evaluate(() => document.querySelector('#ageOk14').click());
    await L.wait(150);
    const half = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /동의하고 시작하기/.test(x.textContent||''));
      return b ? b.disabled : null;
    });
    R.note(half === true, '나이만 체크해서는 안 열린다 (개인정보 동의가 따로 필요하다)');
    await page.close();
  }

  /* ── ② 그냥 오신 분: 동의 → 카카오 → 사주 입력 ────────────────── */
  {
    const page = await open('', true);
    await consent(page);
    await L.clickText(page, /^동의하고 시작하기$/);
    await page.waitForNavigation({waitUntil:'load', timeout:15000}).catch(() => {});
    await L.wait(3200);
    const t = await screen(page);
    R.note(page.__went === 1, '동의를 누르면 곧바로 카카오로 보낸다', '보낸 횟수 ' + page.__went);
    R.note(/언제 태어나셨어요/.test(t), '로그인하고 돌아오면 사주 정보를 받는다', t.slice(0,40));
    const on = await page.evaluate(() => (JSON.parse(localStorage.getItem('inyeonjeom.v2')||'{}')).onboarded);
    R.note(on === true, '로그인까지 끝난 뒤에 시작으로 친다');
    R.note(page.__errs.length === 0, '② JS 오류 0건', page.__errs.join(' | ').slice(0,120));
    await page.close();
  }

  /* ── ③ 초대받은 분도 예외 없다 ────────────────────────────────── */
  {
    const page = await open(INVITE, true);
    await consent(page);
    await L.clickText(page, /^동의하고 시작하기$/);
    await page.waitForNavigation({waitUntil:'load', timeout:15000}).catch(() => {});
    await L.wait(3200);
    const t = await screen(page);
    R.note(page.__went === 1, '초대받은 분도 동의 뒤 곧바로 카카오로 간다', '보낸 횟수 ' + page.__went);
    R.note(/언제 태어나셨어요/.test(t), '돌아오면 사주 정보를 받는다', t.slice(0,40));
    R.note(page.__errs.length === 0, '③ JS 오류 0건', page.__errs.join(' | ').slice(0,120));
    await page.close();
  }

  /* ── ④ ★ 카카오를 못 써도 **들여보내지 않는다** ────────────────
     2026-09-09 대표님 지시 "카카오 로그인은 필수로 해라 그냥".
     ★ 다만 막다른 길이면 안 된다 — 왜 안 되는지 말하고 [다시 시도]가 있어야 한다. */
  {
    const page = await open('', false);
    await consent(page);
    await L.clickText(page, /^동의하고 시작하기$/);
    await L.wait(3000);   /* 지나가게 두기 전에 한 번 더 물어보므로 조금 더 기다린다 */
    const t = await screen(page);
    const m = await page.evaluate(() => {
      const b = document.querySelector('.modal-box');
      return b ? (b.innerText||'').replace(/\s+/g,' ').trim() : '';
    });
    R.note(page.__went === 0, '카카오가 꺼져 있으면 로그인으로 보내지 않는다', '보낸 횟수 ' + page.__went);
    R.note(!/언제 태어나셨어요/.test(t),
      '★ 로그인 없이는 사주 입력으로 들어가지 못한다 (예외 없음)', t.slice(0,40));
    R.note(/지금은 카카오 로그인을 할 수 없어요/.test(m),
      '★ 왜 안 되는지 말해 준다 (아무 말 없이 멈춰 있지 않는다)', m.slice(0,44));
    R.note(/다시 시도/.test(m), '★ 다시 해 볼 길을 준다 (막다른 길이 아니다)');
    const on = await page.evaluate(() => (JSON.parse(localStorage.getItem('inyeonjeom.v2')||'{}')).onboarded);
    R.note(on !== true, '로그인 전에는 시작한 것으로 치지 않는다', 'onboarded=' + on);
    await page.close();
  }

  /* ── ⑤ 화면이 "로그인 안 해도 된다"고 말하지 않는가 ───────────── */
  {
    const page = await open('', true);
    const t = await screen(page);
    R.note(!/회원가입도, 앱 설치도 없이/.test(t),
      '첫 화면이 더는 "회원가입 없이"를 약속하지 않는다', t.slice(0,60));
    await page.close();
  }

  /* 소스에 옛 약속이 남아 있지 않은지 (문서는 모달이라 화면 검사로는 새기 쉽다) */
  {
    const fs = require('fs'), path = require('path');
    const src = fs.readFileSync(path.join(L.ROOT, 'fortune.html'), 'utf8');
    const bad = [
      '무료로 보시는 범위에서는 선택',
      '무료 범위는 로그인 없이 그대로 이용',
      '무료 이용에는 필요하지 않으며',
      '무료로 보시는 부분은 로그인 없이',
      '무료로 보시는 것은 로그인도 필요 없어요',
    ].filter((x) => src.indexOf(x) >= 0);
    R.note(bad.length === 0,
      '약관·처리방침·FAQ 에 "로그인 없이 써도 된다"는 옛 문장이 남아 있지 않다',
      bad.length ? bad.join(' / ') : '0건');
  }

  /* ── ⑤-2 ★ 이미 쓰시던 분도 예외가 없다 (2026-09-09 "기존 데이터는 다 날려") ──
     ★ 여기가 제일 조심스러운 자리다. 로그인 여부를 **알기 전에** 막으면 이미 로그인하신
       분도 동의 화면이 한 번 번쩍인다. 그래서 KAKAO.loaded 를 함께 본다. */
  {
    const page = await L.openPage(browser, {state:L.makeState({onboarded:true}), width:390, height:1000});
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const u = r.url();
      const j = (o) => r.respond({status:200, contentType:'application/json', body:JSON.stringify(o)});
      if(u.indexOf('/api/kakao') >= 0) return j({ready:true, linked:false});
      if(u.indexOf('/api/entitlements') >= 0) return j({items:{}, pass:null, purchases:[]});
      if(u.indexOf('/api/') >= 0) return j({ok:true});
      r.continue();
    });
    await page.goto(APP, {waitUntil:'load'});
    await L.wait(2800);
    const t = await screen(page);
    R.note(/만 14세 이상이에요/.test(t),
      '★ 프로필이 있어도 로그인 안 했으면 동의·로그인 화면에 선다 (예외 없음)', t.slice(0,40));
    const dup = await page.evaluate(() => !!document.querySelector('.modal-box'));
    R.note(!dup, '그 위에 로그인 권유 창을 또 띄우지 않는다 (같은 말을 두 번 하지 않는다)');
    await page.close();
  }
  {
    /* 로그인한 분은 그대로 서비스로 들어간다 — 관문이 과하게 걸리면 여기서 잡힌다 */
    const page = await L.openPage(browser, {state:L.makeState({onboarded:true}), width:390, height:1000});
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const u = r.url();
      const j = (o) => r.respond({status:200, contentType:'application/json', body:JSON.stringify(o)});
      if(u.indexOf('/api/kakao') >= 0) return j({ready:true, linked:true, since:Date.now()});
      if(u.indexOf('/api/entitlements') >= 0) return j({items:{}, pass:null, purchases:[]});
      if(u.indexOf('/api/sync') >= 0) return j({ok:true, data:{}});
      if(u.indexOf('/api/') >= 0) return j({ok:true});
      r.continue();
    });
    await page.goto(APP, {waitUntil:'load'});
    await L.wait(2800);
    const t = await screen(page);
    R.note(!/만 14세 이상이에요/.test(t),
      '로그인하신 분은 관문에 안 걸린다 (동의 화면이 번쩍이지 않는다)', t.slice(0,40));
    await page.close();
  }

  /* ── ⑥ ★ 잠깐 못 물어본 것과 정말 못 하는 것을 가르는가 ────────
     부팅 때 /api/kakao 가 실패하면 화면은 ready=false 로 둔다. 그것만 보고 지나가게 두면
     **잠깐 끊겼던 분이 로그인 없이 들어온다.** 동의를 누르는 그 자리에서 한 번 더 물어야 한다. */
  {
    const page = await L.openPage(browser, {state:fresh(), width:390, height:1000});
    page.__went = 0;
    let asked = 0, linked = false;
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const u = r.url();
      const j = (o) => r.respond({status:200, contentType:'application/json', body:JSON.stringify(o)});
      if(u.indexOf('/api/kakao?step=start') >= 0){
        page.__went++; linked = true;
        return r.respond({status:302, headers:{location:'/fortune.html?kakao=ok&moved=0'}});
      }
      if(u.indexOf('/api/kakao') >= 0){
        asked++;
        /* 첫 물음은 실패시킨다(부팅 때 잠깐 끊긴 상황). 두 번째는 정상으로 답한다. */
        if(asked === 1) return r.abort();
        return j({ready:true, linked:linked, since:Date.now()});
      }
      if(u.indexOf('/api/entitlements') >= 0) return j({items:{}, pass:null, purchases:[]});
      if(u.indexOf('/api/') >= 0) return j({ok:true});
      r.continue();
    });
    await page.goto(APP, {waitUntil:'load'});
    await L.wait(2500);
    await consent(page);
    await L.clickText(page, /^동의하고 시작하기$/);
    await page.waitForNavigation({waitUntil:'load', timeout:15000}).catch(() => {});
    await L.wait(3000);
    R.note(page.__went === 1,
      '★ 부팅 때 한 번 실패했어도 동의하는 자리에서 다시 물어 로그인으로 보낸다',
      '물어본 횟수 ' + asked + ' · 보낸 횟수 ' + page.__went);
    await page.close();
  }

  /* ── ⑦ ★ 기기에 남은 옛 저장분을 한 번 비우는가 (2026-09-09 "니가 못지우냐?") ──
     서버는 지웠지만 프로필·기록은 각자 브라우저 안에도 있다. 그대로 두면 로그인하는 순간
     동기화가 그것을 서버로 다시 올려서 "지웠는데 또 생겼네"가 된다.
     ★ 표식이 붙은 저장분은 **건드리면 안 된다** — 열 때마다 비우면 아무것도 못 쓴다. */
  {
    const old = L.makeState({onboarded:true});
    delete old.resetId;                      /* 표식이 없던 시절의 저장분을 흉내 낸다 */
    const page = await L.openPage(browser, {state:old, width:390, height:1000});
    await stubLinked(page);
    await page.goto(APP, {waitUntil:'load'});
    await L.wait(2200);
    /* ★ 2026-09-09 — 예전에는 '저장 칸이 null 이어야 한다'로 봤는데, 그건 **비워진 뒤에
       아무도 안 쓴다**는 것에 기대는 조건이었습니다. 비운 다음 서비스가 다시 무언가를
       적으면(예: 로그인이 확인돼 `kakaoSeen` 을 적는다) 칸이 다시 생기고, 비우기는
       제대로 됐는데 검사만 실패합니다 — 실제로 그렇게 걸렸습니다.
       봐야 할 것은 '칸이 없다'가 아니라 **옛 자료가 안 남았다** 입니다. */
    const gone = await page.evaluate(() => {
      const s = localStorage.getItem('inyeonjeom.v2');
      if(s === null) return 'gone';
      let o = {};
      try{ o = JSON.parse(s) || {}; }catch(e){ return 'unreadable'; }
      return 'kept:' + ((o.profiles||[]).length) + ':' + ((o.compatHistory||[]).length);
    });
    R.note(gone === 'gone' || gone === 'kept:0:0',
           '★ 표식 없는 옛 저장분은 한 번 비운다', gone);
    await page.close();
  }
  {
    const marked = L.makeState({onboarded:true});
    marked.resetId = RESET_ID;
    const page = await L.openPage(browser, {state:marked, width:390, height:1000});
    await stubLinked(page);
    await page.goto(APP, {waitUntil:'load'});
    await L.wait(2200);
    const kept = await page.evaluate(() => {
      const s = localStorage.getItem('inyeonjeom.v2');
      return s === null ? 0 : (JSON.parse(s).profiles||[]).length;
    });
    R.note(kept === 1, '★ 이미 비운 기기는 다시 비우지 않는다 (한 번만이다)', '프로필 ' + kept + '개');
    await page.close();
  }

  /* ── ⑧ ★ 로그인을 못 하는 분이 우리에게 말할 길이 있는가 ────────
     `kakaoUnavailableModal` 이 "계속 이러면 [문의하기]로 알려주세요"라고 말한다.
     그런데 [문의하기]가 관문 뒤에 있으면 **로그인이 안 되는 분에게 로그인해야 닿는
     곳으로 가라고 한 것**이 된다. 막다른 길이다. 실제로 그렇게 만들었다가 잡았다. */
  {
    const page = await open('', true);
    const links = await page.evaluate(() =>
      [...document.querySelectorAll('.fl')].map((x) => (x.textContent||'').trim()));
    R.note(links.indexOf('문의하기') >= 0,
      '★ 동의 화면에 [문의하기]가 있다 (로그인 못 하는 분의 유일한 길)', links.join(' · '));
    const moved = await L.clickText(page, /^문의하기$/, {all:true});
    await L.wait(1400);
    const t = await screen(page);
    R.note(!!moved && /무엇이 궁금하신지/.test(t),
      '★ 눌러서 실제로 문의 화면까지 간다 (프로필도 로그인도 없이)', t.slice(0,40));
    R.note(!/언제 태어나셨어요/.test(t),
      '문의하러 가는 길에 생년월일부터 넣으라고 하지 않는다');
    R.note(page.__errs.length === 0, '⑧ JS 오류 0건', page.__errs.join(' | ').slice(0,120));
    await page.close();
  }

  /* ── ⑨ ★★ 쪽지가 사라진 채 돌아와도 동의를 두 번 시키지 않는가 ──
     안드로이드에서는 카카오 로그인이 카카오톡 앱이나 다른 탭으로 다녀오는 일이 있고,
     그러면 sessionStorage 쪽지가 통째로 없어진다. 대표님 갤럭시에서 실제로 그랬다 —
     "로그인했어요" 알림이 뜬 채 동의 화면이 다시 서 있었다.
     ★ 동의는 localStorage 에 남아 있으므로 그것으로 이어 가야 한다. */
  {
    const page = await L.openPage(browser, {state:L.makeState({profiles:[], activeId:null,
      onboarded:false, consentAt:Date.now()}), width:390, height:1000});
    await stubLinked(page);
    /* 쪽지를 **심지 않는다** — 사라진 상황 그대로 */
    await page.goto(APP + '?kakao=ok&moved=0', {waitUntil:'load'});
    await L.wait(3200);
    const t = await screen(page);
    R.note(/언제 태어나셨어요/.test(t),
      '★ 쪽지가 없어져도 동의한 것을 기억해 사주 입력으로 이어간다', t.slice(0,40));
    R.note(!/만 14세 이상이에요/.test(t), '동의를 두 번 시키지 않는다');
    const on = await page.evaluate(() => (JSON.parse(localStorage.getItem('inyeonjeom.v2')||'{}')).onboarded);
    R.note(on === true, '시작한 것으로 친다', 'onboarded=' + on);
    R.note(page.__errs.length === 0, '⑨ JS 오류 0건', page.__errs.join(' | ').slice(0,120));
    await page.close();
  }
  {
    /* 동의도 안 한 채 kakao=ok 로 들어오면? 그때는 그냥 동의 화면이어야 한다 */
    const page = await L.openPage(browser, {state:fresh(), width:390, height:1000});
    await stubLinked(page);
    await page.goto(APP + '?kakao=ok&moved=0', {waitUntil:'load'});
    await L.wait(3200);
    const t = await screen(page);
    R.note(/만 14세 이상이에요/.test(t),
      '동의한 적이 없으면 그냥 동의 화면이다 (동의를 건너뛰지 않는다)', t.slice(0,36));
    await page.close();
  }

  /* ── ⑩ 동의 화면 카드 모양 (2026-09-10 대표님 지시) ──
     "→ 이거 빼라" · "오늘의 운세 사주팔자 대운 성격유형 으로 한줄로 맞춰"
     ★ 설명 줄이 두 줄로 접히면 안 됩니다. 폭마다 재서 봅니다 — 글자 크기나 여백을
       건드리면 여기서 걸립니다. */
  {
    R.head('── ⑩ 동의 화면 카드');
    for(const w of [320, 360, 390]){
      const page = await L.openPage(browser, {state:fresh(), width:w, height:1000});
      await stubLinked(page);
      await page.goto(APP, {waitUntil:'load'});
      await L.wait(2200);
      const m = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.onboard .svc-card')];
        return {
          n: cards.length,
          arrows: document.querySelectorAll('.onboard .svc-arrow').length,
          descs: cards.map(function(c){
            const d = c.querySelector('.svc-desc');
            if(!d) return {t:'(없음)', lines:0, over:0};
            const cs = getComputedStyle(d);
            const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.65;
            return { t:(d.textContent||'').trim(),
                     lines: Math.round(d.getBoundingClientRect().height / lh),
                     over: d.scrollWidth - d.clientWidth };
          }),
        };
      });
      R.note(m.n === 2, w + 'px — 카드가 두 장이다', m.n + '장');
      R.note(m.arrows === 0, w + 'px — 화살표가 없다', m.arrows + '개');
      m.descs.forEach(function(d){
        R.note(d.lines === 1 && d.over <= 1, w + 'px — 「' + d.t.slice(0,22) + '」 한 줄',
               d.lines + '줄 · 넘침 ' + d.over);
      });
      await page.close();
    }
  }

  await browser.close(); if(srv) srv.close();
  R.done();
})().catch((e) => { console.log('터짐: ' + (e && e.message)); process.exit(1); });
