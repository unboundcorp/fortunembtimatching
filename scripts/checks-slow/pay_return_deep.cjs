/* =====================================================================
   결제하고 돌아오면 결제한 풀이 화면이 바로 열린다 (느린 층)
   ---------------------------------------------------------------------
   2026-10-06 대표님 첫 실결제 제보 "심층분석 보기가 열리긴 했는데 다시 궁합화면으로 들어왔더라 —
   결제하면 바로 심층보기로 들어가지게" · "다른 결제도 결제하고 난 이후의 화면이 열리게".
   ① 모임 쌍 상세에서 궁합 결제 → 그 쌍의 긴 풀이(PAIR_DEEP.story)
   ② 1:1 결과에서 궁합 결제 → 긴 풀이(COMPAT_SUB='story')
   ③ 내 사주에서 사주 결제 → report13   ④ 성격유형에서 이용권 결제 → mbtiReport
   ⑤ 취소로 돌아오면 긴 풀이로 보내지 않는다(결제 안 한 분)
   ★ /api/verify · /api/entitlements · /api/group 은 가로채 흉내 냅니다. 돈은 안 나갑니다. */
const { chromePath, puppeteer, serve, reporter, openPage, wait, clickText, ROOT, makeState } = require('../_lib.cjs');
const GID = 'paydeepgroup1', PGID = 'paydeeppair1';
const R = reporter('결제 후 풀이 화면');
const Y = new Date(Date.now() + 9*3600*1000).getUTCFullYear();

(async function(){
  const pptr = puppeteer(), chrome = chromePath();
  if(!pptr || !chrome){ console.log('크롬을 못 찾았습니다 — 건너뜁니다'); process.exit(0); }
  const base = process.argv[2];
  const site = base ? {url:base, close:function(){}} : await serve(ROOT, 0);
  const browser = await pptr.launch({executablePath: chrome, headless:'new', args:['--no-sandbox','--disable-dev-shm-usage']});
  const errs = [];
  try{
    let roster = '';
    const p = await openPage(browser, {hook:true, state: makeState({savedGroups:[{id:PGID, name:'둘이서', at:Date.now(), token:'t', n:2, rel:'lover', pair:1}]})});
    p.on('pageerror', e => errs.push(String(e)));
    await p.setRequestInterception(true);
    p.on('request', function(req){
      const u = req.url();
      if(u.indexOf('/api/group') >= 0){
        let body = {}; try{ body = JSON.parse(req.postData() || '{}'); }catch(e){}
        if(body.action === 'get') return req.respond({status:200, contentType:'application/json', body: JSON.stringify({name:'검사 모임', members:roster, ttlDays:365})});
        return req.respond({status:400, contentType:'application/json', body:'{}'});
      }
      if(u.indexOf('/api/verify') >= 0) return req.respond({status:200, contentType:'application/json', body:'{"verified":true}'});
      if(u.indexOf('/api/entitlements') >= 0){
        const items = {compat_full:{purchasedAt: Date.now()}}; items['saju_full:' + Y] = {purchasedAt: Date.now()}; items['saju_full:' + (Y+1)] = {purchasedAt: Date.now()}; items.mbti_full = {purchasedAt: Date.now()};
        return req.respond({status:200, contentType:'application/json', body: JSON.stringify({items:items,
          pass:{expiresAt: Date.now() + 30*86400000, purchasedAt: Date.now()}, purchases:[]})});
      }
      if(u.indexOf('/api/interpret') >= 0 || u.indexOf('/api/content') >= 0)
        return req.respond({status:503, contentType:'application/json', body:'{"error":"test"}'});
      req.continue();
    });
    await p.goto(site.url + '/fortune.html', {waitUntil:'domcontentloaded'}); await wait(900);
    roster = await p.evaluate(function(){
      const T = window.__INYEON_TEST__; const me = T.activeProfile();
      const other = Object.assign({}, me, {name:'상대', mbti: me.mbti === 'ENFP' ? 'ISTJ' : 'ENFP', day: me.day === 15 ? 16 : 15});
      return T.gcMeetRow(me) + ';' + T.gcMeetRow(other);
    });
    const st = () => p.evaluate(function(){ const T = window.__INYEON_TEST__; return { route: T.route(), pd: T.pairDeep(), sub: T.compatSub(), url: location.search, y: window.scrollY }; });
    const back = async (q) => { await p.goto(site.url + '/fortune.html?' + q, {waitUntil:'domcontentloaded'}); await wait(2600); return st(); };

    /* ① 모임 쌍 상세 → 결제 성공 복귀 */
    await p.evaluate(function(g){ window.__INYEON_TEST__.openSavedGroup(g); }, GID); await wait(1500);
    if(await p.evaluate(function(){ return document.body.innerText.indexOf('이 모임은 어떤 사이인가요') >= 0; })){ await clickText(p, /^친구$/); await wait(900); }
    await clickText(p, /심층 분석 보기/); await wait(700);
    let s = await st();
    R.note(s.route === 'pairDeep' && s.pd && !s.pd.story, '① 쌍 상세(요약)에 섰다', JSON.stringify(s.pd));
    await p.evaluate(function(){ window.__INYEON_TEST__.notePayPosition('compat_full'); });
    s = await back('receipt=R1&product=compat_full');
    R.note(s.route === 'pairDeep' && s.pd && s.pd.story === true, '① 결제하고 돌아오면 그 쌍의 긴 풀이가 바로 열린다', 'route=' + s.route + ' pd=' + JSON.stringify(s.pd));
    R.note(s.y < 40, '① 맨 위에서 시작한다', 'scrollY=' + s.y);

    /* ⑤ 같은 자리에서 취소로 돌아오면 긴 풀이로 보내지 않는다 */
    await p.evaluate(function(){ var T = window.__INYEON_TEST__; var pd = T.pairDeep(); if(pd) pd.story = false; T.goRoute('pairDeep'); }); await wait(600);
    await p.evaluate(function(){ window.__INYEON_TEST__.notePayPosition('compat_full'); });
    s = await back('pay=cancel');
    R.note(s.route === 'pairDeep' && s.pd && !s.pd.story, '⑤ 취소로 돌아오면 쌍 상세(요약)에 그대로', JSON.stringify(s.pd));

    /* ② 1:1 결과 → 결제 성공 복귀 */
    await p.evaluate(function(){ var T = window.__INYEON_TEST__; T.goRoute('compat'); }); await wait(300);
    await p.evaluate(function(g){ window.__INYEON_TEST__.openSavedGroup(g); }, PGID); await wait(1800);
    const pairOpened = 'pair';
    s = await st();
    if(pairOpened === 'pair' && s.route === 'compat' && !s.sub){
      await p.evaluate(function(){ window.__INYEON_TEST__.notePayPosition('compat_full'); });
      s = await back('receipt=R2&product=compat_full');
      R.note(s.route === 'compat' && s.sub === 'story', '② 1:1 결과에서 결제하면 긴 풀이가 바로 열린다', 'route=' + s.route + ' sub=' + s.sub);
    } else {
      R.note(false, '② 1:1 결과 화면을 못 열었다(검사 준비 실패)', 'opened=' + pairOpened + ' route=' + s.route + ' sub=' + s.sub);
    }

    /* ③ 내 사주 → 사주 결제 */
    await p.evaluate(function(){ window.__INYEON_TEST__.goRoute('saju'); }); await wait(700);
    await p.evaluate(function(y){ window.__INYEON_TEST__.notePayPosition('saju_full:' + y); }, Y);
    s = await back('receipt=R3&product=saju_full%3A' + Y);
    R.note(s.route === 'report13', '③ 사주 결제 → 사주 풀이 화면(report13)', s.route);

    /* ③-2 2026-10-18 대표님 제보 "2027년 결제했는데 2026년으로 간다" — 내년 사주를 보다 결제하면 내년 풀이 */
    await p.evaluate(function(y){ var T = window.__INYEON_TEST__; T.goRoute('report13'); T.setViewYear(y); }, Y+1); await wait(700);
    await p.evaluate(function(y){ window.__INYEON_TEST__.notePayPosition('saju_full:' + y); }, Y+1);
    s = await back('receipt=R5&product=saju_full%3A' + (Y+1));
    let vy = await p.evaluate(function(){ return window.__INYEON_TEST__.viewYear(); });
    R.note(s.route === 'report13' && vy === Y+1, '③-2 내년 사주 결제 → 내년(' + (Y+1) + ') 풀이에 머문다', 'route=' + s.route + ' year=' + vy);
    /* 쪽지 없이(다른 탭에서 돌아옴) 와도 결제한 해를 연다 */
    await p.evaluate(function(y){ window.__INYEON_TEST__.setViewYear(y); }, Y);
    s = await back('receipt=R6&product=saju_full%3A' + (Y+1));
    vy = await p.evaluate(function(){ return window.__INYEON_TEST__.viewYear(); });
    R.note(vy === Y+1, '③-3 쪽지가 없어도 결제한 해를 연다', 'year=' + vy);
    /* 카카오 로그인 왕복(결제 전)에도 보던 해가 남는다 — 같은 쪽지 모양(snapshotCompatState)을 쓴다 */
    await p.evaluate(function(y){ var T = window.__INYEON_TEST__; T.goRoute('saju'); T.setViewYear(y); }, Y+1); await wait(500);
    await p.evaluate(function(){ window.__INYEON_TEST__.notePayPosition('saju_full:9999'); });
    s = await back('pay=cancel');
    vy = await p.evaluate(function(){ return window.__INYEON_TEST__.viewYear(); });
    R.note(s.route === 'saju' && vy === Y+1, '③-4 내년을 보다 결제를 취소해도 내년 그대로', 'route=' + s.route + ' year=' + vy);

    /* ③-5 성격유형 단품 결제 → 성격유형 풀이 */
    await p.evaluate(function(){ window.__INYEON_TEST__.goRoute('report'); }); await wait(500);
    await p.evaluate(function(){ window.__INYEON_TEST__.notePayPosition('mbti_full'); });
    s = await back('receipt=R7&product=mbti_full');
    R.note(s.route === 'mbtiReport', '③-5 성격유형 결제 → 성격유형 풀이(mbtiReport)', s.route);

    /* ④ 성격유형 → 이용권 결제 */
    await p.evaluate(function(){ window.__INYEON_TEST__.goRoute('report'); }); await wait(700);
    await p.evaluate(function(y){ window.__INYEON_TEST__.notePayPosition('premium_pass:' + y); }, Y);
    s = await back('receipt=R4&product=premium_pass%3A' + Y);
    R.note(s.route === 'mbtiReport', '④ 성격유형 화면에서 이용권 결제 → 성격유형 풀이(mbtiReport)', s.route);

    /* ⑥ 2026-10-18 — 2027년 AI 글의 '올해'를 그 해의 말로 (조사 포함) */
    const yw = await p.evaluate(function(Y){ var f = window.__INYEON_TEST__.aiYearWords;
      return [f((Y+1)+'년, 올해는 좋아요. 올해가 지나면', Y+1), f('올해는 좋아요', Y), f('지금의 10년과 올해 · 대운', Y+1)]; }, Y);
    R.note(yw[0] === '내년('+(Y+1)+'년)은 좋아요. 내년이 지나면', '⑥ 내년 풀이의 "올해" → "내년(YYYY년)" · 조사', yw[0]);
    R.note(yw[1] === '올해는 좋아요' && yw[2] === '지금의 10년과 내년('+(Y+1)+'년) · 대운', '⑥ 올해 풀이는 그대로 · 제목도 바뀜', yw[1]+' / '+yw[2]);
    R.note(errs.length === 0, 'JS 오류 0건', errs.join(' | ') || '없음');
  } catch(e){ R.note(false, '검사기 자체 오류', String(e && e.stack || e)); }
  await browser.close(); site.close();
  R.done();
})();
