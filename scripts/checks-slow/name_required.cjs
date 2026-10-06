/* =====================================================================
   프로필 이름은 필수 · 이름 없이 들어온 모임 줄은 'null'로 안 찍힌다 (느린 층)
   ---------------------------------------------------------------------
   2026-10-06 대표님 사진 "최고 궁합: TEST × null" — "이름 의무 입력하게 바꿔라".
   ① 이름을 지우고 [수정 완료]를 누르면 저장되지 않는다
   ② 이름 없는 옛 프로필로 서비스 화면에 서면 이름을 묻는 창이 뜨고, 저장하면 들어간다
   ③ 모임 명단에 이름 없이 들어간 줄이 'null'이 아니라 '이름 없음'으로 보인다
   ★ /api/group 은 가로채 흉내 낸다. */
const L = require('../_lib.cjs');
const wait = L.wait;

(async () => {
  const R = L.reporter('프로필 이름 필수');
  const srv = await L.serve(L.ROOT, 0);
  const browser = await L.puppeteer().launch({executablePath: L.chromePath(), headless:'new', args:['--no-sandbox']});
  const errs = [];
  const stored = (p) => p.evaluate(function(){
    var st = {}; try{ st = JSON.parse(localStorage.getItem('inyeonjeom.v2')||'{}'); }catch(e){}
    return (st.profiles||[]).map(function(x){ return x.name; });
  });
  try{
    /* ── ① 수정에서 이름을 비우면 저장 안 됨 ── */
    let p = await L.openPage(browser, {state: L.makeState(), width:390, height:900});
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto(srv.url + '/fortune.html', {waitUntil:'networkidle0'}); await wait(1200);
    await L.clickText(p, /더보기/); await wait(400);
    await L.clickText(p, /^설정$/); await wait(600);
    await L.clickText(p, /검사 \(활성\)/); await wait(500);
    await L.clickText(p, /^정보 수정$/); await wait(800);
    await p.focus('#profNameTop');
    await p.evaluate(function(){ document.querySelector('#profNameTop').select(); });
    await p.keyboard.press('Backspace');
    await L.clickText(p, /^다음 ·/); await wait(600);
    await L.clickText(p, /^다음 ·/); await wait(900);
    await L.clickText(p, /^수정 완료$/); await wait(800);
    let names = await stored(p);
    const toast = await p.evaluate(function(){ return (document.querySelector('#toast')||{}).textContent||''; });
    R.note(names.indexOf('검사') > -1 && names.indexOf('') === -1, '이름을 비우면 저장되지 않는다(옛 이름 그대로)', JSON.stringify(names));
    R.note(/이름을 넣어/.test(toast), "'프로필 이름을 넣어 주세요' 알림이 뜬다", toast);
    R.note(await p.evaluate(function(){ return !!document.querySelector('#profNameTop'); }), '이름 칸으로 돌아가 있다');
    await p.close();

    /* ── ② 이름 없는 옛 프로필 → 묻는 창 ── */
    p = await L.openPage(browser, {state: L.makeState({profiles:[L.person({name:''})]}), width:390, height:900});
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto(srv.url + '/fortune.html', {waitUntil:'networkidle0'}); await wait(1500);
    const asked = await p.evaluate(function(){ return !!document.querySelector('#askNameInput'); });
    R.note(asked, '이름 없는 프로필이면 이름을 묻는 창이 뜬다');
    if(asked){
      await L.clickText(p, /^저장$/); await wait(400);
      R.note((await stored(p))[0] === '', '빈칸으로 [저장]하면 저장되지 않는다');
      await p.type('#askNameInput', '민지', {delay:20});
      await L.clickText(p, /^저장$/); await wait(800);
      names = await stored(p);
      R.note(names[0] === '민지', '넣은 이름이 저장된다', JSON.stringify(names));
      R.note(await p.evaluate(function(){ return !document.querySelector('#askNameInput'); }), '저장하면 창이 닫힌다');
    }
    await p.close();

    /* 이름 있는 프로필에는 안 묻는다 */
    p = await L.openPage(browser, {state: L.makeState(), width:390, height:900});
    await p.goto(srv.url + '/fortune.html', {waitUntil:'networkidle0'}); await wait(1500);
    R.note(await p.evaluate(function(){ return !document.querySelector('#askNameInput'); }), '이름 있는 프로필에는 묻지 않는다');
    await p.close();

    /* ── ③ 모임 명단의 이름 없는 줄 ── */
    p = await L.openPage(browser, {hook:true, width:390, height:900,
      state: L.makeState({profiles:[L.person({name:'TEST'})],
        savedGroups:[{id:'gN', name:'이름 없는 분 모임', at:Date.now(), token:'t', n:3, rel:'friend', profileId:'p1', pchk:1}]})});
    p.on('pageerror', e => errs.push(String(e)));
    let roster = null;
    await p.setRequestInterception(true);
    p.on('request', function(req){
      if(req.url().indexOf('/api/group') >= 0){
        let body = {}; try{ body = JSON.parse(req.postData()||'{}'); }catch(e){}
        if(body.action === 'get' && roster) return req.respond({status:200, contentType:'application/json',
          body: JSON.stringify({name:'이름 없는 분 모임', members:roster, ttlDays:365})});
        return req.respond({status:404, contentType:'application/json', body:'{"error":"not_found"}'});
      }
      req.continue();
    });
    await p.goto(srv.url + '/fortune.html', {waitUntil:'domcontentloaded'}); await wait(1200);
    roster = await p.evaluate(function(){
      var T = window.__INYEON_TEST__, a = T.profiles()[0];
      var nameless = Object.assign({}, a, {name:'', mbti:'ISTJ', day: a.day + 1});
      var mandu = Object.assign({}, a, {name:'만두', mbti:'ESFJ', year: a.year + 2});
      return T.gcMeetRow(a) + ';' + T.gcMeetRow(nameless) + ';' + T.gcMeetRow(mandu);
    });
    await p.evaluate(function(){ window.__INYEON_TEST__.openSavedGroup('gN'); });
    await wait(1500);
    const txt = await p.evaluate(function(){ return document.querySelector('#main').innerText; });
    R.note(/최고 궁합/.test(txt), '모임 결과 화면이 그려졌다', txt.slice(0,80));
    R.note(!/\bnull\b/.test(txt), "화면에 'null'이 없다", (txt.match(/.{0,20}null.{0,20}/)||[''])[0]);
    R.note(/이름 없음/.test(txt), "이름 없는 분은 '이름 없음'으로 보인다");
    await p.close();

    /* ── ④ 이름이 용어와 같으면(정인) 이름은 용어 단추가 안 된다 — 2026-10-06 대표님 사진 ── */
    p = await L.openPage(browser, {hook:true, width:390, height:900,
      state: L.makeState({profiles:[L.person({name:'TEST'}), L.person({id:'p2', name:'정인', year:1993, month:5, day:9, mbti:'INFJ'})]})});
    p.on('pageerror', e => errs.push(String(e)));
    await p.goto(srv.url + '/fortune.html', {waitUntil:'networkidle0'}); await wait(1200);
    const termed = await p.evaluate(function(){
      var box = document.createElement('div');
      box.innerHTML = '<p>이 두 사람의 궁합: TEST × 정인 (59점)</p><p>정인님은 차분해요.</p><p>십성 중 정인은 품어 주는 힘이에요.</p>';
      document.querySelector('#main').appendChild(box);
      window.__INYEON_TEST__.autoTermify(box);
      var ps = box.querySelectorAll('p');
      var r = [0,1,2].map(function(i){ return [...ps[i].querySelectorAll('.term-inline, button')].map(function(b){ return b.textContent; }); });
      box.remove(); return r;
    });
    R.note(termed[0].indexOf('정인') < 0, "'TEST × 정인' 의 이름은 용어 단추가 아니다", JSON.stringify(termed[0]));
    R.note(termed[1].indexOf('정인') < 0, "'정인님은' 의 이름은 용어 단추가 아니다", JSON.stringify(termed[1]));
    R.note(termed[2].indexOf('십성') >= 0, '같은 화면의 다른 용어(십성)는 그대로 단추다', JSON.stringify(termed[2]));
    await p.close();

    R.note(errs.length === 0, 'JS 오류 0건', errs.slice(0,2).join(' / ') || '없음');
  } finally {
    await browser.close(); srv.close();
  }
  R.done();
})();
