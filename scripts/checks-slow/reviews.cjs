/* =====================================================================
   후기 (느린 층) — 2026-10-19 대표님 "3) 후기 해라"
   ① 결제한 성격유형 풀이 끝에 후기 칸 · 별점·한 줄을 눌러 남기면 서버로 간다 · 남긴 뒤 '확인 중'
   ② 공개 후기가 있으면 잠금 카드(사주) 결제 단추 위에 보인다 · 없으면 아무것도 안 보인다
   ③ 결제 안 한 상품에도 후기 칸이 있다(2026-10-21) ④ 후기 칸은 [글 전체 복사]에 안 들어간다 ⑤ JS 오류 0
===================================================================== */
const L = require('../_lib.cjs');
const wait = L.wait;
(async () => {
  const R = L.reporter('후기');
  const srv = process.argv[2] ? {url:process.argv[2], close(){}} : await L.serve(L.ROOT, 0);
  const browser = await L.puppeteer().launch({executablePath: L.chromePath(), headless:'new', args:['--no-sandbox']});
  const errs = [];
  const sent = [];
  const ADMIN_ROWS = [{id:7, product:'saju_full', stars:5, body:'딱 맞았어요', nick:'가*', status:'public', bought:true, tester:false, updated_at:'2026-10-19T00:00:00Z', reply:null},
                      {id:8, product:'mbti_full', stars:4, body:'재밌어요', nick:'나*', status:'pending', bought:false, tester:false, updated_at:'2026-10-20T00:00:00Z', reply:'고마워요'}];
  async function open(pub, admin){
    const p = await L.openPage(browser, {hook:true, width:admin ? 1280 : 390, height:900, state: L.makeState()});
    p.on('pageerror', e => errs.push(String(e)));
    await p.setRequestInterception(true);
    p.on('request', function(req){
      const u = req.url();
      const j = o => req.respond({status:200, contentType:'application/json', body:JSON.stringify(o)});
      if(u.indexOf('/api/entitlements') >= 0)
        return j({items:{mbti_full:{purchasedAt:Date.now()}}, pass:null, purchases:[], testAccess:false, adminAccess:!!admin, testPayment:false});
      if(u.indexOf('/api/review') >= 0){
        const b = JSON.parse(req.postData() || '{}'); sent.push(b);
        if(b.action === 'mine') return j({canWrite:true, mine:null, ready:true});
        if(b.action === 'write') return j({ok:true});
        if(b.action === 'list') return j({items:ADMIN_ROWS, ready:true});
        if(b.action === 'reply') return j({ok:true, reply:String(b.text||'').trim() || null});
        if(b.action === 'set') return j({ok:true});
        if(b.action === 'public') return j(pub && b.product === 'saju_full'
          ? {items:[{stars:5, text:'어린 시절 얘기가 딱 맞았어요', nick:'가*', bought:true, at:'2026-10-19', reply:'남겨 주셔서 고마워요'},{stars:4, text:'무료 부분도 재밌어요', nick:'나*', bought:false, at:'2026-10-20'}], sum:{n:2, avg:4.5}}
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
    await p.goto(srv.url + '/fortune.html' + (admin ? '#admin' : ''), {waitUntil:'networkidle0'}); await wait(admin ? 2500 : 800);
    return p;
  }
  try{
    let p = await open(true);
    await p.evaluate(function(){ window.__INYEON_TEST__.goRoute('mbtiReport'); }); await wait(3000);
    /* ★ 2026-10-21 — 화면 끝 깔린 칸 대신 카드 저장 아래 [후기 남기기] 단추 → 창 */
    const inline = await p.evaluate(function(){ return document.querySelectorAll('#main .rv-box').length; });
    R.note(inline === 0, '① 화면에 후기 칸을 따로 깔지 않는다(단추 하나)', inline);
    const order1 = await p.evaluate(function(){ var b = document.querySelector('#main .rv-open'); var c = [].slice.call(document.querySelectorAll('#main button')).filter(function(x){ return /요약 카드로 저장하기/.test(x.textContent); })[0];
      return !!(b && c && (c.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)); });
    R.note(order1, '① [후기 남기기]가 카드 저장 단추 아래');
    await p.evaluate(function(){ var b = document.querySelector('#main .rv-open'); b.scrollIntoView({block:'center', behavior:'instant'}); });
    const ob = await p.evaluate(function(){ var r = document.querySelector('#main .rv-open').getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}; });
    await p.mouse.click(ob.x, ob.y); await wait(700);
    const box = await p.evaluate(function(){ var b = document.querySelector('.modal-box .rv-box'); return b && b.style.display !== 'none' ? (document.querySelector('.modal-box').innerText) : null; });
    R.note(!!box && /어떠셨어요/.test(box) && /후기 남기기/.test(box), '① 누르면 별점·한 줄 창', String(box).slice(0,60));
    const st = await p.evaluate(function(){ var r = document.querySelectorAll('.modal-box .rv-star')[3].getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}; });
    await p.mouse.click(st.x, st.y); await wait(200);
    await p.evaluate(function(){ var t = document.querySelector('.modal-box .rv-input'); t.focus(); });
    await p.keyboard.type('나를 잘 아는 것 같아요');
    await p.evaluate(function(){ [].slice.call(document.querySelectorAll('.modal-box .rv-box button')).filter(function(b){ return /후기 남기기/.test(b.textContent); })[0].click(); });
    await wait(600);
    const w = sent.filter(b => b.action === 'write')[0];
    R.note(w && w.product === 'mbti_full' && w.stars === 4 && /나를 잘 아는/.test(w.text), '① 별 넷 + 한 줄이 서버로 간다', JSON.stringify(w));
    const after = await p.evaluate(function(){ var b = document.querySelector('.modal-box .rv-box'); return b ? b.innerText : ''; });
    await p.keyboard.press('Escape'); await wait(400);
    R.note(/확인 중이에요/.test(after) && /★★★★☆/.test(after), "① 남긴 뒤 '확인 중' + 내 별점", after.slice(0,80));
    const copy = await p.evaluate(function(){ return window.__INYEON_TEST__.screenTextForCopy(); });
    R.note(!/어떠셨어요|후기 남기기|확인 중이에요/.test(copy), '④ 후기 단추는 복사본에 안 들어간다', (copy.match(/.{0,20}후기.{0,20}/)||[''])[0]);
    /* ② 잠긴 사주 풀이 — 공개 후기 */
    await p.evaluate(function(){ window.__INYEON_TEST__.goRoute('report13'); }); await wait(2500);
    const pub = await p.evaluate(function(){ var b = document.querySelector('#main .locked-block .rv-pub'); return b && b.style.display !== 'none' ? b.innerText : null; });
    R.note(!!pub && /가\*/.test(pub) && /후기 2개/.test(pub) && !/구매한 분 후기/.test(pub), '② 공개 후기가 결제 단추 위에 보인다', String(pub));
    const rep = await p.evaluate(function(){ return [].slice.call(document.querySelectorAll('#main .locked-block .rv-pub .rv-reply')).map(function(x){ return x.innerText; }); });
    R.note(rep.length === 1 && /인연점/.test(rep[0]) && /남겨 주셔서 고마워요/.test(rep[0]), '⑦ 운영자 답글이 그 후기 바로 아래 「인연점」으로 (답글 있는 글에만)', JSON.stringify(rep));
    const tags = await p.evaluate(function(){ return [].slice.call(document.querySelectorAll('#main .locked-block .rv-pub-row')).map(function(r){ return !!r.querySelector('.rv-buy'); }); });
    R.note(tags.length === 2 && tags[0] === true && tags[1] === false, "② '구매' 표시는 산 분 글에만", JSON.stringify(tags));
    const order = await p.evaluate(function(){ var c = document.querySelector('#main .locked-cta'); var a = c.querySelector('.rv-pub'), b = c.querySelector('.btn-buy');
      return a && b ? !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) : false; });
    R.note(order, '② 후기가 결제 단추보다 위');
    const lockBtn = await p.evaluate(function(){ return !!document.querySelector('#main .rv-open'); });
    R.note(lockBtn, '③ 결제 안 한(잠긴) 사주 풀이에도 [후기 남기기]가 있다 (2026-10-21)');
    const dated = await p.evaluate(function(){ var r = document.querySelector('#main .locked-block .rv-pub-row'); return r ? r.innerText : ''; });
    R.note(/10월 19일/.test(dated), '② 공개 후기에 날짜', dated);
    /* 내 사주 화면 — 윗줄 [올해 월별 운세][내 사주 풀이 읽어보기] · 아래 [후기 남기기] */
    await p.evaluate(function(){ window.__INYEON_TEST__.goRoute('saju'); }); await wait(1500);
    const sj = await p.evaluate(function(){
      var row = [].slice.call(document.querySelectorAll('#main .btn-row')).filter(function(r){ return /월별 운세/.test(r.innerText) && /풀이 읽어보기/.test(r.innerText); })[0];
      var rv = document.querySelector('#main .rv-open');
      return {row: !!row, after: !!(row && rv && (row.compareDocumentPosition(rv) & Node.DOCUMENT_POSITION_FOLLOWING)), circle: /내 사주 풀이 읽어보기/.test([].slice.call(document.querySelectorAll('#main .circle-cta, #main .cta-circle')).map(function(x){return x.innerText;}).join(' ')), solo: [].slice.call(document.querySelectorAll('#main button')).some(function(b){ return /^\s*올해 월별 운세 보기\s*$/.test(b.textContent); })}; });
    R.note(sj.row && sj.after && !sj.solo, '⑥ 내 사주 — 윗줄 두 칸 · 아래 [후기 남기기] · 옛 [올해 월별 운세 보기] 줄 없음', JSON.stringify(sj));
    await p.close();
    /* 공개 후기가 없으면 아무것도 안 보인다 */
    p = await open(false);
    await p.evaluate(function(){ window.__INYEON_TEST__.goRoute('report13'); }); await wait(2500);
    const none = await p.evaluate(function(){ var b = document.querySelector('#main .locked-block .rv-pub'); return !b || b.style.display === 'none'; });
    R.note(none, '② 공개 후기가 없으면 아무것도 안 보인다');
    const over = await p.evaluate(function(){ return document.documentElement.scrollWidth > document.documentElement.clientWidth; });
    R.note(!over, '가로 넘침 없음');
    await p.close();
    /* ⑧ 관리자 [후기] — 답글 달기·고치기·지우기 */
    p = await open(false, true);
    await p.evaluate(function(){ var b = [].slice.call(document.querySelectorAll('#adminRoot .ad-nav')).filter(function(x){ return /^후기/.test(x.textContent.trim()); })[0]; if(b) b.click(); });
    await wait(1200);
    const ad0 = await p.evaluate(function(){ var t = document.querySelector('#adminRoot').innerText;
      return {reply:/고마워요/.test(t), btns:[].slice.call(document.querySelectorAll('#adminRoot .ad-link')).map(function(b){ return b.textContent.trim(); }).filter(function(x){ return /답글/.test(x); })}; });
    R.note(ad0.reply && ad0.btns.join(',') === '답글,답글 고치기', '⑧ 관리자 — 단 답글이 보이고 줄마다 [답글]/[답글 고치기]', JSON.stringify(ad0));
    await p.evaluate(function(){ [].slice.call(document.querySelectorAll('#adminRoot .ad-link')).filter(function(b){ return b.textContent.trim() === '답글'; })[0].click(); });
    await wait(300);
    await p.focus('#adminRoot .rv-admin-reply textarea'); await p.keyboard.type('찾아 주셔서 고마워요');
    await p.evaluate(function(){ [].slice.call(document.querySelectorAll('#adminRoot .rv-admin-reply button')).filter(function(b){ return /답글 저장/.test(b.textContent); })[0].click(); });
    await wait(700);
    const rp = sent.filter(b => b.action === 'reply');
    R.note(rp.length === 1 && rp[0].id === 7 && rp[0].text === '찾아 주셔서 고마워요', '⑧ [답글 저장] → 서버로 그 후기 번호와 글', JSON.stringify(rp));
    const ad1 = await p.evaluate(function(){ return {open:!!document.querySelector('#adminRoot .rv-admin-reply'), shown:/찾아 주셔서 고마워요/.test(document.querySelector('#adminRoot').innerText)}; });
    R.note(!ad1.open && ad1.shown, '⑧ 저장 뒤 편집 칸이 닫히고 답글이 표에 보인다', JSON.stringify(ad1));
    await p.evaluate(function(){ [].slice.call(document.querySelectorAll('#adminRoot .ad-link')).filter(function(b){ return b.textContent.trim() === '답글 고치기'; })[1].click(); });
    await wait(300);
    const pre = await p.evaluate(function(){ var t = document.querySelector('#adminRoot .rv-admin-reply textarea'); return t ? t.value : null; });
    R.note(pre === '고마워요', '⑧ [답글 고치기]는 원래 답글을 채워서 연다', pre);
    p.on('dialog', d => d.accept());
    await p.evaluate(function(){ [].slice.call(document.querySelectorAll('#adminRoot .rv-admin-reply button')).filter(function(b){ return /답글 지우기/.test(b.textContent); })[0].click(); });
    await wait(700);
    const rp2 = sent.filter(b => b.action === 'reply');
    R.note(rp2.length === 2 && rp2[1].id === 8 && rp2[1].text === '', '⑧ [답글 지우기] → 빈 글로 보냄', JSON.stringify(rp2[1]));
    await p.close();
    R.note(errs.length === 0, '⑤ JS 오류 0건', errs.slice(0,2).join(' | '));
  }catch(e){ R.note(false, '검사 자체가 터졌습니다: ' + e.message); }
  await browser.close(); srv.close();
  process.exit(R.done() ? 0 : 1);
})();
