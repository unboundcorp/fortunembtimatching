/* =====================================================================
   2026-10-16 소비자 관점 전체 검수(대표님 "다 고쳐라")로 고친 것을 지킨다 (빠른 층)
   ---------------------------------------------------------------------
   ① 오늘 다섯 카드 — 점수 구간(hi·mid·lo)별 묶음에서만 고른다. lo 묶음에 결정을 부추기는 말이 없다
   ② 성격유형 순위 — 16유형 × 연애·일 32개 목록 어디에도 같은 이유가 두 번 나오지 않는다(브라우저에서 실제로 돌림)
   ③ 성격유형 풀이 기본 안내가 사주 설명이 아니다(상품을 보고 문장을 고른다)
   ④ 결제창 — '1회 결제 · 자동 결제 없음' · [환불 정책] 단추
   ⑤ 처리방침 — 로그인 필수 이전 문장('브라우저에만 저장되고' · '회원가입이 없고')이 되살아나지 않는다
   ⑥ 제목 아이콘 — 좋고 나쁨이 갈리는 제목('…하루' · '이런 사이예요')과 ⚠️ 를 쓰지 않는다
   ⑦ 상극 별명 — 낙인찍는 말('둘 다 사라지는' · '둘 다 깎이는')이 되살아나지 않는다
===================================================================== */
const fs = require('fs'), path = require('path');
const L = require('../_lib.cjs');
const R = L.reporter('소비자 검수 10-16');
const src = fs.readFileSync(path.join(L.ROOT, 'fortune.html'), 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '');

const fp = code.match(/var FORTUNE_PHRASES = \{[\s\S]*?\n\};/);
R.note(!!fp, '① FORTUNE_PHRASES 가 있다');
const fpt = fp ? fp[0] : '';
R.note((fpt.match(/\bhi:\[/g)||[]).length === 5 && (fpt.match(/\bmid:\[/g)||[]).length === 5 && (fpt.match(/\blo:\[/g)||[]).length === 5, '① 다섯 항목 모두 hi·mid·lo 묶음');
const los = (fpt.match(/lo:\[[^\]]*\]/g) || []).join(' ');
R.note(!/결정지어도 좋아요|수입의 기운|시작하기 좋은|밀어 보세요/.test(los), '① lo 묶음에 결정·시작을 부추기는 말이 없다');
R.note(/FORTUNE_PHRASES\[cat\.key\]\[band\]/.test(code) && /function todayBand\(/.test(code), '① 카드 문장이 그날 점수 구간(todayBand)으로 고른다');

R.note(/var isMbti = kindOf === 'mbti_full'/.test(code) && /var whatReads = isMbti/.test(code) && /isMbti\s*\n?\s*\?\s*'풀이 문장은 성격유형/.test(code), '③ 기본 안내가 상품(성격유형·궁합·사주)에 맞춰 갈린다');
R.note(/interpreterNotice\(state, product\)/.test(code), '③ 부르는 쪽이 상품을 넘긴다');

R.note((code.match(/자동 결제 없음/g)||[]).length >= 3, "④ 결제창 가격 줄에 '자동 결제 없음'");
R.note(/setRoute\('refund'\);\s*\n\s*\}\},\['환불 정책'\]/.test(code), '④ 결제창에 [환불 정책] 단추');

R.note(!/기본적으로 이용자의 브라우저에만 저장되고/.test(code) && !/회원가입이 없고/.test(code), '⑤ 처리방침에 로그인 필수 이전 문장이 없다');

const hi = code.match(/var HEAD_ICONS = \[[\s\S]*?\];/);
const hit = hi ? hi[0] : '';
R.note(!!hi && !/하루\$/.test(hit) && !/이런 사이예요/.test(hit) && !/⚠️/.test(hit) && !/☯️/.test(hit), "⑥ 아이콘 표에 판정 제목·⚠️·☯️ 가 없다");

R.note(!/둘 다 사라지는|둘 다 깎이는|미리 꺼야 하는|식어가는 커피/.test(code), '⑦ 낙인찍는 궁합 별명이 없다');

(async () => {
  const srv = await L.serve(L.ROOT, 0);
  const b = await L.puppeteer().launch({executablePath: L.chromePath(), headless: 'new', args: ['--no-sandbox']});
  try{
    const p = await L.openPage(b, {hook: true, width: 390, height: 844});
    await p.goto(srv.url + '/fortune.html', {waitUntil: 'domcontentloaded'}); await L.wait(1200);
    const r = await p.evaluate(function(){
      var X = window.__INYEON_TEST__, T = Object.keys(X.MBTI_STACK), dup = 0, lists = 0, bad = [];
      T.forEach(function(me){ ['love','work'].forEach(function(k){
        var M = k === 'work' ? X.MBTI_WORK_MATRIX : X.MBTI_MATRIX;
        var rows = T.map(function(t){ return {t:t, v:M[me][t]}; }).sort(function(a,b){ return b.v - a.v; }).slice(0, 10);
        var used = {}, seen = {}; lists++;
        rows.forEach(function(r){ var w = X.mbtiFitReason(me, r.t, k, used); if(seen[w]){ dup++; if(bad.length<3) bad.push(me+'/'+k+': '+w); } seen[w] = 1; });
      }); });
      return {dup: dup, lists: lists, bad: bad};
    });
    R.note(r.lists === 32 && r.dup === 0, '② 순위 32개 목록에 같은 이유 0번', r.lists + '개 · 중복 ' + r.dup + ' ' + r.bad.join(' | '));
  } catch(e){ R.note(false, '② 브라우저 검사', String(e && e.message || e)); }
  await b.close(); srv.close();
  R.done();
})();
