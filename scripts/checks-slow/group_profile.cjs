/* =====================================================================
   저장한 그룹은 프로필별로 보인다 (느린 층)
   ---------------------------------------------------------------------
   2026-09-22 대표님 지시 "2가 맞는 거 같은데 그리고 어떤 프로필의 궁합인지 적어줘라"
   (영상: dh 프로필인데 정인 프로필로 본 '정인 × 테스트' 모임이 [저장한 그룹]에 그대로 남음).
   ① 프로필이 적힌 모임은 그 프로필일 때만 보인다 · 줄 맨 앞에 프로필 이름이 적힌다
   ② 프로필이 안 적힌 옛 모임은 명단을 받아 태어난 정보가 맞는 프로필에 붙는다(fillGroupProfiles)
   ③ 맞는 프로필이 없으면 '지금 없는 프로필'로 누구에게나 보인다(숨기면 닿는 길이 없다)
   ④ 다른 프로필의 모임을 열어 봐도 적힌 프로필이 바뀌지 않는다
   ⑤ 새로 만드는 모임은 지금 고른 프로필 것이 된다
   ★ /api/group 은 가로채 흉내 낸다 — 모임마다 명단이 다르다. */
const L = require('../_lib.cjs');
const R = L.reporter('저장한 그룹 프로필별');

(async function(){
  const pptr = L.puppeteer(), chrome = L.chromePath();
  if(!pptr || !chrome){ console.log('크롬을 못 찾았습니다 — 건너뜁니다'); process.exit(0); }
  const base = process.argv[2];
  const site = base ? {url:base, close:function(){}} : await L.serve(L.ROOT, 0);
  const browser = await pptr.launch({executablePath: chrome, headless:'new', args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const p1 = L.person({id:'p1', name:'첫째'}), p2 = L.person({id:'p2', name:'둘째', year:1992, month:7, day:3, mbti:'ISTJ'});
    const groups = [
      {id:'gA', name:'첫째의 옛 모임', at:Date.now()-1000, token:'t', n:2, rel:'friend'},          /* 명단에 p1 */
      {id:'gB', name:'둘째의 옛 모임', at:Date.now()-2000, token:'t', n:2, rel:'friend'},          /* 명단에 p2 */
      {id:'gC', name:'지운 프로필의 모임', at:Date.now()-3000, token:null, n:2, rel:'friend'},     /* 아무 프로필도 없음 */
      {id:'gD', name:'둘째의 새 모임', at:Date.now()-4000, token:'t', n:2, rel:'friend', profileId:'p2', pchk:1},
    ];
    let rosters = null;
    async function open(activeId, seed){
      const p = await L.openPage(browser, {hook:true, width:390, height:900,
        state: L.makeState({activeId:activeId, profiles:[p1,p2], savedGroups: seed})});
      await p.setRequestInterception(true);
      p.on('request', function(req){
        const u = req.url();
        if(u.indexOf('/api/group') >= 0){
          let body = {}; try{ body = JSON.parse(req.postData() || '{}'); }catch(e){}
          const r = rosters && rosters[body.groupId];
          /* 명단은 1.5초 뒤에 답한다 — 안 늦추면 첫 그리기보다 먼저 붙어 「확인 중」 상태를 볼 수 없다(실측). */
          if(body.action === 'get' && r) return setTimeout(function(){ req.respond({status:200, contentType:'application/json', body: JSON.stringify({name: seed.filter(g=>g.id===body.groupId)[0].name, members:r, ttlDays:365})}); }, 1500);
          return req.respond({status:404, contentType:'application/json', body:'{"error":"not_found"}'});
        }
        req.continue();
      });
      await p.goto(site.url + '/fortune.html', {waitUntil:'domcontentloaded'}); await L.wait(800);
      if(!rosters){
        rosters = await p.evaluate(function(){
          const T = window.__INYEON_TEST__; const ps = T.profiles();
          const a = ps[0], b = ps[1];
          const other = Object.assign({}, a, {name:'상대', mbti:'ENTP', day: a.day + 1});
          const stranger = Object.assign({}, a, {name:'낯선이', year: a.year - 5, day: a.day + 2});
          return { gA: T.gcMeetRow(a)+';'+T.gcMeetRow(other), gB: T.gcMeetRow(b)+';'+T.gcMeetRow(other),
                   gC: T.gcMeetRow(stranger)+';'+T.gcMeetRow(other), gD: T.gcMeetRow(b)+';'+T.gcMeetRow(other) };
        });
      }
      await L.clickText(p, /^궁합$/, {all:true}); await L.wait(400);
      await L.clickText(p, /여럿이서/, {all:true}); await L.wait(600);
      return p;
    }
    const labels = (p) => p.evaluate(function(){ return [...document.querySelectorAll('[data-gid] .sr-label')].map(function(x){ return x.getAttribute && x.closest('[data-gid]').getAttribute('data-gid') + '=' + x.textContent.trim(); }); });
    const stored = (p) => p.evaluate(function(){ return window.__INYEON_TEST__.savedGroups().map(function(g){ return g.id+':'+(g.profileId||'-')+':'+(g.pchk?1:0); }).join(' '); });

    /* 첫째 프로필로 연다 */
    let p = await open('p1', groups);
    let lb = await labels(p);
    R.note(lb.length === 3 && !lb.some(x => /^gD=/.test(x)), '① 프로필이 적힌 다른 프로필의 모임(gD)은 안 보인다', JSON.stringify(lb));
    R.note(lb.some(x => /^gA=어느 프로필인지 확인 중/.test(x)), '② 프로필이 안 적힌 모임은 처음엔 「확인 중」', JSON.stringify(lb));
    R.note(await p.evaluate(function(){ return document.body.innerText.indexOf('지금 고른 프로필(첫째)로 본 모임만') >= 0; }), '① 카드에 어느 프로필 기준인지 적혀 있다');
    await L.wait(2500);
    lb = await labels(p);
    R.note(lb.some(x => /^gA=첫째 · /.test(x)), '② 명단을 받아 첫째의 모임에 「첫째」가 붙는다', JSON.stringify(lb));
    R.note(lb.some(x => /^gB=둘째 · /.test(x)), '② 둘째의 옛 모임에는 「둘째」가 붙는다(다음 그리기에서 숨는다)', JSON.stringify(lb));
    R.note(lb.some(x => /^gC=지금 없는 프로필 · /.test(x)), '③ 아무 프로필도 안 맞으면 「지금 없는 프로필」', JSON.stringify(lb));
    let st = await stored(p);
    R.note(/gA:p1:1/.test(st) && /gB:p2:1/.test(st) && /gC:-:1/.test(st) && /gD:p2:1/.test(st), '② 저장분에 프로필이 적혔다', st);

    /* 다시 그리면 둘째 것이 숨는다 */
    await L.clickText(p, /^홈$/, {all:true}); await L.wait(300);
    await L.clickText(p, /^궁합$/, {all:true}); await L.wait(300);
    await L.clickText(p, /여럿이서/, {all:true}); await L.wait(500);
    lb = await labels(p);
    R.note(lb.length === 2 && lb.some(x => /^gA=/.test(x)) && lb.some(x => /^gC=/.test(x)), '① 다시 그리면 첫째의 모임과 「지금 없는 프로필」 모임만 보인다', JSON.stringify(lb));
    /* 2026-09-22 대표님 지적 "지금 고른 프로필 모임이 아닌 다른 모임이 보인다" — 안 맞는 모임은 접힌 줄 안에 */
    const fold = await p.evaluate(function(){ const d = document.querySelector('.group-orphan-fold'); const c = d ? d.querySelector('[data-gid="gC"]') : null;
      return { has: !!d, open: d ? d.open : null, inside: !!c, outsideA: !!document.querySelector('.group-orphan-fold [data-gid="gA"]'), sum: d ? d.querySelector('summary').textContent : '' }; });
    R.note(fold.has && fold.inside && !fold.open, '③ 「지금 없는 프로필」 모임은 접힌 줄 안에 있고 처음엔 접혀 있다', JSON.stringify(fold));
    R.note(!fold.outsideA && /1개/.test(fold.sum), '③ 첫째의 모임은 접힌 줄 밖 · 접힌 줄 제목에 개수', fold.sum);

    /* ④ 첫째 프로필로 둘째의 모임(gB)을 열어 봐도 적힌 프로필은 그대로 */
    await p.evaluate(function(){ window.__INYEON_TEST__.openSavedGroup('gB'); }); await L.wait(1200);
    st = await stored(p);
    R.note(/gB:p2:1/.test(st), '④ 다른 프로필의 모임을 열어 봐도 적힌 프로필이 안 바뀐다', st);
    /* ⑤ 새 모임은 지금 프로필 것 */
    await p.evaluate(function(){ window.__INYEON_TEST__.rememberGroup('gNEW', '새 모임', 'tok', 1, 'friend'); });
    st = await stored(p);
    R.note(/gNEW:p1:1/.test(st), '⑤ 새로 만든 모임은 지금 고른 프로필(첫째) 것', st);
    R.note(p.__errs.length === 0, 'JS 오류 없음 (첫째)', p.__errs.join(' | '));
    await p.close();

    /* 둘째 프로필로 열면 둘째 것만 */
    const seed2 = groups.map(g => Object.assign({}, g, g.id==='gA' ? {profileId:'p1', pchk:1} : g.id==='gB' ? {profileId:'p2', pchk:1} : g.id==='gC' ? {profileId:null, pchk:1} : {}));
    p = await open('p2', seed2);
    lb = await labels(p);
    R.note(lb.length === 3 && !lb.some(x => /^gA=/.test(x)) && lb.some(x => /^gB=둘째 · /.test(x)) && lb.some(x => /^gD=둘째 · /.test(x)) && lb.some(x => /^gC=지금 없는 프로필/.test(x)),
      '① 둘째 프로필로 열면 둘째의 모임 둘과 「지금 없는 프로필」 모임만', JSON.stringify(lb));
    R.note(await p.evaluate(function(){ return document.body.innerText.indexOf('지금 고른 프로필(둘째)로 본 모임만') >= 0; }), '① 카드 안내가 둘째 기준으로 바뀐다');
    /* 폭 390 넘침 */
    const ov = await p.evaluate(function(){ return [...document.querySelectorAll('[data-gid]')].filter(function(r){ return r.scrollWidth > r.clientWidth + 1; }).length; });
    R.note(ov === 0, '줄 글자 넘침 없음 (폭 390)', ov + '개');
    R.note(p.__errs.length === 0, 'JS 오류 없음 (둘째)', p.__errs.join(' | '));
  }catch(e){ R.bad('검사 자체가 터짐', String(e && e.stack || e).slice(0, 400)); }
  await browser.close(); site.close(); R.done();
})();
