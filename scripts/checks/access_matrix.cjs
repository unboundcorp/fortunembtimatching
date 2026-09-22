/* =====================================================================
   권한 판정 행렬 (빠른 층) — 2026-09-21
   ---------------------------------------------------------------------
   옛 관리자 테스트 콘솔(ADMIN_KEY 방식)을 지우면서 권한 판정 함수(hasAccess · passActive)
   안에 끼어 있던 "항상 false" 호출 5곳을 함께 걷어냈다. 그 전후로 판정이 한 칸도 안 바뀌었음을
   실측(동일 JSON)으로 확인했고, 그때의 값을 아래 EXPECTED 에 그대로 박아 지킨다.
   ★ 이용권 모양 10가지 × 상품 6가지. 값이 바뀌면 '누가 무엇을 열 수 있나'가 바뀐 것이다 —
     일부러 바꾼 것이면 이 표를 같이 고치고, 아니면 회귀다.
   ★ 화면 함수를 직접 부른다(window.__INYEON_TEST__). 글자 대조가 아니다.
===================================================================== */
const L = require('../_lib.cjs');
const EXPECTED = '{"none":{"access":{"saju_full:2026":false,"saju_full:2027":false,"mbti_full":false,"compat_full":false,"premium_pass:2026":false,"premium_pass":false},"passActive":false,"realPassActive":false,"days":0,"gate":{"mode":"live","live":true}},"saju26":{"access":{"saju_full:2026":true,"saju_full:2027":false,"mbti_full":false,"compat_full":false,"premium_pass:2026":false,"premium_pass":false},"passActive":false,"realPassActive":false,"days":0,"gate":{"mode":"live","live":true}},"mbti":{"access":{"saju_full:2026":false,"saju_full:2027":false,"mbti_full":true,"compat_full":false,"premium_pass:2026":false,"premium_pass":false},"passActive":false,"realPassActive":false,"days":0,"gate":{"mode":"live","live":true}},"compat":{"access":{"saju_full:2026":false,"saju_full:2027":false,"mbti_full":false,"compat_full":true,"premium_pass:2026":false,"premium_pass":false},"passActive":false,"realPassActive":false,"days":0,"gate":{"mode":"live","live":true}},"pass26":{"access":{"saju_full:2026":true,"saju_full:2027":false,"mbti_full":true,"compat_full":true,"premium_pass:2026":true,"premium_pass":true},"passActive":true,"realPassActive":true,"days":100,"gate":{"mode":"live","live":true}},"pass27":{"access":{"saju_full:2026":false,"saju_full:2027":true,"mbti_full":true,"compat_full":true,"premium_pass:2026":false,"premium_pass":true},"passActive":true,"realPassActive":true,"days":100,"gate":{"mode":"live","live":true}},"passNoYear":{"access":{"saju_full:2026":true,"saju_full:2027":false,"mbti_full":true,"compat_full":true,"premium_pass:2026":true,"premium_pass":true},"passActive":true,"realPassActive":true,"days":100,"gate":{"mode":"live","live":true}},"passNoYearNoAt":{"access":{"saju_full:2026":true,"saju_full:2027":true,"mbti_full":true,"compat_full":true,"premium_pass:2026":true,"premium_pass":true},"passActive":true,"realPassActive":true,"days":100,"gate":{"mode":"live","live":true}},"passExpired":{"access":{"saju_full:2026":false,"saju_full:2027":false,"mbti_full":false,"compat_full":false,"premium_pass:2026":false,"premium_pass":false},"passActive":false,"realPassActive":false,"days":0,"gate":{"mode":"live","live":true}},"mixed":{"access":{"saju_full:2026":true,"saju_full:2027":true,"mbti_full":true,"compat_full":true,"premium_pass:2026":true,"premium_pass":true},"passActive":true,"realPassActive":true,"days":10,"gate":{"mode":"live","live":true}},"passAllYears":{"access":{"saju_full:2026":true,"saju_full:2027":true,"mbti_full":true,"compat_full":true,"premium_pass:2026":true,"premium_pass":true},"passActive":true,"realPassActive":true,"days":100,"gate":{"mode":"live","live":true}},"passAllYearsExpired":{"access":{"saju_full:2026":false,"saju_full:2027":false,"mbti_full":false,"compat_full":false,"premium_pass:2026":false,"premium_pass":false},"passActive":false,"realPassActive":false,"days":0,"gate":{"mode":"live","live":true}}}';
(async function(){
  const R = L.reporter('권한 판정 행렬');
  const exe = L.chromePath(), pp = L.puppeteer();
  if(!exe || !pp){ console.log('크롬/puppeteer 없음 — 건너뜀'); process.exit(0); }
  let srv = null, base = process.argv[2];
  if(!base){ srv = await L.serve(L.ROOT, 0); base = srv.url; }
  const browser = await pp.launch({executablePath: exe, headless:'new', args:['--no-sandbox']});
  const page = await L.openPage(browser, {width:390, height:800, state:L.makeState(), hook:true});
  await page.setRequestInterception(true);
  page.on('request', r => { const u = r.url(); const j = o => ({status:200, contentType:'application/json', body:JSON.stringify(o)});
    if(u.indexOf('/api/entitlements') >= 0) return r.respond(j({items:{}, pass:null, purchases:[]}));
    if(u.indexOf('/api/') >= 0) return r.respond(j({ok:true})); r.continue(); });
  await page.goto(base.replace(/\/+$/, '') + '/fortune.html', {waitUntil:'load'}); await L.wait(1500);
  const got = await page.evaluate(() => {
    const T = window.__INYEON_TEST__; const now = Date.now(); const D = 86400000;
    const y = T.productIdFor('premium_pass', 2026), y27 = T.productIdFor('premium_pass', 2027);
    const shapes = {
      none:{items:{},pass:null,purchases:[]},
      saju26:{items:{'saju_full:2026':{receiptId:'r1'}},pass:null,purchases:[]},
      mbti:{items:{'mbti_full':{receiptId:'r2'}},pass:null,purchases:[]},
      compat:{items:{'compat_full':{receiptId:'r3'}},pass:null,purchases:[]},
      pass26:{items:{},pass:{productId:y,purchasedAt:now-D,expiresAt:now+100*D},purchases:[]},
      pass27:{items:{},pass:{productId:y27,purchasedAt:now-D,expiresAt:now+100*D},purchases:[]},
      passNoYear:{items:{},pass:{productId:'premium_pass',purchasedAt:now-D,expiresAt:now+100*D},purchases:[]},
      passNoYearNoAt:{items:{},pass:{productId:'premium_pass',expiresAt:now+100*D},purchases:[]},
      passExpired:{items:{},pass:{productId:y,purchasedAt:now-400*D,expiresAt:now-D},purchases:[]},
      /* 2026-09-22 — 테스트 허가(서버가 allYears 를 붙임)는 모든 해가 열린다 */
      passAllYears:{items:{},pass:{productId:y,purchasedAt:now-D,expiresAt:now+100*D,allYears:true},purchases:[]},
      passAllYearsExpired:{items:{},pass:{productId:y,purchasedAt:now-400*D,expiresAt:now-D,allYears:true},purchases:[]},
      mixed:{items:{'saju_full:2027':{receiptId:'r4'}},pass:{productId:y,purchasedAt:now-D,expiresAt:now+10*D},purchases:[]},
    };
    const prods = ['saju_full:2026','saju_full:2027','mbti_full','compat_full',y,'premium_pass'];
    const res = {};
    for(const k in shapes){
      T.ENT.data = shapes[k]; T.ENT.ready = true; T.ENT.error = null;
      const r = {access:{}, passActive:T.passActive(), realPassActive:T.realPassActive(), days:T.passRemainingDays()};
      prods.forEach(p => { r.access[p] = T.hasAccess(p); });
      const g = T.paywallGate(); r.gate = {mode:g.mode, live:g.live};
      res[k] = r;
    }
    return res;
  });
  const exp = JSON.parse(EXPECTED);
  let cells = 0;
  Object.keys(exp).forEach(function(k){
    const e = exp[k], g = got[k] || {};
    Object.keys(e.access).forEach(function(p){ cells++;
      R.note(g.access && g.access[p] === e.access[p], k + ' → ' + p + ' = ' + e.access[p], String(g.access && g.access[p])); });
    R.note(g.passActive === e.passActive && g.realPassActive === e.realPassActive,
      k + ' → passActive ' + e.passActive + ' · realPassActive ' + e.realPassActive, g.passActive + ' · ' + g.realPassActive);
    R.note(g.days === e.days, k + ' → 남은 일수 ' + e.days, String(g.days));
    R.note(g.gate && g.gate.mode === e.gate.mode && g.gate.live === e.gate.live, k + ' → 결제 관문 ' + e.gate.mode, JSON.stringify(g.gate));
  });
  R.note(cells === 72, '행렬이 72칸이다 (12 모양 × 6 상품)', cells + '칸');
  await browser.close(); if(srv) srv.close();
  R.done();
})();
