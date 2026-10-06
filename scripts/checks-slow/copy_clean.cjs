/* =====================================================================
   [이 화면 글 전체 복사] — 읽을 글만 복사한다 (느린 층)
   ---------------------------------------------------------------------
   2026-10-06 대표님 지시 "UI상에서 있는 목차라든지 한자 복사는 필요 없는데 다 복사를 해버리네
   맥락에 맞게 필요한 말만 복사해라" · "도표도 이상하게 복사되니깐 해결해라"
   ① 목차 · 목차 안내 줄 · 장 번호 한자 · 'AI 해석' 딱지 · 화면 머리말이 복사본에 없다
   ② 본문(각 장 제목과 글)은 그대로 있다
   ③ AI 표는 '· 첫 칸 — 머리글: 값 · 머리글: 값' 한 줄씩
   ④ **굵게** 별표가 화면에도 복사본에도 없다(화면은 <b>)
   ⑤ 모임 쌍 카드 — '정인과의 궁합'(받침 조사) · '…필요해요. 성격유형으로는'(마침표 뒤 쉼표 없음) */
const L = require('../_lib.cjs');
const wait = L.wait;

(async () => {
  const R = L.reporter('글 전체 복사 정리');
  const srv = process.argv[2] ? {url:process.argv[2], close(){}} : await L.serve(L.ROOT, 0);
  const browser = await L.puppeteer().launch({executablePath: L.chromePath(), headless:'new', args:['--no-sandbox']});
  const errs = [];
  try{
    const p = await L.openPage(browser, {hook:true, width:390, height:900, state: L.makeState()});
    p.on('pageerror', e => errs.push(String(e)));
    await p.setRequestInterception(true);
    p.on('request', function(req){
      const u = req.url();
      if(u.indexOf('/api/entitlements') >= 0){
        return req.respond({status:200, contentType:'application/json',
          body: JSON.stringify({items:{mbti_full:{purchasedAt:Date.now()}}, pass:null, purchases:[], testAccess:false, adminAccess:false, testPayment:false})});
      }
      if(u.indexOf('/api/interpret') >= 0){
        const titles = JSON.parse(req.postData()||'{}').payload.requested.sectionTitles;
        const txt = titles.map(function(t, i){
          if(i === 1) return '##' + t + '\n둘째 장 본문이에요. **기다리는 시간에 이유를 붙이는 것**이 핵심이에요.\n| 자리 | 통하는 지점 | 어긋나는 지점 |\n|---|---|---|\n| 말투 | 둘 다 핵심만 말함 | 한쪽은 바로 |\n| 결정 | 근거를 따짐 | 순서가 다름 |\n표 다음 문장이에요.';
          return '##' + t + '\n이 장의 본문이에요. 시험 글입니다.';
        }).join('\n');
        const body = 'data: ' + JSON.stringify({type:'delta', text: txt}) + '\n\n' + 'data: ' + JSON.stringify({type:'done'}) + '\n\n';
        return req.respond({status:200, contentType:'text/event-stream', body: body});
      }
      if(u.indexOf('/api/content') >= 0) return req.respond({status:500, contentType:'application/json', body:'{}'});
      req.continue();
    });
    await p.goto(srv.url + '/fortune.html', {waitUntil:'networkidle0'}); await wait(800);
    await p.evaluate(function(){ window.__INYEON_TEST__.goRoute('mbtiReport'); });
    await wait(2500);
    const scr = await p.evaluate(function(){
      var m = document.querySelector('#main');
      return { text: m.innerText, bold: [...m.querySelectorAll('p b')].map(function(b){ return b.textContent; }), toc: !!m.querySelector('.toc-nav'), secNo: !!m.querySelector('.sec-no') };
    });
    R.note(scr.toc && scr.secNo, '화면에는 목차·장 번호가 그대로 있다(복사에서만 뺀다)');
    R.note(scr.bold.indexOf('기다리는 시간에 이유를 붙이는 것') >= 0 && scr.text.indexOf('**') < 0, '화면 — **굵게** 가 굵은 글씨로 그려지고 별표가 안 보인다', JSON.stringify(scr.bold));
    const c = await p.evaluate(function(){ return window.__INYEON_TEST__.screenTextForCopy(); });
    R.note(!/목차를 눌러/.test(c), '복사본 — 목차 안내 줄이 없다');
    R.note(!/[一二三四五六七八九十]/.test(c.replace(/\([^)]*\)/g,'')), '복사본 — 장 번호 한자가 없다', (c.match(/[一二三四五六七八九十]+/g)||[]).slice(0,3).join(','));
    R.note(!/AI 해석/.test(c) && !/계산 결과를 직접 읽고/.test(c), "복사본 — 'AI 해석' 딱지·설명이 없다");
    const tocLines = c.split('\n').filter(function(l){ return l && !/^■/.test(l); });
    const titleOnly = await p.evaluate(function(){ return [...document.querySelectorAll('#main .toc-nav a')].map(function(a){ return a.textContent.trim(); }); });
    const dup = titleOnly.filter(function(t){ return tocLines.indexOf(t) >= 0; });
    R.note(titleOnly.length > 5 && dup.length === 0, '복사본 — 목차 항목이 따로 줄로 안 나온다(장 제목은 ■ 줄로만)', '목차 ' + titleOnly.length + ' · 따로 나온 것 ' + dup.length);
    R.note((c.match(/^■ /gm)||[]).length >= 13 && /이 장의 본문이에요/.test(c), '복사본 — 장 제목과 본문은 그대로 있다', '■ ' + (c.match(/^■ /gm)||[]).length);
    R.note(/· 말투 — 통하는 지점: 둘 다 핵심만 말함 · 어긋나는 지점: 한쪽은 바로/.test(c) && /· 결정 — 통하는 지점: 근거를 따짐/.test(c), '복사본 — 표가 줄마다 머리글: 값 으로 나온다');
    R.note(c.indexOf('**') < 0 && /기다리는 시간에 이유를 붙이는 것이 핵심/.test(c), '복사본 — 별표 없이 글만');
    await p.close();

    /* ⑤ 모임 쌍 카드 */
    const q = await L.openPage(browser, {hook:true, width:390, height:900,
      state: L.makeState({savedGroups:[{id:'gC', name:'시험 모임', at:Date.now(), token:'t', n:2, rel:'friend', profileId:'p1', pchk:1, pair:0}]})});
    q.on('pageerror', e => errs.push(String(e)));
    let roster = null;
    await q.setRequestInterception(true);
    q.on('request', function(req){
      if(req.url().indexOf('/api/group') >= 0){
        if(roster) return req.respond({status:200, contentType:'application/json', body: JSON.stringify({name:'시험 모임', members:roster, ttlDays:365})});
        return req.respond({status:404, contentType:'application/json', body:'{}'});
      }
      req.continue();
    });
    await q.goto(srv.url + '/fortune.html', {waitUntil:'domcontentloaded'}); await wait(1200);
    roster = await q.evaluate(function(){
      var T = window.__INYEON_TEST__, a = T.profiles()[0];
      return T.gcMeetRow(a) + ';' + T.gcMeetRow(Object.assign({}, a, {name:'정인', mbti:'ISTJ', day:a.day+1})) + ';' + T.gcMeetRow(Object.assign({}, a, {name:'나래', mbti:'ESFP', year:a.year+3}));
    });
    await q.evaluate(function(){ window.__INYEON_TEST__.openSavedGroup('gC'); }); await wait(1800);
    const gt = await q.evaluate(function(){ return document.querySelector('#main').innerText; });
    R.note(/정인과의 궁합/.test(gt) && !/정인와의/.test(gt), "모임 쌍 — '정인과의 궁합'(받침 있는 이름은 '과')");
    R.note(/나래와의 궁합/.test(gt), "모임 쌍 — '나래와의 궁합'(받침 없는 이름은 '와')");
    R.note(!/[.!?]\s*,/.test(gt), "모임 쌍 — '필요해요.,' 처럼 마침표 뒤 쉼표가 없다", (gt.match(/.{8}[.!?]\s*,.{6}/)||[''])[0]);
    await q.close();
    R.note(errs.length === 0, 'JS 오류 0건', errs.slice(0,2).join(' / ') || '없음');
  } finally {
    await browser.close(); srv.close();
  }
  R.done();
})();
