/* =====================================================================
   '왜 N점인가요?' 가 눈에 띄게 움직이는가 (느린 층)
   ---------------------------------------------------------------------
   2026-10-07 대표님 "이거 모션효과 못넣냐? 그냥 다들 지나치네".
   ① 알약 단추 모양(바탕이 있음) ② 화면 밖에 있을 때는 아직 안 움직임 → 스크롤해 들어오면 .nudge
   ③ 움직임은 whyRing(물결) 세 번 ④ 펴면 멈춤 ⑤ 움직임 줄이기 설정이면 안 움직임
   ⑥ JS 오류 0. 궁합 결과는 '전에 본 궁합' 기록을 눌러 엽니다(guest_buttons.cjs 와 같은 방식). */
const L = require('../_lib.cjs');
const wait = L.wait;
const hist = [{id:'h1',date:'2026-09-21',profileId:'p1',relation:'friend',partnerName:'민수',partnerMbti:'ISTJ',partnerGender:'F',score:70,tier:'무난한 인연',
  inputs:{b:{name:'민수',mbti:'ISTJ',gender:'F',birth:{y:1992,m:7,d:20,hour:14,minute:0,lon:126.98,adjust:true}}}}];

async function openResult(browser, srv, reduce){
  const p = await L.openPage(browser, {hook:true, state: L.makeState({compatHistory: hist}), width:390, height:700});
  if(reduce) await p.emulateMediaFeatures([{name:'prefers-reduced-motion', value:'reduce'}]);
  await p.goto(srv.url + '/fortune.html', {waitUntil:'networkidle0'}); await wait(800);
  await p.evaluate(() => window.__INYEON_TEST__.goRoute('compat')); await wait(700);
  await p.evaluate(() => { const c = [...document.querySelectorAll('#main button')].find(e => /민수/.test(e.innerText || '')); if(c) c.click(); });
  await wait(1200);
  await p.evaluate(() => window.scrollTo(0, 0)); await wait(300);
  return p;
}
function state(){
  const w = document.querySelector('.gc-why'); if(!w) return null;
  const sm = w.querySelector('summary'), cs = getComputedStyle(sm);
  const r = w.getBoundingClientRect();
  return {nudge: w.classList.contains('nudge'), anim: cs.animationName, bg: cs.backgroundColor,
    inView: r.top < innerHeight && r.bottom > 0, open: w.open};
}

(async () => {
  const R = L.reporter("'왜 N점인가요?' 움직임");
  const srv = await L.serve(L.ROOT, 0);
  const browser = await L.puppeteer().launch({executablePath: L.chromePath(), headless:'new', args:['--no-sandbox']});
  try{
    const p = await openResult(browser, srv, false);
    const s0 = await p.evaluate(state);
    R.note(!!s0, '궁합 결과에 「왜 N점인가요?」가 있다');
    if(s0){
      R.note(s0.bg !== 'rgba(0, 0, 0, 0)', '알약 단추 모양(바탕색이 있다)', s0.bg);
      if(!s0.inView) R.note(!s0.nudge, '화면에 들어오기 전에는 아직 안 움직인다');
      else R.skip('화면 밖 상태', '첫 화면에 이미 보여서 잴 수 없음');
      await p.evaluate(() => document.querySelector('.gc-why').scrollIntoView({block:'center', behavior:'instant'}));
      await wait(500);
      const s1 = await p.evaluate(state);
      R.note(s1.nudge && s1.anim === 'whyRing', '화면에 들어오면 물결이 돈다', s1.anim);
      await p.evaluate(() => document.querySelector('.gc-why summary').click()); await wait(300);
      const s2 = await p.evaluate(state);
      R.note(s2.open && s2.anim === 'none', '펴면 움직임이 멈춘다', s2.anim);
      await p.screenshot({path: require('os').tmpdir() + '/why_nudge.png'});
    }
    R.note(p.__errs.length === 0, 'JS 오류 0', p.__errs.join(' | '));
    await p.close();

    const q = await openResult(browser, srv, true);
    await q.evaluate(() => { const w = document.querySelector('.gc-why'); if(w) w.scrollIntoView({block:'center', behavior:'instant'}); });
    await wait(500);
    const s3 = await q.evaluate(state);
    R.note(s3 && s3.anim === 'none', '움직임 줄이기 설정이면 안 움직인다', s3 && s3.anim);
    await q.close();
  } finally {
    await browser.close(); srv.close();
  }
  R.done();
})();
