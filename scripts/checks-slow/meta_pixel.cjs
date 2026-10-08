#!/usr/bin/env node
/* =====================================================================
   메타 픽셀 — 무엇을 언제 보내나 (느린 층)
   ---------------------------------------------------------------------
   2026-10-08 대표님 "진행해". 진짜 메타로는 아무것도 안 나간다 — window.fbq 를 가짜로 심고
   connect.facebook.net 요청은 막고 센다.
   ① 그냥 열면: init(ID) · autoConfig 끔 · PageView 한 번 · 그때 주소가 깨끗하다
   ② 결제창을 열면 InitiateCheckout(상품·금액·KRW)
   ③ 결제 복귀(?receipt=)면 Purchase — 그때 주소에 receipt 가 없다
   ④ 초대 링크 해시로 열어도 보낼 때 주소에 해시가 없다
   ⑤ 어느 사건에도 이름·생년이 안 실린다
   ⑥ 설정에서 끄면(adOptOut) 아무것도 안 보낸다
   ⑦ 우리 주소가 아니면(검사 표식 없음) 스크립트도 안 부른다
===================================================================== */
const { chromePath, puppeteer, serve, reporter, openPage, wait, makeState, ROOT } = require('../_lib.cjs');
const R = reporter('메타 픽셀');
const ID = '739495668667523';
(async function(){
  const pptr = puppeteer(), chrome = chromePath();
  if(!pptr || !chrome){ console.log('크롬을 못 찾았습니다 — 건너뜁니다'); process.exit(0); }
  const base = process.argv[2];
  const site = base ? {url:base, close:function(){}} : await serve(ROOT, 0);
  const browser = await pptr.launch({executablePath: chrome, headless:'new', args:['--no-sandbox','--disable-dev-shm-usage']});
  const errs = []; let fbNet = 0;
  async function open(opt){
    const p = await openPage(browser, {hook:true, state: makeState(opt.state || {})});
    p.on('pageerror', e => errs.push(String(e)));
    if(opt.fake !== false) await p.evaluateOnNewDocument(function(){
      window.__PIXEL_TEST__ = true; window.__FBQ = [];
      window.fbq = function(){ window.__FBQ.push({a: Array.prototype.slice.call(arguments), url: location.href}); };
    });
    await p.setRequestInterception(true);
    p.on('request', function(req){
      const u = req.url();
      if(u.indexOf('facebook') >= 0){ fbNet++; return req.abort(); }
      if(u.indexOf('/api/verify') >= 0) return req.respond({status:200, contentType:'application/json', body:'{"verified":true}'});
      if(u.indexOf('/api/entitlements') >= 0) return req.respond({status:200, contentType:'application/json', body: JSON.stringify({items:{compat_full:{purchasedAt:Date.now()}}, purchases:[]})});
      req.continue();
    });
    await p.goto(site.url + '/fortune.html' + (opt.q || ''), {waitUntil:'domcontentloaded'}); await wait(opt.wait || 1500);
    return p;
  }
  const calls = p => p.evaluate(function(){ return window.__FBQ || null; });
  const tracks = (c, name) => (c || []).filter(x => x.a[0] === 'track' && x.a[1] === name);
  try{
    /* ① ⑤ */
    let p = await open({});
    let c = await calls(p);
    const nm = await p.evaluate(function(){ var m = window.__INYEON_TEST__.activeProfile(); return {n:m.name, y:String(m.year)}; });
    R.note(c.some(x => x.a[0]==='init' && x.a[1]===ID), '① init — 인연점 픽셀 ID', JSON.stringify(c.map(x=>x.a[0]+':'+x.a[1])));
    R.note(c.some(x => x.a[0]==='set' && x.a[1]==='autoConfig' && x.a[2]===false), '① 자동 수집(autoConfig)을 끈다');
    R.note(tracks(c,'PageView').length === 1, '① PageView 한 번', String(tracks(c,'PageView').length));
    /* ② */
    await p.evaluate(function(){ var T = window.__INYEON_TEST__; T.openPaywall(T.PRODUCTS.compat_full); }); await wait(400);
    c = await calls(p);
    const ic = tracks(c,'InitiateCheckout')[0];
    R.note(ic && ic.a[2].content_ids[0]==='compat_full' && ic.a[2].currency==='KRW' && ic.a[2].value > 0, '② 결제창 열림 → InitiateCheckout(상품·금액)', JSON.stringify(ic && ic.a[2]));
    const all1 = JSON.stringify(c.map(x=>x.a));
    R.note(all1.indexOf(nm.n) < 0 && all1.indexOf(nm.y) < 0, '⑤ 이름·태어난 해가 안 실린다', all1.slice(0,160));
    await p.close();
    /* ③ */
    p = await open({q:'?receipt=RCPT123&product=compat_full', wait:3000});
    c = await calls(p);
    const pu = tracks(c,'Purchase')[0];
    R.note(pu && pu.a[2].content_ids[0]==='compat_full' && pu.a[2].value > 0, '③ 결제 복귀 → Purchase(상품·금액)', JSON.stringify(pu && pu.a[2]));
    R.note(c.length > 0 && c.every(x => x.url.indexOf('receipt') < 0 && x.url.indexOf('?') < 0), '③ 보낼 때 주소에 영수증이 없다', c.map(x=>x.url).join(' | ').slice(0,200));
    R.note(JSON.stringify(c.map(x=>x.a)).indexOf('RCPT123') < 0, '③ 영수증 번호가 사건에 안 실린다');
    await p.close();
    /* ④ */
    p = await open({q:'#g=abcdefgh123&rel=lover', wait:2000});
    c = await calls(p);
    R.note(c.length > 0 && c.every(x => x.url.indexOf('#') < 0), '④ 초대 해시로 열어도 보낼 때 주소가 깨끗하다', c.map(x=>x.url).join(' | ').slice(0,200));
    await p.close();
    /* ⑥ */
    p = await open({state:{adOptOut:true}});
    c = await calls(p);
    await p.evaluate(function(){ var T = window.__INYEON_TEST__; T.openPaywall(T.PRODUCTS.compat_full); }); await wait(300);
    c = await calls(p);
    R.note(c.length === 0, '⑥ 설정에서 끄면 아무것도 안 보낸다', JSON.stringify(c.map(x=>x.a[0])));
    await p.close();
    /* ⑦ */
    fbNet = 0;
    p = await open({fake:false});
    const st = await p.evaluate(function(){ return {fbq: typeof window.fbq, loaded: window.__INYEON_TEST__.PIXEL.loaded}; });
    R.note(st.fbq === 'undefined' && !st.loaded && fbNet === 0, '⑦ 우리 주소가 아니면 스크립트도 안 부른다', JSON.stringify(st) + ' net=' + fbNet);
    await p.close();
    R.note(errs.length === 0, 'JS 오류 0건', errs.slice(0,2).join(' / ') || '없음');
  } finally { await browser.close(); site.close(); }
  R.done();
})();
