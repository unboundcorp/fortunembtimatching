/* =====================================================================
   스스로 그룹 나가기 — 화면을 실제로 띄워 눌러 본다 (느린 층)
   ---------------------------------------------------------------------
   2026-09-09 대표님 지시 "내가 스스로 그룹 못나가?"

   ★ 진짜 서버에 대고 재지 않는다. /api/group 을 가로채 흉내 낸다 —
     검사 때문에 실제 그룹이 만들어지거나 지워지면 안 된다.
   ★ 명단 한 줄을 만드는 규칙(gcMeetRow)을 여기 베껴 적지 않는다.
     화면의 검사 통로(window.__INYEON_TEST__)에서 그대로 불러 쓴다 —
     베껴 적으면 규칙이 바뀔 때 한쪽만 고쳐져 검사가 거짓으로 통과한다.
   ★ 확인하는 것 셋: ① 내 줄이 없으면 단추가 안 나온다 ② 있으면 나오고,
     누르면 서버에 **내 줄 그대로** 간다 ③ 나간 뒤 저장 목록에서도 빠진다.
===================================================================== */
const { chromePath, puppeteer, serve, reporter, openPage, wait, clickText, ROOT, STORAGE_KEY }
  = require('../_lib.cjs');

const GID = 'testgroup123';
const R = reporter('그룹 나가기(화면)');

(async function(){
  const pptr = puppeteer(), chrome = chromePath();
  if(!pptr || !chrome){ console.log('크롬을 못 찾았습니다 — 건너뜁니다'); process.exit(0); }

  const base = process.argv[2];
  const site = base ? {url:base, close:function(){}} : await serve(ROOT, 0);
  const browser = await pptr.launch({executablePath: chrome, headless:'new',
    args:['--no-sandbox','--disable-dev-shm-usage']});

  try{
    /* 서버 흉내 — members 는 시험 중에 바꿔 끼운다 */
    let roster = '';
    let leaveBody = null;

    async function page(){
      const p = await openPage(browser, {hook:true});
      await p.setRequestInterception(true);
      p.on('request', function(req){
        const u = req.url();
        if(u.indexOf('/api/group') >= 0){
          let body = {};
          try{ body = JSON.parse(req.postData() || '{}'); }catch(e){}
          if(body.action === 'get'){
            return req.respond({status:200, contentType:'application/json',
              body: JSON.stringify({name:'검사 모임', members:roster, ttlDays:365})});
          }
          if(body.action === 'leave'){
            leaveBody = body;
            const rows = String(roster).split(';').filter(Boolean);
            const i = rows.indexOf(body.member);
            if(i < 0) return req.respond({status:404, contentType:'application/json',
              body: JSON.stringify({ok:false, reason:'이 그룹 명단에서 회원님을 찾지 못했어요.'})});
            rows.splice(i,1); roster = rows.join(';');
            return req.respond({status:200, contentType:'application/json',
              body: JSON.stringify({ok:true, emptied:!roster, members:roster})});
          }
          return req.respond({status:400, contentType:'application/json', body:'{}'});
        }
        req.continue();
      });
      await p.goto(site.url + '/fortune.html', {waitUntil:'domcontentloaded'});
      await wait(900);
      return p;
    }

    /* 그룹을 연 뒤 '어떤 사이인가요'가 뜨면 고른다 — 고르기 전에는 결과 화면 자체가 안 그려진다.
       ★ 이걸 빠뜨렸다가 "단추가 안 보인다"로 잘못 실패했다. 검사기가 화면 흐름을 다 밟아야 한다. */
    async function openGroup(p){
      await p.evaluate(function(g){ window.__INYEON_TEST__.openSavedGroup(g); }, GID);
      await wait(1500);
      const need = await p.evaluate(function(){
        return document.body.innerText.indexOf('이 모임은 어떤 사이인가요') >= 0;
      });
      if(need){ await clickText(p, /^친구$/); await wait(900); }
      return need;
    }

    /* ── 줄 두 개를 화면의 규칙으로 직접 만든다 ─────────────────── */
    let p = await page();
    const rows = await p.evaluate(function(){
      const T = window.__INYEON_TEST__;
      if(!T || !T.gcMeetRow || !T.activeProfile) return null;
      const me = T.activeProfile();
      if(!me) return null;
      return { mine: T.gcMeetRow(me),
               other: T.gcMeetRow(Object.assign({}, me, {name:'다른사람', mbti:'ISTJ'})),
               third: T.gcMeetRow(Object.assign({}, me, {name:'또다른분', mbti:'INFJ', year:1988})) };
    });
    R.head('── 준비');
    if(!rows || !rows.mine || !rows.other || !rows.third){
      R.bad('명단 한 줄을 만드는 통로(gcMeetRow)를 열지 못함');
      await browser.close(); site.close(); R.done(); return;
    }
    R.ok('명단 줄 세 개를 화면 규칙으로 만들었다', rows.mine.slice(0,24) + '…');
    R.note(rows.mine !== rows.other && rows.mine !== rows.third, '세 줄이 서로 다르다');
    await p.close();

    /* ── ① 내 줄이 없는 그룹 — 단추가 나오면 안 된다 ────────────── */
    R.head('── ① 내가 명단에 없을 때');
    /* 두 명으로 둔다. 한 명뿐인 그룹은 결과 화면 자체가 안 그려져서
       "단추가 없다"가 언제나 참이 된다 — 그건 검사가 아니라 **거짓 통과**다.
       실제로 단추 조건을 일부러 if(true)로 고장 냈을 때 한 명짜리로는 안 걸렸다. */
    roster = rows.other + ';' + rows.third;
    p = await page();
    await openGroup(p);
    let txt = await p.evaluate(function(){ return document.body.innerText; });
    R.note(txt.indexOf('검사 모임') >= 0 || txt.indexOf('이 그룹 주소') >= 0,
           '그룹 화면이 열렸다');
    R.note(txt.indexOf('이 그룹에서 나가기') < 0, '나가기 단추가 안 보인다');
    R.note((p.__errs||[]).length === 0, 'JS 오류 0건', (p.__errs||[]).join(' | ') || '없음');
    await p.close();

    /* ── ② 내 줄이 있는 그룹 — 단추가 나오고 실제로 나간다 ──────── */
    R.head('── ② 내가 명단에 있을 때');
    roster = rows.mine + ';' + rows.other;
    leaveBody = null;
    p = await page();
    R.note(await openGroup(p), '사이를 먼저 고르게 한다 (모임 규칙 그대로)');
    txt = await p.evaluate(function(){ return document.body.innerText; });
    R.note(txt.indexOf('이 그룹에서 나가기') >= 0, '나가기 단추가 보인다');

    const savedBefore = await p.evaluate(function(k){
      try{ return (JSON.parse(localStorage.getItem(k)||'{}').savedGroups||[]).length; }catch(e){ return -1; }
    }, STORAGE_KEY);
    R.note(savedBefore >= 1, '열어 본 그룹이 저장 목록에 들어갔다', savedBefore + '개');

    const hit = await clickText(p, /이 그룹에서 나가기/);
    await wait(400);
    let modal = await p.evaluate(function(){
      const m = document.querySelector('.modal-box');
      return m ? m.innerText : '';
    });
    R.note(!!hit, '단추를 눌렀다');
    R.note(/나갈까요/.test(modal), '먼저 물어본다 (바로 안 지운다)', modal.slice(0,40).replace(/\n/g,' '));

    await clickText(p, /^나가기$/);
    await wait(1200);
    R.note(!!leaveBody && leaveBody.action === 'leave', "서버에 action:'leave' 가 갔다");
    R.note(!!leaveBody && leaveBody.groupId === GID, '그룹 주소가 함께 갔다');
    R.note(!!leaveBody && leaveBody.member === rows.mine,
           '보낸 줄이 **내 줄** 그대로다 (남의 줄이 아니다)');
    R.note(roster === rows.other, '서버 명단에서 내 줄만 빠졌다', roster === rows.other ? '' : roster);

    txt = await p.evaluate(function(){ return document.body.innerText; });
    R.note(txt.indexOf('이 그룹 주소') < 0, '그룹 화면에서 빠져나왔다');

    const savedAfter = await p.evaluate(function(k){
      try{ return (JSON.parse(localStorage.getItem(k)||'{}').savedGroups||[])
        .filter(function(g){ return g && g.id === 'testgroup123'; }).length; }catch(e){ return -1; }
    }, STORAGE_KEY);
    R.note(savedAfter === 0, '내 저장 목록에서도 빠졌다');

    const tomb = await p.evaluate(function(k){
      try{ return (JSON.parse(localStorage.getItem(k)||'{}').deletedGroups||[])
        .some(function(x){ return x && x.id === 'testgroup123'; }); }catch(e){ return false; }
    }, STORAGE_KEY);
    R.note(tomb, '묘비를 남겼다 (다른 기기에서 되살아나지 않는다)');
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
