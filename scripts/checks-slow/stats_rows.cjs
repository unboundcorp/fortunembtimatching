#!/usr/bin/env node
/* =====================================================================
   관리자 원자료 표 — 실제로 눌러서 보이는가 (느린 층)
   ---------------------------------------------------------------------
   2026-09-10 대표님 지시:
     > "이거만 보이고 끝이야? 누르면 디테일하게 로우데이터 표가 있어야하는 거 아니냐?"
     > "관리자 페이지에서는 모든 정보가 다 보여야한다 일목 요연하게!
     >  시간부터 내용 멘트 하나하나 다 보여야된다"

   ★ 글자 대조(checks/stats_rows_pair.cjs)로는 "눌렀을 때 실제로 뜨는가"를 못 본다.
     이 검사는 진짜 화면에서 [원자료 보기]를 눌러 **값 하나하나가 찍히는지**를 본다.
   ★ 320px 에서 글자가 넘치는지도 함께 잰다 — 값이 길어서(영수증 번호·세션) 잘리기 쉽다.
===================================================================== */
const L = require('../_lib.cjs');
const BASE = (process.argv[2] || 'http://127.0.0.1:8899').replace(/\/+$/, '');
const APP = BASE + '/fortune.html';

/* 날짜별 흐름 — 대시보드가 이걸로 기간을 더한다 (2026-09-10)
   ★ 날짜를 오늘 기준으로 만든다. 못 박아 두면 내일 이 검사가 저절로 깨진다. */
const DAILY = (function(){
  const day = (i) => new Date(Date.now() + 9*3600*1000 - i*86400000).toISOString().slice(0,10);
  const blank = (d, o) => Object.assign({
    d, rooms:{made:0, joined:0}, groups:{made:0, people:0, max:0},
    orders:{created:0, paid:0, failed:0, revenue:0, byProduct:{}},
    ai:{generated:0}, kakao:{linked:0}, feedback:{created:0},
  }, o || {});
  const out = [];
  for(let i = 9; i >= 0; i--) out.push(blank(day(i)));
  /* 앞 5일: 매출 0 · 뒤 5일: 매출 있음 → '늘었다'가 나와야 한다 */
  out[7].kakao.linked = 1;
  out[8].rooms.made = 2; out[8].rooms.joined = 1;
  out[9].orders.paid = 2; out[9].orders.revenue = 1980; out[9].orders.created = 2;
  out[9].orders.byProduct = {'궁합 심층 해석':{count:2, amount:1980}};
  out[9].kakao.linked = 1; out[9].ai.generated = 1; out[9].groups.made = 1;
  out[9].groups.people = 2; out[9].groups.max = 2;
  return out;
})();

/* 현황 요약 — 화면이 읽는 모양 그대로 */
const SUMMARY = (function(){
  const per = (o) => ({d1:o, d7:o, d30:o});
  return {
    now: new Date().toISOString(),
    daily: DAILY,
    dailyDays: 90,
    rooms: Object.assign(per({made:2, joined:1, rate:50}), {all:2}),
    groups: Object.assign(per({made:1, people:2, avg:2, max:2}), {all:1}),
    orders: Object.assign(per({created:1, paid:1, failed:0, revenue:990, byProduct:{}}), {all:1}),
    ai: Object.assign(per({generated:1, costKrw:101}), {cached:1, reuse:0, costPerKrw:101}),
    kakao: {linked:1, d1:1, d7:1},
    sync: {saved:1, d7:1},
    feedback: {all:0, d1:0, d7:0, byStatus:{}, waiting:0},
    recent: [],
  };
})();

const P_A = {name:'가영', mbti:'ENFP', birth:'1990-03-05', time:'09:30', gender:'여', lon:'126.98', solarTime:'보정함'};
const P_B = {name:'민수', mbti:'ISTJ', birth:'1988-11-22', time:'모름',  gender:'남', lon:'129.08', solarTime:'보정 안 함'};

const ROWS = {
  rooms: [{id:'RM-001', a:P_A, b:P_B, at:'2026-09-10T01:02:03Z', joinedAt:'2026-09-10T01:09:08Z', expiresAt:'2026-10-10T01:02:03Z'},
          {id:'RM-002', a:P_A, b:null, at:'2026-09-09T22:11:00Z', joinedAt:null, expiresAt:'2026-10-09T22:11:00Z'}],
  groups: [{id:'GR-777', name:'회사 모임', people:2, members:[P_A, P_B], hasPin:false, hasOwner:true,
            at:'2026-09-08T05:06:07Z', updatedAt:'2026-09-09T05:06:07Z', expiresAt:'2026-11-08T05:06:07Z'}],
  orders: [{id:'ORD-12345', productId:'compat_full', name:'궁합 심층 해석', amount:990, status:'paid',
            sessionId:'sess-abcdef', paymentKey:'있음', at:'2026-09-10T02:03:04Z', paidAt:'2026-09-10T02:03:44Z'}],
  ai: [{id:'ck-0011aa22', name:'궁합 심층 해석', model:'claude-sonnet-5', chars:6841,
        sessionId:'sess-abcdef', at:'2026-09-10T02:04:05Z'}],
  /* 회원 한 명 통째 — 카카오 번호 · 넣으신 사주/성격유형 · 결제 여부 (2026-09-10) */
  kakao: [
    {id:'4123456789', sessionId:'sess-abcdef', at:'2026-09-01T00:00:01Z', updatedAt:'2026-09-10T00:00:01Z',
     synced:true, rev:7, syncedAt:'2026-09-10T00:00:02Z', history:5, groups:1,
     paidCount:1, revenue:990,
     profiles:[{name:'가영', mbti:'ENFP', gender:'여', birth:'1990-03-05', inputBirth:'1990-02-09',
                calendar:'음력', time:'09:30', place:'seoul', lon:'126.98', solarTime:'보정함',
                element:'목', zodiac:'말', saju:'경오 임오 신해 계사', createdAt:1757000000000}],
     orders:[{id:'ORD-12345', name:'궁합 심층 해석', amount:990, status:'paid', at:'2026-09-10T02:03:44Z'}]},
    /* 로그인만 하고 사주를 안 넣은 분 — 여기가 비면 화면이 조용히 빈 줄을 그린다 */
    {id:'4198765432', sessionId:'sess-zzz', at:'2026-09-02T00:00:01Z', updatedAt:'2026-09-02T00:00:01Z',
     synced:false, rev:null, syncedAt:null, history:0, groups:0,
     paidCount:0, revenue:0, profiles:[], orders:[]},
  ],
  sync: [{id:'4123456789', rev:7, profiles:2, history:5, groups:1, bytes:4096,
          at:'2026-09-01T00:00:01Z', updatedAt:'2026-09-10T00:00:02Z'}],
};

(async () => {
  const R = L.reporter('관리자 원자료');
  const exe = L.chromePath(), pp = L.puppeteer();
  if(!exe || !pp){ console.error('크롬 또는 puppeteer-core 를 못 찾았습니다.'); process.exit(2); }
  const browser = await pp.launch({executablePath:exe, headless:'new', args:['--no-sandbox']});
  const page = await L.openPage(browser, {width:390, height:1400, state:L.makeState()});

  await page.setRequestInterception(true);
  page.on('request', function(r){
    const u = r.url();
    const j = (o) => ({status:200, contentType:'application/json', body:JSON.stringify(o)});
    if(u.indexOf('/api/entitlements') >= 0) return r.respond(j({items:{}, pass:null, purchases:[], adminAccess:true, testAccess:true}));
    if(u.indexOf('/api/stats') >= 0){
      let b = {};
      try{ b = JSON.parse(r.postData() || '{}'); }catch(e){}
      if(b.action === 'rows'){
        const rows = ROWS[b.kind];
        if(!rows) return r.respond({status:400, contentType:'application/json', body:JSON.stringify({error:'bad_request', reason:'모르는 갈래예요.'})});
        return r.respond(j({kind:b.kind, rows:rows}));
      }
      return r.respond(j(SUMMARY));
    }
    if(u.indexOf('/api/feedback') >= 0) return r.respond(j({items:[]}));
    if(u.indexOf('/api/') >= 0) return r.respond(j({}));
    r.continue();
  });

  await page.goto(APP + '#admin', {waitUntil:'load'});
  await L.wait(3000);

  /* ⓪ 대시보드 (2026-09-10 대표님 지시 "대시보드도 좀 넣어둬라! 날짜 요소도 넣어두고!") */
  R.head('⓪ 대시보드 — 기간 고르기·요약·그래프');
  const dash0 = await page.evaluate(() => {
    const t = ((document.querySelector('#main')||{}).innerText||'').replace(/\s+/g,' ');
    return {
      text: t,
      presets: [...document.querySelectorAll('#main .seg-toggle button')].map(b => b.textContent.trim()),
      cells: [...document.querySelectorAll('#main .dash-cell')].map(c => (c.innerText||'').replace(/\s+/g,' ')),
      bars: document.querySelectorAll('#main .dash-chart rect').length,
      metrics: [...document.querySelectorAll('#main .dash-metrics button')].map(b => b.textContent.trim()),
    };
  });
  R.note(dash0.text.indexOf('대시보드') >= 0, '대시보드 칸이 있다');
  R.note(['오늘','7일','30일','전체','직접'].every(x => dash0.presets.indexOf(x) >= 0),
         '기간 프리셋 다섯이 있다', dash0.presets.join(','));
  R.note(dash0.metrics.length === 6, '그래프 지표가 여섯이다', dash0.metrics.join(','));
  R.note(dash0.cells.length === 4, '요약 칸이 넷이다', String(dash0.cells.length));
  /* 처음 열면 7일이다(STATS_RANGE 기본값). 막대도 이레치여야 한다. */
  R.note(/1,980/.test(dash0.cells.join(' ')), '고른 기간의 매출이 더해진다', dash0.cells[0]);
  R.note(dash0.bars === 7, '처음 열면 이레치를 그린다 (값이 0인 날도)', dash0.bars + '개');

  /* [30일] 로 넓히면 있는 만큼(열흘) 다 그려야 한다 */
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#main .dash-metrics')].length ?
      [...document.querySelectorAll('#main .seg-toggle button')].find(x => x.textContent.trim() === '30일') : null;
    if(b) b.click();
  });
  await L.wait(700);
  const wide = await page.evaluate(() => document.querySelectorAll('#main .dash-chart rect').length);
  R.note(wide === 10, '[30일] 은 가진 날(열흘)을 다 그린다', wide + '개');

  /* [오늘] 로 좁히면 숫자가 실제로 줄어야 한다 — 안 줄면 기간 고르기가 장식이다 */
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#main .seg-toggle button')]
      .find(x => x.textContent.trim() === '오늘');
    if(b) b.click();
  });
  await L.wait(700);
  const dash1 = await page.evaluate(() => ({
    cells: [...document.querySelectorAll('#main .dash-cell')].map(c => (c.innerText||'').replace(/\s+/g,' ')),
    bars: document.querySelectorAll('#main .dash-chart rect').length,
  }));
  R.note(dash1.bars === 1, '[오늘] 은 하루치만 그린다', dash1.bars + '개');
  R.note(/1,980/.test(dash1.cells.join(' ')), '오늘 매출이 1,980원이다 (마지막 날에 넣었다)', dash1.cells[0]);

  /* [직접] — 날짜 입력이 실제로 생기고, 바꾸면 숫자가 따라오는가 */
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#main .seg-toggle button')]
      .find(x => x.textContent.trim() === '직접');
    if(b) b.click();
  });
  await L.wait(700);
  const dates = await page.evaluate(() => [...document.querySelectorAll('#main input[type="date"]')]
    .map(i => ({v:i.value, min:i.min, max:i.max})));
  R.note(dates.length === 2, '날짜 고르는 칸이 둘이다', JSON.stringify(dates));
  R.note(!!(dates[0] && dates[0].min && dates[0].max), '고를 수 있는 범위가 정해져 있다',
         dates[0] ? (dates[0].min + ' ~ ' + dates[0].max) : '');
  /* 매출이 없는 앞쪽 닷새로 옮긴다 → 매출 0원이 나와야 한다 */
  const early = await page.evaluate((d) => {
    const ins = [...document.querySelectorAll('#main input[type="date"]')];
    ins[0].value = d.from; ins[0].dispatchEvent(new Event('change', {bubbles:true}));
    return true;
  }, {from: DAILY[0].d});
  await L.wait(500);
  await page.evaluate((d) => {
    const ins = [...document.querySelectorAll('#main input[type="date"]')];
    ins[1].value = d.to; ins[1].dispatchEvent(new Event('change', {bubbles:true}));
  }, {to: DAILY[4].d});
  await L.wait(700);
  const dash2 = await page.evaluate(() => ({
    cells: [...document.querySelectorAll('#main .dash-cell')].map(c => (c.innerText||'').replace(/\s+/g,' ')),
    bars: document.querySelectorAll('#main .dash-chart rect').length,
    text: ((document.querySelector('#main')||{}).innerText||'').replace(/\s+/g,' '),
  }));
  R.note(early && dash2.bars === 5, '고른 날짜만큼만 그린다', dash2.bars + '개');
  R.note(/0원/.test(dash2.cells[0]), '매출이 없는 기간은 0원으로 나온다', dash2.cells[0]);
  R.note(dash2.text.indexOf(DAILY[0].d) >= 0 && dash2.text.indexOf(DAILY[4].d) >= 0,
         '고른 기간이 화면에 적힌다');

  /* 지표를 바꾸면 그래프가 그 값을 그리는가 */
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#main .dash-metrics button')]
      .find(x => x.textContent.trim() === '링크');
    if(b) b.click();
  });
  await L.wait(600);
  const picked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#main .dash-metrics button')]
      .find(x => x.getAttribute('aria-pressed') === 'true');
    return b ? b.textContent.trim() : '';
  });
  R.note(picked === '링크', '고른 지표가 눌린 채로 남는다', picked);

  /* 30일로 되돌려 놓고 아래 검사를 이어간다 */
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#main .seg-toggle button')]
      .find(x => x.textContent.trim() === '30일');
    if(b) b.click();
  });
  await L.wait(700);

  /* ① 요약 화면에 원자료로 가는 길이 있는가 */
  R.head('① 카드마다 원자료로 가는 길');
  const btns = await page.evaluate(() => [...document.querySelectorAll('#main button')]
    .map(b => (b.textContent||'').trim()).filter(t => /원자료/.test(t)));
  R.note(btns.length >= 6, '원자료 단추가 여섯 개 이상 있다', btns.length + '개');

  /* 갈래마다 눌러서 실제 값이 찍히는지 */
  /* ★ 손님이 밟는 길 그대로 — 카드에서 단추를 실제로 누른다.
     함수를 직접 부르면 '단추가 없어져도 통과하는' 검사가 된다. */
  const CARD_OF = {rooms:'궁합 링크', groups:'그룹', orders:'결제', ai:'AI 해석', kakao:'카카오 로그인'};
  async function open(kind){
    const clicked = await page.evaluate((title) => {
      let b = null;
      if(title){
        const c = [...document.querySelectorAll('#main .scroll-card')]
          .find(x => ((x.querySelector('h3')||{}).textContent||'').trim() === title);
        b = c && [...c.querySelectorAll('button')].find(x => /원자료/.test(x.textContent||''));
      } else {
        b = [...document.querySelectorAll('#main button')]
          .find(x => /이어보기 원자료/.test(x.textContent||''));
      }
      if(b) b.click();
      return !!b;
    }, CARD_OF[kind] || null);
    await L.wait(1000);
    const o = await page.evaluate(() => ({
      text: ((document.querySelector('#main')||{}).innerText || '').replace(/\s+/g,' '),
      over: [...document.querySelectorAll('#main .raw-v, #main .raw-title, #main .raw-sub')]
              .filter(x => x.scrollWidth > x.clientWidth + 1).length,
      rows: document.querySelectorAll('#main .raw-row').length,
    }));
    o.clicked = clicked;
    return o;
  }
  async function back(){
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('#main button')]
        .find(x => /현황으로/.test(x.textContent||''));
      if(b) b.click();
    });
    await L.wait(800);
  }

  R.head('② 그룹 — 사람 하나하나가 다 보이는가');
  let o = await open('groups');
  R.note(o.clicked, '[그룹] 카드의 원자료 단추를 눌렀다');
  R.note(o.rows === 1, '줄이 하나 그려진다', o.rows + '줄');
  ['회사 모임','GR-777','2명','가영','ENFP','1990-03-05','09:30','여','민수','ISTJ','1988-11-22','모름','남','만든 분 표식 있음']
    .forEach(function(w){ R.note(o.text.indexOf(w) >= 0, "'" + w + "' 가 보인다"); });
  R.note(/\d{2}:\d{2}:\d{2}/.test(o.text), '시각이 초까지 찍힌다');
  R.note(o.over === 0, '글자 넘침 0건 (390)', o.over + '건');

  R.head('③ 궁합 링크 — 보낸 분·받은 분');
  await back(); o = await open('rooms');
  R.note(o.clicked, '[궁합 링크] 카드의 원자료 단추를 눌렀다');
  R.note(o.rows === 2, '두 줄이 그려진다', o.rows + '줄');
  ['RM-001','보낸 분','받은 분','가영','민수'].forEach(function(w){
    R.note(o.text.indexOf(w) >= 0, "'" + w + "' 가 보인다"); });
  R.note(o.text.indexOf('아직 안 들어왔어요') >= 0, '아직 안 들어온 링크를 그렇게 적는다');
  R.note(o.text.indexOf('아직 없어요') >= 0, '받은 분이 없는 줄을 그렇게 적는다');

  R.head('④ 결제 — 영수증·세션·결제 시각');
  await back(); o = await open('orders');
  R.note(o.clicked, '[결제] 카드의 원자료 단추를 눌렀다');
  ['ORD-12345','궁합 심층 해석','결제완료','990','sess-abcdef','compat_full']
    .forEach(function(w){ R.note(o.text.indexOf(w) >= 0, "'" + w + "' 가 보인다"); });
  R.note(o.text.indexOf('열람 여부까지 보기') >= 0, '주문 상세로 가는 단추가 있다');

  R.head('⑤ AI · 카카오 · 이어보기');
  await back(); o = await open('ai');
  ['claude-sonnet-5','6841자','ck-0011aa22'].forEach(function(w){
    R.note(o.text.indexOf(w) >= 0, "AI — '" + w + "' 가 보인다"); });
  await back(); o = await open('kakao');
  R.note(o.clicked, '[회원] 카드의 원자료 단추를 눌렀다');
  R.head('⑤-2 회원 — 사주·성격유형·결제 여부가 다 보이는가');
  ['4123456789','가영','ENFP','1990-03-05','음력','넣으신 날짜 1990-02-09','09:30','seoul',
   '사주 경오 임오 신해 계사','목 기운','말띠','보정함']
    .forEach(function(w){ R.note(o.text.indexOf(w) >= 0, "회원 — '" + w + "' 가 보인다"); });
  R.note(/결제\s*1건/.test(o.text), '결제한 분은 건수와 금액이 보인다');
  R.note(o.text.indexOf('궁합 심층 해석') >= 0 && o.text.indexOf('ORD-12345') >= 0,
         '무엇을 샀는지 · 영수증 번호까지 보인다');
  R.note(o.text.indexOf('저장본 7번') >= 0, '이어보기 저장본 번호가 보인다');
  /* ★ 안 낸 분을 '없음'이라고 분명히 적는가 — 빈칸으로 두면 '아직 안 불러온 것'과 구별이 안 된다 */
  R.note(o.text.indexOf('4198765432') >= 0, '결제 안 한 분도 줄이 있다');
  R.note(/결제\s*없음/.test(o.text), "결제가 없으면 '없음'이라고 적는다");
  R.note(o.text.indexOf('로그인만 하시고 사주를 안 넣으셨어요') >= 0,
         '프로필이 없는 분에게 그 이유를 적는다');
  await back(); o = await open('sync');
  R.note(o.clicked, '[이어보기 원자료 보기] 단추를 눌렀다');
  ['2개','5건','4096자'].forEach(function(w){
    R.note(o.text.indexOf(w) >= 0, "이어보기 — '" + w + "' 가 보인다"); });

  R.head('⑥ 좁은 화면 (320)');
  await page.setViewport({width:320, height:1400});
  await back(); o = await open('groups');
  R.note(o.over === 0, '320 에서도 글자 넘침 0건', o.over + '건');
  const docW = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  R.note(docW[0] <= docW[1] + 1, '가로로 안 넘친다', docW.join(' / '));

  R.head('⑦ 돌아가기');
  await page.setViewport({width:390, height:1400});
  await back();
  const home = await page.evaluate(() => ((document.querySelector('#main')||{}).innerText||'').replace(/\s+/g,' '));
  R.note(home.indexOf('궁합 링크') >= 0 && home.indexOf('원자료 보기') >= 0, '현황 화면으로 돌아온다');
  R.note(page.__errs.length === 0, 'JS 오류 0건', page.__errs[0] || '');

  await browser.close();
  R.done();
})().catch((e) => { console.error('검사 자체가 터졌습니다:', e && e.message); process.exit(2); });
