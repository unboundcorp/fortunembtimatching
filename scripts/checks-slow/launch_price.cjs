/* =====================================================================
   상품 값 — 화면 (느린 층)
   ---------------------------------------------------------------------
   2026-10-31 대표님 "바로 지금부터 · 고지도 싹다 바꿔" — 출시 기념가 끝 · 4,900 · 3,900 · 2,900 · 8,900 (같은 날 3,500 안을 거쳐).
   ① 지금 · ② 한국 11월 1일 0시 뒤 둘 다: 값이 새 값이고 '출시 기념가' · '11월 1일부터' 글자가 어디에도 없다
   ③ 잠금 단추 · 결제창 · 상품과 가격(#pricing) · 이용권 비교 '따로 구매하면 7,300원'
   ④ 취소선으로 판 적 없는 '정가'를 적지 않음 · JS 오류 0
===================================================================== */
const L = require('../_lib.cjs');
const wait = L.wait;
(async () => {
  const R = L.reporter('상품 값 화면');
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
  const NO_LAUNCH = (t) => !/출시 기념가|기념가|11월 1일부터/.test(t);
  try{
    for (const [label, when] of [['① 지금', null], ['② 11월 1일 0시 뒤', Date.UTC(2026, 9, 31, 15, 0, 5)]]) {
      const p = await open(when);
      const t = await p.evaluate(function(){ var H = window.__INYEON_TEST__, P = H.PRODUCTS;
        return {active: H.launchPriceActive(), prices:[P.saju_full.price, P.mbti_full.price, P.compat_full.price, P.premium_pass.price]}; });
      R.note(!t.active && t.prices.join(',') === '4900,3900,2900,8900', label + ' — 값 4,900 · 3,900 · 2,900 · 8,900 · 기념가 꺼짐', JSON.stringify(t));
      await p.evaluate(function(){ window.__INYEON_TEST__.goRoute('mbtiReport'); }); await wait(1000);
      const lock = await p.evaluate(function(){ var b = document.querySelector('.locked-cta .btn-buy'); return b ? b.textContent : ''; });
      R.note(/풀이 열기/.test(lock) && !/원/.test(lock) && NO_LAUNCH(lock), label + ' — 잠금 단추에 금액 없음(10-31 결제창에서 처음 보임)', lock);
      await p.evaluate(function(){ window.__INYEON_TEST__.openPaywall(window.__INYEON_TEST__.PRODUCTS.premium_pass); }); await wait(600);
      const pay = await p.evaluate(function(){ var m = document.querySelector('.modal-box'); return {launch: !!document.querySelector('.modal-box .pay-launch'), price: (document.querySelector('.modal-box .pay-price')||{}).textContent, txt: m ? m.innerText : ''}; });
      R.note(!pay.launch && pay.price === '8,900원' && /11,700원/.test(pay.txt) && NO_LAUNCH(pay.txt), label + ' — 이용권 결제창 8,900원 · 따로 구매하면 11,700원 · 기념가 줄 없음', JSON.stringify({launch:pay.launch, price:pay.price}));
      await p.evaluate(function(){ document.querySelectorAll('.modal-box button').forEach(function(b){ if(/닫기/.test(b.textContent)) b.click(); }); });
      await p.evaluate(function(){ window.__INYEON_TEST__.goRoute('pricing'); }); await wait(800);
      const pr = await p.evaluate(function(){ return document.querySelector('#main').innerText; });
      R.note(/4,900원/.test(pr) && /3,900원/.test(pr) && /2,900원/.test(pr) && /8,900원/.test(pr) && !/990원|1,900원|3,500원|5,900원|1,500원/.test(pr) && NO_LAUNCH(pr), label + ' — 상품과 가격: 새 값만 · 옛 값·기념가 글자 없음');
      const s = await p.evaluate(function(){ return document.querySelectorAll('#main s, .modal-box s').length; });
      R.note(s === 0, label + ' — 상품과 가격에 취소선 없음', String(s));
      await p.close();
    }
    R.note(errs.length === 0, 'JS 오류 0건', errs.slice(0,2).join(' / ') || '없음');
  } finally { await browser.close(); srv.close(); }
  R.done();
})();
