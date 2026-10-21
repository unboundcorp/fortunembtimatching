/* =====================================================================
   메타 광고비 — 서버가 실제로 묻고 내려주는가 (빠른 층) · 2026-10-20
   ---------------------------------------------------------------------
   가짜 메타(graph.facebook.com)·가짜 DB 로 api/stats.js 전체 현황을 실제로 돌린다.
   ① 토큰 없음 → connected:false · 이유 · daily 에 ads 칸 없음(0원으로 지어내지 않음)
   ② 토큰 있음 → /me/adaccounts → 원화 계정만 insights → 날짜별 합 · 페이지 넘김 · USD 계정은 빠짐
   ③ META_AD_ACCOUNT_ID 가 있으면 그 계정만
   ④ 메타 오류(190) → connected:false · 알아볼 이유 · 다른 숫자는 그대로 200
   ⑤ 토큰이 응답 어디에도 안 나감 · 읽기만(GET) · 운영자 관문 뒤
===================================================================== */
const path = require('path');
const fs = require('fs');
const { ROOT, reporter } = require('../_lib.cjs');
const R = reporter('메타 광고비 서버');
const TOKEN = 'EAAfake' + 'Z'.repeat(40);
const kst = (ms) => new Date(ms + 9*3600*1000).toISOString().slice(0, 10);
const D1 = kst(Date.now() - 86400000), D2 = kst(Date.now() - 2*86400000);
function resp(status, obj){ const t = JSON.stringify(obj); return { ok: status < 400, status, json: async () => obj, text: async () => t }; }

let META_MODE = 'ok', META_CALLS = [], METHODS = [];
async function fakeFetch(url, init){
  const u = new URL(String(url));
  if(u.hostname === 'graph.facebook.com'){
    META_CALLS.push(u.pathname + '?' + u.search);
    METHODS.push((init && init.method) || 'GET');
    if(META_MODE === 'bad') return resp(400, {error:{message:'Error validating access token: Session has expired access_token=' + TOKEN, code:190}});
    if(/\/me\/adaccounts$/.test(u.pathname)) return resp(200, {data:[
      {id:'act_111', name:'인연점 광고', currency:'KRW', timezone_name:'Asia/Seoul'},
      {id:'act_222', name:'달러', currency:'USD', timezone_name:'America/Los_Angeles'}]});
    if(/\/739495668667523\/stats$/.test(u.pathname)){
      if(META_MODE === 'nopix') return resp(400, {error:{message:'Unsupported get request. access_token=' + TOKEN, code:100}});
      const st = Number(u.searchParams.get('start_time'));
      return resp(200, {data:[
        {start_time:new Date(st*1000 + 3600000).toISOString().replace('.000Z','+0000'), aggregation:'event', data:[{value:'PageView', count:30},{value:'Purchase', count:2}]},
        {start_time:new Date(st*1000 + 26*3600000).toISOString().replace('.000Z','+0000'), aggregation:'event', data:[{value:'PageView', count:12},{value:'CompleteRegistration', count:4}]}]});
    }
    if(/\/act_333333$/.test(u.pathname)) return resp(200, {id:'act_333333', name:'고정 계정', currency:'KRW', timezone_name:'Asia/Seoul'});
    if(/\/act_111\/insights$/.test(u.pathname) && u.searchParams.get('level') === 'campaign') return resp(200, {data:[
      {campaign_id:'c1', campaign_name:'가을', spend:'8000', impressions:'1000', reach:'900', clicks:'50', inline_link_clicks:'40',
       actions:[{action_type:'offsite_conversion.fb_pixel_purchase', value:'2'}, {action_type:'purchase', value:'2'},
                {action_type:'complete_registration', value:'5'}],
       action_values:[{action_type:'offsite_conversion.fb_pixel_purchase', value:'3800'}]}]});
    if(/\/act_111\/insights$/.test(u.pathname)){
      if(u.searchParams.get('after') === 'p2') return resp(200, {data:[{date_start:D1, spend:'3000', impressions:'100', clicks:'5'}]});
      return resp(200, {data:[{date_start:D2, spend:'5000', impressions:'200', clicks:'9'}],
                        paging:{next:'https://graph.facebook.com/v23.0/act_111/insights?after=p2&access_token=' + TOKEN}});
    }
    if(/\/act_333333\/insights$/.test(u.pathname)) return resp(200, {data:[{date_start:D1, spend:'700', impressions:'7', clicks:'1'}]});
    if(/\/act_222\/insights$/.test(u.pathname)) return resp(200, {data:[{date_start:D1, spend:'99', impressions:'1', clicks:'1'}]});
    return resp(404, {error:{message:'unknown', code:100}});
  }
  const table = u.pathname.split('/rest/v1/')[1];
  if(table === 'test_grants') return resp(200, [{session_id:'x', role:'admin', expires_at:new Date(Date.now()+86400000).toISOString()}]);
  return resp(200, []);
}

(async function(){
  process.env.SUPABASE_URL = 'https://fake.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'x'.repeat(40);
  process.env.SESSION_SECRET = 's'.repeat(40);
  globalThis.fetch = fakeFetch;
  const origWarn = console.warn; const warns = []; console.warn = (...a) => warns.push(a.join(' '));
  let stats;
  try{ stats = (await import('file://' + path.join(ROOT, 'api/stats.js'))).default; }
  catch(e){ R.bad('api/stats.js 를 못 불러옴', String(e && e.message).slice(0,200)); R.done(); return; }
  async function run(){
    const out = {status:0, body:null, raw:''};
    const res = { status(s){ out.status = s; return this; }, setHeader(){}, send(t){ out.raw = String(t); try{ out.body = JSON.parse(t); }catch(e){ out.body = t; } }, end(){} };
    await stats({ method:'POST', headers:{}, body:{} }, res);
    return out;
  }
  const dayOf = (b, d) => (b.daily || []).find((r) => r.d === d) || {};

  /* ① 토큰 없음 */
  delete process.env.META_ADS_TOKEN; delete process.env.META_AD_ACCOUNT_ID;
  let o = await run();
  R.note(o.status === 200 && o.body.ads && o.body.ads.connected === false, '① 토큰 없으면 연결 전', JSON.stringify(o.body && o.body.ads));
  R.note(/META_ADS_TOKEN/.test(o.body.ads.reason || ''), '① 이유를 적음');
  R.note(!(o.body.daily || []).some((r) => r.ads), '① daily 에 ads 칸을 안 만듦(0원으로 지어내지 않음)');
  R.note(META_CALLS.length === 0, '① 토큰 없으면 메타를 부르지도 않음', META_CALLS.length);

  /* ② 토큰 있음 · 계정 자동 */
  process.env.META_ADS_TOKEN = TOKEN; META_MODE = 'ok'; META_CALLS = []; METHODS = [];
  o = await run();
  const A = o.body.ads || {};
  R.note(o.status === 200 && A.connected === true, '② 연결됨', JSON.stringify(A).slice(0, 160));
  R.note(dayOf(o.body, D2).ads && dayOf(o.body, D2).ads.spend === 5000, '② 그제 5,000원', JSON.stringify(dayOf(o.body, D2).ads));
  R.note(dayOf(o.body, D1).ads && dayOf(o.body, D1).ads.spend === 3000 && dayOf(o.body, D1).ads.clicks === 5, '② 어제 3,000원 — 다음 쪽까지 따라감(USD 99 안 섞임)', JSON.stringify(dayOf(o.body, D1).ads));
  R.note((o.body.daily || []).every((r) => r.ads && typeof r.ads.spend === 'number'), '② 연결되면 날마다 ads 칸(없는 날 0)');
  R.note(A.accounts && A.accounts.length === 2 && A.accounts[0].included && !A.accounts[1].included, '② USD 계정은 빠짐 표시');
  R.note(!META_CALLS.some((c) => /act_222\/insights/.test(c)), '② USD 계정 insights 는 아예 안 부름');
  const ins = META_CALLS.find((c) => /act_111\/insights/.test(c)) || '';
  R.note(/time_increment=1/.test(ins) && /level=account/.test(ins), '② 하루치·계정 단위로 물음');
  R.note(o.raw.indexOf(TOKEN) < 0, '② 응답에 토큰이 없음');
  R.note(METHODS.every((m) => m === 'GET'), '⑤ 메타에는 읽기(GET)만', METHODS.join(','));

  /* ③ 계정 고정 */
  process.env.META_AD_ACCOUNT_ID = '333333'; META_CALLS = [];
  o = await run();
  R.note(o.body.ads.connected && o.body.ads.accounts.length === 1 && o.body.ads.accounts[0].id === 'act_333333', '③ META_AD_ACCOUNT_ID 계정만', JSON.stringify(o.body.ads.accounts));
  R.note(!META_CALLS.some((c) => /adaccounts/.test(c)) && dayOf(o.body, D1).ads.spend === 700, '③ 목록을 안 묻고 그 계정 값만');
  process.env.META_AD_ACCOUNT_ID = 'abc';
  o = await run();
  R.note(o.body.ads.connected === false && /META_AD_ACCOUNT_ID/.test(o.body.ads.reason || ''), '③ 번호를 못 읽으면 전부로 넘어가지 않고 알림', o.body.ads.reason);
  delete process.env.META_AD_ACCOUNT_ID;

  /* ④ 메타 오류 */
  META_MODE = 'bad'; warns.length = 0;
  o = await run();
  R.note(o.status === 200 && o.body.ads.connected === false, '④ 메타가 거절해도 현황판은 200', o.status);
  R.note(/만료/.test(o.body.ads.reason || ''), '④ 190 → 토큰 만료 안내', o.body.ads.reason);
  R.note(o.raw.indexOf(TOKEN) < 0 && !warns.some((w) => w.indexOf(TOKEN) >= 0), '④ 오류 문장의 토큰이 응답·로그로 안 샘');
  R.note(!(o.body.daily || []).some((r) => r.ads), '④ 실패면 ads 칸 없음');
  console.warn = origWarn;

  /* ⑥ [광고] 탭 창구 (action:'ads') */
  META_MODE = 'ok'; META_CALLS = [];
  async function runAds(b){
    const out = {status:0, body:null, raw:''};
    const res = { status(x){ out.status = x; return this; }, setHeader(){}, send(t){ out.raw = String(t); try{ out.body = JSON.parse(t); }catch(e){ out.body = t; } }, end(){} };
    await stats({ method:'POST', headers:{}, body:b }, res);
    return out;
  }
  o = await runAds({action:'ads', since:D2, until:D1, level:'campaign'});
  const row = o.body && o.body.rows && o.body.rows[0];
  R.note(o.status === 200 && o.body.connected && row && row.campaign === '가을' && row.spend === 8000, '⑥ 캠페인 줄', JSON.stringify(row).slice(0, 160));
  R.note(row && row.conv.purchase === 2, '⑥ 같은 구매가 두 이름으로 와도 한 번만(2, 4 아님)', row && row.conv.purchase);
  R.note(row && row.conv.reg === 5 && row.purchaseValue === 3800, '⑥ 가입(일반 이름)·구매액', JSON.stringify(row && row.conv));
  R.note(o.body.daily && o.body.daily.length === 2 && o.body.daily[0].d === D2, '⑥ 날마다 줄(다음 쪽까지)', JSON.stringify(o.body.daily && o.body.daily.map((d) => d.d)));
  R.note(o.raw.indexOf(TOKEN) < 0, '⑥ 응답에 토큰 없음');
  /* ⑦ 픽셀 통계(이벤트 전체) — 2026-10-22 */
  const px = o.body && o.body.pixel;
  R.note(px && px.connected && px.totals.PageView === 42 && px.totals.Purchase === 2 && px.totals.CompleteRegistration === 4,
    '⑦ 픽셀 이벤트 합계(페이지뷰 42 · 결제 2 · 가입 4)', JSON.stringify(px && px.totals));
  R.note(px && px.daily.length === 2 && px.daily[0].d === D2 && px.daily[1].ev.PageView === 12, '⑦ 픽셀 이벤트를 KST 날짜로 묶음', JSON.stringify(px && px.daily));
  R.note(META_CALLS.some((c) => /\/stats\?.*aggregation=event/.test(c)), '⑦ /{pixel}/stats aggregation=event 로 물음');
  o = await runAds({action:'ads', since:kst(Date.now() - 29*86400000), until:D1, level:'campaign'});
  R.note(o.body.pixel && o.body.pixel.clipped && o.body.pixel.from === kst(Date.now() - 6*86400000), '⑦ 30일을 고르면 최근 7일로 잘라 묻고 적음', o.body.pixel && o.body.pixel.from);
  META_MODE = 'nopix';
  o = await runAds({action:'ads', since:D2, until:D1, level:'campaign'});
  R.note(o.status === 200 && o.body.connected && o.body.pixel && !o.body.pixel.connected && /데이터 세트/.test(o.body.pixel.reason || '') && o.raw.indexOf(TOKEN) < 0,
    '⑦ 픽셀 권한이 없으면 광고 숫자는 그대로 · 이유만 · 토큰 없음', o.body.pixel && o.body.pixel.reason);
  META_MODE = 'ok';
  o = await runAds({action:'ads', since:'2020-01-01', until:D1, level:'campaign'});
  R.note(o.status === 400, '⑥ 400일 넘는 기간은 거절', o.status);
  o = await runAds({action:'ads', since:'abc', until:D1});
  R.note(o.status === 400, '⑥ 날짜를 못 읽으면 거절', o.status);
  const sAds = fs.readFileSync(path.join(ROOT, 'api/stats.js'), 'utf8');
  R.note(sAds.indexOf("body.action === 'ads'") > sAds.indexOf('adminAccessOf(sessionId)'), '⑥ [광고] 창구도 운영자 관문 뒤');

  /* ⑤ 관문 뒤 · 창구는 stats 하나뿐 */
  const src = fs.readFileSync(path.join(ROOT, 'api/stats.js'), 'utf8');
  const gate = src.indexOf('adminAccessOf(sessionId)'), call = src.indexOf('fetchMetaAdSpend(');
  R.note(gate > 0 && call > gate, '⑤ 광고비 조회는 운영자 관문 뒤');
  const users = fs.readdirSync(path.join(ROOT, 'api')).filter((f) => f.endsWith('.js'))
    .filter((f) => /metaads/.test(fs.readFileSync(path.join(ROOT, 'api', f), 'utf8')));
  R.note(users.length === 1 && users[0] === 'stats.js', '⑤ metaads 를 쓰는 창구는 stats.js 하나', users.join(','));
  R.note(!/process\.env\.META_ADS_TOKEN/.test(fs.readFileSync(path.join(ROOT, 'fortune.html'), 'utf8')) &&
         !/EAA[A-Za-z0-9]{20,}/.test(fs.readFileSync(path.join(ROOT, 'fortune.html'), 'utf8')), '⑤ 화면 파일에 토큰 흔적 없음');
  R.done();
})();
