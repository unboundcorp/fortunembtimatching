/* =====================================================================
   모임 [내 정보 갱신] — 화면에서 실제로 눌러 본다 (느린 층)
   ---------------------------------------------------------------------
   2026-09-21 대표님 지시. 명단에 적힌 내 줄(옛 이름·옛 성격유형)이 지금 프로필과 다를 때
   ① 안내와 [내 정보 갱신]이 보이고 ② 무엇이 달라졌는지 적히고 ③ 누르면 먼저 묻고
   ④ 서버로 옛 줄·새 줄이 그대로 가고 ⑤ 화면이 새 줄로 바뀐다.
   그리고 ⑥ 내 줄이 그대로면 안내가 없고 ⑦ 태어난 정보가 같은 줄이 둘이면(쌍둥이) 짐작하지 않는다.
   ★ /api/group 은 가로채 흉내 낸다 — 진짜 서버에 시험 모임을 만들지 않는다. */
const { chromePath, puppeteer, serve, reporter, openPage, wait, clickText, ROOT } = require('../_lib.cjs');
const GID = 'refreshgroup1';
const R = reporter('모임 내 정보 갱신(화면)');

(async function(){
  const pptr = puppeteer(), chrome = chromePath();
  if(!pptr || !chrome){ console.log('크롬을 못 찾았습니다 — 건너뜁니다'); process.exit(0); }
  const base = process.argv[2];
  const site = base ? {url:base, close:function(){}} : await serve(ROOT, 0);
  const browser = await pptr.launch({executablePath: chrome, headless:'new', args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    let roster = '', refreshBody = null;
    async function page(){
      const p = await openPage(browser, {hook:true});
      await p.setRequestInterception(true);
      p.on('request', function(req){
        const u = req.url();
        if(u.indexOf('/api/group') >= 0){
          let body = {}; try{ body = JSON.parse(req.postData() || '{}'); }catch(e){}
          const J = (st, o) => req.respond({status:st, contentType:'application/json', body: JSON.stringify(o)});
          if(body.action === 'get') return J(200, {name:'검사 모임', members:roster, ttlDays:365});
          if(body.action === 'refresh'){
            refreshBody = body;
            const rows = String(roster).split(';').filter(Boolean);
            const i = rows.indexOf(body.member);
            if(i < 0) return J(404, {ok:false, reason:'이 그룹 명단에서 회원님을 찾지 못했어요.'});
            rows[i] = body.newMember; roster = rows.join(';');
            return J(200, {ok:true, members:roster});
          }
          return J(400, {});
        }
        req.continue();
      });
      await p.goto(site.url + '/fortune.html', {waitUntil:'domcontentloaded'});
      await wait(900);
      return p;
    }
    async function openGroup(p){
      await p.evaluate(function(g){ window.__INYEON_TEST__.openSavedGroup(g); }, GID);
      await wait(1500);
      const need = await p.evaluate(function(){ return document.body.innerText.indexOf('이 모임은 어떤 사이인가요') >= 0; });
      if(need){ await clickText(p, /^친구$/); await wait(900); }
    }
    const text = (p) => p.evaluate(function(){ return document.body.innerText; });

    let p = await page();
    const rows = await p.evaluate(function(){
      const T = window.__INYEON_TEST__; const me = T.activeProfile(); if(!me) return null;
      const otherType = me.mbti === 'ENFP' ? 'ISTJ' : 'ENFP';
      return { mine: T.gcMeetRow(me), myName: me.name, myType: me.mbti,
               stale: T.gcMeetRow(Object.assign({}, me, {name:'옛이름', mbti:otherType})),   /* 이름·성격유형만 다름 = 프로필을 고친 나 */
               twin:  T.gcMeetRow(Object.assign({}, me, {name:'쌍둥이', mbti:'INFJ'})),      /* 태어난 정보가 같은 또 한 줄 */
               other: T.gcMeetRow(Object.assign({}, me, {name:'다른사람', mbti:'ISTJ', day:(me.day === 1 ? 2 : 1)})) };
    });
    R.head('── 준비');
    if(!rows){ R.bad('명단 줄을 만들지 못함'); await browser.close(); site.close(); R.done(); return; }
    R.ok('줄 네 개를 화면 규칙으로 만들었다');
    await p.close();

    R.head('── ① 내 줄이 옛 정보로 적혀 있을 때');
    roster = rows.stale + ';' + rows.other; refreshBody = null;
    p = await page(); await openGroup(p);
    let txt = await text(p);
    R.note(txt.indexOf('이 모임에 적힌 내 정보가 지금 프로필과 달라요') >= 0, '안내가 보인다');
    R.note(txt.indexOf('내 정보 갱신') >= 0, '[내 정보 갱신] 단추가 보인다');
    R.note(txt.indexOf('닉네임: 옛이름 → ' + rows.myName) >= 0, '무엇이 달라졌는지 적는다 (닉네임)', txt.match(/닉네임: [^\n]*/) ? txt.match(/닉네임: [^\n]*/)[0] : '없음');
    R.note(new RegExp('성격유형: \\w+ → ' + rows.myType).test(txt), '무엇이 달라졌는지 적는다 (성격유형)');
    R.note(txt.indexOf('이 그룹에서 나가기') >= 0, '나가기 단추도 보인다 (태어난 정보로 내 자리를 찾음)');
    const idx = await p.evaluate(function(){ return window.__INYEON_TEST__.groupMyMemberIdx(); });
    R.note(idx === 0, '내 자리를 0번으로 찾는다', String(idx));
    R.note(!!(await clickText(p, /내 정보 갱신/)), '단추를 눌렀다');
    await wait(400);
    let modal = await p.evaluate(function(){ const m = document.querySelector('.modal-box'); return m ? m.innerText : ''; });
    R.note(/바꿀까요/.test(modal), '먼저 물어본다 (바로 안 바꾼다)', modal.slice(0,40).replace(/\n/g,' '));
    await clickText(p, /^갱신하기$/); await wait(1200);
    R.note(!!refreshBody && refreshBody.action === 'refresh', "서버에 action:'refresh' 가 갔다");
    R.note(!!refreshBody && refreshBody.groupId === GID, '그룹 주소가 함께 갔다');
    R.note(!!refreshBody && refreshBody.member === rows.stale, '옛 줄이 **서버가 준 원문 그대로** 갔다');
    R.note(!!refreshBody && refreshBody.newMember === rows.mine, '새 줄이 지금 프로필 줄이다');
    R.note(roster === rows.mine + ';' + rows.other, '서버 명단에서 내 줄만 바뀌고 다른 분 줄은 그대로다', roster === rows.mine + ';' + rows.other ? '' : roster);
    txt = await text(p);
    R.note(txt.indexOf('이 모임에 적힌 내 정보가 지금 프로필과 달라요') < 0, '갱신 뒤 안내가 사라진다');
    R.note(txt.indexOf('옛이름') < 0 && txt.indexOf(rows.myName) >= 0, '화면 명단이 새 이름으로 바뀐다');
    R.note((p.__errs||[]).length === 0, 'JS 오류 0건', (p.__errs||[]).join(' | ') || '없음');
    await p.close();

    R.head('── ② 내 줄이 그대로일 때');
    roster = rows.mine + ';' + rows.other; refreshBody = null;
    p = await page(); await openGroup(p); txt = await text(p);
    R.note(txt.indexOf('이 모임에 적힌 내 정보가 지금 프로필과 달라요') < 0 && txt.indexOf('내 정보 갱신') < 0, '안내·단추가 없다');
    R.note(txt.indexOf('이 그룹에서 나가기') >= 0, '나가기 단추는 그대로 보인다');
    await p.close();

    R.head('── ③ 태어난 정보가 같은 줄이 둘일 때 (짐작하지 않는다)');
    roster = rows.stale + ';' + rows.twin; refreshBody = null;
    p = await page(); await openGroup(p); txt = await text(p);
    const idx3 = await p.evaluate(function(){ return window.__INYEON_TEST__.groupMyMemberIdx(); });
    R.note(idx3 === -1, '내 자리를 정하지 않는다 (-1)', String(idx3));
    R.note(txt.indexOf('내 정보 갱신') < 0 && txt.indexOf('이 그룹에서 나가기') < 0, '갱신·나가기 단추가 모두 없다');
    R.note((p.__errs||[]).length === 0, 'JS 오류 0건', (p.__errs||[]).join(' | ') || '없음');
    await p.close();
  }catch(e){ R.bad('검사 중 예외', String(e && e.message).slice(0,160)); }
  await browser.close(); site.close(); R.done();
})();
