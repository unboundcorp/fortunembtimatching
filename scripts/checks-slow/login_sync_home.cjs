/* 2026-09-21 대표님 제보 — "다른 PC에서 카카오 로그인 했는데 데이터는 있는데도 초기화면이 뜨면서
   사주 입력하라네?" 새 기기에서 동의 → 로그인 → 돌아오면, 서버에 프로필이 있으면 **마법사가 아니라
   서비스 화면**으로 가야 한다. 원인은 이용권 조회(왕복 1번)가 카카오 조회→동기화(왕복 2번)보다
   먼저 끝나서, 동의 마무리(finishConsent)가 "프로필 없음 → 마법사"로 먼저 결정해 버리는 것이었다.
   이 검사는 동기화를 일부러 늦게(0.8초) 답하게 해서 그 순서를 강제로 만든다.
   ① 서버에 프로필이 있음 → 마법사·동의 화면을 거치지 않고 서비스 화면에 선다
   ② 서버가 비어 있음 → 예전처럼 마법사로 간다(진짜 새 손님)
   ③ 기다리는 동안 동의 화면이나 마법사가 번쩍이지 않는다(기다림 화면만) */
const L = require('../_lib.cjs');
let srv = null, BASE = process.argv[2];
const wait = ms => new Promise(r => setTimeout(r, ms));
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(L.ROOT, 'fortune.html'), 'utf8');
const BACK_KEY = (/var KAKAO_BACK_KEY = '([^']+)'/.exec(SRC) || [])[1];
(async () => {
  const R = L.reporter('로그인 뒤 동기화 → 홈');
  if(!BASE){ srv = await L.serve(L.ROOT, 0); BASE = srv.url; }
  const APP = BASE.replace(/\/+$/, '') + '/fortune.html';
  R.note(!!BACK_KEY, '쪽지 열쇠(KAKAO_BACK_KEY)를 화면 소스에서 읽었다', BACK_KEY || '없음');
  const exe = L.chromePath(), pp = L.puppeteer();
  if(!exe || !pp){ console.log('크롬/puppeteer 없음 — 건너뜀'); process.exit(0); }
  const browser = await pp.launch({executablePath: exe, headless: 'new', args: ['--no-sandbox']});
  const full = L.makeState();
  const remote = {profiles: full.profiles, activeId: full.activeId, onboarded: true, history: [], compatHistory: [], receiptMemos: [], savedGroups: [], deletedGroups: []};
  const fresh = () => L.makeState({profiles: [], activeId: null, onboarded: false, consentAt: Date.now()});

  async function run(label, remoteData, syncDelay, noNote) {
    const page = await L.openPage(browser, {state: fresh(), width: 390, height: 900});
    const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 120)));
    await page.setRequestInterception(true);
    page.on('request', r => {
      const u = r.url();
      const j = (o, delay) => setTimeout(() => r.respond({status: 200, contentType: 'application/json', body: JSON.stringify(o)}), delay || 0);
      if (u.indexOf('/api/kakao') >= 0) return j({ready: true, linked: true, since: Date.now()}, 150);
      if (u.indexOf('/api/entitlements') >= 0) return j({items: {}, pass: null, purchases: []}, 50);
      if (u.indexOf('/api/sync') >= 0) return j({ok: true, data: remoteData}, syncDelay);
      if (u.indexOf('/api/') >= 0) return j({ok: true});
      r.continue();
    });
    if (!noNote) await page.evaluateOnNewDocument((k) => { try { sessionStorage.setItem(k, JSON.stringify({at: Date.now(), mode: 'self', startMode: 'self', route: 'home'})); } catch (e) {} }, BACK_KEY);
    await page.goto(APP + '?kakao=ok', {waitUntil: 'domcontentloaded'});
    const seq = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 3500) {
      const s = await page.evaluate(() => {
        const t = (document.querySelector('#main') || {}).innerText || '';
        if (/만 14세 이상이에요/.test(t)) return '동의';
        if (/잠시만요/.test(t)) return '기다림';
        if (/언제 태어나셨어요|태어난 날짜|생년월일을/.test(t) || (document.querySelector('.setup, .wizard') && !/검사님/.test(t))) return '마법사';
        if (/검사님/.test(t)) return '서비스';
        return t ? '기타' : '빈';
      });
      if (seq[seq.length - 1] !== s) seq.push(s);
      await wait(40);
    }
    const route = await page.evaluate(() => { try { return (window.__INYEON_TEST__ && window.__INYEON_TEST__.route) ? window.__INYEON_TEST__.route() : (location.hash || ''); } catch (e) { return '?'; } });
    await page.close();
    return {seq, errs, route};
  }

  const a = await run('서버에 프로필 있음', remote, 800);
  R.note(a.seq[a.seq.length - 1] === '서비스', '① 서버에 프로필이 있으면 서비스 화면에 선다', a.seq.join(' → '));
  R.note(a.seq.indexOf('마법사') < 0, '① 마법사를 거치지 않는다', a.seq.join(' → '));
  R.note(a.seq.indexOf('동의') < 0, '③ 기다리는 동안 동의 화면이 번쩍이지 않는다', a.seq.join(' → '));
  R.note(a.errs.length === 0, '① JS 오류 없음', a.errs.join(' | ') || '0건');

  const b = await run('서버 비어 있음', {}, 800);
  R.note(b.seq[b.seq.length - 1] === '마법사', '② 서버가 비어 있으면 마법사로 간다(새 손님)', b.seq.join(' → '));
  R.note(b.seq.indexOf('동의') < 0, '② 동의 화면으로 되돌아가지 않는다', b.seq.join(' → '));

  const c = await run('서버에 프로필 있음 · 동기화가 더 빠름', remote, 0);
  R.note(c.seq[c.seq.length - 1] === '서비스' && c.seq.indexOf('마법사') < 0, '① 동기화가 먼저 끝나도 같은 결과', c.seq.join(' → '));

  /* ④ 안드로이드에서 카카오톡 앱을 다녀오면 sessionStorage 쪽지가 사라진다(2026-09-09).
     쪽지가 없어도 consentAt 으로 이어 가는 갈래가 같은 규칙을 지키는지 본다. */
  const d = await run('쪽지 없음 · 서버에 프로필 있음', remote, 800, true);
  R.note(d.seq[d.seq.length - 1] === '서비스' && d.seq.indexOf('마법사') < 0, '④ 쪽지가 사라져도(앱 다녀옴) 서비스 화면에 선다', d.seq.join(' → '));
  R.note(d.errs.length === 0, '④ JS 오류 없음', d.errs.join(' | ') || '0건');

  await browser.close();
  if(srv) srv.close();
  R.done();
})();
