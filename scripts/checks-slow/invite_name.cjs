/* =====================================================================
   초대 링크 창에서 모임 이름 정하기 (느린 층)
   ---------------------------------------------------------------------
   2026-09-22 대표님 지시 "모임 이름 정할 수 있게 하바" (초대 링크 창 사진).
   ① 창에 [모임 이름] 칸이 자동 이름으로 채워져 있다 ② [저장]을 누르면 서버로 action:'update' + ownerToken 이
   가고 저장된 모임 목록의 이름이 바뀐다 ③ 링크(모임 번호)가 도착하기 전에 저장을 눌러도 도착하는 순간 보낸다
   ④ 폭 390 에서 칸이 안 넘친다. ★ /api/group 은 가로채 흉내 낸다 — 진짜 모임을 만들지 않는다. */
const L = require('../_lib.cjs');
const R = L.reporter('초대 링크 모임 이름');

(async function(){
  const pptr = L.puppeteer(), chrome = L.chromePath();
  if(!pptr || !chrome){ console.log('크롬을 못 찾았습니다 — 건너뜁니다'); process.exit(0); }
  const base = process.argv[2];
  const site = base ? {url:base, close:function(){}} : await L.serve(L.ROOT, 0);
  const browser = await pptr.launch({executablePath: chrome, headless:'new', args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    async function open(createDelay){
      const updates = [];
      const p = await L.openPage(browser, {hook:true, width:390, height:844, state: L.makeState()});
      await p.setRequestInterception(true);
      p.on('request', function(req){
        const u = req.url();
        if(u.indexOf('/api/group') >= 0){
          let body = {}; try{ body = JSON.parse(req.postData() || '{}'); }catch(e){}
          const J = (o) => req.respond({status:200, contentType:'application/json', body: JSON.stringify(o)});
          if(body.action === 'create') return setTimeout(function(){ J({groupId:'invname1', ownerToken:'OWNER-TOKEN-1234567890'}); }, createDelay);
          if(body.action === 'update'){ updates.push(body); return J({ok:true}); }
          if(body.action === 'get') return J({name:'검사 모임', members:'', ttlDays:365});
          return J({ok:true});
        }
        req.continue();
      });
      await p.goto(site.url + '/fortune.html', {waitUntil:'domcontentloaded'}); await L.wait(800);
      await L.clickText(p, /^궁합$/, {all:true}); await L.wait(400);
      await L.clickText(p, /^친구$/); await L.wait(300);
      const hit = await L.clickText(p, /궁합 링크 보내기/); await L.wait(200);
      return {p, updates, hit};
    }
    const saved = (p) => p.evaluate(function(){ return window.__INYEON_TEST__.savedGroups().map(function(g){ return g.id+'='+g.name; }).join(' '); });

    /* ①② 링크가 먼저 오고 나서 이름을 바꾼다 */
    let {p, updates, hit} = await open(200);
    R.note(!!hit, '[상대방에게 궁합 링크 보내기] 를 눌렀다', String(hit));
    await L.wait(900);
    const f = await p.evaluate(function(){ const i = document.querySelector('#inviteGroupName'); const b = document.querySelector('#inviteGroupNameSave');
      return { has: !!i, val: i ? i.value : null, btn: !!b, over: i ? (i.closest('.invite-name-row').scrollWidth > i.closest('.invite-name-row').clientWidth + 1) : null,
               link: (document.querySelector('#inviteLinkInput')||{}).value || '' }; });
    R.note(f.has && f.btn, '① 창에 [모임 이름] 칸과 [저장] 단추가 있다');
    /* 2026-09-22 대표님 지시 "모임 이름을 올리고 링크 복사를 내려" */
    const order = await p.evaluate(function(){ const n = document.querySelector('#inviteGroupName'), l = document.querySelector('#inviteLinkInput');
      return (n && l) ? !!(n.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING) : null; });
    R.note(order === true, '① [모임 이름] 칸이 링크·[복사] 줄보다 위에 있다', String(order));
    R.note(f.val === '검사님의 궁합', '① 자동 이름으로 채워져 있다', JSON.stringify(f.val));
    R.note(f.link.indexOf('invname1') >= 0, '링크가 도착했다', f.link.slice(0, 60));
    R.note(f.over === false, '④ 이름 줄이 폭 390 에서 안 넘친다');
    await p.evaluate(function(){ const i = document.querySelector('#inviteGroupName'); i.value = '우리 셋 모임'; document.querySelector('#inviteGroupNameSave').click(); });
    await L.wait(500);
    R.note(updates.length === 1 && updates[0].groupId === 'invname1' && updates[0].name === '우리 셋 모임' && updates[0].ownerToken === 'OWNER-TOKEN-1234567890',
      '② [저장] → 서버로 update(이름 · 만든 분 열쇠)가 한 번 간다', JSON.stringify(updates));
    R.note(/invname1=우리 셋 모임/.test(await saved(p)), '② 저장된 모임 목록의 이름이 바뀐다', await saved(p));
    const toast = await p.evaluate(function(){ const t = document.querySelector('#toast'); return t ? t.textContent.trim() : ''; });
    R.note(/이름을 저장했어요/.test(toast), '② 알림이 뜬다', toast);
    /* 같은 이름을 또 저장하면 서버에 안 보낸다 */
    await p.evaluate(function(){ document.querySelector('#inviteGroupNameSave').click(); }); await L.wait(300);
    R.note(updates.length === 1, '② 같은 이름은 다시 안 보낸다', String(updates.length));
    /* 창을 닫고 여럿이서 목록에서 이름을 본다 */
    await L.clickText(p, /^닫기$/); await L.wait(300);
    await L.clickText(p, /여럿이서/, {all:true}); await L.wait(500);
    R.note(await p.evaluate(function(){ return document.body.innerText.indexOf('우리 셋 모임') >= 0; }), '② 저장된 모임 목록에 새 이름이 보인다');
    R.note(p.__errs.length === 0, 'JS 오류 없음 (①②)', p.__errs.join(' | '));
    await p.close();

    /* ③ 링크가 오기 전에 이름부터 저장 */
    ({p, updates} = await open(1500));
    await L.wait(300);
    await p.evaluate(function(){ const i = document.querySelector('#inviteGroupName'); i.value = '먼저 정한 이름'; document.querySelector('#inviteGroupNameSave').click(); });
    await L.wait(300);
    R.note(updates.length === 0, '③ 번호가 없으면 아직 안 보낸다(적어만 둔다)', String(updates.length));
    await L.wait(1800);
    R.note(updates.length === 1 && updates[0].name === '먼저 정한 이름' && updates[0].groupId === 'invname1', '③ 링크가 도착하면 적어 둔 이름을 보낸다', JSON.stringify(updates));
    R.note(/invname1=먼저 정한 이름/.test(await saved(p)), '③ 목록 이름도 바뀐다', await saved(p));
    R.note(p.__errs.length === 0, 'JS 오류 없음 (③)', p.__errs.join(' | '));
  }catch(e){ R.bad('검사 자체가 터짐', String(e && e.stack || e).slice(0, 400)); }
  await browser.close(); site.close(); R.done();
})();
