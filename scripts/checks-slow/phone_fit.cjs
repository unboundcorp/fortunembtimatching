/* =====================================================================
   폰인데 PC 화면으로 보이던 것 — 세 가지 모양을 실제로 띄워 잰다 (느린 층)
   ---------------------------------------------------------------------
   2026-09-09 대표님 제보 "갤럭시 폰에서는 왜 작아보이냐!"
     → 원인: **삼성 인터넷의 'PC 버전으로 보기'가 기본값으로 켜져 있었습니다.**
       그 모드는 meta viewport 를 무시하고 폭을 약 980으로 답합니다. 그래서
       @media (min-width:601px) 가 걸려 420px 칸이 폰 화면 가운데 조그맣게 섰습니다.

   ★ 고친 방법: `fitPhoneViewport()` 가 **손가락으로 쓰는 기기(pointer:coarse)** 인데
     폭이 600을 넘으면 `#app` 을 412px 로 고정하고 `zoom` 으로 화면 폭에 맞춰 키웁니다.
   ★ `<html>` 에 zoom 을 걸면 안 됩니다 — clientWidth 가 안 줄어 문서가 가로로 넘칩니다(실측).
   ★ `100vh` 는 zoom 아래에서 그대로 부풀어 제목 위에 커다란 빈 칸을 만듭니다.
     그래서 `--app-vh` 로 나눠 줍니다. 이 검사가 그 변수까지 봅니다.

   재는 것 셋:
     ① PC보기 켠 폰(980 · 터치)  → 칸이 화면을 꽉 채우고 가로로 안 넘친다
     ② 보통 폰(412 · 터치)        → 아무것도 안 건드린다
     ③ 진짜 PC(1280 · 마우스)     → 420px 가운데 칸 그대로
===================================================================== */
const { chromePath, puppeteer, serve, reporter, openPage, wait, ROOT, makeState } = require('../_lib.cjs');

/* ★ 동의 화면으로 잰다. `.onboard` 가 100vh 를 쓰는 자리이고, 대표님이 사진으로 보내주신
   "제목 위가 텅 빈" 화면이 바로 이 화면이다. */
const ONBOARD = makeState({onboarded:false, profiles:[], activeId:null});

const R = reporter('폰 화면 맞추기');

async function measure(browser, site, opt){
  const p = await openPage(browser, {width:opt.w, height:opt.h, state:ONBOARD});
  /* ★ 손가락 기기 흉내는 setViewport 의 hasTouch/isMobile 로 한다.
     Emulation.setEmulatedMedia 로 pointer 를 바꾸려 해 봤지만 (pointer:coarse) 가
     그대로 false 였다(실측). 그러면 이 검사가 **아무것도 안 재고 통과**한다. */
  if(opt.touch) await p.setViewport({width:opt.w, height:opt.h, hasTouch:true, isMobile:true});
  await p.goto(site.url + '/fortune.html', {waitUntil:'domcontentloaded'});
  await wait(1100);
  const m = await p.evaluate(function(){
    const app = document.getElementById('app');
    const de = document.documentElement;
    return {
      zoom: app.style.zoom || '',
      appCss: app.style.width || '',
      appPaint: Math.round(app.getBoundingClientRect().width),
      docW: Math.round(de.scrollWidth),
      clientW: de.clientWidth,
      vhVar: de.style.getPropertyValue('--app-vh') || '',
      onboard: !!document.querySelector('.onboard'),
      titleTop: (function(){
        const box = document.querySelector('.onboard');
        if(!box) return -1;
        const t = [...box.children].find(function(x){ return (x.textContent||'').trim(); });
        return t ? Math.round(t.getBoundingClientRect().top) : -1;
      })(),
    };
  });
  m.errs = p.__errs || [];
  await p.close();
  return m;
}

(async function(){
  const pptr = puppeteer(), chrome = chromePath();
  if(!pptr || !chrome){ console.log('크롬을 못 찾았습니다 — 건너뜁니다'); process.exit(0); }
  const base = process.argv[2];
  const site = base ? {url:base, close:function(){}} : await serve(ROOT, 0);
  const browser = await pptr.launch({executablePath: chrome, headless:'new',
    args:['--no-sandbox','--disable-dev-shm-usage']});

  try{
    R.head("── ① 'PC 버전으로 보기'를 켠 폰 (980 · 손가락)");
    const a = await measure(browser, site, {w:980, h:1800, touch:true});
    R.note(a.appPaint >= 900, '칸이 화면을 꽉 채운다', a.appPaint + 'px');
    R.note(a.docW <= a.clientW + 1, '가로로 넘치지 않는다', a.docW + ' / ' + a.clientW);
    R.note(!!a.zoom && Number(a.zoom) > 1.5, 'zoom 으로 키웠다', a.zoom);
    R.note(a.appCss === '412px', '칸 폭을 412px 로 고정했다', a.appCss || '없음');
    R.note(!!a.vhVar, '--app-vh 를 정했다 (100vh 가 부풀지 않게)', a.vhVar || '없음');
    /* ★ 제목이 화면 한참 아래에 있으면 그게 대표님이 보신 "위가 텅 빈" 모양이다 */
    R.note(a.onboard, '동의 화면을 재고 있다 (100vh 를 쓰는 자리)');
    R.note(a.titleTop >= 0 && a.titleTop < 400, '제목 위에 커다란 빈 칸이 없다', a.titleTop + 'px');
    R.note(a.errs.length === 0, 'JS 오류 0건', a.errs.join(' | ') || '없음');

    R.head('── ② 보통 폰 (412 · 손가락)');
    const b = await measure(browser, site, {w:412, h:900, touch:true});
    R.note(!b.zoom, '아무것도 안 건드린다 (zoom 없음)', b.zoom || '없음');
    R.note(!b.vhVar, '--app-vh 도 안 건다', b.vhVar || '없음');
    R.note(b.docW <= b.clientW + 1, '가로로 넘치지 않는다', b.docW + ' / ' + b.clientW);
    R.note(b.errs.length === 0, 'JS 오류 0건', b.errs.join(' | ') || '없음');

    R.head('── ③ 진짜 PC (1280 · 마우스)');
    const c = await measure(browser, site, {w:1280, h:900, touch:false});
    R.note(!c.zoom, 'PC 는 그대로 둔다 (zoom 없음)', c.zoom || '없음');
    R.note(c.appPaint >= 400 && c.appPaint <= 440, '420px 가운데 칸 그대로', c.appPaint + 'px');
    R.note(c.docW <= c.clientW + 1, '가로로 넘치지 않는다', c.docW + ' / ' + c.clientW);
    R.note(c.errs.length === 0, 'JS 오류 0건', c.errs.join(' | ') || '없음');
  }catch(err){
    R.bad('검사 중 오류', String(err && err.message).slice(0,160));
  }finally{
    try{ await browser.close(); }catch(e){}
    site.close();
  }
  R.done();
})();
