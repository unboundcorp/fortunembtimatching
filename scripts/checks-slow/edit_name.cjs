#!/usr/bin/env node
/* =====================================================================
   프로필 이름을 고칠 수 있는가 (느린 층)
   ---------------------------------------------------------------------
   2026-09-19 대표님 지시 **"정보 수정 할 때 이름도 수정할 수 있게 바꿔"**.

   이름 칸은 원래도 있었지만 **3단계 맨 아래**에 있었습니다. [정보 수정]을 누르면
   생년월일 화면이 뜨고 이름 칸은 두 단계 더 가야 나와서, 화면만 봐서는
   "이름은 못 고친다"로 읽혔습니다.

   ★ **칸이 코드에 있는지가 아니라, 누르고 들어갔을 때 보이는지**를 봅니다.
     예전 배치도 `#profName` 은 분명히 있었습니다 — 소스만 뒤지는 검사는 통과시킵니다.
   ★ **만들 때는 그대로 3단계여야 합니다.** 첫 화면이 "생년월일과 성격유형만 넣으면"
     이라고 약속하므로 1단계에서 이름부터 물으면 그 약속이 깨집니다. 그래서 이 검사는
     양쪽을 다 봅니다 — 고칠 때는 1단계에 있고, 만들 때는 1단계에 **없어야** 합니다.
   ★ 같은 칸이 두 군데 있으면 어느 쪽이 진짜인지 알 수 없으므로 그것도 막습니다.
===================================================================== */
const L = require('../_lib.cjs');
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const R = L.reporter('프로필 이름 고치기');
  const srv = await L.serve(L.ROOT, 0);
  const browser = await L.puppeteer().launch({executablePath: L.chromePath(), headless:'new',
    args:['--no-sandbox']});
  const errs = [];
  try{
    /* ── ① 고칠 때 — 1단계 맨 위에 이름 칸 ────────────────────────── */
    let p = await L.openPage(browser, {state: L.makeState(), width:390, height:900});
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto(srv.url + '/fortune.html', {waitUntil:'networkidle0'});
    await wait(1200);
    await L.clickText(p, /더보기/);      await wait(400);
    await L.clickText(p, /^설정$/);      await wait(600);
    await L.clickText(p, /검사 \(활성\)/); await wait(500);
    await L.clickText(p, /^정보 수정$/);  await wait(800);

    const step1 = await p.evaluate(function(){
      var inp = document.querySelector('#profNameTop');
      var firstLabel = document.querySelector('#main .inline-pick-label');
      return {has: !!inp, value: inp ? inp.value : null,
              first: firstLabel ? firstLabel.textContent : '',
              val: (document.querySelector('#main .inline-pick-val')||{}).textContent || ''};
    });
    R.note(step1.has, '[정보 수정] 첫 화면에 이름 칸이 보인다');
    R.note(/이름/.test(step1.first), '이름 칸이 첫 칸이다 (내려가서 찾지 않아도 된다)', step1.first);
    R.note(step1.value === '검사', '지금 쓰는 이름이 미리 들어가 있다', step1.value);

    /* 실제로 쳐 본다 — 한 글자마다 다시 그리면 커서가 날아간다(R103 과 같은 함정) */
    if(step1.has){
      await p.focus('#profNameTop');
      await p.evaluate(function(){ document.querySelector('#profNameTop').select(); });
      await p.keyboard.press('Backspace');
      await p.type('#profNameTop', '가영', {delay:30});
      const typed = await p.evaluate(function(){
        return {v: document.querySelector('#profNameTop').value,
                tag: (document.querySelector('#main .inline-pick-val')||{}).textContent||''};
      });
      R.note(typed.v === '가영', '치는 대로 들어간다 (커서가 날아가지 않는다)', typed.v);
      R.note(typed.tag === '가영', "'지금 값' 딱지가 따라온다", typed.tag);
    }

    await L.clickText(p, /^다음 ·/); await wait(600);
    await L.clickText(p, /^다음 ·/); await wait(900);

    const step3 = await p.evaluate(function(){
      return {dup: !!document.querySelector('#profName'),
              card: (document.querySelector('#main .scroll-card .section-sub')||{}).textContent||''};
    });
    R.note(!step3.dup, '확인 화면에 같은 이름 칸이 또 있지는 않다');
    R.note(/이름/.test(step3.card) && /가영/.test(step3.card),
           '확인 화면이 바꾼 이름을 적어 준다', step3.card);

    await L.clickText(p, /^수정 완료$/); await wait(1100);
    const saved = await p.evaluate(function(){
      var st = {}; try{ st = JSON.parse(localStorage.getItem('inyeonjeom.v2')||'{}'); }catch(e){}
      return (st.profiles||[]).map(function(x){ return x.name; });
    });
    R.note(saved.indexOf('가영') > -1, '바꾼 이름이 실제로 저장된다', JSON.stringify(saved));
    R.note(saved.indexOf('검사') === -1, '옛 이름이 남지 않는다', JSON.stringify(saved));
    await p.close();

    /* ── ② 만들 때 — 이름은 그대로 3단계 ──────────────────────────── */
    p = await L.openPage(browser, {state: L.makeState(), width:390, height:900});
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto(srv.url + '/fortune.html', {waitUntil:'networkidle0'});
    await wait(1200);
    await L.clickText(p, /더보기/);        await wait(400);
    await L.clickText(p, /^설정$/);        await wait(600);
    await L.clickText(p, /새 프로필 추가/); await wait(900);
    const mk = await p.evaluate(function(){ return !!document.querySelector('#profNameTop'); });
    R.note(!mk, '★ 프로필 만들기 1단계에는 이름 칸이 없다 (첫 화면 약속을 지킨다)');
    await p.close();

    R.note(errs.length === 0, 'JS 오류 0건', errs.slice(0,2).join(' / ') || '없음');
  } finally {
    await browser.close(); srv.close();
  }
  R.done();
})();
