#!/usr/bin/env node
/* =====================================================================
   관리자 페이지 검사 — 운영자만 열리는가
   ---------------------------------------------------------------------
   왜 만들었나 (2026-09-08 대표님 지시: "unlock 링크는 테스트페이지잖아 어드민페이지에
   구현해야지"):
     `test_grants` 하나가 두 가지를 겸하고 있었다 — ① 유료를 테스트로 열어 주는 허가와
     ② 손님 문의를 읽고 매출을 보는 권한. 그래서 **테스트 코드만 알면 누구나 손님
     연락처와 주문 내역을 볼 수 있었다.** 테스터와 운영자를 갈랐고, 이 검사가 그 벽을 지킨다.

   ★ 여기서 제일 중요한 줄은 "테스터에게는 **안** 열린다"입니다. 열리는 것만 확인하고
     안 열리는 것을 확인 안 하면, 벽이 사라져도 검사는 계속 통과합니다.

   쓰는 법: node scripts/admin.cjs [주소]
===================================================================== */
const L = require('../_lib.cjs');
const BASE = (process.argv[2] || 'http://127.0.0.1:8899').replace(/\/+$/, '');
const APP = BASE + '/fortune.html';

const CASES = [
  {name:'운영자',                    ent:{adminAccess:true,  testAccess:true },  open:true },
  {name:'테스터(운영자 아님)',       ent:{adminAccess:false, testAccess:true },  open:false},
  {name:'아무 허가 없는 손님',       ent:{adminAccess:false, testAccess:false},  open:false},
  /* 옛 서버는 adminAccess 를 안 내려준다. 그때는 예전처럼 테스터도 열린다 —
     안 그러면 이 코드가 올라간 순간 대표님이 관리자 화면에서 잠긴다. */
  {name:'옛 서버(adminAccess 없음)', ent:{testAccess:true},                       open:true },
  /* ★ 2026-09-08 대표님이 영상으로 잡아 주신 것 — **프로필이 없는 브라우저**에서
     [문의]를 누르면 온보딩('만 14세 이상이에요') 화면으로 튕겼다. 관리자 페이지를 보는
     브라우저에는 손님용 프로필이 없는 것이 오히려 보통이다. 그런데 이 검사는 늘 프로필을
     하나 심어 놓고 돌려서 못 잡았다. **이 줄이 그 구멍이다.** */
  {name:'운영자 · 프로필 없음',      ent:{adminAccess:true,  testAccess:true },  open:true, noProfile:true },
];

const STATS = (function(){
  const o = {rooms:{}, groups:{}, orders:{}, ai:{}};
  ['d1','d7','d30'].forEach(function(k){
    o.rooms[k]={made:0,joined:0}; o.groups[k]={made:0,opened:0};
    o.orders[k]={paid:0,amount:0,ready:0}; o.ai[k]={made:0,cached:0};
  });
  return o;
})();

(async () => {
  const R = L.reporter('관리자 페이지');
  const exe = L.chromePath(), pp = L.puppeteer();
  if(!exe || !pp){ console.error('크롬 또는 puppeteer-core 를 못 찾았습니다.'); process.exit(2); }
  const browser = await pp.launch({executablePath:exe, headless:'new', args:['--no-sandbox']});

  for(const c of CASES){
    R.head('[' + c.name + ']');
    /* 프로필이 없는 상태를 흉내 낸다 — 새 브라우저로 관리자 페이지만 보는 경우다 */
    const state = c.noProfile
      ? L.makeState({profiles:[], activeId:null, onboarded:false})
      : L.makeState();
    const page = await L.openPage(browser, {width:390, height:1200, state:state});
    const ent = Object.assign({items:{}, pass:null, purchases:[]}, c.ent);
    await page.setRequestInterception(true);
    page.on('request', function(r){
      const u = r.url();
      const j = function(o){ return {status:200, contentType:'application/json', body:JSON.stringify(o)}; };
      if(u.indexOf('/api/entitlements') >= 0) return r.respond(j(ent));
      if(u.indexOf('/api/stats') >= 0) return r.respond(j(STATS));
      if(u.indexOf('/api/feedback') >= 0) return r.respond(j({items:[]}));
      if(u.indexOf('/api/') >= 0) return r.respond(j({}));
      r.continue();
    });

    await page.goto(APP + '#admin', {waitUntil:'load'});
    await L.wait(3000);
    /* ★ 2026-09-11 — 관리자 화면이 #adminRoot(사이드바 셸)로 옮겨졌다.
       열린 상태는 그쪽에서, 잠긴 상태는 예전대로 #main 에서 본다.
       화면 하나하나는 checks-slow/admin_shell.cjs 가 따로 본다. */
    const o = await page.evaluate(() => {
      const t = ((document.querySelector('#main')||{}).innerText) || '';
      const root = document.querySelector('#adminRoot');
      return {
        segs: [...document.querySelectorAll('#adminRoot .ad-nav')].map(function(x){ return x.textContent.trim(); }),
        locked: t.indexOf('운영자만 볼 수 있어요') >= 0,
        shellOn: !!(root && !root.hidden),
        head: t.split('\n').filter(Boolean).slice(0,2).join(' | ').slice(0,50),
      };
    });

    if(c.open){
      R.note(o.shellOn && !o.locked, '#admin 이 열린다', o.head || '(어드민 셸)');
      R.note(o.segs.some(function(x){ return x.indexOf('대시보드') === 0; })
             && o.segs.some(function(x){ return x.indexOf('문의') === 0; }),
             '대시보드·문의 메뉴가 있다', JSON.stringify(o.segs.slice(0,3)));
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('#adminRoot .ad-nav')]
          .find(function(x){ return x.textContent.trim().indexOf('문의') === 0; });
        if(b) b.click();
      });
      await L.wait(1500);
      const t2 = await page.evaluate(() => ({
        admin: ((document.querySelector('#adminRoot')||{}).innerText||'').slice(0,200),
        main: ((document.querySelector('#main')||{}).innerText||'').slice(0,150),
      }));
      /* ★ 온보딩으로 튕기는지 반드시 함께 본다. 예전에는 프로필이 없으면 여기서
         '만 14세 이상이에요' 화면이 떴다 — 관리자 페이지가 통째로 못 열리는 것이다. */
      R.note(t2.main.indexOf('만 14세') < 0 && t2.main.indexOf('우리 인연은 몇 점') < 0,
             '[문의]가 온보딩으로 안 튕긴다', t2.main.replace(/\n+/g,' | ').slice(0,50));
      R.note(/문의 · CS|아직 받은 문의가 없어요|답변 저장/.test(t2.admin), '[문의] 갈래로 넘어간다',
             t2.admin.replace(/\n+/g,' | ').slice(0,50));
    } else {
      /* ★ 이 줄이 이 검사의 핵심이다 */
      R.note(o.locked && !o.shellOn, '#admin 이 **잠겨 있다**', o.head);
      R.note(o.segs.length === 0, '관리자 메뉴가 안 보인다', JSON.stringify(o.segs));

      /* 잠긴 화면의 [운영자 코드 넣기]가 **운영자 전용 창**을 열고,
         서버에 want:'admin' 을 보내는지. 이 표시가 빠지면 테스트 코드로도 열린다. */
      if(c.name === '아무 허가 없는 손님'){
        await L.clickText(page, /운영자 코드 넣기/);
        await L.wait(900);
        const m = await page.evaluate(() => {
          const box = document.querySelector('.modal-box');
          return box ? {title:(box.innerText||'').split('\n')[0],
                        ph:(box.querySelector('input')||{}).placeholder} : null;
        });
        R.note(!!m && m.ph === '운영자 코드', '[운영자 코드 넣기]가 운영자 전용 창을 연다',
               m ? (m.title + ' · ' + m.ph) : '창이 안 뜸');
      }
    }

    /* 손님 설정 화면에 관리자 줄이 남아 있으면 안 된다
       ★ 프로필이 없으면 설정으로 못 가고 마법사로 간다 — 그 경우는 건너뛴다. */
    if(c.noProfile){ R.skip('손님 설정 화면 확인', '프로필이 없어 설정에 못 들어감'); await page.close(); continue; }
    await page.goto(APP, {waitUntil:'load'}); await L.wait(2200);
    await L.clickText(page, /^더보기/); await L.wait(700);
    await page.evaluate(() => {
      const r = [...document.querySelectorAll('#activeModal .hd-row')]
        .find(function(x){ return x.textContent.indexOf('설정') >= 0; });
      if(r) r.click();
    });
    await L.wait(2000);
    const leftover = await page.evaluate(() => [...document.querySelectorAll('#main *')]
      .filter(function(x){ return x.children.length === 0 &&
        /운영 현황판 \(운영자\)|문의 관리 \(운영자\)/.test(x.textContent||''); }).length);
    R.note(leftover === 0, '손님 설정 화면에 관리자 입구가 없다', leftover + '개');
    R.note(page.__errs.length === 0, 'JS 오류 0건', page.__errs[0] || '');
    await page.close();
  }

  await browser.close();
  R.done();
})().catch((e) => { console.error('검사 자체가 터졌습니다:', e && e.message); process.exit(2); });
