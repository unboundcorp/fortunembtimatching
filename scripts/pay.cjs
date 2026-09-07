#!/usr/bin/env node
/* =====================================================================
   결제 흐름 검사 — 결제창이 뜨는가, 산 것이 산 것으로 보이는가
   ---------------------------------------------------------------------
   왜 만들었나 (2026-09-07 대표님 제보):
     "내 심층 사주보려고 결제버튼 누르고 카카오 로그인 했는데 다시 이 화면이 뜬다"
     사주 풀이에 연도를 붙이면서(saju_full:2026) 상품을 찾는 코드가 여덟 곳에서 깨졌다.
     전부 `PRODUCTS[id]` 로 찾고 있었는데 상품표의 열쇠는 `saju_full` 이라 **항상 undefined**였다.
     터지지 않고 조용히 아무 일도 안 하는 종류라, 화면 검사로는 절대 안 잡힌다.

   ★ 진짜 서버를 안 부른다. /api/* 를 전부 가짜로 받아 넘긴다 — 돈이 나가지 않는다.

   쓰는 법: node scripts/pay.cjs [주소]
===================================================================== */
const L = require('./_lib.cjs');
const BASE = (process.argv[2] || 'http://127.0.0.1:8899').replace(/\/+$/, '');
const APP = BASE + '/fortune.html';
const YEAR = new Date().getFullYear();

/* 서버 지연을 흉내 낸다 — 느린 응답 하나가 결제창을 붙잡고 있지 않은지 보려는 것이다.
   ★ 예전에는 카카오 조회·기기 동기화가 끝날 때까지 결제창이 안 떴다(실측 2.75초). */
const DELAY = {ent:400, kakao:1000, sync:1200};

function stub(page, ent){
  return page.setRequestInterception(true).then(function(){
    page.on('request', async function(r){
      const u = r.url();
      const j = function(o){ return {status:200, contentType:'application/json', body:JSON.stringify(o)}; };
      if(u.indexOf('/api/kakao') >= 0){ await L.wait(DELAY.kakao);
        return r.respond(j({ready:true, linked:true, since:Date.now()})); }
      if(u.indexOf('/api/sync') >= 0){ await L.wait(DELAY.sync); return r.respond(j({ok:true, data:{}})); }
      if(u.indexOf('/api/entitlements') >= 0){ await L.wait(DELAY.ent); return r.respond(j(ent)); }
      if(u.indexOf('/api/') >= 0) return r.respond(j({}));
      r.continue();
    });
  });
}
const EMPTY_ENT = {items:{}, pass:null, purchases:[]};

/* 결제창이 뜨기까지를 브라우저 안에서 잰다. 창이 떴다가 사라지는지도 함께 본다. */
const WATCH = function(){
  window.__tl = []; window.__m = {}; window.__t0 = performance.now();
  let last = null;
  setInterval(function(){
    if(!window.__m.app && document.querySelector('.tab-btn')) window.__m.app = performance.now();
    const mb = document.querySelector('.modal-box');
    const cur = mb ? ((mb.innerText||'').split('\n').filter(Boolean)[0]||'').slice(0,24) : null;
    if(cur !== last){ window.__tl.push([cur ? ('창:'+cur) : '창닫힘', Math.round(performance.now()-window.__t0)]); last = cur; }
    if(mb && !window.__m.modal) window.__m.modal = performance.now();
  }, 20);
};

(async () => {
  const R = L.reporter('결제 흐름');
  const exe = L.chromePath(), pp = L.puppeteer();
  if(!exe || !pp){ console.error('크롬 또는 puppeteer-core 를 못 찾았습니다.'); process.exit(2); }
  const browser = await pp.launch({executablePath:exe, headless:'new', args:['--no-sandbox']});

  /* ── 1. 카카오 로그인하고 돌아왔을 때 결제창이 다시 뜨는가 ────────
     ★ 한 번에 하나씩 재야 한다. 넷을 동시에 띄우면 CPU를 나눠 써서 전부 '못 쟀음'이
       나온다 — 서비스 고장이 아니라 계측 실패다(2026-09-07에 이걸로 한참 헤맸다). */
  R.head('[1] 카카오 복귀 후 결제창');
  const PRODS = [
    ['saju_full:' + YEAR,    'saju',   '사주 풀이'],
    ['mbti_full',            'report', '성격유형 풀이'],
    ['compat_full',          'compat', '궁합 상세'],
    ['premium_pass:' + YEAR, 'saju',   '전체 이용권'],
  ];
  for(const [pid, route, label] of PRODS){
    const page = await L.openPage(browser, {width:390, height:1400});
    await page.evaluateOnNewDocument(function(pid, route, watch){
      try{
        sessionStorage.setItem('inyeon.kakaoBack', JSON.stringify({
          route:route, mode:(route==='compat'?'compat':'self'), product:pid,
          retried:false, compat:null, at:Date.now()}));
      }catch(e){}
      (new Function(watch))();
    }, pid, route, '(' + WATCH.toString() + ')()');
    await stub(page, EMPTY_ENT);
    await page.goto(APP + '?kakao=ok', {waitUntil:'load'});
    await L.wait(6000);
    const o = await page.evaluate(() => ({tl:window.__tl, m:window.__m}));
    await page.close();
    if(!(o.m.app && o.m.modal)){
      R.bad(label + ' 결제창', '안 뜸 · 타임라인 ' + JSON.stringify(o.tl));
      continue;
    }
    const sec = ((o.m.modal - o.m.app)/1000).toFixed(2);
    const closed = o.tl.some(function(x){ return x[0] === '창닫힘'; });
    if(closed){ R.bad(label + ' 결제창', '떴다가 사라짐 ' + JSON.stringify(o.tl)); continue; }
    /* 이용권 조회(0.4초)만 기다리면 되므로 1초를 넘기면 무언가를 더 기다리고 있는 것이다 */
    R.note(Number(sec) < 1.2, label + ' 결제창이 곧바로 뜬다', sec + '초 · ' + (o.tl[1] ? o.tl[1][0] : ''));
  }

  /* ── 2. 연도가 붙은 상품을 산 뒤 ────────────────────────────── */
  R.head('[2] 연도 상품(saju_full:' + YEAR + ')을 산 상태');
  {
    const bought = {items:{}, pass:null,
      purchases:[{productId:'saju_full:'+YEAR, at:Date.now(), price:1900, receiptId:'T-1', provider:'toss'}]};
    bought.items['saju_full:'+YEAR] = {purchasedAt: Date.now()};
    const page = await L.openPage(browser, {width:390, height:1400, hook:true});
    await stub(page, bought);
    await page.goto(APP, {waitUntil:'load'});
    await L.wait(3000);

    /* 통로로 상품 판정을 직접 확인한다 */
    const chk = await page.evaluate(function(y){
      const T = window.__INYEON_TEST__;
      if(!T || !T.productDef) return {noHook:true};
      const d = T.productDef('saju_full:'+y);
      return {name: d && d.name, price: d && d.price,
              badYear: T.productDef('compat_full:'+y),
              base: T.splitProductId('saju_full:'+y).base};
    }, YEAR);
    if(chk.noHook){ R.skip('상품 이름 판정', '검사 통로가 안 열림'); }
    else {
      R.note(chk.name === '사주 풀이 전체 해석 · ' + YEAR + '년', '연도가 붙은 이름이 나온다', chk.name || '없음');
      R.note(chk.price === 1900, '값을 제대로 찾는다', chk.price + '원');
      R.note(chk.base === 'saju_full', '기본 이름을 갈라낸다', chk.base);
      R.note(chk.badYear === null, '연도가 안 붙는 상품에 연도를 붙이면 거절한다',
             chk.badYear ? '거절 못 함' : 'compat_full:' + YEAR + ' → 없는 상품');
    }

    /* 설정 화면 이용권 카드 — 산 것이 '구매함'으로 보이는가 */
    await L.clickText(page, /^더보기/); await L.wait(700);
    await L.clickText(page, /^설정/);   await L.wait(1600);
    const panel = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#main .scroll-card')];
      const c = cards.find(function(x){ return (x.querySelector('h3')||{}).textContent === '이용권'; });
      return c ? c.innerText : '';
    });
    /* ★ 그냥 '구매함'이 어딘가 있는지만 보면 안 된다 — **사주 줄**이 구매함이어야 한다.
       예전에는 이 자리에 값(1,900원)이 적혀 있었다: 산 분에게 안 산 것처럼 보였다. */
    const sajuRow = (panel.split('\n').map(function(x){ return x.trim(); })
                     .filter(Boolean).join(' · ').match(/사주 풀이 전체 해석 · ([^·]+)/) || [])[1] || '';
    R.note(sajuRow.trim() === '구매함', '산 사주 풀이가 설정 화면에 「구매함」으로 보인다',
           sajuRow ? ('사주 줄 = ' + sajuRow.trim()) : '이용권 카드를 못 찾음');
    await page.close();
  }

  await browser.close();
  R.done();
})().catch((e) => { console.error('검사 자체가 터졌습니다:', e && e.message); process.exit(2); });
