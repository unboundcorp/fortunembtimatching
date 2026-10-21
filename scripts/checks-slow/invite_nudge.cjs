#!/usr/bin/env node
/* =====================================================================
   궁합 링크 권유 카드 (buildInviteNudge · 느린 층)
   ---------------------------------------------------------------------
   2026-10-22 대표님 "그래 만들어 봐" → 시안 2 + 손질 셋. 내 사주 · 내 성격유형 화면 맨 아래.
   ① 카드가 두 화면에 다 있고 예전 '궁합 보러 가기' 카드는 없음
   ② 제목의 기운이 계산(elemReadFacts)과 같음 — 없는 기운이면 '하나도 없어요', 아니면 'N개뿐'
   ③ 여럿이서면 연인이 빠지고, 연인을 고른 채 바꾸면 친구로
   ④ [궁합 링크 보내기] 한 번에 초대 창 · 링크에 고른 사이와 둘이서 표식이 실림
   ⑤ 대표님이 뺀 것(무료 딱지 · 링크 복사 줄 · 맨 아래 안내)이 없음 · 320/390 넘침 0 · JS 오류 0
===================================================================== */
const { chromePath, puppeteer, serve, reporter, openPage, wait, makeState, person, ROOT } = require('../_lib.cjs');
const R = reporter('궁합 링크 권유 카드');

(async function(){
  const pptr = puppeteer(), chrome = chromePath();
  if(!pptr || !chrome){ console.log('크롬을 못 찾았습니다 — 건너뜁니다'); process.exit(0); }
  const base = process.argv[2];
  const site = base ? {url:base, close:function(){}} : await serve(ROOT, 0);
  const browser = await pptr.launch({executablePath: chrome, headless:'new', args:['--no-sandbox','--disable-dev-shm-usage']});
  const errs = [];
  try{
    const me = person({});
    const p = await openPage(browser, {hook:true, state: makeState({profiles:[me], activeId:me.id})});
    p.on('pageerror', e => errs.push(String(e)));
    let created = 0;
    await p.setRequestInterception(true);
    p.on('request', function(req){
      if(req.url().indexOf('/api/group') >= 0){
        let body = {}; try{ body = JSON.parse(req.postData() || '{}'); }catch(e){}
        if(body.action === 'create'){ created++; return req.respond({status:200, contentType:'application/json', body: JSON.stringify({groupId:'gN'+created, ownerToken:'tok'})}); }
        return req.respond({status:200, contentType:'application/json', body:'{"ok":true}'});
      }
      req.continue();
    });
    await p.goto(site.url + '/fortune.html', {waitUntil:'domcontentloaded'}); await wait(1200);

    const look = () => p.evaluate(function(){
      var c = document.querySelector('#main .inv-nudge');
      if(!c) return null;
      return { title: c.querySelector('.inv-title').textContent, text: c.innerText,
        seg: [].map.call(c.querySelectorAll('.inv-seg button'), b => b.textContent + (b.getAttribute('aria-pressed')==='true'?'*':'')),
        rel: [].map.call(c.querySelectorAll('.inv-rel button'), b => b.textContent + (b.getAttribute('aria-pressed')==='true'?'*':'')),
        old: !!document.querySelector('#main .cross-sell') && /궁합 보러 가기/.test(document.querySelector('#main').innerText) };
    });
    const click = (sel, txt) => p.evaluate(function(sel, txt){
      var b = [].filter.call(document.querySelectorAll(sel), x => x.textContent.trim() === txt)[0];
      if(!b) return false; b.scrollIntoView({block:'center', behavior:'instant'}); b.click(); return true;
    }, sel, txt);

    for(const route of ['saju','report']){
      await p.evaluate(function(r){ window.__INYEON_TEST__.goRoute(r); }, route); await wait(1200);
      const c = await look();
      R.note(!!c && !c.old, '① ' + route + ' 화면에 새 카드 · 옛 카드 없음', c ? c.title : '없음');
    }
    await p.evaluate(function(){ window.__INYEON_TEST__.goRoute('saju'); }); await wait(1200);
    const facts = await p.evaluate(function(){
      var T = window.__INYEON_TEST__, pr = T.activeProfile(), f = T.elemReadFacts(T.getSajuResult(pr));
      var list = f.missing.length ? f.missing : [f.lack];
      return {names: list.map(i => T.ELEM_PROFILE[i].name).join('·'), zero: f.missing.length > 0, n: f.lackCount};
    });
    const c1 = await look();
    R.note(c1.title.indexOf(facts.names + ' 기운') >= 0 && (facts.zero ? /하나도 없어요/.test(c1.title) : c1.title.indexOf(facts.n + '개뿐') >= 0),
      '② 제목이 계산과 같음', c1.title + ' / ' + JSON.stringify(facts));
    R.note(c1.seg.join(',') === '둘이서*,여럿이서' && c1.rel.join(',') === '친구*,연인,직장 동료,가족', '③ 처음엔 둘이서 · 친구 · 연인 포함', c1.seg + ' | ' + c1.rel);
    await click('#main .inv-rel button', '연인'); await wait(200);
    await click('#main .inv-seg button', '여럿이서'); await wait(200);
    const c2 = await look();
    R.note(c2.rel.join(',') === '친구*,직장 동료,가족', '③ 여럿이서면 연인 빠지고 친구로', c2.rel.join(','));
    R.note(/최대 \d+명/.test(c2.text), '③ 여럿이서 그림 글', '');
    await click('#main .inv-seg button', '둘이서'); await wait(200);
    await click('#main .inv-rel button', '연인'); await wait(200);
    await click('#main .inv-nudge .inv-send', '궁합 링크 보내기'); await wait(1500);
    const m = await p.evaluate(function(){ var i = document.querySelector('#inviteLinkInput'); return {modal: !!document.querySelector('.modal-box'), link: i ? i.value : ''}; });
    R.note(m.modal && created === 1, '④ 한 번 눌러 초대 창 · 모임 하나 만듦', 'created=' + created);
    R.note(/\/j\/gN1#/.test(m.link) && /rel=lover/.test(m.link) && /k=pair/.test(m.link), '④ 링크에 연인 · 둘이서', m.link);
    await p.keyboard.press('Escape'); await wait(400);
    await p.evaluate(function(){ document.querySelectorAll('.modal-box button').forEach(function(b){ if(/닫기/.test(b.textContent)) b.click(); }); }); await wait(300);

    const c3 = await look();
    R.note(!/친구도 무료|링크 복사|받은 분이|두 분 다 무료/.test(c3.text), '⑤ 대표님이 뺀 것 없음', '');
    for(const w of [320, 390]){
      await p.setViewport({width:w, height:800}); await wait(400);
      const ow = await p.evaluate(function(){
        var c = document.querySelector('#main .inv-nudge'), bad = [];
        c.querySelectorAll('*').forEach(function(e){ if(e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible') bad.push(e.className); });
        if(c.scrollWidth > c.clientWidth + 1) bad.push('card');
        if(document.documentElement.scrollWidth > window.innerWidth) bad.push('doc');
        return bad;
      });
      R.note(ow.length === 0, '⑤ 폭 ' + w + ' 넘침 0', ow.join(','));
    }
    R.note(errs.length === 0, '⑤ JS 오류 0건', errs.join(' | ').slice(0, 300));
  }catch(e){ R.note(false, '검사 도중 오류', String(e && e.stack || e).slice(0, 400)); }
  await browser.close(); site.close();
  R.done();
})();
