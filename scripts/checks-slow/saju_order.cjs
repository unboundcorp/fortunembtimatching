/* =====================================================================
   사주 풀이 순서·무료 범위·한 해 흐름 (느린 층) — 2026-10-18 대표님 지시
   "그 해 운세를 먼저 풀고 전체를" · 순서 "오프닝 - 월별 흐름 - 금전운 - 사랑 - 일 - 타고난 기질 - …" · 무료 "1)"(앞 두 장)
   ① 목차 순서 ② 잠기기 전 무료는 두 장(금전운부터 잠김) ③ 2장 아래 달마다 막대 12개(잠긴 해에도)
   ④ AI 요청서: 새 순서 제목 · yearMonths 12 · sectionFrom 2 ⑤ 옛 순서로 만든 글이 제목으로 제자리에 끼워진다
   ⑥ 막대 값이 해마다 다르다(총운만 쓰면 해마다 같았음) */
const { chromePath, puppeteer, serve, reporter, openPage, wait, ROOT, makeState } = require('../_lib.cjs');
const R = reporter('사주 풀이 순서');
const Y = new Date(Date.now() + 9*3600*1000).getUTCFullYear();
const WANT = ['오프닝','한 해 흐름','금전운','사랑','일','타고난 기질','사회적 인상','내면','잠재력','반복되는 패턴','지나온 10년 흐름','다가올 10년','클로징'];
(async function(){
  const pptr = puppeteer(), chrome = chromePath();
  if(!pptr || !chrome){ console.log('크롬을 못 찾았습니다 — 건너뜁니다'); process.exit(0); }
  const base = process.argv[2];
  const site = base ? {url:base, close:function(){}} : await serve(ROOT, 0);
  const browser = await pptr.launch({executablePath: chrome, headless:'new', args:['--no-sandbox','--disable-dev-shm-usage']});
  const errs = []; let sent = null;
  try{
    const p = await openPage(browser, {hook:true, state: makeState({})});
    p.on('pageerror', e => errs.push(String(e)));
    await p.setViewport({width:390, height:900});
    await p.setRequestInterception(true);
    p.on('request', function(r){ const u = r.url();
      if(u.indexOf('/api/entitlements') >= 0){ const it = {}; it['saju_full:' + (Y+1)] = {purchasedAt: Date.now()};
        return r.respond({status:200, contentType:'application/json', body: JSON.stringify({items:it, purchases:[]})}); }
      if(u.indexOf('/api/interpret') >= 0 || u.indexOf('/api/content') >= 0){ try{ const b = JSON.parse(r.postData() || '{}'); if(b.payload && !sent) sent = b; }catch(e){}
        return r.respond({status:503, contentType:'application/json', body:'{"error":"test"}'}); }
      r.continue(); });
    await p.goto(site.url + '/fortune.html', {waitUntil:'domcontentloaded'}); await wait(1200);
    const look = () => p.evaluate(function(){ return {
      toc: Array.prototype.map.call(document.querySelectorAll('.toc-nav a, .toc-nav button'), function(x){ return x.innerText.replace(/\s+/g,' ').trim(); }),
      bars: document.querySelectorAll('.ym-bar').length, from: (document.querySelector('.toc-nav a.toc-locked')||{}).innerText || '',   /* 2026-10-31 '‘○○’부터 잠겨 있어요' 줄을 빼서 목차의 첫 자물쇠로 잰다 */
      ov: document.documentElement.scrollWidth > document.documentElement.clientWidth }; });
    await p.evaluate(function(y){ var T = window.__INYEON_TEST__; T.goRoute('report13'); T.setViewYear(y); }, Y); await wait(1300);
    let s = await look();
    R.note(JSON.stringify(s.toc.slice(0,13)) === JSON.stringify(WANT), '① 목차 순서', s.toc.join(','));
    R.note(/금전운/.test(s.from), '② 잠긴 해: 목차의 첫 자물쇠가 금전운(무료 두 장)', s.from);
    R.note(s.bars === 12, '③ 잠긴 해에도 2장 아래 막대 12개', String(s.bars));
    R.note(!s.ov, '가로 넘침 없음 (잠김)');
    await p.evaluate(function(y){ window.__INYEON_TEST__.setViewYear(y); }, Y+1); await wait(2500);
    s = await look();
    R.note(s.bars === 12 && !s.ov, '③ 열린 해에도 막대 12개 · 넘침 없음', s.bars);
    const pl = sent && sent.payload, ti = pl && pl.requested && pl.requested.sectionTitles;
    R.note(!!ti && ti.map(function(t){ return t.split(' · ')[0]; }).join(',') === WANT.join(','), '④ AI 요청서 제목이 새 순서', ti ? ti.join('/') : '없음');
    R.note(!!pl && Array.isArray(pl.yearMonths) && pl.yearMonths.length === 12 && pl.year === Y+1, '④ yearMonths 12달 · year', pl ? (pl.yearMonths||[]).length + ' / ' + pl.year : '없음');
    R.note(!sent || sent.sectionFrom === undefined || sent.sectionFrom === 2, '④ 통짜 창구 sectionFrom = 2', String(sent && sent.sectionFrom));
    const map = await p.evaluate(function(y){ var T = window.__INYEON_TEST__, pr = T.activeProfile();
      var titles = T.buildReport13(pr, T.getSajuResult(pr), y).sections.map(function(s){ return s.title; });
      var old = ['오프닝 · 한 문장 요약','타고난 기질 · 나를 가리키는 글자(일간)','사회적 인상 · 남들이 보는 나','내면 · 겉과 속의 차이','사랑 · 연애운','일 · 커리어운','금전운 · 재물운','잠재력 · 아직 덜 쓴 기운(오행)','반복되는 패턴 · 고민','지나온 10년 흐름 · 대운','지금의 10년과 올해 · 대운과 그 해 흐름(세운)','다가올 10년 · 대운','클로징'];
      var got = T.parseSections(old.map(function(t, i){ return '##' + t + '\n' + 'P' + i; }).join('\n'), titles);
      return got.map(function(g){ return g.paras[0]; }).join(','); }, Y+1);
    R.note(map === 'P0,P10,P6,P4,P5,P1,P2,P3,P7,P8,P9,P11,P12', '⑤ 옛 순서 글이 제목으로 제자리에', map);
    const yrs = await p.evaluate(function(){ var T = window.__INYEON_TEST__, pr = T.activeProfile();
      return [2026, 2027, 2028].map(function(y){ return T.buildMonthlyFortune(pr, y, function(){ return true; }).months.map(function(m){ return m.avg; }).join(','); }); });
    R.note(yrs[0] !== yrs[1] && yrs[1] !== yrs[2], '⑥ 막대 값이 해마다 다르다', yrs.join(' / '));
    const tot = await p.evaluate(function(){ var T = window.__INYEON_TEST__, pr = T.activeProfile();
      return [2026, 2027, 2028, 2029, 2030].map(function(y){ return T.buildMonthlyFortune(pr, y, function(){ return true; }).months.map(function(m){ return m.items.total.stars; }).join(''); }); });
    R.note(new Set(tot).size === 5, '⑦ 총운 별점이 다섯 해 모두 다르다(달의 띠로만 정하면 해마다 같았음)', tot.join(' / '));
    /* ⑧ 2026-10-18 — 십성은 띠 속 주된 기운(본기) 음양으로: 경(庚) 일간에게 사(巳)=편관 · 자(子)=상관 */
    const sp = await p.evaluate(function(){ var E = window.__INYEON_TEST__.SajuEngine;
      return [E.BRANCH_SIP_YY.join(''), E.sipseongOf(6, E.BRANCH_ELEM[5], E.BRANCH_SIP_YY[5]), E.sipseongOf(6, E.BRANCH_ELEM[0], E.BRANCH_SIP_YY[0])]; });
    R.note(sp[0] === '001011001011' && sp[1] === '편관' && sp[2] === '상관', '⑧ 본기 음양 · 경+사=편관 · 경+자=상관', sp.join(' / '));
    R.note(errs.length === 0, 'JS 오류 0건', errs.join(' | ') || '없음');
  } catch(e){ R.note(false, '검사기 자체 오류', String(e && e.stack || e)); }
  await browser.close(); site.close();
  R.done();
})();
