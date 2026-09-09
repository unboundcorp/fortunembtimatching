/* =====================================================================
   궁합 등급이 다섯 개 다 쓰이는가 — 분포를 실제로 재 본다 (느린 층)
   ---------------------------------------------------------------------
   2026-09-09 대표님 질문 "5단계 궁합 별로 몇명인지? 로직상 아주 큰 비율이
   강한/무난한에서 머무른다면 궁합쪽이 좀 매력이 떨어질 것 같아서"

   ★ 그때 실측: 옛 선(85/70/55/40)에서 강한+무난한이 **96.5%**,
     '상극 인연'은 **5만 쌍에서 0건** — 확률이 낮은 게 아니라 하위 점수의 바닥 때문에
     **수학적으로 나올 수 없었습니다.** 등급 다섯 중 하나가 죽어 있었습니다.
   ★ 코드를 아무리 읽어도 안 보입니다. **분포를 재야만 보입니다.** 그래서 검사로 남깁니다.

   무엇을 지키나:
     ① 다섯 등급이 **전부** 한 번은 나온다 (죽은 등급이 없다)
     ② 가운데 둘(강한+무난한)이 80%를 넘지 않는다
     ③ 화면 범례의 점수 구간이 실제 자르는 선과 어긋나지 않는다
===================================================================== */
const { chromePath, puppeteer, serve, reporter, openPage, wait, ROOT } = require('../_lib.cjs');

const R = reporter('궁합 등급 분포');
const TIERS = ['찰떡 인연','강한 인연','무난한 인연','엇갈린 인연','상극 인연'];

(async function(){
  const pptr = puppeteer(), chrome = chromePath();
  if(!pptr || !chrome){ console.log('크롬을 못 찾았습니다 — 건너뜁니다'); process.exit(0); }
  const base = process.argv[2];
  const site = base ? {url:base, close:function(){}} : await serve(ROOT, 0);
  const browser = await pptr.launch({executablePath: chrome, headless:'new',
    args:['--no-sandbox','--disable-dev-shm-usage']});

  try{
    const p = await openPage(browser, {hook:true});
    await p.goto(site.url + '/fortune.html', {waitUntil:'domcontentloaded'});
    await wait(1200);

    const out = await p.evaluate(function(N){
      const T = window.__INYEON_TEST__;
      if(!T || !T.computeCompat || !T.dominantElementIdx) return null;
      const MB = ['ISTJ','ISFJ','INFJ','INTJ','ISTP','ISFP','INFP','INTP',
                  'ESTP','ESFP','ENFP','ENTP','ESTJ','ESFJ','ENFJ','ENTJ'];
      /* 씨앗을 박은 난수 — 돌릴 때마다 결과가 달라지면 검사가 아니다 */
      let seed = 20260909 >>> 0;
      function rnd(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296; }
      function ri(a,b){ return a + Math.floor(rnd()*(b-a+1)); }

      const people = [];
      for(let i=0;i<N;i++){
        const y = ri(1980,2007);
        const saju = T.SajuEngine.computeSaju(y, ri(1,12), ri(1,28), ri(0,23), ri(0,59),
                                              {lon:126.98, adjust:true});
        const e = T.dominantElementIdx(saju), z = T.calcZodiac(y);
        people.push({mbti:MB[ri(0,15)], elementIdx:e.idx, zodiacIdx:z.idx,
                     element:T.ELEMENTS[e.idx], saju:saju, name:'P'+i,
                     gender: rnd()<0.5 ? 'M' : 'F'});
      }
      const tally = {}, n = {};
      T.COMPAT_RELATIONS.forEach(function(r){
        tally[r.key] = {}; n[r.key] = 0;
      });
      let lo = 999, hi = -1;
      T.COMPAT_RELATIONS.forEach(function(rel){
        for(let i=0;i<people.length;i++) for(let j=i+1;j<people.length;j++){
          const res = T.computeCompat(people[i], people[j], rel.key);
          tally[rel.key][res.combinedTier] = (tally[rel.key][res.combinedTier]||0) + 1;
          n[rel.key]++;
          if(res.combined < lo) lo = res.combined;
          if(res.combined > hi) hi = res.combined;
        }
      });
      return {tally:tally, n:n, lo:lo, hi:hi,
              cuts: T.COMBINED_TIERS.map(function(t){ return t.name + ':' + t.min; }),
              ranges: T.COMBINED_TIERS.map(function(t){ return T.combinedTierRange(t.name); })};
    }, 130);

    if(!out){ R.bad('검사 통로를 열지 못함 (__INYEON_TEST__)'); throw new Error('no hook'); }

    R.head('── 자르는 선');
    R.ok('선', out.cuts.join(' · '));
    R.ok('실제로 나온 점수 폭', out.lo + ' ~ ' + out.hi + '점');

    R.head('── 등급 분포 (사이 네 가지)');
    Object.keys(out.tally).forEach(function(rel){
      const t = out.tally[rel], total = out.n[rel];
      const pct = TIERS.map(function(x){
        return x.replace(' 인연','') + ' ' + ((t[x]||0)/total*100).toFixed(1) + '%';
      }).join(' · ');
      const dead = TIERS.filter(function(x){ return !t[x]; });
      R.note(dead.length === 0, rel + ' — 다섯 등급이 다 나온다',
             pct + (dead.length ? '  ✗ 안 나온 등급: ' + dead.join(',') : ''));
      const mid = ((t['강한 인연']||0) + (t['무난한 인연']||0)) / total;
      R.note(mid <= 0.80, rel + ' — 가운데 둘이 80% 아래',
             (mid*100).toFixed(1) + '%');
    });

    R.head('── 화면 범례가 자르는 선과 맞는가');
    /* 범례 문장에서 숫자를 뽑아 자르는 선과 맞대어 본다.
       ★ 손으로 적어 둔 구간이 되살아나면 여기서 걸린다. */
    const mins = out.cuts.map(function(c){ return Number(c.split(':')[1]); });
    const want = mins.map(function(m, i){
      if(i === 0) return m + '점 이상';
      if(i === mins.length - 1) return (mins[i-1] - 1) + '점 이하';
      return m + '~' + (mins[i-1] - 1) + '점';
    });
    R.note(JSON.stringify(out.ranges) === JSON.stringify(want),
           '범례 구간이 자르는 선에서 만들어진다', out.ranges.join(' / '));

    R.note((p.__errs||[]).length === 0, 'JS 오류 0건', (p.__errs||[]).join(' | ') || '없음');
    await p.close();
  }catch(err){
    R.bad('검사 중 오류', String(err && err.message).slice(0,160));
  }finally{
    try{ await browser.close(); }catch(e){}
    site.close();
  }
  R.done();
})();
