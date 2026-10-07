/* =====================================================================
   첫 화면(동의·로그인)의 결과 예시 · 카드가 흐려 보이지 않는가 (느린 층)
   ---------------------------------------------------------------------
   2026-10-07 대표님 지시(이음·귀인지도 비교 → "그대로해").
   ① 로그인 전에도 결과가 어떻게 생겼는지 보이게 — 모임 관계 그림을 지어낸 네 사람으로 그린다
   ② 동의 전 카드가 흐리게(opacity .55) 보여 누를 수 있는지 모르던 것 → 흐림을 걷는다
   2026-10-07 대표님 "광고인데 실제 화면에서 설명글이 있으면 안돼" — 상자 안 설명글 0을 본다.
   2026-10-07 대표님 "예시란 말도 캐릭터가 정해진다는 말도 필요없을듯" — 표식·캐릭터 안내 줄도 없어야 한다.
   보는 것: 그림만 · 이름표 6개가 다 놓임 · 등급 다섯이 다 나옴(계산으로 낸 값)
          · 사람을 누르면 나머지가 흐려지고 다시 누르면 돌아옴 · 카드 opacity 1
          · 320·390 가로 넘침 0 · JS 오류 0 · 이름표 점수가 진짜 계산(computeCompat)과 같다 */
const L = require('../_lib.cjs');
const wait = L.wait;

(async () => {
  const R = L.reporter('첫 화면 결과 예시');
  const srv = await L.serve(L.ROOT, 0);
  const browser = await L.puppeteer().launch({executablePath: L.chromePath(), headless:'new', args:['--no-sandbox']});
  try{
    for(const w of [320, 390]){
      const p = await L.openPage(browser, {hook:true, width:w, height:844,
        state: L.makeState({onboarded:false, profiles:[], activeId:null})});
      await p.goto(srv.url + '/fortune.html', {waitUntil:'networkidle0'}); await wait(900);
      const r = await p.evaluate(function(){
        var box = document.querySelector('.onb-sample');
        var tags = box ? [].slice.call(box.querySelectorAll('.gc-tag'))
          .filter(function(t){ return t.style.visibility==='visible'; }).map(function(t){ return t.textContent; }) : [];
        var card = document.querySelector('.onboard .svc-card');
        /* 진짜 계산과 대조 — 예시 점수를 손으로 적지 않았는지 */
        var H = window.__INYEON_TEST__, ms = H.ONB_SAMPLE_ROWS.map(function(x,i){ return H.gcMemberFromMeetRow(x,i); });
        var tiers = {};
        for(var i=0;i<ms.length;i++) for(var j=i+1;j<ms.length;j++){
          tiers[H.computeCompat(ms[i].person, ms[j].person, 'friend').combinedTier] = 1;
        }
        var extra = '';
        if(box){ var cl = box.cloneNode(true);
          [].slice.call(cl.querySelectorAll('.gc-label,.gc-tag')).forEach(function(x){ x.remove(); });
          extra = cl.textContent.replace(/\s+/g,''); }
        return {extra: extra, has: !!box, cards: [].slice.call(document.querySelectorAll('.onboard .svc-title')).map(function(x){ return x.textContent; }).join('|'), titleLines: [].slice.call(document.querySelectorAll('.onboard .svc-title')).map(function(x){ var lh=parseFloat(getComputedStyle(x).lineHeight)||20; return Math.round(x.getBoundingClientRect().height/lh); }), noNote: !/캐릭터가 정해져요/.test(document.querySelector('.onboard').textContent), tags: tags,
          calcTiers: Object.keys(tiers).sort(),
          cardOpacity: card ? getComputedStyle(card).opacity : null,
          over: document.documentElement.scrollWidth - document.documentElement.clientWidth};
      });
      R.note(r.has, w+' — 예시 그림이 있다');
      R.note(r.noNote, w+' — 캐릭터가 정해진다는 안내 줄이 없다');
      R.note(r.tags.length === 6, w+' — 이름표 6개가 전부 그림에 놓였다', r.tags.join(','));
      R.note(r.calcTiers.length === 5, w+' — 계산으로 낸 등급이 다섯 가지 다 나온다', r.calcTiers.join(','));
      R.note(r.tags.slice().sort().filter(function(t,i,a){ return a.indexOf(t)===i; }).join() === r.calcTiers.join(),
        w+' — 그림의 이름표가 계산 결과와 같다');
      R.note(r.cards === '타인과 인연 점수 확인하기|내 사주 × 성격유형 풀이 보기', w+' — 카드 순서·이름(궁합 카드가 위)', r.cards);
      R.note(r.titleLines.every(function(h){ return h <= 1; }), w+' — 카드 제목이 한 줄에 들어간다', r.titleLines.join(','));
      R.note(r.cardOpacity === '1', w+' — 동의 전에도 카드가 흐리지 않다', r.cardOpacity);
      R.note(r.over <= 0, w+' — 가로 넘침 없음', String(r.over));
      R.note(r.extra === '', w+' — 예시 상자 안에 글이 없다(이름·등급만 · 「예시」 표식도 없음)', r.extra);
      if(w === 390){
        /* 사람을 누르면 나머지가 흐려지고, 다시 누르면 돌아온다 */
        const nodes = await p.$$('.onb-sample .gc-node');
        if(!nodes.length){ R.bad('예시 그림의 사람을 눌러 볼 수 없다(그림 없음)'); }
        else {
        await nodes[0].click(); await wait(300);
        const dim1 = await p.evaluate(function(){ return document.querySelectorAll('.onb-sample .gc-node.dim').length; });
        await nodes[0].click(); await wait(300);
        const dim2 = await p.evaluate(function(){ return document.querySelectorAll('.onb-sample .gc-node.dim').length; });
        R.note(dim1 === 3 && dim2 === 0, '사람을 누르면 나머지 셋이 흐려지고 다시 누르면 돌아온다', dim1+'→'+dim2);
        }
        /* 동의 전 카드를 누르면 넘어가지 않고 동의 줄을 알린다(흐림을 걷어도 막는 것은 그대로) */
        const before = await p.evaluate(function(){ return location.href; });
        await p.evaluate(function(){ document.querySelector('.onboard .svc-card').click(); }); await wait(500);
        const after = await p.evaluate(function(){ return {href:location.href, nudge: !!document.querySelector('.chk-nudge')}; });
        R.note(after.href === before && after.nudge, '동의 전 카드를 누르면 안 넘어가고 동의 줄을 깜빡인다');
      }
      R.note(p.__errs.length === 0, w+' — JS 오류 0', p.__errs.join(' | '));
      await p.close();
    }
  } finally {
    await browser.close(); srv.close();
  }
  R.done();
})();
