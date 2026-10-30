#!/usr/bin/env node
/* =====================================================================
   모임 궁합 화면의 [글 전체 복사] · [이미지로 저장] 글 (느린 층 · 2026-10-30)
   ---------------------------------------------------------------------
   대표님 사진 "궁합이미지 엉망인데??" — 그림에 화면 장치(누르기 안내·범례·주소 카드·유료 권유)가 섞이고,
   '왜 N점인가요?' 줄마다 한마디·뜻풀이·이유를 괄호 하나에 몰아 긴 덩어리가 됐다.
   ① 화면 장치가 안 들어간다 ② 평균 점수 한 줄 ③ 순위 '1. A · B — 78점 (강한 인연)'
   ④ 왜 N점 줄은 '이름 — 점수 · 한마디' 한 줄 + 이유는 다음 줄 (뜻풀이 빠짐)
   ⑤ 사람을 누르면 '■ ○○와의 궁합 — 78점 (등급)' · 유료 권유 없음 ⑥ 제목 아이콘 뒤 띄어쓰기 ⑦ JS 오류 0
===================================================================== */
const L = require('../_lib.cjs');
(async () => {
  const R = L.reporter('모임 궁합 복사·그림 글');
  const srv = process.argv[2] ? {url:process.argv[2], close(){}} : await L.serve(L.ROOT, 0);
  const browser = await L.puppeteer().launch({executablePath: L.chromePath(), headless:'new', args:['--no-sandbox']});
  const errs = [];
  try{
    const q = await L.openPage(browser, {hook:true, width:390, height:900,
      state: L.makeState({savedGroups:[{id:'gS', name:'Amigos', at:Date.now(), token:'t', n:3, rel:'friend', profileId:'p1', pchk:1, pair:0}]})});
    q.on('pageerror', e => errs.push(String(e)));
    let roster = null;
    await q.setRequestInterception(true);
    q.on('request', r => {
      if(r.url().indexOf('/api/group') >= 0) return roster
        ? r.respond({status:200, contentType:'application/json', body: JSON.stringify({name:'Amigos', members:roster, ttlDays:365})})
        : r.respond({status:404, contentType:'application/json', body:'{}'});
      r.continue();
    });
    await q.goto(srv.url + '/fortune.html', {waitUntil:'domcontentloaded'}); await L.wait(1200);
    roster = await q.evaluate(function(){ var T = window.__INYEON_TEST__, a = T.profiles()[0];
      return [T.gcMeetRow(a), T.gcMeetRow(Object.assign({}, a, {name:'권대겸', mbti:'ISTJ', day:3})), T.gcMeetRow(Object.assign({}, a, {name:'효대', mbti:'ESFP', year:1995}))].join(';'); });
    await q.evaluate(function(){ window.__INYEON_TEST__.openSavedGroup('gS'); }); await L.wait(1800);
    const c0 = await q.evaluate(function(){ return window.__INYEON_TEST__.screenTextForCopy(); });
    const junk = ['줄을 누르면', '친구 얼굴을', '80점 이상', '이 모임 주소', '사람 더 받기', 'PIN', '사이로 봐요.'];
    const found = junk.filter(j => c0.indexOf(j) >= 0);
    R.note(found.length === 0, '① 누르기 안내·범례·주소/접수 카드·같은 말 사이 설명이 안 들어간다', found.join(', '));
    R.note(/^\d명 · 전체 평균 궁합 지수 — \d+점$/m.test(c0), '② 평균 점수가 한 줄', (c0.match(/.*전체 평균.*/)||[''])[0] + ' / ' + (c0.match(/^\d+점$/m)||[''])[0]);
    R.note(/^1\. .+ · .+ — \d+점 \(.+인연\)$/m.test(c0) && /^3\. /m.test(c0), "③ 순위가 '1. A · B — 78점 (강한 인연)'", (c0.match(/^1.*$/m)||[''])[0]);
    R.note(/^· 성격유형이 맞는 정도 — \d+점 · \S/m.test(c0) && !/^· .+\(.+ · .+ · /m.test(c0) && c0.indexOf('성격유형 열여섯 가지끼리') < 0,
      "④ 왜 N점 줄 = '이름 — 점수 · 한마디' · 괄호 덩어리·뜻풀이 없음", (c0.match(/^· 성격유형.*$/m)||[''])[0].slice(0,80));
    R.note(/^\[왜 \d+점인가요\?\]$/m.test(c0), '④ 왜 N점인가요? 는 소제목 [ ] 줄');
    R.note(/^■ 🏆 전체 순위$/m.test(c0) && /^■ 📝 모임 총평$/m.test(c0), '⑥ 제목 아이콘 뒤에 한 칸');
    await q.evaluate(function(){ document.querySelectorAll('#main .gc-node')[1].click(); }); await L.wait(600);
    const c1 = await q.evaluate(function(){ return window.__INYEON_TEST__.screenTextForCopy(); });
    R.note(/^■ .+(와|과)의 궁합 — \d+점 \(.+인연\)$/m.test(c1), "⑤ 사람을 누르면 '■ ○○와의 궁합 — 78점 (등급)' 한 줄", (c1.match(/.*의 궁합.*/)||[''])[0]);
    R.note(c1.indexOf('걸리는 게 하나') < 0 && c1.indexOf('심층 궁합 분석') < 0 && c1.indexOf('다시 누르면') < 0, '⑤ 유료 권유 카드·누르기 안내가 없다');
    const pg = await q.evaluate(function(){ var P = window.__INYEON_TEST__.screenImagePages(); return JSON.stringify(P).slice(0, 200000); });
    R.note(pg.indexOf('\\ud83c ') < 0 && /🏆 전체 순위/.test(pg), '⑥ 그림 제목의 아이콘이 깨지지 않는다(이모지 반쪽 사이 띄어쓰기 없음)');
    R.note(errs.length === 0, '⑦ JS 오류 0', errs.join(' | ').slice(0, 200));
  }catch(e){ R.bad('검사 중 오류', String(e && e.stack || e).slice(0, 300)); }
  await browser.close(); srv.close();
  R.done();
})();
