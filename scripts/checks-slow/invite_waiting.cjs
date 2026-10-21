#!/usr/bin/env node
/* =====================================================================
   저장된 모임 — 아무도 안 들어온 링크 줄에 '기다리는 중' 칩 (느린 층)
   ---------------------------------------------------------------------
   2026-10-21 대표님 "3)으로 해라" — 맨 위 지켜보기 카드는 최근 링크 하나뿐이라,
   그 전에 보낸 링크도 목록에서 기다리는 중인지 보이게 한다.
   ① 나 혼자인 모임 줄에 칩 ② 들어온 모임에는 칩 없음 ③ 저장된 수가 낡았어도
   명단을 받아 누가 들어왔으면 칩을 걷고 'N명' ④ '아직 나 혼자' 문구 안 겹침
===================================================================== */
const { chromePath, puppeteer, serve, reporter, openPage, wait, makeState, person, ROOT } = require('../_lib.cjs');
const R = reporter('저장된 모임 기다리는 중 칩');

(async function(){
  const pptr = puppeteer(), chrome = chromePath();
  if(!pptr || !chrome){ console.log('크롬을 못 찾았습니다 — 건너뜁니다'); process.exit(0); }
  const base = process.argv[2];
  const site = base ? {url:base, close:function(){}} : await serve(ROOT, 0);
  const browser = await pptr.launch({executablePath: chrome, headless:'new', args:['--no-sandbox','--disable-dev-shm-usage']});
  const errs = [];
  try{
    const me = person({});
    const now = Date.now();
    const g = function(id, name, n, ago){ return {id, name, at:now-ago, token:'t'+id, n, rel:'lover', pair:1, profileId:me.id, pchk:1}; };
    const st = makeState({ profiles:[me], activeId:me.id, pendingInviteGroup:'gNew',
      savedGroups:[g('gNew','새 링크',1,1e3), g('gOld','옛 링크',1,7200e3), g('gStale','들어온 링크',1,9000e3), g('gTwo','둘 다 있음',2,10000e3)] });
    const p = await openPage(browser, {hook:true, state:st});
    p.on('pageerror', e => errs.push(String(e)));
    let rows = null;
    await p.setRequestInterception(true);
    p.on('request', function(req){
      if(req.url().indexOf('/api/group') >= 0){
        let body = {}; try{ body = JSON.parse(req.postData() || '{}'); }catch(e){}
        if(body.action === 'get' && rows){
          const m = body.groupId === 'gStale' || body.groupId === 'gTwo' ? rows.me + ';' + rows.b : rows.me;
          return req.respond({status:200, contentType:'application/json', body: JSON.stringify({name:'x', members:m, ttlDays:365})});
        }
        return req.respond({status:200, contentType:'application/json', body:'{"ok":true,"name":"x","members":""}'});
      }
      req.continue();
    });
    await p.goto(site.url + '/fortune.html', {waitUntil:'domcontentloaded'}); await wait(1200);
    rows = await p.evaluate(function(){
      const T = window.__INYEON_TEST__, m = T.activeProfile();
      return { me: T.gcMeetRow(m), b: T.gcMeetRow(Object.assign({}, m, {name:'상대', mbti:'ENFP', day:(m.day===1?2:1)})) };
    });
    await p.evaluate(function(){ window.__INYEON_TEST__.goRoute('compat'); }); await wait(1500);
    const info = await p.evaluate(function(){
      const o = {};
      document.querySelectorAll('#main [data-gid]').forEach(function(r){
        o[r.getAttribute('data-gid')] = { chip: !!r.querySelector('.wait-chip'), label: (r.querySelector('.sr-label')||{}).textContent || '' };
      });
      return o;
    });
    R.note(info.gNew && info.gNew.chip, '① 최근 링크 줄에 칩', JSON.stringify(info.gNew));
    R.note(info.gOld && info.gOld.chip, '① 전에 보낸 링크 줄에도 칩', JSON.stringify(info.gOld));
    R.note(info.gTwo && !info.gTwo.chip && /2명/.test(info.gTwo.label), '② 들어온 모임에는 칩 없음', JSON.stringify(info.gTwo));
    R.note(info.gStale && !info.gStale.chip && /2명/.test(info.gStale.label), '③ 저장된 수가 낡았어도 명단을 받아 칩을 걷음', JSON.stringify(info.gStale));
    R.note(Object.keys(info).every(function(k){ return !/아직 나 혼자/.test(info[k].label); }), '④ 칩과 같은 말을 줄 글에 또 안 적음');
    for(const w of [320, 390]){
      await p.setViewport({width:w, height:800}); await wait(400);
      const ov = await p.evaluate(function(){
        const bad = [];
        document.querySelectorAll('#main [data-gid]').forEach(function(r){ if(r.scrollWidth > r.clientWidth + 1) bad.push(r.getAttribute('data-gid')); });
        return {bad, doc: document.documentElement.scrollWidth > document.documentElement.clientWidth};
      });
      R.note(!ov.bad.length && !ov.doc, '폭 '+w+' 줄 넘침 없음', JSON.stringify(ov));
    }
    R.note(errs.length === 0, 'JS 오류 0건', errs.slice(0,2).join(' / ') || '없음');
    await p.close();
  } finally { await browser.close(); site.close(); }
  R.done();
})();
