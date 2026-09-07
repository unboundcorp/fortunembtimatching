#!/usr/bin/env node
/* =====================================================================
   화면 조작 검사 — 버튼을 실제로 눌러 본다
   ---------------------------------------------------------------------
   왜 만들었나: smoke.cjs 는 탭 여덟 개가 "그려지는가"만 본다. 그런데 실제로 나간
   결함은 전부 **누른 뒤**에 있었다.
     · 마법사 다음 단계로 넘어가면 스크롤이 안 올라가 위가 잘려 보였다 (2026-09-07)
     · 기록 탭을 바꿔도 마찬가지였다
     · 궁합 기록을 눌러도 다시 열 길이 없었다 (2026-09-07)
   "그려진다"와 "눌러진다"는 다른 것이다. 여기서는 눌러 본다.

   쓰는 법: node scripts/flow.cjs [주소]     (기본값 http://127.0.0.1:8899)
===================================================================== */
const L = require('./_lib.cjs');

const BASE = (process.argv[2] || 'http://127.0.0.1:8899').replace(/\/+$/, '');
const APP = BASE + '/fortune.html';

/* 궁합 기록 하나 — '전에 본 궁합'에서 다시 여는 길을 검사하려면 필요하다 */
const HIST = [{
  id:'h1', profileId:'p1', relation:'friend', score:73, tier:'강한 인연', at:Date.now(),
  name:'민지', partnerName:'민지',
  inputs:{ b:{ name:'민지', mbti:'INFJ', gender:'F',
    birth:{y:1993, m:7, d:22, hour:14, minute:30, lon:126.98, adjust:true} } },
}];

(async () => {
  const R = L.reporter('화면 조작');
  const exe = L.chromePath(), pp = L.puppeteer();
  if(!exe || !pp){ console.error('크롬 또는 puppeteer-core 를 못 찾았습니다.'); process.exit(2); }
  const browser = await pp.launch({executablePath:exe, headless:'new', args:['--no-sandbox']});
  const page = await L.openPage(browser, {width:390, height:800,
                 state: L.makeState({compatHistory: HIST})});

  const y = () => page.evaluate(() => Math.round(window.scrollY));
  const down = async () => { await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
                             await L.wait(350); return y(); };
  const text = () => page.evaluate(() => ((document.querySelector('#main')||{}).innerText||''));

  /* 내려간 자리에서 눌렀을 때 맨 위로 올라가는가 */
  async function nextPage(name, re, mustSee){
    const before = await down();
    page.__errs.length = 0;
    const label = await L.clickText(page, re);
    await L.wait(1100);
    if(label === null){ R.bad(name, '누를 것을 못 찾음'); return false; }
    const after = await y();
    const t = await text();
    const seen = !mustSee || t.indexOf(mustSee) >= 0;
    const errs = page.__errs.slice();
    if(errs.length){ R.bad(name, errs[0]); return false; }
    if(!seen){ R.bad(name, '다음 화면에 「' + mustSee + '」가 없음'); return false; }
    if(before > 0 && after !== 0){ R.bad(name, '스크롤이 안 올라감 ' + before + 'px → ' + after + 'px'); return false; }
    R.ok(name, (before>0 ? before+'px → '+after+'px' : '눌림') + ' · ' + label.slice(0,20));
    return true;
  }

  await page.goto(APP, {waitUntil:'load'});
  await L.wait(2200);

  /* ── 1. 마법사 ───────────────────────────────────────────────── */
  R.head('[1] 프로필 마법사 — 단계를 넘길 때');
  await L.clickText(page, /^더보기/); await L.wait(700);
  await L.clickText(page, /^설정/);   await L.wait(1200);
  await L.clickText(page, /\(활성\)/); await L.wait(1000);
  const enter = await L.clickText(page, /^수정|고치기|정보 수정/);
  await L.wait(1600);
  if(enter === null){ R.bad('마법사 들어가기', '[수정] 버튼을 못 찾음'); }
  else {
    await nextPage('1단계 → 2단계', /다음 · 성격유형 고르기/, '성격유형');
    await nextPage('2단계 → 간단 테스트', /모르겠어요/, '질문');
    await nextPage('테스트 질문 1 → 2', /^친구들과 어울려|^혼자 조용히/, '질문');
  }

  /* ── 2. 기록 탭 ──────────────────────────────────────────────── */
  R.head('[2] 히스토리 — 탭을 바꿀 때');
  await page.goto(APP, {waitUntil:'load'}); await L.wait(2200);
  await L.clickText(page, /^더보기/); await L.wait(700);
  await L.clickText(page, /^히스토리/); await L.wait(1400);
  await nextPage('운세 기록 → 궁합 기록', /^궁합 기록/, '궁합');
  await nextPage('궁합 기록 → 사주풀이 기록', /^사주풀이 기록/, '사주');

  /* ── 3. 궁합 — 기록에서 다시 열기 ────────────────────────────── */
  R.head('[3] 궁합 — 전에 본 궁합을 다시 열기');
  await page.goto(APP, {waitUntil:'load'}); await L.wait(2200);
  await L.clickText(page, /^궁합/); await L.wait(1500);
  page.__errs.length = 0;
  const reopened = await L.clickText(page, /민지/);
  await L.wait(2600);
  if(reopened === null) R.bad('기록에서 다시 열기', '목록에 기록이 안 보임');
  else {
    const o = await page.evaluate(() => ({
      nick:(document.querySelector('.csb-nick')||{}).textContent||'',
      num:(document.querySelector('.csb-num')||{}).innerText||'',
      verdict:(document.querySelector('.csb-verdict')||{}).textContent||'',
      scroll: Math.round(window.scrollY),
    }));
    R.note(!!o.num, '결과 화면이 뜬다', o.num.replace(/\n/g,' ').slice(0,24));
    R.note(!!o.nick, '한 줄 별명이 붙는다', o.nick.slice(0,30));
    R.note(!!o.verdict, '총평 한 줄이 붙는다', o.verdict.slice(0,24));
    R.note(page.__errs.length === 0, '다시 열 때 JS 오류 0건', page.__errs[0] || '');

    /* 궁합 하위 화면 — ROUTE 가 안 바뀌는 자리다 */
    R.head('[4] 궁합 하위 화면 — ROUTE 가 안 바뀌는 쪽 넘김');
    await nextPage('사주 궁합 자세히', /사주 궁합 자세히 보기/, '사주');
    await L.clickText(page, /요약으로 돌아가기/); await L.wait(1200);
    await nextPage('성격유형 궁합 자세히', /성격유형 궁합 자세히 보기/, '성격유형');
    await L.clickText(page, /요약으로 돌아가기/); await L.wait(1200);
    /* ★ 유료라 잠겨 있어 결제 안내가 대신 뜬다 — 그래도 '그 화면으로 넘어갔다'는 것은 확인된다 */
    await nextPage('그림으로 한눈에', /그림으로 한눈에 보기/, '그림으로 보는 두 사람');
  }

  /* ── 5. 문서 화면 ──────────────────────────────────────────────
     ★ 일곱 개 중 다섯은 **화면(ROUTE)**이고 이용약관·개인정보처리방침은 **창(모달)**이다.
       한 덩이로 묶어 #main 만 보면, 창으로 뜨는 둘은 홈이 그대로 남아 있는데도
       바닥글에 그 낱말이 있어서 **통과로 읽힌다**(실제로 처음에 그렇게 통과했다).
       그래서 창으로 뜨는 것은 창 안을 본다. */
  R.head('[5] 안내 문서 — 열 때 오류가 없는가');
  const DOCS = [
    ['서비스 소개',        'page', '인연점'],
    ['사주 가이드',        'page', '오행과 십성'],
    ['성격유형 가이드',    'page', '네 글자'],
    ['자주 묻는 질문',     'page', '환불'],
    ['문의하기',           'page', '무엇이 궁금하신지'],
    ['이용약관',           'modal', '제1조'],
    ['개인정보처리방침',   'modal', '제1조'],
  ];
  for(const [name, how, must] of DOCS){
    await page.goto(APP, {waitUntil:'load'}); await L.wait(1700);
    page.__errs.length = 0;
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await L.wait(400);
    const got = await L.clickText(page, new RegExp('^' + name + '$'), {all:true});
    if(got === null){ R.bad(name, '링크를 못 찾음'); continue; }
    await L.wait(1500);
    const t = await page.evaluate(function(sel){
      const n = document.querySelector(sel); return n ? (n.innerText||'') : '';
    }, how === 'modal' ? '.modal-box' : '#main');
    if(how === 'modal' && !t){ R.bad(name, '창이 안 열림'); continue; }
    R.note(page.__errs.length === 0 && t.indexOf(must) >= 0, name,
           page.__errs[0] || (t.indexOf(must) >= 0 ? t.length + '자' : '「' + must + '」가 없음'));
  }

  await browser.close();
  R.done();
})().catch((e) => { console.error('검사 자체가 터졌습니다:', e && e.message); process.exit(2); });
