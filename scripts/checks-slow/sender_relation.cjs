#!/usr/bin/env node
/* =====================================================================
   보낸 분 화면에서도 링크에 실은 사이가 남는가 (느린 층)
   ---------------------------------------------------------------------
   2026-09-26 대표님 제보(사진): "연인으로 설정하고 보냈는데 궁합에 들어가 보니까 또 친구로 설정이 되어 있냐"
   · "둘이서 보기에는 전체 순위 필요 없잖아"
   원인: 아무도 안 들어온 옛 링크(모임)가 있으면 openInviteLinkModal 이 그것을 다시 쓰는데, 그 모임에 적힌
   옛 사이(친구)를 그대로 두었다. 링크 주소에는 #rel=lover 가 실려 나가는데 보낸 분 기기의 저장된 모임만 친구였다.
   초대 지켜보기(tickInviteWatch)도 직전에 본 다른 모임의 GC_RELATION 을 넘겨 덮을 수 있었다.

   ① 옛 친구 모임(1명) + 연인으로 링크 만들기 → 저장된 모임 rel=lover · 링크에 #rel=lover
   ② 상대가 들어온 뒤(2명) 그 모임을 열면 → 사이 lover · 칩 '연인 사이로 봤어요' · '전체 순위' 없음
   ③ 셋이 된 모임에는 '전체 순위'가 있다 (없는 것만 재면 늘 통과하므로 있는 쪽도 잰다)
   ④ 사람 더 받기 주소 — 연인 모임엔 사이를 안 싣고(셋째에게 연인은 성립 안 함), 친구 모임엔 싣는다
===================================================================== */
const { chromePath, puppeteer, serve, reporter, openPage, wait, makeState, person, ROOT } = require('../_lib.cjs');
const R = reporter('보낸 분 화면의 사이');

(async function(){
  const pptr = puppeteer(), chrome = chromePath();
  if(!pptr || !chrome){ console.log('크롬을 못 찾았습니다 — 건너뜁니다'); process.exit(0); }
  const base = process.argv[2];
  const site = base ? {url:base, close:function(){}} : await serve(ROOT, 0);
  const browser = await pptr.launch({executablePath: chrome, headless:'new', args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    let roster = '';
    const me = person({});
    const st = makeState({ profiles:[me], activeId:me.id, pendingInviteGroup:'g1',
      savedGroups:[{id:'g1', name:'검사님의 궁합', at:Date.now()-3600e3, token:'tok', n:1, rel:'friend', profileId:me.id, pchk:1}] });
    const p = await openPage(browser, {hook:true, state:st});
    await p.setRequestInterception(true);
    p.on('request', function(req){
      if(req.url().indexOf('/api/group') >= 0){
        let body = {}; try{ body = JSON.parse(req.postData() || '{}'); }catch(e){}
        if(body.action === 'get') return req.respond({status:200, contentType:'application/json',
          body: JSON.stringify({name:'검사님의 궁합', members:roster, ttlDays:365})});
        return req.respond({status:200, contentType:'application/json', body:'{"ok":true}'});
      }
      req.continue();
    });
    await p.goto(site.url + '/fortune.html', {waitUntil:'domcontentloaded'}); await wait(1200);
    const rows = await p.evaluate(function(){
      const T = window.__INYEON_TEST__, m = T.activeProfile();
      return { me: T.gcMeetRow(m),
               b: T.gcMeetRow(Object.assign({}, m, {name:'상대', mbti:'ENFP', day:(m.day===1?2:1)})),
               c: T.gcMeetRow(Object.assign({}, m, {name:'셋째', mbti:'INTJ', day:(m.day===3?4:3)})) };
    });
    roster = rows.me;

    /* ① */
    await p.evaluate(function(){ const T = window.__INYEON_TEST__; T.openInviteLinkModal(T.activeProfile(), 'lover'); });
    await wait(1500);
    const s1 = await p.evaluate(function(){
      const T = window.__INYEON_TEST__, box = document.querySelector('.modal-box');
      const inp = box && Array.from(box.querySelectorAll('input')).map(i => i.value).filter(v => /\/j\//.test(v))[0];
      T.closeModal(); const g = T.savedGroups().filter(x => x.id === 'g1')[0];
      return { rel: T.groupRelation('g1'), link: inp || '', pair: g && g.pair };
    });
    R.note(s1.rel === 'lover', '옛 친구 링크를 다시 써도 저장된 모임 사이가 연인', JSON.stringify(s1));
    R.note(/#rel=lover&k=pair$/.test(s1.link), '링크 주소에 #rel=lover&k=pair (둘이서 표식)', s1.link);
    R.note(s1.pair === 1, '저장된 모임에 둘이서 표식', String(s1.pair));

    /* ② */
    roster = rows.me + ';' + rows.b;
    await p.evaluate(function(){ window.__INYEON_TEST__.openSavedGroup('g1'); }); await wait(1800);
    const s2 = await p.evaluate(function(){
      const T = window.__INYEON_TEST__, chip = document.querySelector('.compat-rel-chip');
      return { rel: T.gcRelation(), chip: chip ? chip.textContent.trim() : '', text: document.querySelector('#main').innerText };
    });
    R.note(s2.rel.rel === 'lover' && s2.rel.set, '두 분 모임을 열면 사이 연인', JSON.stringify(s2.rel));
    R.note(/연인 사이로 봤어요/.test(s2.chip), "칩 '연인 사이로 봤어요'", s2.chip);
    R.note(!/전체 순위/.test(s2.text), "두 분이면 '전체 순위' 없음");
    R.note(!/사람 더 받기/.test(s2.text), "둘이서 링크 모임에는 '사람 더 받기' 없음");
    R.note(!/궁금한 친구를 눌러보세요|모두의 궁합이 아래에/.test(s2.text), '두 분이면 캐릭터 누르기 안내 없음');
    const deep = await p.evaluate(() => { const c = document.querySelector('.deep-card'); return c ? c.innerText : ''; });
    R.note(/걸리는 게 하나 있어요/.test(deep) && /두 분 궁합을 끝까지 알아 봐요/.test(deep), '모임 화면 심층 카드에 걸이와 권유', deep.slice(0,80));
    /* 저장 목록 — 둘이서 화면에 있고 여럿이서 화면에는 없다 */
    const lists = await p.evaluate(async function(){
      const T = window.__INYEON_TEST__, W = ms => new Promise(r => setTimeout(r, ms));
      T.goRoute('compat'); await W(300);
      const pick = (label) => { const b = Array.from(document.querySelectorAll('button')).filter(x => x.textContent.trim().indexOf(label) === 0)[0]; if(b) b.click(); };
      pick('둘이서'); await W(500); const pairTxt = document.querySelector('#main').innerText;
      pick('여럿이서'); await W(500); const grpTxt = document.querySelector('#main').innerText;
      return { pair: /링크로 본 궁합[\s\S]*검사님의 궁합/.test(pairTxt), grp: /저장된 모임[\s\S]*검사님의 궁합/.test(grpTxt), grpHas: /검사님의 궁합/.test(grpTxt) };
    });
    R.note(lists.pair, "둘이서 화면 '링크로 본 궁합'에 있음", JSON.stringify(lists));
    R.note(!lists.grpHas, '여럿이서 화면에는 없음', JSON.stringify(lists));

    /* ③ — 친구로 바꾼 셋 모임 */
    roster = rows.me + ';' + rows.b + ';' + rows.c;
    await p.evaluate(function(){ const T = window.__INYEON_TEST__; T.rememberGroup('g1', '검사님의 궁합', null, 3, 'friend'); T.openSavedGroup('g1'); });
    await wait(1800);
    const s3 = await p.evaluate(() => ({ text: document.querySelector('#main').innerText, more: (document.getElementById('groupJoinLink')||{}).value || '' }));
    R.note(/전체 순위/.test(s3.text), "셋이면 '전체 순위' 있음");
    R.note(/사람 더 받기/.test(s3.text) && /궁금한 친구를 눌러보세요/.test(s3.text), "셋이면 '사람 더 받기'·캐릭터 안내 있음");
    R.note(/#rel=friend$/.test(s3.more), '친구 모임의 사람 더 받기 주소에 #rel=friend', s3.more);
    R.note((p.__errs||[]).length === 0, 'JS 오류 0', JSON.stringify(p.__errs));
  } finally { await browser.close(); site.close(); }
  R.done(); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
