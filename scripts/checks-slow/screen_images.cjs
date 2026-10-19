/* =====================================================================
   [이미지로 저장] — 화면 글을 세로 그림 여러 장으로 (느린 층) · 2026-10-19 대표님
   "사주풀이 글 전체 복사하면 표나 이미지 글귀는 다 깨지는데 그냥 이미지를 싹다 떠 주면 안 되나?"
   ① 복사 링크 옆에 [이미지로 저장]이 있다 ② 누르면 창에 긴 그림 한 장(간직용 · 대표님 2026-10-19) ③ 폭 1080 · 아주 길면 1,600만 화소 안으로 줄임
   ④ 복사본이 표·막대·칩을 펴서 낸다(그림이 같은 글을 쓴다) ⑤ JS 오류 0 · 가로 넘침 0 */
const { chromePath, puppeteer, serve, reporter, openPage, wait, ROOT, makeState } = require('../_lib.cjs');
const R = reporter('이미지로 저장');
(async function(){
  const pptr = puppeteer(), chrome = chromePath();
  if(!pptr || !chrome){ console.log('크롬을 못 찾았습니다 — 건너뜁니다'); process.exit(0); }
  const base = process.argv[2];
  const site = base ? {url:base, close:function(){}} : await serve(ROOT, 0);
  const browser = await pptr.launch({executablePath: chrome, headless:'new', args:['--no-sandbox','--disable-dev-shm-usage']});
  const errs = [];
  try{
    const Y = new Date(Date.now() + 9*3600*1000).getUTCFullYear();
    const p = await openPage(browser, {hook:true, state: makeState({})});
    p.on('pageerror', e => errs.push(String(e)));
    await p.setViewport({width:390, height:900});
    await p.setRequestInterception(true);
    p.on('request', function(r){ const u = r.url();
      if(u.indexOf('/api/entitlements') >= 0){ const it = {}; it['saju_full:'+Y] = {purchasedAt: Date.now()};
        return r.respond({status:200, contentType:'application/json', body: JSON.stringify({items:it, purchases:[]})}); }
      if(u.indexOf('/api/interpret') >= 0 || u.indexOf('/api/content') >= 0)
        return r.respond({status:503, contentType:'application/json', body:'{"error":"test"}'});
      r.continue(); });
    await p.goto(site.url + '/fortune.html', {waitUntil:'domcontentloaded'}); await wait(1500);
    await p.evaluate(function(){ window.__INYEON_TEST__.goRoute('report13'); }); await wait(2500);
    const links = await p.evaluate(function(){ return [].slice.call(document.querySelectorAll('#main .copy-links button')).map(function(b){ return b.textContent.trim(); }); });
    R.note(links.indexOf('이 화면 글 전체 복사') >= 0 && links.indexOf('이미지로 저장') >= 0, '① 복사 링크 옆에 [이미지로 저장]', JSON.stringify(links));
    const copy = await p.evaluate(function(){ return window.__INYEON_TEST__.screenTextForCopy(); });
    R.note(/달마다 점수 — 1월 \d+ · 2월 \d+/.test(copy), '④ 달마다 막대가 숫자 한 줄로 나온다');
    R.note(/· 첫인상 — 타고난 기운으로 보면: .+ \/ 성격유형으로 보면: /.test(copy) && !/\t/.test(copy), '④ 사랑 장 표가 줄마다 펴진다(탭 없음)');
    R.note(!/👆/.test(copy), "④ '막대를 누르면' 안내가 안 들어간다");
    const h = await p.evaluate(function(){ return window.__INYEON_TEST__.screenImagePages().height; });
    await p.evaluate(function(){
      var b = [].slice.call(document.querySelectorAll('#main .copy-links button')).filter(function(x){ return x.textContent.trim() === '이미지로 저장'; })[0];
      b.scrollIntoView({block:'center', behavior:'instant'}); b.click(); }); await wait(1500);
    const m = await p.evaluate(function(){ var imgs = [].slice.call(document.querySelectorAll('.modal-box .pg-img'));
      return { n: imgs.length, wh: imgs[0] ? [imgs[0].naturalWidth, imgs[0].naturalHeight] : null,
        save: [].slice.call(document.querySelectorAll('.modal-box button')).some(function(b){ return /^그림 저장하기/.test(b.textContent.trim()); }),
        over: document.documentElement.scrollWidth > document.documentElement.clientWidth }; });
    R.note(m.n === 1, '② 창에 그림이 한 장', '그림 '+m.n);
    R.note(m.wh && m.wh[0] === 1080 && m.wh[1] >= 2000 && Math.abs(m.wh[1] - h) <= 2, '③ 폭 1080 · 글 길이만큼 긴 한 장', JSON.stringify(m.wh)+' 계산 높이 '+h);
    R.note(m.save, '② [그림 저장하기] 단추가 있다');
    /* 아주 긴 풀이 — 아이폰 캔버스 한도(약 1,677만 화소) 안으로 줄여 그리는가 */
    const big = await p.evaluate(function(){ var T = window.__INYEON_TEST__, mk = T.screenImagePages();
      mk.height = 40000; var c = document.createElement('canvas'); T.pgDraw(c, mk); return [c.width, c.height]; });
    R.note(big[0] * big[1] <= 16000000 && big[1] > 10000, '③ 아주 긴 풀이는 한도 안으로 줄여 한 장', JSON.stringify(big));
    R.note(!m.over, '⑤ 가로 넘침 없음');
    /* 내 사주 화면에도 */
    await p.keyboard.press('Escape'); await wait(400);
    await p.evaluate(function(){ window.__INYEON_TEST__.goRoute('saju'); }); await wait(2000);
    const n2 = await p.evaluate(function(){ var m = window.__INYEON_TEST__.screenImagePages(); return m ? m.lines.length : 0; });
    R.note(n2 >= 1, '내 사주 화면도 그림으로 만들어진다', '줄 '+n2);
    R.note(errs.length === 0, '⑤ JS 오류 0건', errs.slice(0,2).join(' | '));
  }catch(e){ R.note(false, '검사 자체가 터졌습니다: '+e.message); }
  await browser.close(); site.close();
  process.exit(R.done() ? 0 : 1);
})();
