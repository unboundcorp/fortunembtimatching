/* =====================================================================
   고민 고르기 (느린 층) — 2026-10-19 대표님 "그래 그대로 해라"
   ① 처음 만드는 풀이면 쓰기 전에 묻는다 · 묻는 동안 AI 를 안 부른다
   ② 고르면 요청서 situation 으로 간다 · 다시 열어도 같은 값(안 묻는다 → 저장 열쇠 그대로)
   ③ 건너뛰면 situation 없이 · 다시 안 묻는다
   ④ 이미 만든 풀이(made)면 묻지도 싣지도 않는다 · 서버가 made 를 안 주면(옛 서버) 묻지 않는다
   ⑤ JS 오류 0
===================================================================== */
const L = require('../_lib.cjs');
const wait = L.wait;
(async () => {
  const R = L.reporter('고민 고르기');
  const srv = process.argv[2] ? {url:process.argv[2], close(){}} : await L.serve(L.ROOT, 0);
  const browser = await L.puppeteer().launch({executablePath: L.chromePath(), headless:'new', args:['--no-sandbox']});
  const errs = [];
  async function open(made, state){
    const p = await L.openPage(browser, {hook:true, width:390, height:900, state: state || L.makeState()});
    p.__sent = [];
    p.on('pageerror', e => errs.push(String(e)));
    await p.setRequestInterception(true);
    p.on('request', function(req){
      const u = req.url();
      if(u.indexOf('/api/entitlements') >= 0){
        const o = {items:{mbti_full:{purchasedAt:Date.now()}}, pass:null, purchases:[], testAccess:false, adminAccess:false, testPayment:false};
        if(made) o.made = made;
        return req.respond({status:200, contentType:'application/json', body:JSON.stringify(o)});
      }
      if(u.indexOf('/api/review') >= 0) return req.respond({status:200, contentType:'application/json', body:'{"canWrite":false,"ready":false,"items":[]}'});
      if(u.indexOf('/api/interpret') >= 0){
        const b = JSON.parse(req.postData()||'{}'); p.__sent.push(b.payload);
        const txt = b.payload.requested.sectionTitles.map(t => '##' + t + '\n본문이에요.').join('\n');
        return req.respond({status:200, contentType:'text/event-stream',
          body: 'data: ' + JSON.stringify({type:'delta', text: txt}) + '\n\n' + 'data: ' + JSON.stringify({type:'done'}) + '\n\n'});
      }
      if(u.indexOf('/api/content') >= 0) return req.respond({status:500, contentType:'application/json', body:'{}'});
      req.continue();
    });
    await p.goto(srv.url + '/fortune.html', {waitUntil:'networkidle0'}); await wait(800);
    await p.evaluate(function(){ window.__INYEON_TEST__.goRoute('mbtiReport'); }); await wait(1500);
    return p;
  }
  const modalTitle = p => p.evaluate(function(){ var m = document.querySelector('.modal-box'); return m ? m.innerText.split('\n')[0] : ''; });
  const clickIn = (p, re) => p.evaluate(function(src){ var re = new RegExp(src);
    var b = [].slice.call(document.querySelectorAll('.modal-box button')).filter(function(x){ return re.test(x.textContent.trim()); })[0];
    if(b) b.click(); return !!b; }, typeof re === 'string' ? re : re.source);
  try{
    /* ① ② 고르기 */
    let p = await open([]);
    let t = await modalTitle(p);
    R.note(/하나만 물어볼게요/.test(t), '① 처음 만드는 풀이면 쓰기 전에 묻는다', t);
    R.note(p.__sent.length === 0, '① 묻는 동안 AI 를 안 부른다', p.__sent.length);
    await clickIn(p, '^연애 중$'); await clickIn(p, '^돈$'); await clickIn(p, '이대로 풀이 받기'); await wait(2500);
    const s1 = p.__sent[0] && p.__sent[0].situation;
    R.note(s1 && s1.love === '연애 중' && s1.focus === '돈', '② 고른 값이 요청서 situation 으로 간다', JSON.stringify(s1));
    const st = await p.evaluate(function(){ return JSON.stringify(window.__INYEON_TEST__.activeProfile().aiSituation || null); });
    R.note(/"mbti_full":\{"love":"dating","focus":"money"\}/.test(st), '② 프로필에 상품별로 적힌다', st);
    /* 같은 기기 다시 열기 — 저장된 상태로 새 창 */
    const saved = await p.evaluate(function(){ return localStorage.getItem('inyeonjeom.v2'); });
    await p.close();
    p = await L.openPage(browser, {hook:true, width:390, height:900});
    await p.close();
    const st2 = JSON.parse(saved);
    p = await open([], st2);
    t = await modalTitle(p); await wait(1500);
    R.note(!/하나만 물어볼게요/.test(t), '② 다시 열면 안 묻는다', t);
    R.note(p.__sent[0] && JSON.stringify(p.__sent[0].situation) === JSON.stringify(s1), '② 다시 열어도 같은 값(저장 열쇠 그대로)', JSON.stringify(p.__sent[0] && p.__sent[0].situation));
    await p.close();
    /* ③ 건너뛰기 */
    p = await open([]);
    await clickIn(p, '건너뛰기'); await wait(2500);
    R.note(p.__sent.length >= 1 && !('situation' in p.__sent[0]), '③ 건너뛰면 situation 없이 쓴다', JSON.stringify(p.__sent[0] && Object.keys(p.__sent[0])));
    await p.close();
    /* ④ 이미 만든 풀이 · 옛 서버 */
    p = await open(['mbti_full']); await wait(1500);
    t = await modalTitle(p);
    R.note(!/하나만 물어볼게요/.test(t) && p.__sent.length >= 1 && !('situation' in p.__sent[0]), '④ 이미 만든 풀이면 묻지도 싣지도 않는다', t);
    await p.close();
    p = await open(null); await wait(1500);
    t = await modalTitle(p);
    R.note(!/하나만 물어볼게요/.test(t) && p.__sent.length >= 1, '④ 서버가 made 를 안 주면 묻지 않는다', t);
    await p.close();
    R.note(errs.length === 0, '⑤ JS 오류 0건', errs.slice(0,2).join(' | '));
  }catch(e){ R.note(false, '검사 자체가 터졌습니다: ' + e.message); }
  await browser.close(); srv.close();
  process.exit(R.done() ? 0 : 1);
})();
