#!/usr/bin/env node
/* =====================================================================
   어드민 셸 — 실제로 눌러서 도는가 (느린 층)
   ---------------------------------------------------------------------
   2026-09-11 대표님 지시로 만든 사이드바형 관리자 화면을 지킨다.
     > "어드민 페이지 고도화해라 … 이정도 수준의 UI와 기능 대시보드 구성을 좀 해봐라
     >  모바일 버전도 호환되게 해야한다"

   ★ 글자 대조(checks/admin_pair.cjs)로는 "눌렀을 때 실제로 뜨는가"를 못 본다.
   ★ 좁은 화면(390)에서 서랍이 열리고 닫히는지, 가로로 넘치지 않는지도 여기서 잰다.
   ★ 가짜 서버를 쓰므로 **서버 코드는 하나도 안 거친다.** 그쪽은 빠른 층이 실제로 돌려 본다.
     (예전에 이 사실을 잊고 "48건 통과"를 근거로 서버가 멀쩡하다고 여긴 적이 있다.)
===================================================================== */
const L = require('../_lib.cjs');
const BASE = (process.argv[2] || 'http://127.0.0.1:8899').replace(/\/+$/, '');
const APP = BASE + '/fortune.html';

const day = (i) => new Date(Date.now() + 9*3600*1000 - i*86400000).toISOString().slice(0,10);
const blank = (d, o) => Object.assign({d, rooms:{made:0,joined:0}, groups:{made:0,people:0,max:0},
  orders:{created:0,paid:0,failed:0,revenue:0,byProduct:{}},
  ai:{generated:0,inTok:0,outTok:0,costKrw:0,estimated:0}, kakao:{linked:0},
  feedback:{created:0}}, o||{});
const DAILY = (function(){
  const out = [];
  for(let i = 29; i >= 0; i--) out.push(blank(day(i)));
  out[27].orders = {created:3, paid:2, failed:1, revenue:2890,
                    byProduct:{'궁합 심층 해석':{count:2, amount:1980}}};
  out[27].ai.generated = 2;
  out[27].ai.inTok = 12000; out[27].ai.outTok = 9000; out[27].ai.costKrw = 157; out[27].ai.estimated = 0;
  out[29].rooms.made = 2; out[29].rooms.joined = 1; out[29].kakao.linked = 1;
  return out;
})();
const SUMMARY = {now:new Date().toISOString(), daily:DAILY, dailyDays:90,
  rooms:{d1:{},d7:{},d30:{},all:12}, groups:{d1:{},d7:{},d30:{},all:4},
  orders:{d1:{},d7:{},d30:{},all:6}, ai:{d1:{},d7:{},d30:{},cached:5,reuse:2,costPerKrw:101,
      price:{inPerMTokUsd:2,outPerMTokUsd:10,usdKrw:1380}},
  kakao:{linked:7,d1:1,d7:3}, sync:{saved:5,d7:2},
  feedback:{all:2,d1:1,d7:2,byStatus:{received:1,answered:1},waiting:1}, recent:[]};

const P_A = {name:'가영',mbti:'ENFP',gender:'여',birth:'1990-03-05',inputBirth:'1990-02-09',
  calendar:'음력',time:'09:30',place:'seoul',lon:'126.98',solarTime:'보정함',
  element:'목',zodiac:'말',saju:'경오 임오 신해 계사'};
const P_B = {name:'민수',mbti:'ISTJ',gender:'남',birth:'1988-11-22',inputBirth:'',
  calendar:'양력',time:'모름',place:'seoul',lon:'126.98',solarTime:'보정 안 함',
  element:'금',zodiac:'용',saju:'무진 계해 신유'};
const ROWS = {
  kakao:[
    {id:'5057959396',sessionId:'sess-abc',at:'2026-09-09T05:50:35Z',updatedAt:'2026-09-10T03:11:16Z',
     synced:true,rev:7,syncedAt:'2026-09-10T03:11:16Z',history:5,groups:1,paidCount:2,revenue:2890,
     profiles:[P_A,P_B],
     orders:[{id:'ORD-1',name:'궁합 심층 해석',amount:990,status:'paid',at:'2026-09-10T02:03:44Z'}]},
    {id:'5073954894',sessionId:'sess-zzz',at:'2026-09-09T05:48:53Z',updatedAt:'2026-09-10T08:38:44Z',
     synced:false,rev:null,syncedAt:null,history:0,groups:0,paidCount:0,revenue:0,profiles:[],orders:[]}],
  orders:[
    {id:'ORD-1',productId:'compat_full',name:'궁합 심층 해석',amount:990,status:'paid',
     sessionId:'sess-abc',paymentKey:'있음',at:'2026-09-10T02:03:04Z',paidAt:'2026-09-10T02:03:44Z'},
    {id:'ORD-3',productId:'compat_full',name:'궁합 심층 해석',amount:990,status:'failed',
     sessionId:'sess-zzz',paymentKey:'없음',at:'2026-09-10T03:00:00Z',paidAt:null}],
  rooms:[{id:'RM-001',a:P_A,b:P_B,at:'2026-09-10T01:02:03Z',joinedAt:'2026-09-10T01:09:08Z',expiresAt:'2026-10-10T01:02:03Z'},
         {id:'RM-002',a:P_A,b:null,at:'2026-09-09T22:11:00Z',joinedAt:null,expiresAt:'2026-10-09T22:11:00Z'}],
  groups:[{id:'GR-777',name:'회사 모임',people:2,members:[P_A,P_B],hasPin:false,hasOwner:true,
           at:'2026-09-08T05:06:07Z',updatedAt:'2026-09-09T05:06:07Z',expiresAt:'2026-11-08T05:06:07Z'}],
  ai:[{id:'ck-0011',name:'궁합 심층 해석',model:'claude-sonnet-5',chars:6841,
       sessionId:'sess-abc',at:'2026-09-10T02:04:05Z',
       inTok:12000,outTok:9000,costKrw:157,estimated:false},
      {id:'ck-0012',name:'사주 풀이 · 2026년',model:'claude-sonnet-5',chars:5000,
       sessionId:'sess-abc',at:'2026-09-08T02:04:05Z',
       inTok:null,outTok:null,costKrw:101,estimated:true},
      /* ★ 옛 서버가 토큰·비용 칸을 아예 안 내려주는 경우. 이 줄이 없으면
         "값이 없으면 터지는" 결함을 못 잡는다 — 실제로 그렇게 [AI 해석] 화면이
         통째로 죽는 것을 스크린샷으로 잡았다(2026-09-11). */
      {id:'ck-0013',name:'성격유형 풀이',model:'',chars:0,
       sessionId:'sess-old',at:'2026-09-07T02:04:05Z'}],
  sync:[{id:'5057959396',rev:7,profiles:2,history:5,groups:1,bytes:4096,
         at:'2026-09-01T00:00:01Z',updatedAt:'2026-09-10T00:00:02Z'}],
};
const TICKETS = [
  {id:11,kind:'refund',screen:'결제',body:'결제했는데 결과가 안 보여요.',contact:'test@example.com',
   status:'received',created_at:'2026-09-10T01:00:00Z',reply:null},
  {id:10,kind:'idea',screen:'궁합',body:'링크가 안 열려요',contact:'',
   status:'answered',created_at:'2026-09-09T01:00:00Z',reply:'확인 후 고쳤습니다.'},
];
const NOTICES = [{id:1,title:'9월 12일 새벽 점검 안내',body:'02:00~03:00 잠시 멈춥니다.',kind:'banner',
                  starts_at:null,ends_at:null,active:true,
                  created_at:'2026-09-10T00:00:00Z',updated_at:'2026-09-10T00:00:00Z'}];

function wire(page, opt){
  opt = opt || {};
  page.on('request', function(r){
    const u = r.url();
    const j = (o) => ({status:200, contentType:'application/json', body:JSON.stringify(o)});
    if(u.indexOf('/api/entitlements') >= 0)
      return r.respond(j({items:{}, pass:null, purchases:[],
                          adminAccess: opt.admin !== false, testAccess:true}));
    if(u.indexOf('/api/stats') >= 0){
      let b = {}; try{ b = JSON.parse(r.postData() || '{}'); }catch(e){}
      if(b.action === 'rows') return r.respond(j({kind:b.kind, rows:ROWS[b.kind] || []}));
      return r.respond(j(SUMMARY));
    }
    if(u.indexOf('/api/feedback') >= 0) return r.respond(j({items:TICKETS}));
    if(u.indexOf('/api/notice') >= 0){
      let b = {}; try{ b = JSON.parse(r.postData() || '{}'); }catch(e){}
      if(b.action === 'active') return r.respond(j({items:NOTICES.map(function(n){
        return {id:n.id, title:n.title, body:n.body, kind:n.kind}; })}));
      return r.respond(j({items:NOTICES}));
    }
    if(u.indexOf('/api/') >= 0) return r.respond(j({}));
    r.continue();
  });
}
const LABEL = {dash:'대시보드', members:'회원 관리', tickets:'문의 · CS', payments:'결제',
               compat:'궁합 · 모임', ai:'AI 해석', notices:'공지 · 배너', export:'데이터 내보내기'};

(async () => {
  const R = L.reporter('어드민 셸');
  const exe = L.chromePath(), pp = L.puppeteer();
  if(!exe || !pp){ console.error('크롬 또는 puppeteer-core 를 못 찾았습니다.'); process.exit(2); }
  const browser = await pp.launch({executablePath:exe, headless:'new', args:['--no-sandbox']});

  /* ── 넓은 화면 ────────────────────────────────────────────────── */
  const page = await L.openPage(browser, {width:1280, height:1000, state:L.makeState()});
  await page.setRequestInterception(true);
  wire(page);
  await page.goto(APP + '#admin', {waitUntil:'load'});
  await L.wait(3200);

  async function go(key){
    const ok = await page.evaluate((label) => {
      const b = [...document.querySelectorAll('#adminRoot .ad-nav')]
        .find(x => (x.textContent||'').trim().indexOf(label) === 0);
      if(b) b.click();
      return !!b;
    }, LABEL[key]);
    await L.wait(1100);
    const o = await page.evaluate(() => ({
      text: ((document.querySelector('#adminRoot')||{}).innerText || '').replace(/\s+/g,' '),
      title: ((document.querySelector('#adminRoot .ad-title')||{}).textContent || '').trim(),
      over: [...document.querySelectorAll('#adminRoot .ad-card, #adminRoot .ad-title, #adminRoot .ad-v')]
              .filter(x => x.scrollWidth > x.clientWidth + 1).length,
      hash: location.hash,
    }));
    o.clicked = ok;
    return o;
  }

  R.head('① 셸이 서는가');
  const shell = await page.evaluate(() => ({
    hidden: document.querySelector('#adminRoot').hidden,
    outsideApp: !document.querySelector('#app').contains(document.querySelector('#adminRoot')),
    navs: [...document.querySelectorAll('#adminRoot .ad-nav')].map(b => b.textContent.trim()),
    groups: [...document.querySelectorAll('#adminRoot .ad-group')].map(b => b.textContent.trim()),
    icons: document.querySelectorAll('#adminRoot .ad-nav svg').length,
    title: ((document.querySelector('#adminRoot .ad-title')||{}).textContent||'').trim(),
    tabbarShows: (function(){
      const t = document.querySelector('#tabbarWrap');
      if(!t || t.hidden) return false;
      const r = t.getBoundingClientRect();
      const top = document.elementFromPoint(Math.round(r.left + r.width/2), Math.round(r.top + r.height/2));
      return !!(top && t.contains(top));   /* 어드민 위로 비쳐 보이면 true */
    })(),
  }));
  R.note(!shell.hidden, '어드민 칸이 보인다');
  R.note(shell.outsideApp, '#adminRoot 가 #app 밖에 있다 (420px 에 안 갇힌다)');
  R.note(shell.navs.length === 8, '메뉴가 여덟이다', shell.navs.join(' / '));
  R.note(shell.groups.length === 5, '묶음이 다섯이다', shell.groups.join(' / '));
  R.note(shell.icons === 8, '메뉴마다 아이콘이 그려진다', shell.icons + '개');
  R.note(shell.title === '대시보드', '처음은 대시보드다', shell.title);
  /* ★ 손님용 탭 막대가 어드민 위로 비쳐 보이던 적이 있다(겹침 순서). 그 자리를 지킨다. */
  R.note(!shell.tabbarShows, '손님 탭 막대가 어드민 위로 안 비친다');

  R.head('② 대시보드');
  let o = await go('dash');
  ['오늘 처리할 일','결제 매출','새 회원','궁합 링크','AI 비용','남는 것',
   '활동 추이','궁합 링크 퍼널','상품별 매출','서비스 상태']
    .forEach(function(w){ R.note(o.text.indexOf(w) >= 0, "'" + w + "' 가 있다"); });
  const dash = await page.evaluate(() => ({
    kpis: document.querySelectorAll('#adminRoot .ad-kpi .ad-card').length,
    sparks: document.querySelectorAll('#adminRoot .ad-spark').length,
    lines: document.querySelectorAll('#adminRoot .ad-chart polyline').length,
    segs: [...document.querySelectorAll('#adminRoot .ad-seg button')].map(b => b.textContent.trim()),
  }));
  R.note(dash.kpis === 6, 'KPI 카드가 여섯이다', dash.kpis + '개');
  R.note(dash.sparks === 6, '카드마다 스파크라인이 있다', dash.sparks + '개');
  /* ★ 비용과 남는 것이 실제 값으로 셈되는가 — 매출 2,890 − AI 157 = 2,733 */
  R.note(/157원/.test(o.text), 'AI 비용이 토큰으로 셈된다 (건당 추정이 아니라)');
  R.note(/2,733원/.test(o.text), '남는 것 = 매출 − AI 비용', o.text.slice(0,0));
  R.note(/토큰 입력 12,000 · 출력 9,000/.test(o.text), '쓴 토큰이 그대로 보인다');
  R.note(dash.lines === 3, '활동 추이가 세 줄이다', dash.lines + '줄');
  R.note(['7일','30일','90일','직접'].every(x => dash.segs.indexOf(x) >= 0), '기간이 넷이다', dash.segs.join(','));
  R.note(/2,890원/.test(o.text), '고른 기간의 매출이 더해진다');
  /* [직접] 을 누르면 날짜 칸이 실제로 생기는가 */
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#adminRoot .ad-seg button')].find(x => x.textContent.trim() === '직접');
    if(b) b.click();
  });
  await L.wait(800);
  const dates = await page.evaluate(() => [...document.querySelectorAll('#adminRoot input[type="date"]')].length);
  R.note(dates === 2, '[직접] 을 누르면 날짜 칸 둘이 생긴다', dates + '개');

  R.head('③ 회원 — 사주·성격유형·결제가 다 보이는가');
  o = await go('members');
  R.note(o.clicked, '[회원 관리] 를 눌렀다');
  ['5057959396','가영','ENFP','경오 임오 신해 계사','결제 2건','2,890원','5073954894','사주 없음']
    .forEach(function(w){ R.note(o.text.indexOf(w) >= 0, "'" + w + "' 가 보인다"); });
  /* ★ 2026-09-11 대표님 영상 제보로 뒤집힌 검사입니다.
     예전에는 주소에 `#admin/members` 를 적는 것이 통과 조건이었는데, 그 주소가
     방문 기록에 박혀 **손님 링크가 운영자 전용 화면을 열었습니다.** 이제 주소에
     아무것도 안 적는 것이 통과 조건입니다. */
  R.note(o.hash === '', '주소에 #admin 이 안 남는다', o.hash || '(빈칸)');
  /* [상세] 서랍 */
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#adminRoot .ad-link')].find(x => x.textContent.trim() === '상세');
    if(b) b.click();
  });
  await L.wait(900);
  const dr = await page.evaluate(() => {
    const p = document.querySelector('#adminRoot .ad-drawer-panel');
    return p ? (p.innerText||'').replace(/\s+/g,' ') : '';
  });
  R.note(!!dr, '[상세] 를 누르면 오른쪽 서랍이 열린다');
  /* ★ 여기가 이 검사의 핵심이다 — element.click() 은 가림을 무시하고 바로 부른다.
     실제로 어두운 막이 패널을 덮어 단추가 하나도 안 눌리는 상태를 그렇게 통과시켰다
     (대표님이 폰에서 잡아 주셨다). 그 자리에 실제로 무엇이 있는지 좌표로 확인한다. */
  const hit = await page.evaluate(() => {
    const out = [];
    ['닫기','이 분 주문 보기'].forEach(function(label){
      const b = [...document.querySelectorAll('#adminRoot .ad-drawer-panel button')]
        .find(x => x.textContent.trim() === label);
      if(!b){ out.push([label, '단추 없음']); return; }
      const r = b.getBoundingClientRect();
      const top = document.elementFromPoint(Math.round(r.left + r.width/2), Math.round(r.top + r.height/2));
      out.push([label, (top && (top === b || b.contains(top))) ? 'ok' : ('가림: ' + (top ? top.className || top.tagName : '없음'))]);
    });
    const panel = document.querySelector('#adminRoot .ad-drawer-panel');
    const pr = panel.getBoundingClientRect();
    const mid = document.elementFromPoint(Math.round(pr.left + pr.width/2), Math.round(pr.top + 60));
    out.push(['패널 가운데', (mid && panel.contains(mid)) ? 'ok' : ('가림: ' + (mid ? mid.className || mid.tagName : '없음'))]);
    return out;
  });
  hit.forEach(function(pr){
    R.note(pr[1] === 'ok', '서랍의 「' + pr[0] + '」 가 실제로 눌리는 자리에 있다', pr[1]);
  });
  ['넣으신 날짜 1990-02-09','민수','ISTJ','결제 이력','궁합 심층 해석',
   '가입(첫 로그인)','마지막 로그인']
    .forEach(function(w){ R.note(dr.indexOf(w) >= 0, "서랍에 '" + w + "' 가 있다"); });
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#adminRoot .ad-drawer-panel button')]
      .find(x => x.textContent.trim() === '닫기');
    if(b) b.click();
  });
  await L.wait(600);
  const closed = await page.evaluate(() => !document.querySelector('#adminRoot .ad-drawer'));
  R.note(closed, '서랍이 닫힌다');
  /* 검색이 실제로 거르는가 */
  await page.evaluate(() => {
    const i = document.querySelector('#adminRoot .ad-search input');
    i.value = '가영';
    i.dispatchEvent(new Event('input', {bubbles:true}));
  });
  await L.wait(700);
  const found = await page.evaluate(() => ({
    rows: document.querySelectorAll('#adminRoot .ad-table tbody tr').length,
    text: ((document.querySelector('#adminRoot')||{}).innerText||'').replace(/\s+/g,' '),
  }));
  R.note(found.rows === 1, '검색이 실제로 거른다', found.rows + '줄');
  R.note(found.text.indexOf('5073954894') < 0, '안 걸린 회원은 사라진다');
  await page.evaluate(() => {
    const i = document.querySelector('#adminRoot .ad-search input');
    i.value = ''; i.dispatchEvent(new Event('input', {bubbles:true}));
  });
  await L.wait(500);

  R.head('④ 문의 · 결제 · 궁합 · AI');
  o = await go('tickets');
  ['#11','결제했는데 결과가 안 보여요','test@example.com','답변 저장']
    .forEach(function(w){ R.note(o.text.indexOf(w) >= 0, "문의 — '" + w + "' 가 보인다"); });
  const badge = await page.evaluate(() => {
    const b = [...document.querySelectorAll('#adminRoot .ad-nav')].find(x => x.textContent.indexOf('문의') === 0);
    return b ? (b.querySelector('.ad-badge') || {}).textContent : null;
  });
  R.note(badge === '1', '메뉴에 미답변 건수가 붙는다', String(badge));

  o = await go('payments');
  ['ORD-1','궁합 심층 해석','결제완료','실패','열람 여부','환불 처리 단추는 아직 없어요']
    .forEach(function(w){ R.note(o.text.indexOf(w) >= 0, "결제 — '" + w + "' 가 보인다"); });

  o = await go('compat');
  ['RM-001','회사 모임','아직 안 들어옴','PIN 없음','만든 분이 관리','열쇠가 저장돼 있어요']
    .forEach(function(w){ R.note(o.text.indexOf(w) >= 0, "궁합 — '" + w + "' 가 보인다"); });

  o = await go('ai');
  ['claude-sonnet-5','6841자','입력 토큰','출력 토큰','12,000','9,000','157원']
    .forEach(function(w){ R.note(o.text.indexOf(w) >= 0, "AI — '" + w + "' 가 보인다"); });
  /* ★ 토큰을 안 적던 옛 줄은 '추정'이라고 분명히 적어야 한다 — 지어낸 값을 진짜처럼 두지 않는다 */
  R.note(/\(추정\)/.test(o.text), '토큰 기록이 없는 줄을 (추정) 으로 적는다');
  R.note(o.text.indexOf('1건은 토큰 기록이 없어') >= 0, '몇 건이 추정인지 적는다');
  R.note(o.text.indexOf('Anthropic 콘솔이 정본') >= 0, '진짜 청구액이 어디에 있는지 적는다');
  /* 값이 하나도 없는 줄이 섞여도 화면이 죽지 않아야 한다 */
  R.note(o.text.indexOf('성격유형 풀이') >= 0, '토큰·비용 칸이 아예 없는 줄도 그려진다');
  R.note(o.text.indexOf('Cannot read') < 0 && o.text.indexOf('undefined') < 0,
         '오류 글자가 화면에 안 뜬다', o.text.slice(0, 60));

  R.head('⑤ 공지 · 배너');
  o = await go('notices');
  R.note(o.text.indexOf('9월 12일 새벽 점검 안내') >= 0, '공지 목록이 보인다');
  R.note(o.text.indexOf('노출 중') >= 0, '지금 뜨는 공지를 그렇게 적는다');
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#adminRoot button')].find(x => x.textContent.trim() === '새 공지 쓰기');
    if(b) b.click();
  });
  await L.wait(700);
  const ed = await page.evaluate(() => ({
    inputs: document.querySelectorAll('#adminRoot input[type="datetime-local"]').length,
    check: document.querySelectorAll('#adminRoot input[type="checkbox"]').length,
    text: ((document.querySelector('#adminRoot')||{}).innerText||'').replace(/\s+/g,' '),
  }));
  R.note(ed.inputs === 2, '기간 칸 둘이 생긴다', ed.inputs + '개');
  R.note(ed.check >= 1, '켜기 칸이 있다');
  R.note(ed.text.indexOf('기간은 비워도 돼요') >= 0, '기간을 비워도 된다고 적었다');

  R.head('⑥ 데이터 내보내기');
  o = await go('export');
  ['회원 목록','결제 내역','AI 해석 이력','내려받기']
    .forEach(function(w){ R.note(o.text.indexOf(w) >= 0, "'" + w + "' 가 있다"); });
  R.note(o.text.indexOf('statsTime is not defined') < 0, '오류 글자가 화면에 안 뜬다');
  R.note(page.__errs.length === 0, '넓은 화면 JS 오류 0건', page.__errs[0] || '');
  await page.close();

  /* ── 좁은 화면 (모바일) ──────────────────────────────────────── */
  R.head('⑦ 좁은 화면 — 서랍');
  const m = await L.openPage(browser, {width:390, height:844, state:L.makeState()});
  await m.setViewport({width:390, height:844, hasTouch:true, isMobile:true});
  await m.setRequestInterception(true);
  wire(m);
  await m.goto(APP + '#admin', {waitUntil:'load'});
  await L.wait(3200);
  const narrow0 = await m.evaluate(() => {
    const side = document.querySelector('#adminRoot .ad-side');
    return {
      sideX: side.getBoundingClientRect().left,
      burger: !!document.querySelector('#adminRoot .ad-burger') &&
              getComputedStyle(document.querySelector('#adminRoot .ad-burger')).display !== 'none',
      docW: document.documentElement.scrollWidth,
      cliW: document.documentElement.clientWidth,
      kpis: document.querySelectorAll('#adminRoot .ad-kpi .ad-card').length,
    };
  });
  R.note(narrow0.burger, '햄버거 단추가 보인다');
  R.note(narrow0.sideX < 0, '사이드바가 처음엔 숨어 있다', 'left ' + Math.round(narrow0.sideX));
  R.note(narrow0.docW <= narrow0.cliW + 1, '가로로 안 넘친다', narrow0.docW + ' / ' + narrow0.cliW);
  R.note(narrow0.kpis === 6, '좁은 화면에서도 KPI 여섯이 다 있다', narrow0.kpis + '개');

  await m.evaluate(() => { document.querySelector('#adminRoot .ad-burger').click(); });
  await L.wait(700);
  const opened = await m.evaluate(() => ({
    sideX: document.querySelector('#adminRoot .ad-side').getBoundingClientRect().left,
    scrim: !!document.querySelector('#adminRoot .ad-scrim'),
  }));
  R.note(opened.sideX >= -1, '햄버거를 누르면 서랍이 나온다', 'left ' + Math.round(opened.sideX));
  R.note(opened.scrim, '뒤에 어두운 막이 깔린다');

  /* 화면을 고르면 서랍이 저절로 닫혀야 한다 — 안 닫히면 고른 화면이 가려진다 */
  await m.evaluate(() => {
    const b = [...document.querySelectorAll('#adminRoot .ad-nav')].find(x => x.textContent.indexOf('회원 관리') === 0);
    if(b) b.click();
  });
  await L.wait(900);
  const after = await m.evaluate(() => ({
    sideX: document.querySelector('#adminRoot .ad-side').getBoundingClientRect().left,
    title: ((document.querySelector('#adminRoot .ad-title')||{}).textContent||'').trim(),
    docW: document.documentElement.scrollWidth,
    cliW: document.documentElement.clientWidth,
    over: [...document.querySelectorAll('#adminRoot .ad-card, #adminRoot .ad-v')]
            .filter(x => x.scrollWidth > x.clientWidth + 1).length,
  }));
  R.note(after.sideX < 0, '화면을 고르면 서랍이 닫힌다', 'left ' + Math.round(after.sideX));
  R.note(after.title === '회원 관리', '고른 화면이 열린다', after.title);
  R.note(after.docW <= after.cliW + 1, '표가 있어도 가로로 안 넘친다', after.docW + ' / ' + after.cliW);
  R.note(after.over === 0, '글자 넘침 0건', after.over + '건');
  R.note(m.__errs.length === 0, '좁은 화면 JS 오류 0건', m.__errs[0] || '');
  await m.close();

  /* ── 운영자가 아니면 ─────────────────────────────────────────── */
  R.head('⑧ 운영자가 아니면 안 열린다 (제일 중요)');
  const g = await L.openPage(browser, {width:390, height:900, state:L.makeState()});
  await g.setRequestInterception(true);
  wire(g, {admin:false});
  await g.goto(APP + '#admin', {waitUntil:'load'});
  await L.wait(3000);
  const guest = await g.evaluate(() => ({
    hidden: document.querySelector('#adminRoot').hidden,
    navs: document.querySelectorAll('#adminRoot .ad-nav').length,
    main: ((document.querySelector('#main')||{}).innerText||'').replace(/\s+/g,' ').slice(0,120),
  }));
  R.note(guest.hidden, '어드민 칸이 안 보인다');
  R.note(guest.navs === 0, '메뉴가 하나도 안 그려진다', guest.navs + '개');
  R.note(guest.main.indexOf('운영자만 볼 수 있어요') >= 0, '잠김 안내가 뜬다', guest.main.slice(0,40));
  R.note(g.__errs.length === 0, 'JS 오류 0건', g.__errs[0] || '');
  await g.close();

  /* ── 손님 화면에는 공지가 **없어야** 한다 ──────────────────────
     2026-09-11 대표님 지시 "공지는 관리자 화면에만 할 거야 본 서비스에는 만들지 마".
     ★ 없는 것을 확인하는 검사이므로 **있었으면 보였을 자리**에서 잰다 —
       공지를 실제로 켜 둔 서버를 흉내 내고, 그래도 손님 화면에 안 뜨는지 본다.
       그냥 빈 서버로 재면 코드를 되살려 놔도 통과한다. */
  R.head('⑨ 손님 화면에는 공지가 없다');
  const c = await L.openPage(browser, {width:390, height:900, state:L.makeState()});
  await c.setRequestInterception(true);
  let noticeCalls = 0;
  c.on('request', function(r){
    const u = r.url();
    const j = (o) => ({status:200, contentType:'application/json', body:JSON.stringify(o)});
    if(u.indexOf('/api/kakao') >= 0) return r.respond(j({ready:true, linked:true}));
    if(u.indexOf('/api/notice') >= 0){
      noticeCalls += 1;
      return r.respond(j({items:[{id:1, title:'9월 12일 새벽 점검 안내',
        body:'02:00~03:00 잠시 멈춥니다.', kind:'banner'}]}));
    }
    if(u.indexOf('/api/') >= 0) return r.respond(j({}));
    r.continue();
  });
  await c.goto(APP, {waitUntil:'load'});
  await L.wait(3000);
  const cust = await c.evaluate(() => ({
    bar: !!document.querySelector('#noticeBar, .notice-bar'),
    text: ((document.querySelector('#app')||{}).innerText || '').replace(/\s+/g,' '),
  }));
  R.note(!cust.bar, '손님 화면에 공지 띠가 없다');
  R.note(cust.text.indexOf('새벽 점검 안내') < 0, '켜 둔 공지가 있어도 손님 화면에 안 샌다');
  R.note(noticeCalls === 0, '손님 화면이 공지 창구를 부르지도 않는다', noticeCalls + '번');
  R.note(c.__errs.length === 0, 'JS 오류 0건', c.__errs[0] || '');
  await c.close();

  /* ── 관리자를 보고 나서 손님 주소를 열면 ──────────────────────────
     2026-09-11 대표님 영상 제보: 네이버 앱 [바로가기]로 서비스를 여니
     "이 화면은 운영자만 볼 수 있어요" 가 떴습니다. 주소에 남아 있던 `#admin` 탓입니다.
     ★ 같은 탭에서 ① 어드민을 열고 ② 손님 주소로 옮겨 갑니다. */
  R.head('⑩ 관리자를 보고 나서 손님 주소를 열면');
  const k = await L.openPage(browser, {width:390, height:900, state:L.makeState()});
  await k.setRequestInterception(true);
  wire(k);
  await k.goto(APP + '#admin', {waitUntil:'load'});
  await L.wait(2600);
  const inAdmin = await k.evaluate(() => ({
    open: !document.querySelector('#adminRoot').hidden, hash: location.hash,
    url: location.href,
  }));
  R.note(inAdmin.open, '먼저 관리자 화면이 열린다');
  R.note(inAdmin.hash === '', '열린 뒤 주소에 #admin 이 없다', inAdmin.hash || '(빈칸)');

  /* 운영자에게 손해가 없어야 한다 — 새로고침은 보던 자리 그대로 */
  await k.reload({waitUntil:'load'});
  await L.wait(2600);
  const kept = await k.evaluate(() => !document.querySelector('#adminRoot').hidden);
  R.note(kept, '새로고침하면 관리자 화면 그대로다 (운영자가 안 튕긴다)');

  await k.goto(APP, {waitUntil:'load'});      /* 손님 주소 (해시 없음) */
  await L.wait(2600);
  const back = await k.evaluate(() => ({
    open: !document.querySelector('#adminRoot').hidden,
    txt: ((document.querySelector('#main')||{}).innerText || '').replace(/\s+/g,' '),
  }));
  R.note(!back.open, '손님 주소에서는 관리자 화면이 안 뜬다');
  R.note(back.txt.indexOf('운영자 전용') < 0, '"운영자 전용" 안내도 안 뜬다',
         back.txt.slice(0, 40));

  await k.reload({waitUntil:'load'});          /* 새로고침은 손님 화면 그대로여야 한다 */
  await L.wait(2400);
  const re = await k.evaluate(() => !document.querySelector('#adminRoot').hidden);
  R.note(!re, '새로고침해도 관리자 화면으로 안 끌려간다');
  R.note(k.__errs.length === 0, 'JS 오류 0건', k.__errs[0] || '');
  await k.close();

  await browser.close();
  R.done();
})().catch((e) => { console.error('검사 자체가 터졌습니다:', e && e.message); process.exit(2); });
