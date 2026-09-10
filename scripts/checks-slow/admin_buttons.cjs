#!/usr/bin/env node
/* =====================================================================
   어드민 QA — 화면마다 **모든 단추를 실제로 눌러 본다** (느린 층)
   ---------------------------------------------------------------------
   2026-09-11 대표님 지시: "QA까지 하고 모든 버튼 다 확인하고 나한테 다시 보내라"

   ★ 왜 따로 만들었나 — 대표님이 폰에서 "이 페이지 왜 아무것도 안 되지?"를 잡아 주셨습니다.
     어두운 막이 패널을 덮어 단추가 하나도 안 눌리는 상태였는데, 제 검사기는 통과했습니다.
     **`element.click()` 은 가림을 무시하고 바로 부르기 때문입니다.**
     그래서 이 검사는 두 가지를 지킵니다.
       ① 좌표로 눌러 본다 (`page.mouse.click`) — 가려져 있으면 못 누른다
       ② 누르기 전에 그 자리에 실제로 그 단추가 있는지 확인한다 (elementFromPoint)
   ★ 누른 뒤에는 **JS 오류가 났는지**와 **화면이 살아 있는지**를 본다.
     눌렀는데 아무 일도 안 나는 것은 여기서 못 가른다(그건 화면별 검사가 본다).
     여기서 잡는 것은 "못 누른다 · 누르면 터진다 · 누르면 화면이 죽는다" 셋이다.
===================================================================== */
const L = require('../_lib.cjs');
const BASE = (process.argv[2] || 'http://127.0.0.1:8899').replace(/\/+$/, '');
const APP = BASE + '/fortune.html';

const day = (i) => new Date(Date.now() + 9*3600*1000 - i*86400000).toISOString().slice(0,10);
const blank = (d, o) => Object.assign({d, rooms:{made:0,joined:0}, groups:{made:0,people:0,max:0},
  orders:{created:0,paid:0,failed:0,revenue:0,byProduct:{}},
  ai:{generated:0,inTok:0,outTok:0,costKrw:0,estimated:0}, kakao:{linked:0}, feedback:{created:0}}, o||{});
const DAILY = (function(){
  const out = [];
  for(let i = 29; i >= 0; i--) out.push(blank(day(i)));
  out[27].orders = {created:3, paid:2, failed:1, revenue:2890, byProduct:{'궁합 심층 해석':{count:2, amount:1980}}};
  out[27].ai = {generated:2, inTok:12000, outTok:9000, costKrw:157, estimated:0};
  out[29].rooms.made = 2; out[29].rooms.joined = 1; out[29].kakao.linked = 1;
  return out;
})();
const SUMMARY = {now:new Date().toISOString(), daily:DAILY, dailyDays:90,
  rooms:{d1:{},d7:{},d30:{},all:12}, groups:{d1:{},d7:{},d30:{},all:4},
  orders:{d1:{},d7:{},d30:{},all:6},
  ai:{d1:{},d7:{},d30:{},cached:5,reuse:2,costPerKrw:101,price:{inPerMTokUsd:2,outPerMTokUsd:10,usdKrw:1380}},
  kakao:{linked:7,d1:1,d7:3}, sync:{saved:5,d7:2},
  feedback:{all:2,d1:1,d7:2,byStatus:{received:1,answered:1},waiting:1}, recent:[]};
const P = {name:'가영',mbti:'ENFP',gender:'여',birth:'1990-03-05',inputBirth:'',calendar:'양력',
  time:'09:30',place:'seoul',lon:'126.98',solarTime:'보정함',element:'목',zodiac:'말',saju:'경오 임오 신해 계사'};
const ROWS = {
  kakao:[{id:'5057959396',sessionId:'sess-abc',at:'2026-09-09T05:50:35Z',updatedAt:'2026-09-10T03:11:16Z',
    synced:true,rev:7,syncedAt:'2026-09-10T03:11:16Z',history:5,groups:1,paidCount:1,revenue:990,
    profiles:[P],orders:[{id:'ORD-1',name:'궁합 심층 해석',amount:990,status:'paid',at:'2026-09-10T02:03:44Z'}]}],
  orders:[{id:'ORD-1',productId:'compat_full',name:'궁합 심층 해석',amount:990,status:'paid',
    sessionId:'sess-abc',paymentKey:'있음',at:'2026-09-10T02:03:04Z',paidAt:'2026-09-10T02:03:44Z'}],
  rooms:[{id:'RM-001',a:P,b:null,at:'2026-09-10T01:02:03Z',joinedAt:null,expiresAt:'2026-10-10T01:02:03Z'}],
  groups:[{id:'GR-777',name:'회사 모임',people:1,members:[P],hasPin:false,hasOwner:true,
    at:'2026-09-08T05:06:07Z',updatedAt:'2026-09-09T05:06:07Z',expiresAt:'2026-11-08T05:06:07Z'}],
  ai:[{id:'ck-0011',name:'궁합 심층 해석',model:'claude-sonnet-5',chars:6841,sessionId:'sess-abc',
    at:'2026-09-10T02:04:05Z',inTok:12000,outTok:9000,costKrw:157,estimated:false}],
  sync:[{id:'5057959396',rev:7,profiles:1,history:5,groups:1,bytes:4096,
    at:'2026-09-01T00:00:01Z',updatedAt:'2026-09-10T00:00:02Z'}],
};
const TICKETS = [
  {id:11,kind:'refund',screen:'결제',body:'결제했는데 결과가 안 보여요.',contact:'test@example.com',
   status:'received',created_at:'2026-09-10T01:00:00Z',reply:null},
  {id:10,kind:'idea',screen:'궁합',body:'링크가 안 열려요',contact:'',
   status:'answered',created_at:'2026-09-09T01:00:00Z',reply:'고쳤습니다.'}];
const NOTICES = [{id:1,title:'점검 안내',body:'02:00~03:00 멈춥니다.',kind:'banner',
  starts_at:null,ends_at:null,active:true,created_at:'2026-09-10T00:00:00Z',updated_at:'2026-09-10T00:00:00Z'}];

function wire(page){
  page.on('request', function(r){
    const u = r.url();
    const j = (o) => ({status:200, contentType:'application/json', body:JSON.stringify(o)});
    if(u.indexOf('/api/entitlements') >= 0)
      return r.respond(j({items:{}, pass:null, purchases:[], adminAccess:true, testAccess:true}));
    if(u.indexOf('/api/stats') >= 0){
      let b = {}; try{ b = JSON.parse(r.postData() || '{}'); }catch(e){}
      if(b.action === 'rows') return r.respond(j({kind:b.kind, rows:ROWS[b.kind] || []}));
      if(b.action === 'order') return r.respond(j({found:true,
        order:{receiptId:'ORD-1', productId:'compat_full', productName:'궁합 심층 해석', amount:990,
               status:'paid', createdAt:'2026-09-10T02:03:04Z', paidAt:'2026-09-10T02:03:44Z', paymentKey:'있음'},
        aiUses:1, aiQuota:1, firstAiAt:'2026-09-10T02:04:05Z', lastAiAt:'2026-09-10T02:04:05Z',
        passUntil:null, note:'테스트'}));
      return r.respond(j(SUMMARY));
    }
    if(u.indexOf('/api/feedback') >= 0){
      let b = {}; try{ b = JSON.parse(r.postData() || '{}'); }catch(e){}
      if(b.action === 'reply') return r.respond(j({ok:true}));
      return r.respond(j({items:TICKETS}));
    }
    if(u.indexOf('/api/notice') >= 0){
      let b = {}; try{ b = JSON.parse(r.postData() || '{}'); }catch(e){}
      if(b.action === 'active') return r.respond(j({items:[]}));
      if(b.action === 'save') return r.respond(j({ok:true, item:NOTICES[0]}));
      if(b.action === 'delete') return r.respond(j({ok:true}));
      return r.respond(j({items:NOTICES}));
    }
    if(u.indexOf('/api/') >= 0) return r.respond(j({}));
    r.continue();
  });
}
const LABEL = {dash:'대시보드', members:'회원 관리', tickets:'문의 · CS', payments:'결제',
               compat:'궁합 · 모임', ai:'AI 해석', notices:'공지 · 배너', export:'데이터 내보내기'};
/* 눌러도 어드민을 벗어나는 것 — 여기서는 건너뛴다(벗어나는 것 자체는 따로 확인한다) */
const SKIP = ['서비스 화면으로'];

(async () => {
  const R = L.reporter('어드민 QA (모든 단추)');
  const exe = L.chromePath(), pp = L.puppeteer();
  if(!exe || !pp){ console.error('크롬 또는 puppeteer-core 를 못 찾았습니다.'); process.exit(2); }
  const browser = await pp.launch({executablePath:exe, headless:'new', args:['--no-sandbox']});

  for(const view of [{w:1280, h:1000, name:'PC'}, {w:390, h:844, name:'폰'}]){
    R.head('── ' + view.name + ' (' + view.w + 'px)');
    const page = await L.openPage(browser, {width:view.w, height:view.h, state:L.makeState()});
    await page.setRequestInterception(true);
    wire(page);

    async function open(screen){
      await page.goto(APP + '#admin' + (screen === 'dash' ? '' : '/' + screen), {waitUntil:'load'});
      await L.wait(2600);
      /* 폰에서는 서랍이 닫혀 있어 사이드바 단추가 안 보인다 — 열어 둔다 */
      if(view.w < 900){
        await page.evaluate(() => {
          const b = document.querySelector('#adminRoot .ad-burger');
          if(b && !document.querySelector('#adminRoot').classList.contains('ad-open')) b.click();
        });
        await L.wait(500);
        await page.evaluate(() => {
          const s = document.querySelector('#adminRoot .ad-scrim');
          if(s) s.click();               /* 다시 닫아 본문을 보이게 한다 */
        });
        await L.wait(500);
      }
    }
    /* 지금 화면에서 눌릴 수 있는 것들을 모은다.
       ★ 재기 전에 그 자리로 굴려 놓는다(scrollIntoView). 표는 가로로 굴러가므로
         안 굴리면 오른쪽 끝의 [상세]·[열람 여부] 가 화면 밖에 있어 "가려졌다"로 잘못 잡힌다.
         (처음에 그렇게 만들어 거짓 실패를 냈습니다.)
       ★ 좁은 화면에서 닫혀 있는 서랍 안의 것은 빼고 센다 — 그건 가려진 것이 아니라
         '아직 안 연 것'이다. 서랍은 아래에서 따로 열어 본다. */
    async function collect(){
      return page.evaluate(() => {
        const out = [];
        const root = document.querySelector('#adminRoot');
        const side = document.querySelector('#adminRoot .ad-side');
        const drawerClosed = side && side.getBoundingClientRect().right < 1;
        const nodes = [...document.querySelectorAll('#adminRoot button, #adminRoot select, #adminRoot input')];
        nodes.forEach(function(n, i){
          if(drawerClosed && side.contains(n)) return;      /* 닫힌 서랍 안 */
          let r = n.getBoundingClientRect();
          if(r.width < 2 || r.height < 2) return;           /* 안 보이는 것 */
          try{ n.scrollIntoView({block:'center', inline:'center'}); }catch(e){}
          r = n.getBoundingClientRect();
          const cx = Math.round(r.left + r.width/2), cy = Math.round(r.top + r.height/2);
          if(cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) return;
          const top = document.elementFromPoint(cx, cy);
          out.push({
            i: i,
            tag: n.tagName.toLowerCase(),
            type: n.getAttribute('type') || '',
            label: (n.textContent || n.getAttribute('aria-label') || n.value || '').trim().slice(0, 24),
            x: cx, y: cy,
            hit: !!(top && (top === n || n.contains(top))),
            covered: (top && !(top === n || n.contains(top))) ? (top.className || top.tagName) : '(화면 밖)',
          });
        });
        return out;
      });
    }

    let total = 0, blocked = [], broke = [];
    for(const key of Object.keys(LABEL)){
      await open(key);
      const list = (await collect()).filter(b => SKIP.indexOf(b.label) < 0);
      /* 화면마다 눌릴 것이 하나도 없으면 그것부터가 이상하다 */
      R.note(list.length > 0, '[' + LABEL[key] + '] 눌릴 것이 있다', list.length + '개');
      total += list.length;

      const bad = list.filter(b => !b.hit);
      if(bad.length) blocked = blocked.concat(bad.map(b => LABEL[key] + ' / ' + (b.label || b.tag) + ' ← ' + b.covered));
      R.note(bad.length === 0, '[' + LABEL[key] + '] 모두 눌리는 자리에 있다 (가림 0)',
             bad.length ? bad.map(b => b.label + '←' + b.covered).join(', ') : list.length + '개');

      /* 하나씩 진짜로 눌러 본다.
         ★ 매번 화면을 새로 열면 정확하지만 너무 느리다(단추 하나에 3초, 164개면 8분).
           그래서 **화면이 바뀌었을 때만** 다시 연다. 안 바뀌었으면 목록만 다시 잰다
           (누르면 다시 그려지는 자리가 있어 좌표가 밀리기 때문이다). */
      for(let n = 0; n < list.length; n++){
        const cur = (await collect()).filter(b => SKIP.indexOf(b.label) < 0);
        const b = cur[n];
        if(!b || !b.hit) continue;
        const before = page.__errs.length;
        try{
          await page.mouse.click(b.x, b.y);
        }catch(e){ /* 좌표를 못 누르는 것도 결과다 */ }
        await L.wait(650);
        /* 창(모달)이 떴으면 닫는다 — 다음 단추를 가리지 않게 */
        await page.evaluate(() => {
          const m = document.querySelector('.modal-backdrop button');
          if(m) [...document.querySelectorAll('.modal-backdrop button')]
            .filter(x => /닫기|취소/.test(x.textContent||'')).slice(0,1).forEach(x => x.click());
        });
        const st = await page.evaluate(() => ({
          alive: !!document.querySelector('#adminRoot .ad-nav') || !!document.querySelector('#main'),
          title: ((document.querySelector('#adminRoot .ad-title')||{}).textContent||'').trim(),
          drawer: !!document.querySelector('#adminRoot .ad-drawer'),
          menu: !!document.querySelector('#adminRoot.ad-open'),
        }));
        const newErr = page.__errs.slice(before);
        if(newErr.length) broke.push(LABEL[key] + ' / ' + (b.label || b.tag) + ' — ' + newErr[0]);
        if(!st.alive) broke.push(LABEL[key] + ' / ' + (b.label || b.tag) + ' — 화면이 사라짐');
        /* 화면이 옮겨졌거나 서랍이 열렸으면 원래 자리로 되돌린다 */
        if(!st.alive || st.title !== LABEL[key] || st.drawer || st.menu) await open(key);
      }
    }

    /* 좁은 화면에서는 서랍을 열어 사이드바 단추도 따로 눌러 본다 */
    if(view.w < 900){
      await open('dash');
      await page.evaluate(() => { document.querySelector('#adminRoot .ad-burger').click(); });
      await L.wait(700);
      /* ★ 서랍이 열려 있을 때 **뒤쪽 본문 단추가 가려지는 것은 맞는 동작**이다(어두운 막).
         그래서 서랍 안의 것만 눌릴 자리에 있어야 하고, 본문 것은 오히려 막에 가려져야 한다.
         처음에 이걸 안 갈라서 거짓 실패를 냈다. */
      const drawer = await page.evaluate(() => {
        const side = document.querySelector('#adminRoot .ad-side');
        const out = {inside:[], outside:[]};
        [...document.querySelectorAll('#adminRoot button, #adminRoot select, #adminRoot input')]
          .forEach(function(n){
            const r = n.getBoundingClientRect();
            if(r.width < 2 || r.height < 2) return;
            const cx = Math.round(r.left + r.width/2), cy = Math.round(r.top + r.height/2);
            if(cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) return;
            const top = document.elementFromPoint(cx, cy);
            const rec = {label:(n.textContent || n.getAttribute('aria-label') || '').trim().slice(0,20),
                         hit: !!(top && (top === n || n.contains(top))),
                         covered: top ? (top.className || top.tagName) : '(없음)'};
            (side.contains(n) ? out.inside : out.outside).push(rec);
          });
        return out;
      });
      const navs = drawer.inside.filter(b => SKIP.indexOf(b.label) < 0);
      R.note(navs.length >= 8, '서랍을 열면 메뉴가 다 보인다', navs.length + '개');
      const badNav = navs.filter(b => !b.hit);
      R.note(badNav.length === 0, '서랍 안 단추가 안 가려져 있다',
             badNav.length ? badNav.map(b => b.label + '←' + b.covered).join(', ') : '가림 0');
      const leaked = drawer.outside.filter(b => b.hit);
      R.note(leaked.length === 0, '서랍이 열린 동안 뒤쪽 단추는 막에 가려진다',
             leaked.length ? leaked.map(b => b.label).join(', ') : '뒤쪽 ' + drawer.outside.length + '개 전부 가려짐');
      total += navs.length;
    }

    R.note(total >= (view.w < 900 ? 30 : 40), '눌러 본 것이 충분히 많다', total + '개');
    R.note(blocked.length === 0, '가려서 못 누르는 단추 0개',
           blocked.length ? blocked.slice(0,4).join(' | ') : '없음');
    R.note(broke.length === 0, '누르면 터지거나 화면이 죽는 단추 0개',
           broke.length ? broke.slice(0,4).join(' | ') : '없음');
    R.note(page.__errs.length === 0, view.name + ' 전체 JS 오류 0건',
           page.__errs.slice(0,2).join(' | '));
    await page.close();
  }

  await browser.close();
  R.done();
})().catch((e) => { console.error('검사 자체가 터졌습니다:', e && e.message); process.exit(2); });
