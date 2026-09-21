/* 손님 화면의 눌릴 수 있는 것을 전부 좌표로 눌러 본다 (2026-09-21 대표님 "전체 qa진행해").
   관리자 쪽 admin_buttons.cjs 와 짝이다. 보는 것 셋 —
   ① 가려서 못 누르는가(elementFromPoint 로 그 자리에 실제로 무엇이 있나)
   ② 누르면 JS 오류가 나는가 ③ 누른 뒤 화면이 비는가.
   ★ element.click() 은 가림을 무시하므로 쓰지 않는다. 좌표로 누른다.
   ★ 접힌 <details> 안의 단추는 그리기만 되고 눌리지 않는 것이 정상이다 — 펴고 나서 잰다.
   ★ 접힌 판(.why-panel.hidden) 안 용어 단추도 펴서 누른다 — 안 펴면 89개가 영영 검사에서 빠진다.
     (처음엔 이것을 '가려짐' 5건으로 잘못 잡았다. 크롬은 접힌 내용에도 상자를 준다.)
   결제·서버 쓰기는 정적 서버라 501 로 막힌다 — 돈이 안 나간다.
   둘째 인자로 화면 이름을 주면 그 화면만 돈다 (예: 오늘). */
const L = require('../_lib.cjs');
const BASE = (process.argv[2] || 'http://127.0.0.1:8899').replace(/\/+$/, '');
const ONLY = process.argv[3] || null;
const wait = ms => new Promise(r => setTimeout(r, ms));
const hist = [{id:'h1',date:'2026-09-21',profileId:'p1',relation:'friend',partnerName:'민수',partnerMbti:'ISTJ',partnerGender:'F',score:70,tier:'무난한 인연',
  inputs:{b:{name:'민수',mbti:'ISTJ',gender:'F',birth:{y:1992,m:7,d:20,hour:14,minute:0,lon:126.98,adjust:true}}}}];
const SEL = 'button, a[href], [role=button], summary, select, input[type=checkbox], input[type=radio]';
(async () => {
  const browser = await L.puppeteer().launch({executablePath: L.chromePath(), headless: 'new', args: ['--no-sandbox']});
  const p = await L.openPage(browser, {state: L.makeState({compatHistory: hist}), width: 390, height: 844});
  const errs = []; p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  const report = []; let pressed = 0, swept = 0, hidden = 0, missing = 0;
  async function sweep(screen, enter) {
    if (ONLY && screen !== ONLY) return;
    await p.goto(BASE + '/fortune.html', {waitUntil: 'networkidle0'}); await wait(800);
    await enter(); await wait(800);
    const n = await p.evaluate(SEL => { const root = document.querySelector('.modal-box') || document.querySelector('#main'); return root.querySelectorAll(SEL).length; }, SEL);
    /* 단추마다 화면을 새로 열면 180번 × 2초라 오래 걸린다. 누른 뒤 화면이 그대로면(같은 탭 · 창 없음 ·
       글자 수 비슷) 다시 안 연다. 창이 떴거나 화면이 바뀌었을 때만 새로 연다 (admin_buttons.cjs 와 같은 규칙). */
    let fresh = true;
    /* ★ 글자 수만 보면 안 된다 — 홈에서 [문의하기]를 누르면 문의 화면이 뜨는데 글자 수가 홈과 40자 안쪽이라
       '그대로'로 읽혀 다음 단추 5개를 엉뚱한 화면에서 쟀다(실측). 화면 첫머리 글로 가른다. */
    const sig = () => p.evaluate(() => ({head: (document.querySelector('#main').innerText || '').slice(0, 160), modal: !!document.querySelector('.modal-box, .sheet, [role=dialog]')}));
    let base = await sig(); const p0 = pressed, h0 = hidden, m0 = missing;
    for (let i = 0; i < n; i++) {
      if (!fresh) {
        await p.goto(BASE + '/fortune.html', {waitUntil: 'domcontentloaded'}); await wait(350); await enter();
        /* 늦게 그려지는 단추가 있다(홈에서 5개). 처음 센 개수만큼 나타날 때까지 잠깐 기다린다. */
        const count = () => p.evaluate(SEL => { const root = document.querySelector('.modal-box') || document.querySelector('#main'); return root.querySelectorAll(SEL).length; }, SEL);
        let m = 0; for (let t = 0; t < 8; t++) { await wait(250); m = await count(); if (m >= n) break; }
        /* 그래도 모자라면(홈의 단추 5개는 서버 답을 기다렸다가 그려진다) 처음처럼 느리게 한 번 더 연다. */
        if (m < n) { await p.goto(BASE + '/fortune.html', {waitUntil: 'networkidle0'}); await wait(800); await enter(); await wait(800); }
        fresh = true; base = await sig();
      }
      const info = await p.evaluate((i, SEL) => {
        const root = document.querySelector('.modal-box') || document.querySelector('#main'); const els = root.querySelectorAll(SEL);
        const e = els[i]; if (!e) return null;
        let d = e.closest('details:not([open])'); while (d) { d.open = true; d = e.closest('details:not([open])'); }
        /* buildFoldPanel 의 접힌 판(.why-panel.hidden) 안 용어 단추 88개도 같은 이유로 편다. */
        let h = e.closest('.why-panel.hidden'); while (h) { h.classList.remove('hidden'); h = e.closest('.why-panel.hidden'); }
        e.scrollIntoView({block: 'center', inline: 'center', behavior: 'instant'});
        const b = e.getBoundingClientRect();
        const label = (e.innerText || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 30);
        if (b.width < 2 || b.height < 2) return {skip: 'hidden', label};
        const x = b.left + b.width / 2, y = b.top + b.height / 2; const hit = document.elementFromPoint(x, y);
        const ok = hit && (hit === e || e.contains(hit) || hit.contains(e));
        return {x, y, ok, label, hit: hit ? (hit.tagName + '.' + (hit.className || '').toString().slice(0, 30)) : null, tag: e.tagName};
      }, i, SEL);
      /* 앞 단추를 누른 탓에 목록이 줄어 그 자리가 비면(홈에서 5개가 그렇게 빠졌다) 새로 열고 한 번 더 본다. */
      if (!info) {
        if (fresh) {
          missing++;
          if (process.env.GB_DEBUG) console.log('    못 찾음 #' + i, JSON.stringify(await p.evaluate(SEL => ({n: (document.querySelector('.modal-box') || document.querySelector('#main')).querySelectorAll(SEL).length, modal: !!document.querySelector('.modal-box'), ss: Object.keys(sessionStorage), url: location.href.slice(-40), head: (document.querySelector('#main').innerText || '').slice(0, 60)}), SEL)));
          continue;
        }
        fresh = false; i--; continue;
      }
      /* 앞 단추를 누른 탓에 숨은 것(접힌 토글 등)이면 새로 열고 한 번 더 본다 — 안 그러면 그 단추가 검사에서 빠진다. */
      if (info.skip) { if (fresh) { hidden++; continue; } fresh = false; i--; continue; }
      const before = errs.length; pressed++;
      if (!info.ok) { report.push({screen, label: info.label, problem: '가려짐 → ' + info.hit}); continue; }
      if (info.tag === 'SELECT') continue;
      try { await p.mouse.click(info.x, info.y); } catch (e) {}
      await wait(300);
      const state = await p.evaluate(() => ({main: (document.querySelector('#main').innerText || '').trim().length, modal: !!document.querySelector('.modal-box, .sheet, [role=dialog]')}));
      if (errs.length > before) report.push({screen, label: info.label, problem: 'JS 오류: ' + errs.slice(before).join(' | ')});
      if (state.main < 20 && !state.modal) report.push({screen, label: info.label, problem: '누른 뒤 화면이 빔'});
      let now = await sig();
      /* 창이 떴으면 Esc 로 닫아 본다(용어 창이 대부분이다). 닫히면 새로 열 필요가 없다. */
      if (now.modal) { await p.keyboard.press('Escape'); await wait(250); now = await sig(); }
      if (now.modal || now.head !== base.head) fresh = false;
    }
    swept++; console.log('  ' + screen + ' · 후보 ' + n + ' · 누름 ' + (pressed - p0) + ' · 숨음(안 그려짐) ' + (hidden - h0) + (missing > m0 ? ' · 못 찾음 ' + (missing - m0) : ''));
  }
  const tab = r => () => p.evaluate(r => document.querySelector('.tab-btn[data-route="' + r + '"]').click(), r);
  await sweep('홈', tab('home')); await sweep('오늘', tab('today')); await sweep('내 사주', tab('saju'));
  await sweep('내 성격유형', tab('report')); await sweep('궁합', tab('compat'));
  await sweep('궁합 결과', async () => { await tab('compat')(); await wait(800); await p.evaluate(() => { const c = [...document.querySelectorAll('#main button')].find(e => /민수/.test(e.innerText || '')); if (c) c.click(); }); });
  await sweep('더보기', async () => { await p.evaluate(() => { const b = [...document.querySelectorAll('.tab-btn, button')].find(e => /더보기/.test(e.innerText || '')); if (b) b.click(); }); });
  await browser.close();
  report.forEach(r => console.log('  ✗ ' + r.screen + ' · ' + JSON.stringify(r.label) + ' · ' + r.problem));
  if (missing) report.push({screen: '(전체)', label: '', problem: '다시 열었을 때 자리를 못 찾은 단추 ' + missing + '개 — 검사가 그만큼 비었다'});
  const fail = report.length + (pressed === 0 ? 1 : 0);
  if (pressed === 0) console.log('  ✗ 누른 단추가 0개 — 검사가 안 돈 것이다');
  console.log('손님 단추 검사 — 화면 ' + swept + '개 · 누른 것 ' + pressed + ' · 실패 ' + fail + '건');
  process.exit(fail ? 1 : 0);
})();
