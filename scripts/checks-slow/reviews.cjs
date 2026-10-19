/* =====================================================================
   후기 (느린 층) — 2026-10-19 대표님 "3) 후기 해라"
   ① 결제한 성격유형 풀이 끝에 후기 칸 · 별점·한 줄을 눌러 남기면 서버로 간다 · 남긴 뒤 '확인 중'
   ② 공개 후기가 있으면 잠금 카드(사주) 결제 단추 위에 보인다 · 없으면 아무것도 안 보인다
   ③ 결제 안 한 상품에는 후기 칸이 없다 ④ 후기 칸은 [글 전체 복사]에 안 들어간다 ⑤ JS 오류 0
===================================================================== */
const L = require('../_lib.cjs');
const wait = L.wait;
(async () => {
  const R = L.reporter('후기');
  const srv = process.argv[2] ? {url:process.argv[2], close(){}} : await L.serve(L.ROOT, 0);
  const browser = await L.puppeteer().launch({executablePath: L.chromePath(), headless:'new', args:['--no-sandbox']});
  const errs = [];
  const sent = [];
  async function open(pub){
    const p = await L.openPage(browser, {hook:true, width:390, height:900, state: L.makeState()});
    p.on('pageerror', e => errs.push(String(e)));
    await p.setRequestInterception(true);
    p.on('request', function(req){
      const u = req.url();
      const j = o => req.respond({status:200, contentType:'application/json', body:JSON.stringify(o)});
      if(u.indexOf('/api/entitlements') >= 0)
        return j({items:{mbti_full:{purchasedAt:Date.now()}}, pass:null, purchases:[], testAccess:false, adminAccess:false, testPayment:false});
      if(u.indexOf('/api/review') >= 0){
        const b = JSON.parse(req.postData() || '{}'); sent.push(b);
        if(b.action === 'mine') return j({canWrite:true, mine:null, ready:true});
        if(b.action === 'write') return j({ok:true});
        if(b.action === 'public') return j(pub && b.product === 'saju_full'
          ? {items:[{stars:5, text:'어린 시절 얘기가 딱 맞았어요', nick:'가*', at:'2026-10-19'}], sum:{n:1, avg:5}}
          : {items:[], sum:{n:0, avg:0}});
      }
      if(u.indexOf('/api/interpret') >= 0){
        const titles = JSON.parse(req.postData()||'{}').payload.requested.sectionTitles;
        const txt = titles.map(t => '##' + t + '\n이 장의 본문이에요. 시험 글입니다.').join('\n');
        return req.respond({status:200, contentType:'text/event-stream',
          body: 'data: ' + JSON.stringify({type:'delta', text: txt}) + '\n\n' + 'data: ' + JSON.stringify({type:'done'}) + '\n\n'});
      }
      if(u.indexOf('/api/content') >= 0) return req.respond({status:500, contentType:'application/json', body:'{}'});
      req.continue();
    });
    await p.goto(srv.url + '/fortune.html', {waitUntil:'networkidle0'}); await wait(800);
    return p;
  }
  try{
    let p = await open(true);
    await p.evaluate(function(){ window.__INYEON_TEST__.goRoute('mbtiReport'); }); await wait(3000);
    const box = await p.evaluate(function(){ var b = document.querySelector('#main .rv-box'); return b && b.style.display !== 'none' ? b.innerText : null; });
    R.note(!!box && /이 풀이, 어떠셨어요/.test(box), '① 결제한 풀이 끝에 후기 칸', String(box).slice(0,60));
    await p.evaluate(function(){ var s = document.querySelectorAll('#main .rv-star'); s[3].scrollIntoView({block:'center', behavior:'instant'}); });
    const st = await p.evaluate(function(){ var r = document.querySelectorAll('#main .rv-star')[3].getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}; });
    await p.mouse.click(st.x, st.y); await wait(200);
    await p.evaluate(function(){ var t = document.querySelector('#main .rv-input'); t.focus(); });
    await p.keyboard.type('나를 잘 아는 것 같아요');
    await p.evaluate(function(){ [].slice.call(document.querySelectorAll('#main .rv-box button')).filter(function(b){ return /후기 남기기/.test(b.textContent); })[0].click(); });
    await wait(600);
    const w = sent.filter(b => b.action === 'write')[0];
    R.note(w && w.product === 'mbti_full' && w.stars === 4 && /나를 잘 아는/.test(w.text), '① 별 넷 + 한 줄이 서버로 간다', JSON.stringify(w));
    const after = await p.evaluate(function(){ var b = document.querySelector('#main .rv-box'); return b ? b.innerText : ''; });
    R.note(/확인 중이에요/.test(after) && /★★★★☆/.test(after), "① 남긴 뒤 '확인 중' + 내 별점", after.slice(0,80));
    const copy = await p.evaluate(function(){ return window.__INYEON_TEST__.screenTextForCopy(); });
    R.note(!/어떠셨어요|후기 남기기|확인 중이에요/.test(copy), '④ 후기 칸은 복사본에 안 들어간다');
    /* ② 잠긴 사주 풀이 — 공개 후기 */
    await p.evaluate(function(){ window.__INYEON_TEST__.goRoute('report13'); }); await wait(2500);
    const pub = await p.evaluate(function(){ var b = document.querySelector('#main .locked-block .rv-pub'); return b && b.style.display !== 'none' ? b.innerText : null; });
    R.note(!!pub && /가\*/.test(pub) && /후기 1개/.test(pub), '② 공개 후기가 결제 단추 위에 보인다', String(pub));
    const order = await p.evaluate(function(){ var c = document.querySelector('#main .locked-cta'); var a = c.querySelector('.rv-pub'), b = c.querySelector('.btn-buy');
      return a && b ? !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) : false; });
    R.note(order, '② 후기가 결제 단추보다 위');
    const noBox = await p.evaluate(function(){ var b = document.querySelector('#main .rv-box'); return !b || b.style.display === 'none'; });
    R.note(noBox, '③ 결제 안 한 사주 풀이에는 후기 칸이 없다');
    await p.close();
    /* 공개 후기가 없으면 아무것도 안 보인다 */
    p = await open(false);
    await p.evaluate(function(){ window.__INYEON_TEST__.goRoute('report13'); }); await wait(2500);
    const none = await p.evaluate(function(){ var b = document.querySelector('#main .locked-block .rv-pub'); return !b || b.style.display === 'none'; });
    R.note(none, '② 공개 후기가 없으면 아무것도 안 보인다');
    const over = await p.evaluate(function(){ return document.documentElement.scrollWidth > document.documentElement.clientWidth; });
    R.note(!over, '가로 넘침 없음');
    await p.close();
    R.note(errs.length === 0, '⑤ JS 오류 0건', errs.slice(0,2).join(' | '));
  }catch(e){ R.note(false, '검사 자체가 터졌습니다: ' + e.message); }
  await browser.close(); srv.close();
  process.exit(R.done() ? 0 : 1);
})();
