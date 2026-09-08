/* =====================================================================
   저장한 그룹 — 왼쪽으로 밀어 지우기 (2026-09-09 대표님 지시)
   ---------------------------------------------------------------------
   왜 검사가 필요한가: 이 기능은 **손가락이 있어야만** 도는 종류다. 코드를 읽어서는
   "밀면 열리는지 / 스쳐도 안 열리는지 / 밀고 손을 뗐을 때 모임이 안 열리는지"를
   알 수 없다. 예전에 스크롤을 뺏거나(세로로 미는데 가로로 잡음) 밀어 놓고 손을 뗀
   순간 모임이 열리는 종류의 사고가 나기 딱 좋은 자리다.
   ★ 실제로 터치 이벤트를 만들어 밀어 본다. CSS transform 값을 재서 확인한다.
===================================================================== */
const L = require('../_lib.cjs');

(async function(){
  const R = L.reporter('밀어서 지우기');
  const exe = L.chromePath(), pp = L.puppeteer();
  if(!exe || !pp){ console.log('크롬/puppeteer 없음 — 건너뜀'); process.exit(0); }

  const base = process.argv[2];
  let srv = null, url = base;
  if(!url){ srv = await L.serve(L.ROOT, 0); url = srv.url; }

  const state = L.makeState({
    savedGroups: [
      {id:'GRPAAA1', name:'회사 모임', at: Date.now()-1000, token:'tok-a', n:3, rel:'coworker'},
      {id:'GRPBBB2', name:'남이 만든 모임', at: Date.now()-2000, token:null, n:2, rel:null},
    ],
  });

  const browser = await pp.launch({executablePath: exe, headless:'new',
    args:['--no-sandbox','--disable-dev-shm-usage']});
  const page = await L.openPage(browser, {state, width:390, height:900});
  await page.goto(url + '/fortune.html', {waitUntil:'networkidle2', timeout:60000});
  await L.wait(600);

  /* 궁합 → 여럿이서 보기 로 들어가야 [저장한 그룹] 카드가 나온다 */
  await L.clickText(page, /^궁합$/, {all:true}); await L.wait(400);
  await L.clickText(page, /여럿이서/, {all:true}); await L.wait(600);

  const found = await page.evaluate(() => document.querySelectorAll('.swipe-wrap').length);
  R.note(found === 2, '저장한 그룹 두 줄이 밀 수 있는 모양으로 그려진다', '.swipe-wrap ' + found + '개');
  if(found !== 2){ await browser.close(); if(srv) srv.close(); R.done(); return; }

  /* 안내 문구가 미는 법을 알려주는가 — 알려주지 않으면 아무도 못 찾는다 */
  const hint = await page.evaluate(() => {
    const p = [...document.querySelectorAll('.biz-hint')].find(x => /밀면/.test(x.textContent||''));
    return p ? p.textContent.trim() : '';
  });
  R.note(/왼쪽으로 밀면/.test(hint), '왼쪽으로 밀라고 화면이 알려준다', hint.slice(0,44));

  /* [지우기] 단추가 줄 뒤에 깔려 있고, 밀기 전에는 안 보인다 */
  const hidden = await page.evaluate(() => {
    const w = document.querySelector('.swipe-wrap');
    const del = w.querySelector('.swipe-del');
    const row = w.querySelector('.settings-row');
    const wr = w.getBoundingClientRect(), dr = del.getBoundingClientRect(), rr = row.getBoundingClientRect();
    return { covered: rr.right >= dr.right - 1, inside: dr.right <= wr.right + 1,
             clip: getComputedStyle(w).overflow, label: del.textContent.trim() };
  });
  R.note(hidden.covered && hidden.clip === 'hidden', '밀기 전에는 [지우기]가 줄에 가려 안 보인다',
         '겹침 ' + hidden.covered + ' · overflow ' + hidden.clip);
  R.note(hidden.label === '지우기', '단추 글자가 [지우기]다', hidden.label);

  /* ── 손가락 흉내 ──────────────────────────────────────────────── */
  async function swipe(idx, dx, dy){
    return page.evaluate((i, dx, dy) => {
      const row = document.querySelectorAll('.swipe-wrap')[i].querySelector('.settings-row');
      const r = row.getBoundingClientRect();
      const x0 = r.left + r.width - 30, y0 = r.top + r.height/2;
      function t(type, x, y){
        const touch = new Touch({identifier:1, target:row, clientX:x, clientY:y});
        row.dispatchEvent(new TouchEvent(type, {bubbles:true, cancelable:true,
          touches: type==='touchend' ? [] : [touch],
          changedTouches:[touch], targetTouches: type==='touchend' ? [] : [touch]}));
      }
      t('touchstart', x0, y0);
      for(let k=1;k<=6;k++) t('touchmove', x0 + dx*k/6, y0 + dy*k/6);
      t('touchend', x0+dx, y0+dy);
      return true;
    }, idx, dx, dy);
  }
  const shiftOf = (i) => page.evaluate((i) => {
    const row = document.querySelectorAll('.swipe-wrap')[i].querySelector('.settings-row');
    const m = /translateX\(([-\d.]+)px\)/.exec(row.style.transform || '');
    return { x: m ? parseFloat(m[1]) : 0,
             open: document.querySelectorAll('.swipe-wrap')[i].classList.contains('swipe-open') };
  }, i);

  /* ① 살짝만 스친 것은 안 열린다 */
  await swipe(0, -20, 0); await L.wait(320);
  let st = await shiftOf(0);
  R.note(!st.open && Math.abs(st.x) < 2, '살짝 스친 것으로는 안 열린다', 'x=' + st.x);

  /* ② 세로로 미는 것은 밀기가 아니다 (목록 스크롤을 뺏으면 안 된다) */
  await swipe(0, -8, -70); await L.wait(320);
  st = await shiftOf(0);
  R.note(!st.open && Math.abs(st.x) < 2, '세로로 미는 것은 밀기로 안 본다', 'x=' + st.x);

  /* ③ 제대로 밀면 열린다 */
  await swipe(0, -100, 0); await L.wait(320);
  st = await shiftOf(0);
  R.note(st.open && st.x <= -80, '왼쪽으로 밀면 [지우기]가 나온다', 'x=' + st.x);

  /* ④ 다른 줄을 밀면 먼저 열린 줄이 닫힌다 (한 번에 하나만) */
  await swipe(1, -100, 0); await L.wait(320);
  const a = await shiftOf(0), b = await shiftOf(1);
  R.note(!a.open && b.open, '한 번에 한 줄만 열려 있다', '첫째 ' + a.x + ' · 둘째 ' + b.x);

  /* ⑤ 밀린 줄을 눌러도 모임이 안 열린다 (닫히기만 한다) */
  await page.evaluate(() => document.querySelectorAll('.swipe-wrap')[1].querySelector('.settings-row').click());
  await L.wait(320);
  const afterClick = await page.evaluate(() => ({
    open: document.querySelectorAll('.swipe-wrap')[1].classList.contains('swipe-open'),
    stillList: !!document.querySelector('.swipe-wrap'),
  }));
  R.note(!afterClick.open && afterClick.stillList, '밀린 줄을 누르면 닫히기만 하고 모임은 안 열린다');

  /* ⑥ [지우기]를 누르면 물어보는 창이 뜬다 — 그 자리에서 지우지 않는다 */
  await swipe(0, -100, 0); await L.wait(320);
  await page.evaluate(() => document.querySelectorAll('.swipe-wrap')[0].querySelector('.swipe-del').click());
  await L.wait(400);
  const modal = await page.evaluate(() => {
    const b = document.querySelector('.modal-box');
    return b ? b.textContent.replace(/\s+/g,' ').trim() : '';
  });
  R.note(/지울까요/.test(modal) && /회사 모임/.test(modal), '[지우기]를 누르면 물어본다', modal.slice(0,60));
  R.note(/되돌릴 수 없어요/.test(modal), '되돌릴 수 없다는 것을 알린다');

  /* ⑦ 남이 만든 모임은 '목록에서 빼기'로 물어본다 */
  await L.clickText(page, /^취소$/); await L.wait(300);
  await swipe(1, -100, 0); await L.wait(320);
  await page.evaluate(() => document.querySelectorAll('.swipe-wrap')[1].querySelector('.swipe-del').click());
  await L.wait(400);
  const modal2 = await page.evaluate(() => {
    const b = document.querySelector('.modal-box');
    return b ? b.textContent.replace(/\s+/g,' ').trim() : '';
  });
  R.note(/목록에서 뺄까요/.test(modal2), '남이 만든 모임은 목록에서 빼기로 물어본다', modal2.slice(0,50));

  R.note(page.__errs.length === 0, 'JS 오류 0건', page.__errs.join(' | ').slice(0,140));

  await browser.close(); if(srv) srv.close();
  R.done();
})().catch((e) => { console.log('터짐: ' + (e && e.message)); process.exit(1); });
