/* =====================================================================
   모임 화면은 총평만 · 누르면 그 사람의 궁합 / 홈 카드에 값이 없다 (느린 층)
   ---------------------------------------------------------------------
   2026-10-07 대표님 지시
   ① "아무것도 안 누르면 그냥 총평만 나오게 세팅 하자 그리고 누군가 눌러야 그 사람과의 궁합을 보여 주게 하자"
   ② "비용은 없애라 비용은 맨 마지막에 보이게 세팅해야 허들이 없지" — 홈 '더 깊이 알아보기' 카드
   보는 것: 처음엔 사람별 카드 0장 · 총평은 보임 · 누르면 그 사람 카드 1장 · 다시 누르면 0장
          · 두 분 모임도 같고 누르라는 안내가 있음 · 홈 카드 아래 줄에 '원'이 없음 · JS 오류 0 */
const L = require('../_lib.cjs');
const wait = L.wait;

function visibleCards(){
  return [...document.querySelectorAll('#main .gc-person-card')].filter(function(c){ return c.offsetParent !== null; })
    .map(function(c){ return c.getAttribute('data-mi'); });
}

async function openGroup(browser, srv, errs, extra){
  const q = await L.openPage(browser, {hook:true, width:390, height:900,
    state: L.makeState({savedGroups:[{id:'gS', name:'시험 모임', at:Date.now(), token:'t', n:extra.length+1, rel:'friend', profileId:'p1', pchk:1, pair:0}]})});
  q.on('pageerror', e => errs.push(String(e)));
  let roster = null;
  await q.setRequestInterception(true);
  q.on('request', function(req){
    if(req.url().indexOf('/api/group') >= 0){
      if(roster) return req.respond({status:200, contentType:'application/json', body: JSON.stringify({name:'시험 모임', members:roster, ttlDays:365})});
      return req.respond({status:404, contentType:'application/json', body:'{}'});
    }
    req.continue();
  });
  await q.goto(srv.url + '/fortune.html', {waitUntil:'domcontentloaded'}); await wait(1200);
  roster = await q.evaluate(function(extra){
    var T = window.__INYEON_TEST__, a = T.profiles()[0];
    return [T.gcMeetRow(a)].concat(extra.map(function(x){ return T.gcMeetRow(Object.assign({}, a, x)); })).join(';');
  }, extra.map(function(x){ return x; }));
  await q.evaluate(function(){ window.__INYEON_TEST__.openSavedGroup('gS'); }); await wait(1800);
  return q;
}

(async () => {
  const R = L.reporter('모임 총평만 · 홈 카드 값 없음');
  const srv = process.argv[2] ? {url:process.argv[2], close(){}} : await L.serve(L.ROOT, 0);
  const browser = await L.puppeteer().launch({executablePath: L.chromePath(), headless:'new', args:['--no-sandbox']});
  const errs = [];
  try{
    /* ① 세 사람 모임 */
    const q = await openGroup(browser, srv, errs, [{name:'정인', mbti:'ISTJ', day:3}, {name:'나래', mbti:'ESFP', year:1995}]);
    const s0 = await q.evaluate(function(f){ return {cards: eval('('+f+')')(), text: document.querySelector('#main').innerText}; }, visibleCards.toString());
    R.note(s0.cards.length === 0, '세 사람 — 아무도 안 누르면 사람별 카드가 없다', s0.cards.join(','));
    R.note(/전체 평균 궁합|평균 궁합 지수|최고 궁합/.test(s0.text), '세 사람 — 총평(평균·최고 궁합)은 보인다');
    await q.evaluate(function(){ document.querySelectorAll('#main .gc-node')[1].click(); }); await wait(500);
    const s1 = await q.evaluate(function(f){ return eval('('+f+')')(); }, visibleCards.toString());
    R.note(s1.length === 1 && s1[0] === '1', '세 사람 — 누르면 그 사람 카드 한 장만', s1.join(','));
    await q.evaluate(function(){ document.querySelectorAll('#main .gc-node')[1].click(); }); await wait(500);
    const s2 = await q.evaluate(function(f){ return eval('('+f+')')(); }, visibleCards.toString());
    R.note(s2.length === 0, '세 사람 — 다시 누르면 총평만으로 돌아온다', s2.join(','));
    await q.close();

    /* ② 두 사람 모임 (대표님 사진과 같은 모양) */
    const q2 = await openGroup(browser, srv, errs, [{name:'정인', mbti:'ISTJ', day:3}]);
    const t0 = await q2.evaluate(function(f){ return {cards: eval('('+f+')')(), text: document.querySelector('#main').innerText}; }, visibleCards.toString());
    R.note(t0.cards.length === 0, '두 사람 — 처음엔 카드가 없다', t0.cards.join(','));
    R.note(/캐릭터를 누르면 그 사람의 궁합이 아래에 나와요/.test(t0.text), '두 사람 — 누르라는 안내가 있다');
    await q2.evaluate(function(){ document.querySelectorAll('#main .gc-node')[0].click(); }); await wait(500);
    const t1 = await q2.evaluate(function(f){ return eval('('+f+')')(); }, visibleCards.toString());
    R.note(t1.length === 1, '두 사람 — 누르면 카드 한 장', t1.join(','));
    await q2.close();

    /* ③ 홈 카드에 값이 없다 */
    const h = await L.openPage(browser, {hook:true, width:390, height:900, state: L.makeState()});
    h.on('pageerror', e => errs.push(String(e)));
    await h.goto(srv.url + '/fortune.html', {waitUntil:'networkidle0'}); await wait(800);
    await h.evaluate(function(){ window.__INYEON_TEST__.goRoute('home'); }); await wait(800);
    const foot = await h.evaluate(function(){ return [...document.querySelectorAll('#main .hd-card .hc-foot')].map(function(x){ return x.textContent.trim(); }); });
    R.note(foot.length === 4 && foot.every(function(t){ return !/\d+원/.test(t); }), '홈 카드 — 값(원)이 안 보인다', foot.join(' | '));
    R.note(foot.filter(function(t){ return /자세히 보기/.test(t); }).length === 2, '홈 카드 — 유료 두 장은 \'자세히 보기\'', foot.join(' | '));
    await h.close();

    R.note(errs.length === 0, 'JS 오류 0건', errs.slice(0,2).join(' / ') || '없음');
  } finally {
    await browser.close(); srv.close();
  }
  R.done();
})();
