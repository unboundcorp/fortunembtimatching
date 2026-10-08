/* =====================================================================
   출시 기념가 — 화면 (느린 층)
   ---------------------------------------------------------------------
   2026-10-08 대표님 지시. 브라우저 시계를 ① 지금 ② 2027-01-01 00:00:05(한국)로 놓고 연다.
   ① 기념가: 결제창에 '출시 기념가 · 12월 31일까지 (1월 1일부터 2,900원)' · 잠금 단추에 '출시 기념가' · #pricing 에 바뀔 값
   ② 1월 1일 뒤: 값이 2,900 · 2,900 · 1,500 · 5,900 · '출시 기념가' 글자가 어디에도 없음
   ③ 어느 쪽에서도 취소선으로 '정가'를 적지 않음 · JS 오류 0
===================================================================== */
const L = require('../_lib.cjs');
const wait = L.wait;
(async () => {
  const R = L.reporter('출시 기념가 화면');
  const srv = process.argv[2] ? {url:process.argv[2], close(){}} : await L.serve(L.ROOT, 0);
  const browser = await L.puppeteer().launch({executablePath: L.chromePath(), headless:'new', args:['--no-sandbox']});
  const errs = [];
  async function open(fakeNow){
    const p = await L.openPage(browser, {hook:true, width:390, height:844, state: L.makeState()});
    p.on('pageerror', e => errs.push(String(e)));
    if(fakeNow){
      await p.evaluateOnNewDocument(function(ms){
        var Real = Date, off = ms - Real.now();
        function D(){ if(arguments.length) return new (Function.prototype.bind.apply(Real, [null].concat([].slice.call(arguments))))(); return new Real(Real.now()+off); }
        D.now = function(){ return Real.now()+off; }; D.UTC = Real.UTC; D.parse = Real.parse; D.prototype = Real.prototype;
        window.Date = D;
      }, fakeNow);
    }
    await p.goto(srv.url + '/fortune.html', {waitUntil:'networkidle0'}); await wait(800);
    return p;
  }
  try{
    /* ① 지금(기념가) */
    const p = await open(null);
    const t1 = await p.evaluate(function(){ var H = window.__INYEON_TEST__, P = H.PRODUCTS;
      return {active: H.launchPriceActive(), prices:[P.saju_full.price, P.mbti_full.price, P.compat_full.price, P.premium_pass.price]}; });
    R.note(t1.active && t1.prices.join(',') === '1900,1900,990,3900', '① 지금은 기념가', JSON.stringify(t1));
    await p.evaluate(function(){ window.__INYEON_TEST__.goRoute('mbtiReport'); }); await wait(1000);
    const lockTxt = await p.evaluate(function(){ var b = document.querySelector('.locked-cta .btn-buy'); return b ? b.textContent : ''; });
    R.note(/출시 기념가 1,900원으로 열기/.test(lockTxt), '① 잠금 단추에 출시 기념가', lockTxt);
    await p.evaluate(function(){ window.__INYEON_TEST__.openPaywall(window.__INYEON_TEST__.PRODUCTS.mbti_full); }); await wait(600);
    const pay = await p.evaluate(function(){ var x = document.querySelector('.modal-box .pay-launch'); return x ? x.textContent : ''; });
    R.note(pay === '출시 기념가 · 12월 31일까지1월 1일부터 2,900원', '① 결제창에 끝나는 날과 바뀔 값', pay);
    await p.evaluate(function(){ document.querySelectorAll('.modal-box button').forEach(function(b){ if(/닫기/.test(b.textContent)) b.click(); }); });
    await p.evaluate(function(){ window.__INYEON_TEST__.goRoute('pricing'); }); await wait(800);
    const pr = await p.evaluate(function(){ return document.querySelector('#main').innerText; });
    R.note((pr.match(/2027년 1월 1일부터/g)||[]).length === 4 && /1월 1일부터 1,500원/.test(pr) && /1월 1일부터 5,900원/.test(pr), '① 상품과 가격에 네 상품 모두 바뀔 값', (pr.match(/1월 1일부터 [\d,]+원/g)||[]).join(' · '));
    const s1 = await p.evaluate(function(){ return document.querySelectorAll('#main s, .modal-box s').length; });
    await p.close();

    /* ② 1월 1일 00:00:05 (한국) */
    const q = await open(Date.UTC(2026, 11, 31, 15, 0, 5));
    const t2 = await q.evaluate(function(){ var H = window.__INYEON_TEST__, P = H.PRODUCTS;
      return {active: H.launchPriceActive(), prices:[P.saju_full.price, P.mbti_full.price, P.compat_full.price, P.premium_pass.price]}; });
    R.note(!t2.active && t2.prices.join(',') === '2900,2900,1500,5900', '② 1월 1일 0시가 지나면 새 값', JSON.stringify(t2));
    await q.evaluate(function(){ window.__INYEON_TEST__.goRoute('pricing'); }); await wait(800);
    const pr2 = await q.evaluate(function(){ return document.querySelector('#main').innerText; });
    R.note(!/출시 기념가/.test(pr2) && /2,900원/.test(pr2) && /5,900원/.test(pr2), '② 상품과 가격 — 새 값 · 기념가 글자 없음');
    await q.evaluate(function(){ window.__INYEON_TEST__.goRoute('mbtiReport'); }); await wait(1000);
    const lock2 = await q.evaluate(function(){ var b = document.querySelector('.locked-cta .btn-buy'); return b ? b.textContent : ''; });
    R.note(/2,900원으로 열기/.test(lock2) && !/기념가/.test(lock2), '② 잠금 단추 — 2,900원 · 기념가 없음', lock2);
    await q.evaluate(function(){ window.__INYEON_TEST__.openPaywall(window.__INYEON_TEST__.PRODUCTS.mbti_full); }); await wait(600);
    const pay2 = await q.evaluate(function(){ return {launch: !!document.querySelector('.modal-box .pay-launch'), price: (document.querySelector('.modal-box .pay-price')||{}).textContent}; });
    R.note(!pay2.launch && pay2.price === '2,900원', '② 결제창 — 2,900원 · 기념가 줄 없음', JSON.stringify(pay2));
    await q.close();
    R.note(s1 === 0, '③ 상품과 가격 화면에 취소선(판 적 없는 정가) 없음', String(s1));
    R.note(errs.length === 0, 'JS 오류 0건', errs.slice(0,2).join(' / ') || '없음');
  } finally { await browser.close(); srv.close(); }
  R.done();
})();
