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
    /* ★ 2026-10-07 대표님 "그룹 궁합 총평 좀 써주라니까?" — 글로 된 총평이 있다 */
    const v3 = await q.evaluate(function(){ var b = document.querySelector('#main .gc-verdict-card'); return b ? b.innerText.replace(/\s+/g,' ') : ''; });
    R.note(/모임이에요|모였어요/.test(v3) && /중심이에요/.test(v3) && !/undefined|null|NaN/.test(v3), '세 사람 — 글로 된 총평(모임 성격 · 중심인 사람)이 있다', v3.slice(0,120));
    const top3 = await q.evaluate(function(){ var c = document.querySelector('#main .gc-verdict-card'), g = document.querySelector('#main .gauge-label');
      var e = c && c.querySelector('.gv-elem');
      return {before: !!(c && g && (c.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_PRECEDING)), elem: e ? e.textContent : '', dots: c ? c.querySelectorAll('.ge-dots i').length : 0}; });
    R.note(top3.before, '세 사람 — 평균 점수가 맨 위 · 총평 카드는 그 바로 아래 (2026-10-08 대표님 지시)', JSON.stringify(top3.before));
    R.note(/^이 모임은 .+기운이 가장 많아/.test(top3.elem) && (top3.elem.match(/요\./g)||[]).length >= 3 && /다만/.test(top3.elem), '세 사람 — 다섯 기운 문단이 "이 모임은"으로 시작해 세 문장 이상', top3.elem);
    /* ★ 2026-10-08 대표님 "MBTI도 총평에 녹여서 모임 풀이해라" — 문단에 성격유형 문장이 있고, 말한 글자가 실제로 다수인가 */
    R.note(/성격유형으로 보면 .+(많아서|섞여)|성격유형은 고루 섞여/.test(top3.elem), '세 사람 — 다섯 기운 문단에 성격유형 이야기가 녹아 있다', top3.elem);
    const mb = await q.evaluate(function(){ var H = window.__INYEON_TEST__, f = H.groupMbtiLine;
      var cases = [[['ENFP','ENFJ','ESTJ'],false],[['ISTJ','ISFJ','INTJ'],false],[['ENFP','ISTJ'],true],[['ENFP','ENTP'],true],[['ESTJ','INFP','ENTP','ISFJ'],false],[['ENFP'],false]];
      return cases.map(function(c){ return f(c[0].map(function(t){ return {mbti:t}; }), c[1]); }); });
    R.note(/외향형\(E\)/.test(mb[0]) && !/내향/.test(mb[0]), 'MBTI — E 셋이면 외향형을 말한다', mb[0]);
    R.note(/내향형\(I\)/.test(mb[1]) && /계획형\(J\)/.test(mb[1]), 'MBTI — I·J 셋이면 내향형·계획형', mb[1]);
    R.note(/네 글자가 모두 달라/.test(mb[2]), 'MBTI — 두 분이 정반대면 그렇게 말한다', mb[2]);
    R.note(/^성격유형으로 보면 두 분 다 /.test(mb[3]) && /외향형/.test(mb[3]), 'MBTI — 두 분이 같은 글자면 "두 분 다"', mb[3]);
    R.note(/고루 섞여/.test(mb[4]), 'MBTI — 반반이면 고루 섞였다고 한다', mb[4]);
    R.note(mb[5] === '', 'MBTI — 한 명뿐이면 말하지 않는다', JSON.stringify(mb[5]));
    R.note(top3.dots === 25, '세 사람 — 다섯 기운 점 25개', String(top3.dots));
    if(process.env.SHOT) await q.screenshot({path: process.env.SHOT + '/gv3.png'});
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
    const v2 = await q2.evaluate(function(){ var b = document.querySelector('#main .gc-verdict-card .gc-verdict'); return b ? b.innerText.trim() : ''; });
    R.note(v2.length > 10 && !/중심이에요/.test(v2) && !/undefined|null/.test(v2), '두 사람 — 1:1 과 같은 총평 한 줄', v2);
    if(process.env.SHOT) await q2.screenshot({path: process.env.SHOT + '/gv2.png'});
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
