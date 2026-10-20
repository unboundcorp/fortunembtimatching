#!/usr/bin/env node
/* =====================================================================
   관리자 대시보드 광고비 카드 (느린 층) — 2026-10-20
   ---------------------------------------------------------------------
   대표님 지시 "메타 mcp로 인연점 어드민에 광고비 끌어올 수 있냐?".
   가짜 /api/stats 로 세 경우를 연다.
   ① 연결됨 — 광고비 합 · 가입당 · 결제당 · '남는 것'에서 광고비를 뺌 · 그래프 · 계정 이름
   ② 연결 전 — '광고 계정 연결 전' + 서버 이유 · 광고비 숫자 없음 · '남는 것'은 광고비를 안 뺌
   ③ 옛 서버(ads 칸 없음) — 화면이 안 죽음
   ★ 서버 코드는 안 거친다 — 그쪽은 checks/meta_ads_pair.cjs 가 실제로 돌린다.
===================================================================== */
const L = require('../_lib.cjs');

const day = (i) => new Date(Date.now() + 9*3600*1000 - i*86400000).toISOString().slice(0,10);
const blank = (d) => ({d, rooms:{made:0,joined:0}, groups:{made:0,people:0,max:0},
  orders:{created:0,paid:0,failed:0,revenue:0,byProduct:{}},
  ai:{generated:0,inTok:0,outTok:0,costKrw:0,estimated:0}, kakao:{linked:0}, feedback:{created:0}});
function summary(mode){
  const daily = [];
  for(let i = 29; i >= 0; i--) daily.push(blank(day(i)));
  /* 7일 안: 매출 5,700(결제 3건) · AI 300 · 새 회원 4 · 광고비 12,000 */
  daily[28].orders = {created:3, paid:3, failed:0, revenue:5700, byProduct:{'사주 풀이':{count:3, amount:5700}}};
  daily[28].ai.costKrw = 300; daily[28].ai.generated = 1;
  daily[28].kakao.linked = 4;
  if(mode === 'on'){
    daily.forEach((r) => { r.ads = {spend:0, impr:0, clicks:0}; });
    daily[27].ads = {spend:5000, impr:2000, clicks:40};
    daily[28].ads = {spend:7000, impr:3000, clicks:60};
    daily[10].ads = {spend:99999, impr:1, clicks:1};   /* 7일 밖 — 7일 합에 들어가면 안 된다 */
  }
  const s = {now:new Date().toISOString(), daily, dailyDays:90,
    rooms:{all:0}, groups:{all:0}, orders:{all:3}, ai:{cached:0, reuse:0, costPerKrw:101},
    kakao:{linked:4}, sync:{saved:0}, feedback:{all:0, byStatus:{}, waiting:0}, recent:[], people:[]};
  if(mode === 'on') s.ads = {connected:true, reason:null, version:'v23.0',
    accounts:[{id:'act_111', name:'인연점 광고', currency:'KRW', tz:'Asia/Seoul', included:true},
              {id:'act_222', name:'달러 계정', currency:'USD', tz:'America/Los_Angeles', included:false}]};
  if(mode === 'off') s.ads = {connected:false, reason:'광고 계정 연결 전이에요 (Vercel 에 META_ADS_TOKEN 이 없어요).', accounts:[]};
  return s;
}

(async () => {
  const R = L.reporter('대시보드 광고비');
  let base = (process.argv[2] || '').replace(/\/+$/, ''), srv = null;
  if(!base){ srv = await L.serve(L.ROOT, 0); base = srv.url.replace(/\/+$/, ''); }
  const exe = L.chromePath(), pp = L.puppeteer();
  if(!exe || !pp){ console.error('크롬 또는 puppeteer-core 를 못 찾았습니다.'); process.exit(2); }
  const browser = await pp.launch({executablePath:exe, headless:'new', args:['--no-sandbox']});

  async function open(mode, width){
    const page = await L.openPage(browser, {width:width || 1280, height:1000, state:L.makeState()});
    const errs = []; page.on('pageerror', (e) => errs.push(String(e && e.message)));
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const u = r.url(), j = (o) => ({status:200, contentType:'application/json', body:JSON.stringify(o)});
      if(u.indexOf('/api/entitlements') >= 0) return r.respond(j({items:{}, pass:null, purchases:[], adminAccess:true, testAccess:false}));
      if(u.indexOf('/api/stats') >= 0) return r.respond(j(summary(mode)));
      if(u.indexOf('/api/feedback') >= 0) return r.respond(j({items:[]}));
      if(u.indexOf('/api/') >= 0) return r.respond(j({}));
      r.continue();
    });
    await page.goto(base + '/fortune.html#admin', {waitUntil:'load'});
    await L.wait(3000);
    const o = await page.evaluate(() => {
      const root = document.querySelector('#adminRoot');
      const kpis = [...root.querySelectorAll('.ad-kpi > .ad-card')].map((c) => (c.innerText || '').replace(/\s+/g, ' '));
      return { text: (root.innerText || '').replace(/\s+/g, ' '), kpis,
               charts: root.querySelectorAll('svg.ad-chart').length,
               docOver: document.documentElement.scrollWidth > document.documentElement.clientWidth };
    });
    o.errs = errs; await page.close(); return o;
  }

  R.head('① 연결됨 (7일)');
  const on = await open('on');
  const profit = on.kpis.find((t) => t.indexOf('남는 것') === 0) || '';
  R.note(on.text.indexOf('광고비 · 메타') >= 0, '광고비 카드가 있다');
  R.note(/광고비\s*12,000원/.test(on.text), '7일 광고비 합 12,000원(7일 밖 99,999원은 안 셈)', on.text.match(/광고비\s*[\d,]+원/) + '');
  R.note(/새 회원 1명당 광고비\s*3,000원/.test(on.text), '새 회원 1명당 = 12,000 ÷ 4');
  R.note(/결제 1건당 광고비\s*4,000원/.test(on.text), '결제 1건당 = 12,000 ÷ 3');
  R.note(/남는 것\s*-6,600원/.test(profit) || /남는 것\s*−6,600원/.test(profit), "'남는 것' = 5,700 − 300 − 12,000", profit.slice(0, 80));
  R.note(profit.indexOf('광고비 12,000원') >= 0, "'남는 것' 설명에 광고비를 뺐다고 적음");
  R.note(on.charts >= 2, '매출·광고비 그래프가 있다', on.charts);
  R.note(on.text.indexOf('인연점 광고 (act_111)') >= 0, '더한 계정 이름');
  R.note(on.text.indexOf('달러 계정 · USD') >= 0, '원화가 아닌 계정은 빠졌다고 적음');
  R.note(on.errs.length === 0, 'JS 오류 0건', on.errs[0] || '');

  R.head('② 연결 전');
  const off = await open('off');
  const profit2 = off.kpis.find((t) => t.indexOf('남는 것') === 0) || '';
  R.note(off.text.indexOf('광고 계정 연결 전') >= 0, "'광고 계정 연결 전'");
  R.note(off.text.indexOf('META_ADS_TOKEN') >= 0, '서버가 준 이유를 그대로');
  R.note(!/새 회원 1명당 광고비/.test(off.text), '연결 전에는 광고비 숫자를 지어내지 않음');
  R.note(/남는 것\s*5,400원/.test(profit2) && profit2.indexOf('광고비는 연결 전') >= 0, "'남는 것'은 광고비를 안 빼고 그 사실을 적음", profit2.slice(0, 90));
  R.note(off.errs.length === 0, 'JS 오류 0건', off.errs[0] || '');

  R.head('③ 옛 서버 · 좁은 화면');
  const old = await open('old');
  R.note(old.text.indexOf('결제 매출') >= 0 && old.errs.length === 0, 'ads 칸이 없어도 대시보드가 선다', old.errs[0] || '');
  const narrow = await open('on', 390);
  R.note(!narrow.docOver, '폭 390 가로 넘침 없음');
  R.note(narrow.errs.length === 0, '폭 390 JS 오류 0건', narrow.errs[0] || '');

  await browser.close();
  if(srv && srv.close) srv.close();
  R.done();
})().catch((e) => { console.error('검사 자체가 터졌습니다:', e && e.message); process.exit(2); });
