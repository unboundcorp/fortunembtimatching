/* =====================================================================
   모임 쌍 카드의 관계 총평 — 오행 한 줄 · 성격유형 한 줄은 의무 (느린 층)
   ---------------------------------------------------------------------
   2026-10-15 대표님 지시 "관계 총평은 MBTI랑 사주 금 토 목 화 수 기반으로 한줄씩은 의무로 넣어라
   그리고 아이콘도 추가해서 넣고" (예아 × TS 코멘트가 짧다는 지적).
   보는 것: 쌍마다 .pair-sum 두 줄 · ① 오행 줄에 두 분의 기운 아이콘과 이름·기운 ② 성격유형 줄에 'XXXX × YYYY —'
          · 빈 값(undefined/null/NaN) 없음 · 심층 궁합 분석 아래 목차 나열 줄 없음("필요 없는 거 같아") · 폭 320 에서 넘침 없음 · JS 오류 0
===================================================================== */
const L = require('../_lib.cjs');
const wait = L.wait;

(async () => {
  const R = L.reporter('모임 쌍 관계 총평');
  const srv = process.argv[2] ? {url:process.argv[2], close(){}} : await L.serve(L.ROOT, 0);
  const browser = await L.puppeteer().launch({executablePath: L.chromePath(), headless:'new', args:['--no-sandbox']});
  const errs = [];
  try{
    const q = await L.openPage(browser, {hook:true, width:320, height:900,
      state: L.makeState({savedGroups:[{id:'gS', name:'시험 모임', at:Date.now(), token:'t', n:3, rel:'coworker', profileId:'p1', pchk:1, pair:0}]})});
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
    roster = await q.evaluate(function(){
      var T = window.__INYEON_TEST__, a = T.profiles()[0];
      return [T.gcMeetRow(a), T.gcMeetRow(Object.assign({}, a, {name:'예아', mbti:'ISTJ', day:3})),
              T.gcMeetRow(Object.assign({}, a, {name:'빈나', mbti:'ENFP', year:1995}))].join(';');
    });
    await q.evaluate(function(){ window.__INYEON_TEST__.openSavedGroup('gS'); }); await wait(1800);
    const s = await q.evaluate(function(){
      var cards = [...document.querySelectorAll('#main .gc-person-card')];
      cards.forEach(function(c){ c.style.display = ''; c.hidden = false; });
      var blks = [...document.querySelectorAll('#main .gc-pair-blk')];
      var over = 0;
      document.querySelectorAll('#main .pair-sum li').forEach(function(li){ if(li.scrollWidth > li.clientWidth + 1) over++; });
      return { n: blks.length, docW: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, over: over,
        lead: document.querySelectorAll('#main .deep-lead').length + (/상황별 읽기/.test(document.querySelector('#main').innerText) ? 1 : 0),
        rows: blks.map(function(b){ return [...b.querySelectorAll('.pair-sum li')].map(function(li){ return li.innerText.replace(/\s+/g,' ').trim(); }); }) };
    });
    R.note(s.n >= 6, '쌍 블록이 있다 (3명 × 2)', String(s.n));
    const ELEM = /[🌳🔥⛰⚙💧]/u;
    R.note(s.rows.every(r => r.length === 2), '쌍마다 관계 총평 두 줄', JSON.stringify(s.rows.map(r => r.length)));
    R.note(s.rows.every(r => /오행/.test(r[0]) && (r[0].match(/🌳|🔥|⛰️|💎|💧/gu)||[]).length === 2 && /(나무|불|흙|쇠|물)\((목|화|토|금|수)\)/.test(r[0])), '① 오행 줄 — 아이콘 둘 · 두 분의 기운', s.rows[0] && s.rows[0][0]);
    R.note(s.rows.every(r => /🧠/.test(r[1]) && /성격유형/.test(r[1]) && /[EI][SN][TF][JP] × [EI][SN][TF][JP] — .+/.test(r[1])), '② 성격유형 줄 — 아이콘 · 두 유형 · 이유', s.rows[0] && s.rows[0][1]);
    R.note(s.rows.every(r => r.every(t => !/undefined|null|NaN/.test(t))), '빈 값 없음');
    R.note(new Set(s.rows.map(r => r[1])).size > 1, '성격유형 줄이 쌍마다 같은 문장이 아님', JSON.stringify(s.rows.map(r => r[1])));
    R.note(s.over === 0 && s.docW <= s.cw, '폭 320 넘침 없음', JSON.stringify({over:s.over, docW:s.docW, cw:s.cw}));
    R.note(s.lead === 0, "심층 궁합 분석 아래 목차 나열 줄이 없다 (2026-10-15 대표님 지시)", String(s.lead));
    R.note(errs.length === 0, 'JS 오류 0', JSON.stringify(errs));
  } finally { await browser.close(); srv.close(); }
  R.done(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
