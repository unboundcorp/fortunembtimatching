#!/usr/bin/env node
/* =====================================================================
   계산 검사 — 점수와 상품값이 스스로 어긋나지 않는가
   ---------------------------------------------------------------------
   왜 만들었나 (2026-09-05 · 09-07 에 실제로 나온 것들):
     · 같은 두 사람인데 **누가 먼저냐에 따라 점수가 달랐다** (오행 25조합 중 10조합)
     · 띠 점수가 육합을 아예 안 봐서, 같은 글자쌍을 한 화면의 두 항목이 다르게 셌다
     · 일지가 파·형·삼합·방합을 안 보고 있었다 (144칸 중 66칸이 틀린 값)
     · 화면 상품표와 서버 상품표가 갈리면 **표시광고 문제**가 된다
   전부 "터지지 않는" 결함이다. 값을 직접 세어 봐야 잡힌다.

   ★ 화면 코드는 IIFE 안에 있어 밖에서 못 부른다. 그래서 브라우저에 띄운 뒤
     window.__INYEON_TEST__ 통로로 함수를 가져와 브라우저 안에서 센다
     (fortune.html 맨 끝. 검사기가 미리 심어 둔 경우에만 열린다).

   쓰는 법: node scripts/calc.cjs [주소]
===================================================================== */
const L = require('./_lib.cjs');
const path = require('path');
const BASE = (process.argv[2] || 'http://127.0.0.1:8899').replace(/\/+$/, '');
const APP = BASE + '/fortune.html';

(async () => {
  const R = L.reporter('계산');
  const exe = L.chromePath(), pp = L.puppeteer();
  if(!exe || !pp){ console.error('크롬 또는 puppeteer-core 를 못 찾았습니다.'); process.exit(2); }
  const browser = await pp.launch({executablePath:exe, headless:'new', args:['--no-sandbox']});
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(function(k, v){
    try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){}
    window.__INYEON_TEST__ = true;      /* ← 이걸 심어야 통로가 열린다 */
  }, L.STORAGE_KEY, L.makeState());
  await page.goto(APP, {waitUntil:'load'});
  await L.wait(2500);

  const open = await page.evaluate(() => !!(window.__INYEON_TEST__ && window.__INYEON_TEST__.MBTI_MATRIX));
  if(!open){
    console.error('검사 통로(window.__INYEON_TEST__)가 안 열렸습니다 — fortune.html 맨 끝을 확인하세요.');
    await browser.close(); process.exit(2);
  }

  /* ── 1. 띠 점수 ─────────────────────────────────────────────── */
  R.head('[1] 띠 점수 (zodiacScore) — 144칸');
  const zod = await page.evaluate(() => {
    const T = window.__INYEON_TEST__;
    /* ★ YUKHAP 은 인덱스 배열이 아니라 pairKey('a-b') 로 찾는 표다.
       처음에 YUKHAP[a]===b 로 찾았다가 '육합 0쌍'이 나왔다 — 0쌍인데도 '전부 88점'이라며
       통과했다. **셀 것이 0개면 통과가 아니라 검사가 안 돈 것이다.** 개수도 함께 본다. */
    const YUKHAP = T.SajuEngine.YUKHAP, pairKey = T.SajuEngine.pairKey;
    let asym = 0, nan = 0; const hap = [], bad = [];
    for(let a=0; a<12; a++) for(let b=0; b<12; b++){
      const x = T.zodiacScore(a,b), y = T.zodiacScore(b,a);
      if(!isFinite(x)) nan++;
      if(x !== y) asym++;
      if(a < b && YUKHAP[pairKey(a,b)]){ hap.push(x); if(x !== 88) bad.push(a+'×'+b+'='+x); }
    }
    return {asym, nan, hapN:hap.length, hapBad:bad};
  });
  R.note(zod.asym === 0, '순서를 바꿔도 같은 점수', '어긋남 ' + zod.asym + '칸');
  R.note(zod.nan === 0, '숫자가 아닌 값이 없다', 'NaN ' + zod.nan + '칸');
  R.note(zod.hapN === 6 && zod.hapBad.length === 0, '육합 여섯 쌍이 전부 88점',
         zod.hapN !== 6 ? ('육합을 ' + zod.hapN + '쌍밖에 못 찾음 — 표를 잘못 읽고 있다')
                        : (zod.hapBad.length ? zod.hapBad.join(' ') : '6쌍 · 어긋남 0건'));

  /* ── 2. 오행 점수 ───────────────────────────────────────────── */
  R.head('[2] 다섯 기운 점수 (elementScore) — 25칸');
  const elem = await page.evaluate(() => {
    const T = window.__INYEON_TEST__;
    let asym = 0, nan = 0;
    for(let a=0;a<5;a++) for(let b=0;b<5;b++){
      const x = T.elementScore(a,b), y = T.elementScore(b,a);
      if(!isFinite(x)) nan++;
      if(x !== y) asym++;
    }
    return {asym, nan};
  });
  R.note(elem.asym === 0, '순서를 바꿔도 같은 점수', '어긋남 ' + elem.asym + '칸');
  R.note(elem.nan === 0, '숫자가 아닌 값이 없다', 'NaN ' + elem.nan + '칸');

  /* ── 3. 성격유형 궁합표 ─────────────────────────────────────── */
  R.head('[3] 성격유형 궁합표 (MBTI_MATRIX) — 16×16');
  const mb = await page.evaluate(() => {
    const T = window.__INYEON_TEST__, M = T.MBTI_MATRIX;
    const types = Object.keys(M);
    let asym = 0, miss = 0, min = 999, max = -1, sameSum = 0, sameN = 0, aboveSame = 0;
    types.forEach(function(a){
      types.forEach(function(b){
        const x = M[a] && M[a][b], y = M[b] && M[b][a];
        if(typeof x !== 'number'){ miss++; return; }
        if(x !== y) asym++;
        if(x < min) min = x;
        if(x > max) max = x;
        if(a === b){ sameSum += x; sameN++; }
      });
    });
    const sameAvg = sameN ? sameSum / sameN : 0;
    types.forEach(function(a){ types.forEach(function(b){ if(a<b && M[a][b] > sameAvg) aboveSame++; }); });
    return {n:types.length, asym, miss, min, max, sameAvg, aboveSame};
  });
  R.note(mb.n === 16, '유형 16개가 다 있다', mb.n + '개');
  R.note(mb.miss === 0, '빈 칸이 없다', '빠짐 ' + mb.miss + '칸');
  R.note(mb.asym === 0, '순서를 바꿔도 같은 점수', '어긋남 ' + mb.asym + '칸');
  R.note(mb.min >= 30 && mb.max <= 95, '점수가 상식 범위에 있다', mb.min + ' ~ ' + mb.max);
  /* ★ 2026-09-05에 뜯어낸 것 — 예전에는 `if(a===b) score=88`이 박혀 있어서
     같은 유형이 전체 최고점이었다(88을 넘는 쌍 0개). 그 못박기가 되살아나면 여기서 걸린다. */
  R.note(mb.aboveSame >= 10, '같은 유형이 전체 최고가 아니다',
         '같은 유형 평균 ' + mb.sameAvg + '점보다 높은 쌍 ' + mb.aboveSame + '개');

  /* ── 4. 궁합 전체 — 순서를 바꿔도 같은가 ────────────────────── */
  R.head('[4] 궁합 종합 (computeCompat) — 무작위 200쌍');
  const cc = await page.evaluate(() => {
    const T = window.__INYEON_TEST__;
    const types = Object.keys(T.MBTI_MATRIX);
    function rnd(i){
      return {id:'x'+i, name:'검사'+i, mbti:types[i%16], gender:(i%2?'M':'F'),
        calendarType:'solar', lunarLeap:false,
        year:1960 + (i*7)%60, month:1 + (i*5)%12, day:1 + (i*11)%28,
        birthTime:{hour:(i*3)%24, minute:(i*13)%60},
        birthLonKey:'seoul', birthLon:126.98, solarTimeAdjust:true, sajuCache:null};
    }
    let asym = [], nan = 0, n = 0;
    const keys = ['combined','mbtiScore','elemScore','zodScore'];
    for(let i=0;i<200;i++){
      const A = rnd(i), B = rnd(i+37);
      let x, y;
      try{ x = T.computeCompat(A, B, 'friend'); y = T.computeCompat(B, A, 'friend'); }
      catch(e){ return {err: String(e.message).slice(0,120)}; }
      n++;
      keys.forEach(function(k){
        if(!isFinite(x[k])) nan++;
        if(x[k] !== y[k] && asym.length < 4) asym.push(k+' '+A.mbti+'×'+B.mbti+' '+x[k]+'≠'+y[k]);
      });
      const sx = x.saju && x.saju.score, sy = y.saju && y.saju.score;
      if(typeof sx === 'number' && sx !== sy && asym.length < 4) asym.push('saju.score '+sx+'≠'+sy);
    }
    return {n, nan, asym};
  });
  if(cc.err){ R.bad('궁합 계산', cc.err); }
  else {
    R.note(cc.asym.length === 0, '순서를 바꿔도 같은 점수 (' + cc.n + '쌍)',
           cc.asym.length ? cc.asym.join(' | ') : '어긋남 0건');
    R.note(cc.nan === 0, '숫자가 아닌 값이 없다', 'NaN ' + cc.nan + '건');
  }

  /* ── 5. 사이(관계) 비중 ─────────────────────────────────────── */
  R.head('[5] 사이별 비중 (COMPAT_RELATIONS)');
  const rel = await page.evaluate(() => {
    const T = window.__INYEON_TEST__;
    return T.COMPAT_RELATIONS.map(function(r){
      const w = r.w || {};
      const sum = (w.mbti||0)+(w.saju||0)+(w.elem||0)+(w.zod||0);
      return {key:r.key, label:r.label, sum:+sum.toFixed(4), pairOnly:!!r.pairOnly};
    });
  });
  rel.forEach(function(r){
    R.note(Math.abs(r.sum - 1) < 1e-6, '「' + r.label + '」 비중 합이 1',
           r.sum + (r.pairOnly ? ' · 두 분 전용' : ''));
  });

  /* ── 6. 별명표 ──────────────────────────────────────────────── */
  R.head('[6] 한 줄 별명표');
  const nick = await page.evaluate(() => {
    const T = window.__INYEON_TEST__;
    const tiers = Object.keys(T.COMPAT_TIER_LINE), nt = Object.keys(T.COMPAT_NICK);
    let slots = 0, texts = [], empty = [];
    tiers.forEach(function(t){
      ['same','mixed','different'].forEach(function(k){
        const a = T.COMPAT_NICK[t] && T.COMPAT_NICK[t][k];
        if(!a || !a.length){ empty.push(t+'/'+k); return; }
        slots++; texts = texts.concat(a);
      });
    });
    let pslots = 0;
    Object.keys(T.PERSON_NICK).forEach(function(e){
      ['양','음'].forEach(function(y){
        const a = T.PERSON_NICK[e][y];
        if(!a || !a.length){ empty.push(e+' '+y); return; }
        pslots++; texts = texts.concat(a);
      });
    });
    const seen = {}, dup = [];
    texts.forEach(function(x){ if(seen[x]) dup.push(x); seen[x]=1; });
    return {tiersSame: JSON.stringify(tiers)===JSON.stringify(nt), slots, pslots,
            n: texts.length, empty, dup};
  });
  R.note(nick.tiersSame, '등급표와 별명표의 등급이 같다');
  R.note(nick.empty.length === 0, '빈 자리가 없다',
         nick.empty.length ? nick.empty.join(' ') : '궁합 ' + nick.slots + '/15 · 사주 ' + nick.pslots + '/10');
  R.note(nick.dup.length === 0, '중복 문구가 없다',
         nick.dup.length ? nick.dup.slice(0,3).join(' | ') : nick.n + '개');

  /* ── 7. 화면 상품표 ↔ 서버 상품표 ───────────────────────────── */
  R.head('[7] 상품표 — 화면과 서버가 같은가');
  const cli = await page.evaluate(() => {
    const P = window.__INYEON_TEST__.PRODUCTS, out = {};
    Object.keys(P).forEach(function(k){ out[k] = {name:P[k].name, price:P[k].price, kind:P[k].kind, days:P[k].days||null}; });
    return out;
  });
  let srv = null;
  try{ srv = (await import('file://' + path.join(L.ROOT, 'api/_lib/products.js'))).PRODUCTS; }
  catch(e){ R.bad('서버 상품표 읽기', String(e.message).slice(0,100)); }
  if(srv){
    const keys = Array.from(new Set(Object.keys(cli).concat(Object.keys(srv))));
    keys.forEach(function(k){
      const a = cli[k], b = srv[k];
      if(!a){ R.bad('상품 ' + k, '서버에만 있음'); return; }
      if(!b){ R.bad('상품 ' + k, '화면에만 있음'); return; }
      const diff = [];
      if(a.price !== b.price) diff.push('값 ' + a.price + ' ≠ ' + b.price);
      if(a.name !== b.name)   diff.push('이름 「' + a.name + '」 ≠ 「' + b.name + '」');
      if(a.kind !== b.kind)   diff.push('갈래 ' + a.kind + ' ≠ ' + b.kind);
      if((a.days||null) !== (b.days||null)) diff.push('기간 ' + a.days + ' ≠ ' + b.days);
      R.note(diff.length === 0, '상품 ' + k, diff.length ? diff.join(' · ') : a.price.toLocaleString() + '원 · ' + a.name);
    });
  }

  await browser.close();
  R.done();
})().catch((e) => { console.error('검사 자체가 터졌습니다:', e && e.message); process.exit(2); });
