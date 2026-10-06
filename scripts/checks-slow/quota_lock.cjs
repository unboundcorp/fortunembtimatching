/* =====================================================================
   횟수를 다 쓴 풀이는 '쓰는 척' 없이 바로 잠긴다 · 모임 쌍 풀이는 맨 위에서 시작 (느린 층)
   ---------------------------------------------------------------------
   2026-10-06 대표님 영상 — 이용권은 있는데 그 상품으로 만들 수 있는 편수를 다 쓴 상태에서 풀이를 열자
   '풀이를 쓰는 중이에요' 창이 뜨고 진행 막대가 돌다가 '쓰다가 끊겼어요' → 결제창.
   "보여줄듯 하다가 막히는 거도 오류다 · 바로 막혀야" · "스크롤이 최 하단으로 가있는 거도 오류야"
   ① 서버가 429(quota_exceeded)면 기다림 창이 한 번도 안 뜬다
   ② 잠금 상자와 [한 편 더 열기] 단추가 선다 · '본문을 불러오지 못했어요' 줄이 없다
   ③ 402(no_access)도 같다
   ④ 정상 응답(200)이면 풀이가 그대로 채워진다(잠금이 아님)
   ⑤ 모임 쌍 상세에서 [궁합 풀이 읽어보기]를 누르면 맨 위에서 시작한다 */
const L = require('../_lib.cjs');
const wait = L.wait;

(async () => {
  const R = L.reporter('횟수 다 쓴 풀이 잠금');
  const srv = await L.serve(L.ROOT, 0);
  const browser = await L.puppeteer().launch({executablePath: L.chromePath(), headless:'new', args:['--no-sandbox']});
  const errs = [];
  async function openWith(mode){
    const p = await L.openPage(browser, {hook:true, width:390, height:900, state: L.makeState()});
    p.on('pageerror', e => errs.push(String(e)));
    let interpretCalls = 0, contentCalls = 0;
    await p.setRequestInterception(true);
    p.on('request', function(req){
      const u = req.url();
      if(u.indexOf('/api/entitlements') >= 0){
        return req.respond({status:200, contentType:'application/json',
          body: JSON.stringify({items:{mbti_full:{purchasedAt:Date.now()}}, pass:null, purchases:[], testAccess:false, adminAccess:false, testPayment:false})});
      }
      if(u.indexOf('/api/interpret') >= 0 || u.indexOf('/api/content') >= 0){
        if(u.indexOf('/api/interpret') >= 0) interpretCalls++; else contentCalls++;
        if(mode === 'ok'){
          let body = '';
          if(u.indexOf('/api/interpret') >= 0){
            const titles = JSON.parse(req.postData()||'{}').payload.requested.sectionTitles;
            const txt = titles.map(function(t){ return '##' + t + '\n이 장의 본문이에요. 시험 글입니다.'; }).join('\n');
            body = 'data: ' + JSON.stringify({type:'delta', text: txt}) + '\n\n' + 'data: ' + JSON.stringify({type:'done'}) + '\n\n';
            return setTimeout(function(){ req.respond({status:200, contentType:'text/event-stream', body: body}); }, 300);
          }
          return req.respond({status:500, contentType:'application/json', body:'{}'});
        }
        const st = mode === 'quota' ? 429 : 402;
        const er = mode === 'quota' ? {error:'quota_exceeded', reason:'새 해석을 만들 수 있는 횟수(2회)를 다 쓰셨어요.'} : {error:'no_access', reason:'이 해석은 결제하신 뒤에 보실 수 있어요.'};
        /* 2.5초 늦게 답한다 — 기다림 창 시계(2초)보다 늦어야 '쓰는 척'이 재현된다 */
        return setTimeout(function(){ req.respond({status:st, contentType:'application/json', body: JSON.stringify(er)}); }, 2500);
      }
      req.continue();
    });
    await p.goto(srv.url + '/fortune.html', {waitUntil:'networkidle0'}); await wait(1000);
    await p.evaluate(function(){ window.__INYEON_TEST__.goRoute('mbtiReport'); });
    const seen = [];
    for(let i=0;i<30;i++){
      seen.push(await p.evaluate(function(){ var h=document.querySelector('#activeModal .modal-box h3'); return h ? h.textContent : ''; }));
      await wait(150);
    }
    const txt = await p.evaluate(function(){ return document.querySelector('#main').innerText; });
    return {p, seen, txt, calls:{interpretCalls, contentCalls}};
  }
  try{
    for(const mode of ['quota','noacc']){
      const r = await openWith(mode);
      const tag = mode === 'quota' ? '429 횟수 다 씀' : '402 권한 없음';
      R.note(!r.seen.some(x => /쓰는 중|쓰지 못했|열지 못했/.test(x)), tag + ' — 기다림 창이 한 번도 안 뜬다', JSON.stringify([...new Set(r.seen)]));
      R.note(/더 열기|결제하면 바로 만들어져요/.test(r.txt) && /잠긴 이야기/.test(r.txt), tag + ' — 잠금 상자가 선다', r.txt.slice(0,60));
      R.note(!/본문을 불러오지 못했어요/.test(r.txt), tag + " — '본문을 불러오지 못했어요' 줄이 없다");
      R.note(r.calls.contentCalls === 0, tag + ' — 같은 거절을 다른 창구로 또 묻지 않는다', JSON.stringify(r.calls));
      if(mode === 'quota') R.note(/횟수를 다 썼어요/.test(r.txt), tag + ' — 왜 잠겼는지 적는다');
      await r.p.close();
    }
    const ok = await openWith('ok');
    R.note(!/잠긴 이야기/.test(ok.txt) && /이 장의 본문이에요/.test(ok.txt), '정상 응답 — 풀이가 채워지고 잠기지 않는다', ok.txt.slice(0,60));
    await ok.p.close();

    /* ⑤ 모임 쌍 풀이 스크롤 */
    const p = await L.openPage(browser, {hook:true, width:390, height:800,
      state: L.makeState({savedGroups:[{id:'gS', name:'시험 모임', at:Date.now(), token:'t', n:3, rel:'friend', profileId:'p1', pchk:1}]})});
    p.on('pageerror', e => errs.push(String(e)));
    let roster = null;
    await p.setRequestInterception(true);
    p.on('request', function(req){
      if(req.url().indexOf('/api/entitlements') >= 0){
        return req.respond({status:200, contentType:'application/json',
          body: JSON.stringify({items:{compat_full:{purchasedAt:Date.now()}}, pass:null, purchases:[], testAccess:false, adminAccess:false, testPayment:false})});
      }
      if(req.url().indexOf('/api/interpret') >= 0 || req.url().indexOf('/api/content') >= 0){
        return req.respond({status:429, contentType:'application/json', body: JSON.stringify({error:'quota_exceeded', reason:'횟수를 다 썼어요'})});
      }
      if(req.url().indexOf('/api/group') >= 0){
        if(roster) return req.respond({status:200, contentType:'application/json', body: JSON.stringify({name:'시험 모임', members:roster, ttlDays:365})});
        return req.respond({status:404, contentType:'application/json', body:'{}'});
      }
      req.continue();
    });
    await p.goto(srv.url + '/fortune.html', {waitUntil:'domcontentloaded'}); await wait(1200);
    roster = await p.evaluate(function(){
      var T = window.__INYEON_TEST__, a = T.profiles()[0];
      return T.gcMeetRow(a) + ';' + T.gcMeetRow(Object.assign({}, a, {name:'둘', mbti:'ISTJ', day:a.day+1})) + ';' + T.gcMeetRow(Object.assign({}, a, {name:'셋', mbti:'ESFP', year:a.year+3}));
    });
    await p.evaluate(function(){ window.__INYEON_TEST__.openSavedGroup('gS'); }); await wait(1500);
    const clicked = await p.evaluate(function(){
      var b = [...document.querySelectorAll('#main button')].find(function(x){ return /자세히|궁합 보기/.test(x.textContent) && x.closest('.gc-pair, .gc-rank, li, .scroll-card'); });
      return !!b;
    });
    await p.evaluate(function(){ var T=window.__INYEON_TEST__; if(T.openPairDeep) T.openPairDeep(0,1); });
    const pd = await p.evaluate(function(){ return window.__INYEON_TEST__.route(); });
    if(pd !== 'pairDeep'){
      /* 통로가 없으면 첫 쌍 줄을 누른다 */
      await L.clickText(p, /둘|셋/, {all:false}); await wait(800);
    }
    const route = await p.evaluate(function(){ return window.__INYEON_TEST__.route(); });
    R.note(route === 'pairDeep', '모임 쌍 상세가 열린다', route + ' / 후보 단추 ' + clicked);
    if(route === 'pairDeep'){
      await p.evaluate(function(){ window.scrollTo(0, document.body.scrollHeight); }); await wait(300);
      const before = await p.evaluate(function(){ return Math.round(window.scrollY); });
      await L.clickText(p, /궁합 풀이 읽어보기/); await wait(900);
      const after = await p.evaluate(function(){ return Math.round(window.scrollY); });
      const inStory = await p.evaluate(function(){ return /모임 궁합|심층 궁합 분석으로 돌아가기/.test(document.querySelector('#main').innerText) && !!document.querySelector('#main .toc-nav'); });
      R.note(inStory, '풀이 화면(목차)이 열렸다');
      R.note(before > 300 && after < 40, '[궁합 풀이 읽어보기] 뒤 맨 위에서 시작한다', before + 'px → ' + after + 'px');
    }
    await p.close();
    R.note(errs.length === 0, 'JS 오류 0건', errs.slice(0,2).join(' / ') || '없음');
  } finally {
    await browser.close(); srv.close();
  }
  R.done();
})();
