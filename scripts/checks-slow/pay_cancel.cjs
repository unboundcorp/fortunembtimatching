/* =====================================================================
   결제를 취소하고 돌아오면 떠나기 전 자리로 (느린 층)
   ---------------------------------------------------------------------
   2026-09-22 대표님 영상 제보 "결제 취소하고 돌아왔는데 직전 화면이 아니라 홈 화면으로 가는 현상".
   결제 페이지의 [취소하고 돌아가기]는 `/fortune.html?pay=cancel` 로 오고, 브라우저 뒤로가기는
   주소에 아무 표식이 없다(헤드리스 크롬은 navigation.type 도 'navigate' 로 답한다 — 실측).
   그래서 판정은 "같은 탭의 쪽지(sessionStorage · 30분)가 살아 있고 새로고침이 아니면"이다.
   둘 다 결제 성공 때와 같은 쪽지(PAY_BACK_KEY)로
   ① 모임 궁합의 쌍 상세(pairDeep) ② 내 사주 화면 으로 되돌아가야 한다.
   ③ 쪽지가 없으면 아무 일도 안 하고 홈이다. ④ 주소에서 ?pay=cancel 이 지워진다.
   ★ /api/group 은 가로채 흉내 낸다. 결제 페이지도 가짜 html 로 흉내 낸다. */
const { chromePath, puppeteer, serve, reporter, openPage, wait, clickText, ROOT } = require('../_lib.cjs');
const GID = 'paycancelgroup1';
const R = reporter('결제 취소 복귀');

(async function(){
  const pptr = puppeteer(), chrome = chromePath();
  if(!pptr || !chrome){ console.log('크롬을 못 찾았습니다 — 건너뜁니다'); process.exit(0); }
  const base = process.argv[2];
  const site = base ? {url:base, close:function(){}} : await serve(ROOT, 0);
  const browser = await pptr.launch({executablePath: chrome, headless:'new', args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    let roster = '';
    const p = await openPage(browser, {hook:true});
    await p.setRequestInterception(true);
    p.on('request', function(req){
      const u = req.url();
      if(u.indexOf('/api/group') >= 0){
        let body = {}; try{ body = JSON.parse(req.postData() || '{}'); }catch(e){}
        if(body.action === 'get') return req.respond({status:200, contentType:'application/json', body: JSON.stringify({name:'검사 모임', members:roster, ttlDays:365})});
        return req.respond({status:400, contentType:'application/json', body:'{}'});
      }
      /* 심층 분석 단추는 궁합 권한이 있어야 그려진다(없으면 결제 단추뿐). */
      if(u.indexOf('/api/entitlements') >= 0) return req.respond({status:200, contentType:'application/json', body: JSON.stringify({items:{compat_full:{purchasedAt: Date.now()}}, pass:null, purchases:[]})});
      if(u.indexOf('/fake-pay') >= 0) return req.respond({status:200, contentType:'text/html; charset=utf-8', body:'<html><body><h1>가짜 결제 페이지</h1><a href="/fortune.html?pay=cancel">취소하고 돌아가기</a></body></html>'});
      req.continue();
    });
    await p.goto(site.url + '/fortune.html', {waitUntil:'domcontentloaded'}); await wait(900);
    roster = await p.evaluate(function(){
      const T = window.__INYEON_TEST__; const me = T.activeProfile();
      const other = Object.assign({}, me, {name:'상대', mbti: me.mbti === 'ENFP' ? 'ISTJ' : 'ENFP', day: me.day === 15 ? 16 : 15});
      return T.gcMeetRow(me) + ';' + T.gcMeetRow(other);
    });
    const state = () => p.evaluate(function(){ const T = window.__INYEON_TEST__; return { route: T.route(), pd: T.pairDeep(), url: location.search, text: document.body.innerText.slice(0, 4000) }; });

    /* ① 모임 → 쌍 상세 → (결제하러 감) → 취소 링크로 복귀 */
    await p.evaluate(function(g){ window.__INYEON_TEST__.openSavedGroup(g); }, GID); await wait(1500);
    if(await p.evaluate(function(){ return document.body.innerText.indexOf('이 모임은 어떤 사이인가요') >= 0; })){ await clickText(p, /^친구$/); await wait(900); }
    const opened = await clickText(p, /심층 분석 보기/); await wait(700);
    let st = await state();
    R.note(opened && st.route === 'pairDeep' && st.pd, '모임 쌍 상세 화면에 섰다', 'route=' + st.route);
    await p.evaluate(function(){ window.__INYEON_TEST__.notePayPosition('compat_full'); });
    await p.goto(site.url + '/fortune.html?pay=cancel', {waitUntil:'domcontentloaded'}); await wait(400);
    const toast = await p.evaluate(function(){ const t = document.querySelector('#toast'); return t ? t.textContent.trim() : ''; });
    await wait(1800);
    st = await state();
    R.note(st.route === 'pairDeep' && st.pd && st.pd.ai === 0 && st.pd.bi === 1, '① 취소 링크로 돌아오면 보던 쌍 상세로', 'route=' + st.route + ' pd=' + JSON.stringify(st.pd));
    R.note(/상대|검사/.test(st.text) && st.text.indexOf('만 14세') < 0, '① 그 쌍의 화면이 실제로 그려짐');
    R.note(st.url.indexOf('pay=cancel') < 0, '④ 주소에서 ?pay=cancel 이 지워짐', 'search=' + JSON.stringify(st.url));
    R.note(/취소했어요/.test(toast), '① 취소 알림이 뜸', JSON.stringify(toast));
    R.note(await p.evaluate(function(){ return !sessionStorage.getItem('inyeon.payBack'); }), '① 쪽지는 한 번 쓰고 지워짐');

    /* ② 내 사주 화면에서 떠났다가 취소 */
    await clickText(p, /^내 사주$/); await wait(700);
    await p.evaluate(function(){ window.__INYEON_TEST__.notePayPosition('saju_full:2026'); });
    await p.goto(site.url + '/fortune.html?pay=cancel', {waitUntil:'domcontentloaded'}); await wait(1200);
    st = await state();
    R.note(st.route === 'saju', '② 내 사주에서 떠났으면 내 사주로', 'route=' + st.route);

    /* ③ 뒤로가기(back_forward)로 돌아온 경우 — 모임 쌍 상세 */
    await p.evaluate(function(g){ window.__INYEON_TEST__.openSavedGroup(g); }, GID); await wait(1500);
    if(await p.evaluate(function(){ return document.body.innerText.indexOf('이 모임은 어떤 사이인가요') >= 0; })){ await clickText(p, /^친구$/); await wait(900); }
    await clickText(p, /심층 분석 보기/); await wait(600);
    await p.evaluate(function(){ window.__INYEON_TEST__.notePayPosition('compat_full'); });
    await Promise.all([
      p.waitForNavigation({waitUntil:'domcontentloaded', timeout:8000}).catch(function(){}),
      p.evaluate(function(){ location.href = '/fake-pay'; }),
    ]);
    await wait(500);
    const onPay = await p.evaluate(function(){ return document.body.innerText.indexOf('가짜 결제 페이지') >= 0; }).catch(function(){ return false; });
    R.note(onPay, '③ 가짜 결제 페이지로 갔다', p.url());
    await p.goBack({waitUntil:'domcontentloaded'}); await wait(2200);
    st = await state();
    R.note(st.route === 'pairDeep' && st.pd, '③ 뒤로가기로 돌아와도 보던 쌍 상세로', 'route=' + st.route);

    /* ④ 결제 페이지로 못 떠난 채 새로고침 — 옛 자리로 보내지 않고 쪽지를 버린다 */
    await clickText(p, /^홈$/); await wait(500);
    await p.evaluate(function(){ window.__INYEON_TEST__.notePayPosition('compat_full'); });
    await p.reload({waitUntil:'domcontentloaded'}); await wait(1500);
    st = await state();
    R.note(st.route !== 'pairDeep' && st.route !== 'groupCompat', '④ 새로고침은 옛 자리로 안 보냄', 'route=' + st.route);
    R.note(await p.evaluate(function(){ return !sessionStorage.getItem('inyeon.payBack'); }), '④ 새로고침 뒤 쪽지가 지워짐');

    /* ④ 쪽지가 없으면 홈 그대로 */
    await p.evaluate(function(){ sessionStorage.removeItem('inyeon.payBack'); });
    await p.goto(site.url + '/fortune.html?pay=cancel', {waitUntil:'domcontentloaded'}); await wait(1000);
    st = await state();
    R.note(st.route === 'home' || st.route === 'today', '⑤ 쪽지가 없으면 첫 화면', 'route=' + st.route);
    R.note(p.__errs.length === 0, 'JS 오류 없음', p.__errs.join(' | '));
  }catch(e){ R.bad('검사 자체가 터짐', String(e && e.stack || e).slice(0, 300)); }
  await browser.close(); site.close(); R.done();
})();
