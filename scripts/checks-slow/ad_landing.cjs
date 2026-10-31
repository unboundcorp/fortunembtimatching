/* =====================================================================
   광고 손님 첫 화면 두 곳 (느린 층 · 2026-10-31 대표님 "1, 2 먼저 해라")
   ---------------------------------------------------------------------
   ② ?go=YYYY 광고로 온 새 손님의 동의 화면: 'YYYY년 내 사주, 미리 봐요' · 궁합 예시 그림 없음 ·
      카드는 그 해 사주 하나 · 카카오 단추가 첫 화면(844) 안 / go 없이 오면 예전 그대로(예시 그림 · 카드 둘)
   ① 아직 안 연 사주 풀이: 목차는 접혀 있고 · 오프닝 제목이 첫 화면 안 · '기본 풀이' 안내는 본문 아래
      / 연 해의 풀이는 목차를 펼쳐 둔 예전 그대로
===================================================================== */
const L = require('../_lib.cjs');
const wait = L.wait;
const NEXT = new Date().getFullYear() + 1;
(async () => {
  const R = L.reporter('광고 손님 첫 화면');
  const srv = await L.serve(L.ROOT, 0);
  const browser = await L.puppeteer().launch({executablePath: L.chromePath(), headless:'new', args:['--no-sandbox']});
  const errs = [];
  async function landing(q){
    const p = await L.openPage(browser, {hook:true, width:390, height:844, state: {}});
    /* 같은 브라우저라 앞 창의 광고 쪽지(2시간)가 남는다 — go 없는 창은 쪽지를 비우고 연다 */
    if(!/go=/.test(q)) await p.evaluateOnNewDocument(function(){ try{ localStorage.removeItem('inyeon.adGo'); }catch(e){} });
    p.on('pageerror', e => errs.push(String(e)));
    await p.setRequestInterception(true);
    p.on('request', r => { if(r.url().indexOf('/api/kakao') >= 0) return r.respond({status:200, contentType:'application/json', body:'{"ready":true,"linked":false}'}); r.continue(); });
    await p.goto(srv.url + '/fortune.html' + q, {waitUntil:'networkidle0'}); await wait(1200);
    const o = await p.evaluate(function(){
      var k = Array.prototype.filter.call(document.querySelectorAll('#main button'), function(b){ return /카카오로 로그인하기/.test(b.textContent); })[0];
      return {lead: (document.querySelector('.onboard-lead')||{}).textContent || '', sample: !!document.querySelector('.onb-sample'),
        cards: Array.prototype.map.call(document.querySelectorAll('#main .svc-card .svc-title'), function(x){ return x.textContent; }),
        kakaoTop: k ? k.getBoundingClientRect().top : null,
        ov: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    await p.close(); return o;
  }
  async function report(bought){
    const p = await L.openPage(browser, {hook:true, width:390, height:844, state: L.makeState({})});
    p.on('pageerror', e => errs.push(String(e)));
    await p.setRequestInterception(true);
    p.on('request', r => { const u = r.url();
      if(u.indexOf('/api/entitlements') >= 0){ const it = {}; if(bought) it['saju_full:' + NEXT] = {purchasedAt: Date.now()};
        return r.respond({status:200, contentType:'application/json', body: JSON.stringify({items:it, purchases:[]})}); }
      if(u.indexOf('/api/interpret') >= 0 || u.indexOf('/api/content') >= 0) return r.respond({status:503, contentType:'application/json', body:'{"error":"test"}'});
      r.continue(); });
    await p.goto(srv.url + '/fortune.html', {waitUntil:'networkidle0'}); await wait(1200);
    await p.evaluate(function(y){ var T = window.__INYEON_TEST__; T.goRoute('report13'); T.setViewYear(y); }, NEXT); await wait(1500);
    const o = await p.evaluate(function(){
      var fold = document.querySelector('#main details.toc-fold'), toc = document.querySelector('#main .toc-nav');
      var first = document.querySelector('#main .report-section h3');
      var notes = document.querySelectorAll('#main .interp-notice'), last = notes.length ? notes[notes.length-1] : null;
      var heads = document.querySelectorAll('#main .report-section h3');
      return {folded: !!fold && !fold.open && !!(toc && fold.contains(toc)), tocOutside: !!toc && !fold,
        firstTop: first ? first.getBoundingClientRect().top + scrollY : null,
        noteAfter: last && heads.length ? !!(heads[0].compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING) : null,
        ov: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    await p.close(); return o;
  }
  try{
    const a = await landing('?go=' + NEXT + '&fbclid=IwAR0abc');
    R.note(a.lead === NEXT + '년 내 사주, 미리 봐요', '② 광고 손님 — 제목이 그 해 사주', a.lead);
    R.note(!a.sample, '② 광고 손님 — 궁합 예시 그림 없음');
    R.note(a.cards.length === 1 && a.cards[0] === NEXT + '년 내 사주 풀이 보기', '② 광고 손님 — 카드는 그 해 사주 하나', a.cards.join(','));
    R.note(a.kakaoTop != null && a.kakaoTop < 844, '② 광고 손님 — 카카오 단추가 첫 화면 안', String(a.kakaoTop));
    R.note(!a.ov, '② 가로 넘침 없음');
    const b = await landing('');
    R.note(b.lead === '우리 인연은 몇 점?' && b.sample && b.cards.length === 2, '② go 없이 오면 예전 그대로', JSON.stringify(b));
    const c = await report(false);
    R.note(c.folded, '① 안 연 풀이 — 목차가 접혀 있다', JSON.stringify(c));
    R.note(c.firstTop != null && c.firstTop < 844, '① 안 연 풀이 — 첫 장 제목이 첫 화면 안', String(c.firstTop));
    R.note(c.noteAfter !== false, "① 안 연 풀이 — '기본 풀이' 안내는 본문 아래", String(c.noteAfter));
    R.note(!c.ov, '① 가로 넘침 없음');
    const d = await report(true);
    R.note(d.tocOutside && !d.folded, '① 연 해의 풀이 — 목차는 예전처럼 펼쳐 둔다', JSON.stringify(d));
    R.note(errs.length === 0, 'JS 오류 0건', errs.slice(0,2).join(' / ') || '없음');
  } finally { await browser.close(); srv.close(); }
  R.done();
})();
