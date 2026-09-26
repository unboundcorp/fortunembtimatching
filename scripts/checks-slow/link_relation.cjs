#!/usr/bin/env node
/* =====================================================================
   링크에 실린 사이가 받은 분 모임 화면까지 살아 있는가 (느린 층 · 실제로 참여를 누른다)
   ---------------------------------------------------------------------
   2026-09-26 대표님 제보: 둘이서 궁합에서 연인으로 정해 보낸 링크로 받은 분이 들어오니
   "가족/친구/직장 동료" 고르기가 다시 떴고 연인은 고를 수도 없었다.
   원인: [동의하고 참여하기] → openSavedGroup 이 '이 모임에 적힌 사이'만 보고(처음이라 없음)
   '아직 안 고름'으로 되돌리며 부팅 때 링크에서 읽은 GC_RELATION 을 지웠다.

   여기서 보는 것 (가짜 /api/group · 받은 분 기기 = 저장한 모임 없음)
   ① 연인 링크(둘이서) — 참여 뒤 GC_RELATION=lover · 화면 칩 '연인 사이로 봤어요' · 고르기 안내 없음 · 저장한 모임에 rel 적힘
      [바꾸기]를 누르면 두 분뿐이라 고르기 줄에 [연인]이 있다(2026-09-26 "연인은 심지어 고를 수 없게 되어 있어")
   ② 직장 동료 링크(여럿이서) — 참여 뒤 칩 '직장 동료 사이로 봤어요'
   ③ 연인 링크인데 이미 셋 — 규칙대로 다시 고르게(연인 없음 · '먼저 골라주세요')
   ④ 사이 없는 링크(둘) — 고르게 하되 연인도 고를 수 있다
   ⑤ 같은 기기에서 다시 열어도 ①의 사이가 남아 있다
===================================================================== */
const { chromePath, puppeteer, serve, reporter, openPage, wait, clickText, ROOT } = require('../_lib.cjs');

const R = reporter('링크에 실린 사이');

(async function(){
  const pptr = puppeteer(), chrome = chromePath();
  if(!pptr || !chrome){ console.log('크롬을 못 찾았습니다 — 건너뜁니다'); process.exit(0); }
  const base = process.argv[2];
  const site = base ? {url:base, close:function(){}} : await serve(ROOT, 0);
  const browser = await pptr.launch({executablePath: chrome, headless:'new', args:['--no-sandbox','--disable-dev-shm-usage']});

  try{
    let roster = '';
    let joins = 0;
    async function page(hash){
      const p = await openPage(browser, {hook:true});
      await p.setRequestInterception(true);
      p.on('request', function(req){
        const u = req.url();
        if(u.indexOf('/api/group') >= 0){
          let body = {}; try{ body = JSON.parse(req.postData() || '{}'); }catch(e){}
          if(body.action === 'get') return req.respond({status:200, contentType:'application/json',
            body: JSON.stringify({name:'검사 모임', members:roster, ttlDays:365})});
          if(body.action === 'join'){
            joins++;
            const rows = String(roster).split(';').filter(Boolean);
            const already = rows.indexOf(body.member) >= 0;
            if(!already){ rows.push(body.member); roster = rows.join(';'); }
            return req.respond({status:200, contentType:'application/json', body: JSON.stringify({ok:true, already:already, members:roster})});
          }
          return req.respond({status:400, contentType:'application/json', body:'{}'});
        }
        req.continue();
      });
      await p.goto(site.url + '/fortune.html' + hash, {waitUntil:'domcontentloaded'});
      await wait(1200);
      return p;
    }
    const state = (p) => p.evaluate(function(){
      const T = window.__INYEON_TEST__;
      const seg = document.querySelector('.seg-rel');
      const pressed = seg ? Array.from(seg.querySelectorAll('button[aria-pressed="true"]')).map(b => b.textContent.trim()) : [];
      const labels = seg ? Array.from(seg.querySelectorAll('button')).map(b => b.textContent.trim()) : [];
      const sg = (T.savedGroups() || []).map(g => ({id:g.id, rel:g.rel || null}));
      const chipEl = document.querySelector('.compat-rel-chip');
      const chip = chipEl ? chipEl.textContent.trim() : '';
      return { rel: T.gcRelation(), pressed, labels, chip, saved: sg, text: document.body.innerText.replace(/\s+/g,' '), route: T.route() };
    });
    async function join(p){
      const t0 = await p.evaluate(() => document.body.innerText);
      const hasBtn = /동의하고 참여하기/.test(t0);
      if(hasBtn){ await clickText(p, /동의하고 참여하기/); await wait(1800); }
      return { hasBtn, before: t0.replace(/\s+/g,' ') };
    }

    /* 명단 한 줄 — 보낸 분(다른 사람) */
    let p = await page('');
    const other = await p.evaluate(function(){
      const T = window.__INYEON_TEST__; const me = T.activeProfile();
      return T.gcMeetRow(Object.assign({}, me, {name:'보낸분', mbti:'ISTJ', day:(me.day === 1 ? 2 : 1)}));
    });
    const third = await p.evaluate(function(){
      const T = window.__INYEON_TEST__; const me = T.activeProfile();
      return T.gcMeetRow(Object.assign({}, me, {name:'셋째', mbti:'INFJ', year:1988}));
    });
    await p.close();
    R.head('── 준비');
    R.note(!!other && !!third, '보낸 분·셋째 줄을 화면 규칙으로 만들었다');

    /* ── ① 연인 링크(둘이서) ── */
    R.head('── ① 연인으로 정한 링크로 처음 참여');
    roster = other; joins = 0;
    p = await page('#gj=testgroup123&rel=lover');
    const j1 = await join(p);
    R.note(j1.hasBtn, '참여 화면에 [동의하고 참여하기]가 떴다');
    R.note(/보내신 분이 연인 사이로 정하셨어요/.test(j1.before), '참여 화면이 "보내신 분이 연인 사이로 정하셨어요"를 적는다');
    R.note(joins === 1, '참여 요청이 서버로 한 번 갔다', '실제 ' + joins);
    let s1 = await state(p);
    R.note(s1.route === 'groupCompat', '참여 뒤 모임 화면으로 갔다', s1.route);
    R.note(s1.rel.rel === 'lover' && s1.rel.set === true, '참여 뒤 GC_RELATION 이 연인으로 서 있다', JSON.stringify(s1.rel));
    R.note(s1.chip === '연인 사이로 봤어요', "화면 칩이 '연인 사이로 봤어요'다", JSON.stringify(s1.chip));
    R.note(s1.pressed.length === 0 && s1.labels.length === 0, '고르기 줄이 안 떠 있다(이미 정해진 사이)', JSON.stringify(s1.labels));
    R.note(s1.text.indexOf('먼저 어떤 사이인지 골라주세요') < 0, '"먼저 어떤 사이인지 골라주세요"가 없다');
    R.note(s1.saved.some(g => g.id === 'testgroup123' && g.rel === 'lover'), '저장한 모임에 연인이 적혔다', JSON.stringify(s1.saved));
    /* [바꾸기] → 확인 창 [바꾸기] → 두 분뿐이므로 고르기 줄에 연인이 있어야 한다 */
    await clickText(p, /^바꾸기$/); await wait(400);
    await p.evaluate(function(){
      const btns = Array.from(document.querySelectorAll('.modal-box button'));
      const b = btns.find(x => x.textContent.trim() === '바꾸기'); if(b) b.click();
    });
    await wait(600);
    const s1b = await state(p);
    R.note(s1b.rel.set === false && s1b.labels.length >= 4 && s1b.labels.indexOf('연인') >= 0, '[바꾸기] 뒤 두 분뿐인 모임의 고르기 줄에 [연인]이 있다', JSON.stringify(s1b.labels));
    await clickText(p, /^연인$/); await wait(600);
    const s1c = await state(p);
    R.note(s1c.rel.rel === 'lover' && s1c.rel.set === true && s1c.chip === '연인 사이로 봤어요', '[연인]을 다시 고르면 연인으로 돌아온다', JSON.stringify(s1c.rel));
    /* ⑤ 같은 기기에서 다시 열기 */
    await p.evaluate(function(){ window.__INYEON_TEST__.openSavedGroup('testgroup123'); });
    await wait(1500);
    const s5 = await state(p);
    R.note(s5.rel.rel === 'lover' && s5.rel.set === true && s5.chip === '연인 사이로 봤어요', '⑤ 다시 열어도 연인이 그대로다', JSON.stringify(s5.rel)+' '+s5.chip);
    await p.close();

    /* ── ② 직장 동료 링크(여럿이서) ── */
    R.head('── ② 직장 동료로 정한 링크(여럿이서)로 처음 참여');
    roster = other; joins = 0;
    p = await page('#gj=testgroup456&rel=coworker');
    const j2 = await join(p);
    R.note(j2.hasBtn && /보내신 분이 직장 동료 사이로 정하셨어요/.test(j2.before), '참여 화면이 직장 동료를 알린다');
    const s2 = await state(p);
    R.note(s2.rel.rel === 'coworker' && s2.rel.set === true, '참여 뒤 GC_RELATION 이 직장 동료다', JSON.stringify(s2.rel));
    R.note(s2.chip === '직장 동료 사이로 봤어요', "화면 칩이 '직장 동료 사이로 봤어요'다", JSON.stringify(s2.chip));
    R.note(s2.text.indexOf('먼저 어떤 사이인지 골라주세요') < 0, '고르기 안내가 없다');
    await p.close();

    /* ── ③ 연인 링크인데 이미 셋 ── */
    R.head('── ③ 연인 링크인데 들어가 보니 셋');
    roster = other + ';' + third; joins = 0;
    p = await page('#gj=testgroup789&rel=lover');
    await join(p);
    const s3 = await state(p);
    R.note(s3.rel.set === false, '셋 이상이면 연인을 두지 않고 다시 고르게 한다', JSON.stringify(s3.rel));
    R.note(s3.labels.indexOf('연인') < 0 && s3.pressed.length === 0, '연인 단추가 없고 아무것도 안 눌렸다', JSON.stringify(s3.labels));
    R.note(s3.text.indexOf('먼저 어떤 사이인지 골라주세요') >= 0, '"먼저 어떤 사이인지 골라주세요"가 있다');
    await p.close();

    /* ── ④ 사이 없는 링크 ── */
    R.head('── ④ 사이가 안 실린 링크');
    roster = other; joins = 0;
    p = await page('#gj=testgroup000');
    const j4 = await join(p);
    const s4 = await state(p);
    R.note(j4.hasBtn && !/사이로 정하셨어요/.test(j4.before), '참여 화면에 사이 안내가 없다');
    R.note(s4.rel.set === false && s4.pressed.length === 0 && s4.text.indexOf('먼저 어떤 사이인지 골라주세요') >= 0, '예전처럼 고르게 한다', JSON.stringify(s4.rel));
    R.note(s4.labels.indexOf('연인') >= 0 && s4.labels.length === 4, '두 분뿐이면 고르기 줄에 [연인]도 있다', JSON.stringify(s4.labels));
    await p.close();
  }catch(e){
    R.bad('검사 도중 오류', String(e && e.stack || e).slice(0, 300));
  }
  await browser.close(); site.close();
  R.done();
})();
