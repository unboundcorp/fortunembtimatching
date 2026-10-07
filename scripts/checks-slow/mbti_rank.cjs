/* =====================================================================
   성격유형 화면 — 연애로·일로 잘 맞는 순위 1~10등 (느린 층)
   ---------------------------------------------------------------------
   2026-10-07 대표님 지시 "일로 잘맞는 mbti는 1-10등 연애로 잘맞는 mbti는 1-10등" → "만들어".
   보는 것: ① 일로 표가 대칭 · 최저 52 · 최고 84 · 모든 유형 1~10등에 같은 점수 없음
           ② 화면 연애 순위 = MBTI_MATRIX 정렬 10개 · 일로 순위 = MBTI_WORK_MATRIX 정렬 10개(점수까지)
           ③ 두 순위가 같지 않다 ④ 단추를 누르면 바뀐다 ⑤ 320·390 가로 넘침 0 · JS 오류 0 */
const L = require('../_lib.cjs');
const wait = L.wait;

(async () => {
  const R = L.reporter('성격유형 순위(연애·일)');
  const srv = process.argv[2] ? {url:process.argv[2], close(){}} : await L.serve(L.ROOT, 0);
  const browser = await L.puppeteer().launch({executablePath: L.chromePath(), headless:'new', args:['--no-sandbox']});
  const errs = [];
  try{
    for(const w of [390, 320]){
      const p = await L.openPage(browser, {hook:true, width:w, height:900, state: L.makeState()});
      p.on('pageerror', e => errs.push(String(e)));
      await p.goto(srv.url + '/fortune.html', {waitUntil:'networkidle0'}); await wait(800);
      if(w === 390){
        const t = await p.evaluate(function(){
          var H = window.__INYEON_TEST__, W = H.MBTI_WORK_MATRIX, T = Object.keys(W), v = [], asym = 0, tied = 0;
          T.forEach(function(a){ T.forEach(function(b){ v.push(W[a][b]); if(W[a][b] !== W[b][a]) asym++; });
            var top = T.map(function(b){ return W[a][b]; }).sort(function(x,y){ return y-x; }).slice(0,10);
            if(new Set(top).size < 10) tied++; });
          return {n:T.length, min:Math.min.apply(null,v), max:Math.max.apply(null,v), asym:asym, tied:tied};
        });
        R.note(t.n === 16 && t.asym === 0, '일로 표 — 16유형 · 대칭', JSON.stringify(t));
        R.note(t.min === 52 && t.max === 84, '일로 표 — 최저 52 · 최고 84(CLAUDE.md 와 같은 값)', t.min+'~'+t.max);
        R.note(t.tied === 0, '일로 표 — 모든 유형의 1~10등에 같은 점수가 없다', String(t.tied));
        /* 2026-10-07 대표님 "잘맞는 순위에 이유 한줄 간단히 써주자" — 16유형 × 두 순위 × 10줄 전부 이유가 있고, 한 목록에 같은 문장이 넷 이상 겹치지 않는다 */
        const rs = await p.evaluate(function(){
          var H = window.__INYEON_TEST__, T = Object.keys(H.MBTI_MATRIX), empty = 0, maxDup = 0, bad = [];
          ['love','work'].forEach(function(k){ var M = k==='work' ? H.MBTI_WORK_MATRIX : H.MBTI_MATRIX;
            T.forEach(function(me){
              var top = T.map(function(t){ return {t:t, v:M[me][t]}; }).sort(function(x,y){ return y.v-x.v || T.indexOf(x.t)-T.indexOf(y.t); }).slice(0,10);
              var c = {};
              top.forEach(function(x){ var r = H.mbtiFitReason(me, x.t, k); if(!r || /undefined|null/.test(r)){ empty++; bad.push(me+'-'+x.t); } c[r] = (c[r]||0)+1; });
              Object.keys(c).forEach(function(r){ if(c[r] > maxDup) maxDup = c[r]; });
            }); });
          return {empty:empty, maxDup:maxDup, bad:bad.slice(0,3)};
        });
        R.note(rs.empty === 0, '이유 — 320줄 전부 있다(빈칸·undefined 없음)', JSON.stringify(rs.bad));
        R.note(rs.maxDup <= 3, '이유 — 한 목록에서 같은 문장이 넷 이상 안 겹친다', String(rs.maxDup));
      }
      await p.evaluate(function(){ window.__INYEON_TEST__.goRoute('report'); }); await wait(900);
      async function read(){
        return p.evaluate(function(){
          return [...document.querySelectorAll('#main .fit-rank .fit-row')].map(function(r){
            return {t: r.querySelector('.fit-name b').textContent, v: parseInt(r.querySelector('.fit-score').textContent, 10), why: !!(r.querySelector('.fit-why') && r.querySelector('.fit-why').textContent.trim())}; });
        });
      }
      const expect = await p.evaluate(function(){
        var H = window.__INYEON_TEST__, me = H.profiles()[0].mbti, T = Object.keys(H.MBTI_MATRIX);
        function top(M){ return T.map(function(t){ return {t:t, v:M[me][t], why:true}; }).sort(function(x,y){ return y.v-x.v || T.indexOf(x.t)-T.indexOf(y.t); }).slice(0,10); }
        return {love: top(H.MBTI_MATRIX), work: top(H.MBTI_WORK_MATRIX)};
      });
      const love = await read();
      R.note(JSON.stringify(love) === JSON.stringify(expect.love), w+' — 연애 순위 10개가 표 그대로', love.map(function(x){ return x.t+x.v; }).join(' '));
      await p.evaluate(function(){ var b = document.querySelector('#main .fit-seg button[data-k="work"]'); if(b) b.click(); }); await wait(300);
      const work = await read();
      R.note(JSON.stringify(work) === JSON.stringify(expect.work), w+' — 일로 순위 10개가 표 그대로(단추를 누르면 바뀜)', work.map(function(x){ return x.t+x.v; }).join(' '));
      R.note(JSON.stringify(love) !== JSON.stringify(work), w+' — 두 순위가 같지 않다');
      const over = await p.evaluate(function(){
        var o = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        var bad = [...document.querySelectorAll('#main .fit-rank .fit-name, #main .fit-seg button')].filter(function(e){ return e.scrollWidth > e.clientWidth + 1; }).length;
        return {o:o, bad:bad};
      });
      R.note(over.o <= 0 && over.bad === 0, w+' — 가로 넘침 없음', JSON.stringify(over));
      if(w === 390) await p.screenshot({path: require('os').tmpdir() + '/mbti_rank.png'});
      await p.close();
    }
    R.note(errs.length === 0, 'JS 오류 0건', errs.slice(0,2).join(' / ') || '없음');
  } finally {
    await browser.close(); srv.close();
  }
  R.done();
})();
