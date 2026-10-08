#!/usr/bin/env node
/* =====================================================================
   초대 지켜보기 카드 — [지금 확인] 알림 · 둘이서 링크는 두 분이 들어오면 치움 (느린 층)
   ---------------------------------------------------------------------
   2026-10-08 대표님 답 "1) ㅇㅋ 2) ㅇㅋ"
   ① [지금 확인] — 아무도 안 들어왔으면 '아직 아무도 안 들어왔어요.' 알림
   ② 둘이서 링크에 상대가 들어오면 → 알림 '두 분이 다 들어왔어요…' · 카드 사라짐 · pendingInviteGroup 비움
   ③ 여럿이서 링크는 둘이 돼도 카드가 남고 '2명이 들어왔어요.' 알림
   ④ 모임 화면(한 분뿐)의 [지금 확인]도 알림이 뜬다(예전엔 아무 일도 없었음)
===================================================================== */
const { chromePath, puppeteer, serve, reporter, openPage, wait, makeState, person, ROOT } = require('../_lib.cjs');
const R = reporter('초대 지켜보기 카드');

(async function(){
  const pptr = puppeteer(), chrome = chromePath();
  if(!pptr || !chrome){ console.log('크롬을 못 찾았습니다 — 건너뜁니다'); process.exit(0); }
  const base = process.argv[2];
  const site = base ? {url:base, close:function(){}} : await serve(ROOT, 0);
  const browser = await pptr.launch({executablePath: chrome, headless:'new', args:['--no-sandbox','--disable-dev-shm-usage']});
  const errs = [];
  async function run(pair){
    let roster = '';
    const me = person({});
    const st = makeState({ profiles:[me], activeId:me.id, pendingInviteGroup:'g1',
      savedGroups:[{id:'g1', name:'검사님의 궁합', at:Date.now()-3600e3, token:'tok', n:1, rel:pair?'lover':'friend', pair:pair?1:0, profileId:me.id, pchk:1}] });
    const p = await openPage(browser, {hook:true, state:st});
    p.on('pageerror', e => errs.push(String(e)));
    await p.setRequestInterception(true);
    p.on('request', function(req){
      if(req.url().indexOf('/api/group') >= 0){
        let body = {}; try{ body = JSON.parse(req.postData() || '{}'); }catch(e){}
        if(body.action === 'get') return req.respond({status:200, contentType:'application/json',
          body: JSON.stringify({name:'검사님의 궁합', members:roster, ttlDays:365})});
        return req.respond({status:200, contentType:'application/json', body:'{"ok":true}'});
      }
      req.continue();
    });
    await p.goto(site.url + '/fortune.html', {waitUntil:'domcontentloaded'}); await wait(1200);
    const rows = await p.evaluate(function(){
      const T = window.__INYEON_TEST__, m = T.activeProfile();
      return { me: T.gcMeetRow(m), b: T.gcMeetRow(Object.assign({}, m, {name:'상대', mbti:'ENFP', day:(m.day===1?2:1)})) };
    });
    roster = rows.me;
    await p.evaluate(function(){ window.__INYEON_TEST__.goRoute('compat'); }); await wait(900);
    return {p, rows, setRoster: function(r){ roster = r; }};
  }
  async function press(p){
    await p.evaluate(function(){ var b = Array.from(document.querySelectorAll('#main .watch-card button')).filter(function(x){ return /지금 확인/.test(x.textContent); })[0]; if(b) b.click(); });
    await wait(900);
    return p.evaluate(function(){ var t = document.querySelector('#toast'); return {toast: t ? t.textContent : '', card: !!document.querySelector('#main .watch-card'),
      pending: window.__INYEON_TEST__.state ? null : null}; });
  }
  try{
    /* ① ② 둘이서 */
    const a = await run(true);
    const c0 = await a.p.evaluate(function(){ return !!document.querySelector('#main .watch-card'); });
    R.note(c0, '둘이서 링크를 보낸 뒤 카드가 있다');
    const r1 = await press(a.p);
    R.note(r1.toast === '아직 아무도 안 들어왔어요.' && r1.card, '① [지금 확인] — 아무도 없으면 알림', JSON.stringify(r1));
    a.setRoster(a.rows.me + ';' + a.rows.b);
    const r2 = await press(a.p);
    const pend = await a.p.evaluate(function(){ try{ return JSON.parse(localStorage.getItem('inyeonjeom.v2')).pendingInviteGroup; }catch(e){ return 'err'; } });
    R.note(/두 분이 다 들어왔어요/.test(r2.toast), '② 상대가 들어오면 알림', r2.toast);
    R.note(!r2.card, '② 카드가 사라진다', JSON.stringify(r2));
    R.note(pend === null || pend === undefined, '② 기다리는 링크 표식이 비워진다', String(pend));
    await a.p.close();

    /* ③ 여럿이서 */
    const b = await run(false);
    b.setRoster(b.rows.me + ';' + b.rows.b);
    const r3 = await press(b.p);
    const c3 = await b.p.evaluate(function(){ return !!document.querySelector('#main .watch-card'); });
    R.note(r3.toast === '2명이 들어왔어요.' && c3, '③ 여럿이서는 둘이 돼도 카드가 남고 알림', JSON.stringify({toast:r3.toast, card:c3}));

    /* ④ 모임 화면(한 분뿐)의 [지금 확인] */
    b.setRoster(b.rows.me);
    await b.p.evaluate(function(){ window.__INYEON_TEST__.openSavedGroup('g1'); }); await wait(1500);
    await b.p.evaluate(function(){ var x = Array.from(document.querySelectorAll('#main button')).filter(function(e){ return /지금 확인/.test(e.textContent); })[0]; if(x) x.click(); });
    await wait(900);
    const r4 = await b.p.evaluate(function(){ var t = document.querySelector('#toast'); return t ? t.textContent : ''; });
    R.note(r4 === '아직 아무도 안 들어왔어요.', '④ 모임 화면의 [지금 확인]도 알림', r4);
    await b.p.close();
    R.note(errs.length === 0, 'JS 오류 0건', errs.slice(0,2).join(' / ') || '없음');
  } finally { await browser.close(); site.close(); }
  R.done();
})();
