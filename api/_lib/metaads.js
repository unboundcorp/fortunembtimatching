/* =====================================================================
   메타(페이스북·인스타그램) 광고비 — 관리자 대시보드용 · 읽기만 한다
   ---------------------------------------------------------------------
   2026-10-20 대표님 지시 "메타 mcp로 인연점 어드민에 광고비 끌어올 수 있냐?".
   MCP 는 대화 중에 제가 쓰는 도구라 서비스가 쓸 수 없다. 그래서 서버가 메타 Marketing API
   (insights)를 직접 부른다.

   ★ 토큰은 Vercel 환경변수 META_ADS_TOKEN 에만 있다(ads_read 시스템 사용자 토큰).
     코드·로그·응답 어디에도 남기지 않는다. 메타 오류 문장도 토큰 비슷한 것을 걷어 내고 싣는다.
   ★ 광고 계정은 META_AD_ACCOUNT_ID(쉼표로 여럿 가능 · 'act_' 없어도 됨)가 있으면 그것만,
     없으면 토큰이 볼 수 있는 계정 전부(/me/adaccounts).
   ★ 읽기만 한다 — 광고를 켜고 끄거나 예산을 바꾸는 창구를 여기 만들지 마십시오.
   ★ 이 함수는 절대 throw 하지 않는다. 메타가 죽어도 대시보드의 다른 숫자는 살아야 한다.
   ★ 날짜는 메타가 **광고 계정의 시간대**로 가른다. 계정 시간대가 Asia/Seoul 이 아니면
     우리 KST 날짜와 하루씩 어긋날 수 있어 화면이 그 사실을 적는다(tz 를 내려준다).
   ★ 원화(KRW) 계정만 더한다. 다른 통화 계정은 더하지 않고 '빠진 계정'으로 알린다 —
     환율을 지어내 섞지 않는다.
===================================================================== */
export const META_API_VERSION = 'v23.0';
const BASE = 'https://graph.facebook.com/' + META_API_VERSION;
const TIMEOUT_MS = 8000;
const MAX_PAGES = 6;

/* 메타 오류 문장에 혹시 토큰이 섞여 나와도 화면·로그에 안 가게 걷어 낸다. */
export function scrubMeta(s) {
  return String(s || '')
    .replace(/access_token=[^&\s"]+/gi, 'access_token=…')
    .replace(/\bEA[A-Za-z0-9]{20,}/g, '…')
    .slice(0, 200);
}

function normAccount(id) {
  const s = String(id || '').trim().replace(/^act_/i, '');
  return /^\d{5,25}$/.test(s) ? 'act_' + s : null;
}

/* 메타 오류 → 대표님이 알아볼 문장. */
function reasonOf(err) {
  const code = err && err.code;
  if (code === 190) return '토큰이 만료됐거나 잘못됐어요. 메타 비즈니스 설정에서 토큰을 새로 만들어 Vercel 의 META_ADS_TOKEN 을 바꿔 주세요.';
  if (code === 10 || code === 200 || (code >= 200 && code < 300)) return '토큰에 이 광고 계정을 읽을 권한(ads_read)이 없어요. 시스템 사용자에게 광고 계정을 배정했는지 확인해 주세요.';
  if (code === 4 || code === 17 || code === 613 || code === 80004) return '메타 쪽 호출 한도에 걸렸어요. 잠시 뒤 다시 열어 주세요.';
  if (code === 100) return '메타가 요청을 받지 않았어요(광고 계정 번호를 확인해 주세요). ' + scrubMeta(err.message);
  return '메타 응답 오류' + (code ? ' (' + code + ')' : '') + ': ' + scrubMeta(err && err.message);
}

async function getJson(url, fetchImpl) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
  try {
    const res = await fetchImpl(url, ctl ? { signal: ctl.signal } : undefined);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || (data && data.error)) {
      const e = new Error('meta');
      e.meta = (data && data.error) || { message: 'HTTP ' + res.status };
      throw e;
    }
    return data;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* 어느 광고 계정을 볼까 — 요약(fetchMetaAdSpend)과 [광고] 탭(fetchMetaAdDetail)이 함께 쓴다.
   돌려주는 것: { accounts:[{id,name,currency,tz,included}] } 또는 { reason } */
async function resolveAccounts(f, tk) {
  let accounts = [];
  const rawIds = String(process.env.META_AD_ACCOUNT_ID || '').trim();
  const fixed = rawIds.split(',').map(normAccount).filter(Boolean);
  /* 적어 두었는데 하나도 못 읽으면 조용히 '전부'로 넘어가지 않는다 — 엉뚱한 계정이 더해질 수 있다. */
  if (rawIds && !fixed.length) {
    return { reason: 'META_AD_ACCOUNT_ID 값을 광고 계정 번호로 못 읽었어요. 숫자(또는 act_숫자)로 넣어 주세요.' };
  }
  const fields = 'fields=' + encodeURIComponent('id,name,currency,timezone_name,account_status');
  if (fixed.length) {
    for (const id of fixed) accounts.push(await getJson(BASE + '/' + id + '?' + fields + '&' + tk, f));
  } else {
    let url = BASE + '/me/adaccounts?' + fields + '&limit=50&' + tk;
    for (let p = 0; p < MAX_PAGES && url; p++) {
      const d = await getJson(url, f);
      accounts = accounts.concat(Array.isArray(d.data) ? d.data : []);
      url = d.paging && d.paging.next ? d.paging.next : null;
    }
  }
  const list = accounts.map((a) => ({
    id: String(a.id || ''), name: String(a.name || '').slice(0, 60),
    currency: String(a.currency || ''), tz: String(a.timezone_name || ''),
    included: String(a.currency || '').toUpperCase() === 'KRW',
  }));
  if (!list.length) return { reason: '토큰으로 볼 수 있는 광고 계정이 없어요. 시스템 사용자에게 광고 계정을 배정해 주세요.' };
  return { accounts: list };
}

function failReason(e) {
  if (e && e.name === 'AbortError') return '메타가 ' + (TIMEOUT_MS / 1000) + '초 안에 답하지 않았어요. 잠시 뒤 다시 열어 주세요.';
  if (e && e.meta) return reasonOf(e.meta);
  return '메타에 묻지 못했어요: ' + scrubMeta(e && e.message);
}

/* 한 줄을 { spend(원), impr, clicks } 로. 메타는 spend 를 '12345' 같은 문자열로 준다(KRW 는 소수 없음). */
function rowOf(r) {
  return {
    spend: Math.round(Number(r.spend) || 0),
    impr: Math.round(Number(r.impressions) || 0),
    clicks: Math.round(Number(r.clicks) || 0),
  };
}

/* since·until 은 'YYYY-MM-DD'(KST 로 고른 날). 돌려주는 것:
   { connected, reason, accounts:[{id,name,currency,tz,included}], byDay:{'YYYY-MM-DD':{spend,impr,clicks}}, version } */
export async function fetchMetaAdSpend({ since, until, fetchImpl } = {}) {
  const out = { connected: false, reason: null, accounts: [], byDay: {}, version: META_API_VERSION };
  const token = process.env.META_ADS_TOKEN;
  if (!token) { out.reason = '광고 계정 연결 전이에요 (Vercel 에 META_ADS_TOKEN 이 없어요).'; return out; }
  const f = fetchImpl || globalThis.fetch;
  const tk = 'access_token=' + encodeURIComponent(token);
  try {
    /* ① 어느 계정을 볼까 */
    const acc = await resolveAccounts(f, tk);
    if (acc.reason) { out.reason = acc.reason; return out; }
    out.accounts = acc.accounts;

    /* ② 계정마다 하루치 광고비 */
    const range = encodeURIComponent(JSON.stringify({ since, until }));
    for (const a of out.accounts) {
      if (!a.included) continue;
      let url = BASE + '/' + a.id + '/insights?level=account&time_increment=1&time_range=' + range
        + '&fields=' + encodeURIComponent('spend,impressions,clicks') + '&limit=100&' + tk;
      for (let p = 0; p < MAX_PAGES && url; p++) {
        const d = await getJson(url, f);
        (Array.isArray(d.data) ? d.data : []).forEach((r) => {
          const day = String(r.date_start || '').slice(0, 10);
          if (!day) return;
          const v = rowOf(r);
          const b = out.byDay[day] || { spend: 0, impr: 0, clicks: 0 };
          b.spend += v.spend; b.impr += v.impr; b.clicks += v.clicks;
          out.byDay[day] = b;
        });
        url = d.paging && d.paging.next ? d.paging.next : null;
      }
    }
    out.connected = true;
    if (!out.accounts.some((a) => a.included)) {
      out.connected = false;
      out.reason = '원화(KRW) 광고 계정이 없어요. 다른 통화 계정은 더하지 않아요.';
    }
    return out;
  } catch (e) {
    out.reason = failReason(e);
    console.warn('메타 광고비 조회 실패:', out.reason);
    out.byDay = {};
    return out;
  }
}

/* =====================================================================
   [광고] 탭 (2026-10-20 대표님 "광고탭 만들고 세부적으로도 볼 수 있어?")
   ---------------------------------------------------------------------
   캠페인 / 광고 세트 / 광고 단위로 기간 합계 + 날마다 계정 합계.
   ★ 전환(가입·결제 시작·구매)은 **메타 픽셀이 센 값**이다(광고 기여 기준은 계정 기본값).
     우리 DB 의 회원·결제와 숫자가 다를 수 있어 화면이 그 사실을 적는다.
   ★ 같은 전환이 'purchase' 와 'offsite_conversion.fb_pixel_purchase' 두 이름으로 함께 올 수 있다 —
     더하지 않고 하나만 쓴다(픽셀 이름 우선).
===================================================================== */
export const AD_LEVELS = {
  campaign: ['campaign_id', 'campaign_name'],
  adset: ['campaign_name', 'adset_id', 'adset_name'],
  ad: ['campaign_name', 'adset_name', 'ad_id', 'ad_name'],
};
const CONV = {
  reg: ['offsite_conversion.fb_pixel_complete_registration', 'complete_registration'],
  checkout: ['offsite_conversion.fb_pixel_initiate_checkout', 'initiate_checkout'],
  purchase: ['offsite_conversion.fb_pixel_purchase', 'purchase'],
  view: ['offsite_conversion.fb_pixel_view_content', 'view_content'],
  landing: ['landing_page_view'],
};
export function pickAction(list, names) {
  const arr = Array.isArray(list) ? list : [];
  for (const n of names) {
    const hit = arr.find((a) => a && a.action_type === n);
    if (hit) return Math.round(Number(hit.value) || 0);
  }
  return 0;
}
function detailRow(r) {
  const o = {
    spend: Math.round(Number(r.spend) || 0),
    impr: Math.round(Number(r.impressions) || 0),
    reach: Math.round(Number(r.reach) || 0),
    clicks: Math.round(Number(r.clicks) || 0),
    linkClicks: Math.round(Number(r.inline_link_clicks) || 0),
    conv: {},
    purchaseValue: pickAction(r.action_values, CONV.purchase),
  };
  Object.keys(CONV).forEach((k) => { o.conv[k] = pickAction(r.actions, CONV[k]); });
  return o;
}

export async function fetchMetaAdDetail({ since, until, level, fetchImpl } = {}) {
  const lv = AD_LEVELS[level] ? level : 'campaign';
  const out = { connected: false, reason: null, accounts: [], level: lv, since, until, rows: [], daily: [], version: META_API_VERSION };
  const token = process.env.META_ADS_TOKEN;
  if (!token) { out.reason = '광고 계정 연결 전이에요 (Vercel 에 META_ADS_TOKEN 이 없어요).'; return out; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(since)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(until))) {
    out.reason = '기간을 못 읽었어요.'; return out;
  }
  const f = fetchImpl || globalThis.fetch;
  const tk = 'access_token=' + encodeURIComponent(token);
  try {
    const acc = await resolveAccounts(f, tk);
    if (acc.reason) { out.reason = acc.reason; return out; }
    out.accounts = acc.accounts;
    const used = out.accounts.filter((a) => a.included);
    if (!used.length) { out.reason = '원화(KRW) 광고 계정이 없어요. 다른 통화 계정은 더하지 않아요.'; return out; }
    const range = encodeURIComponent(JSON.stringify({ since, until }));
    const base = 'spend,impressions,reach,clicks,inline_link_clicks,actions,action_values';
    const dayMap = {};
    for (const a of used) {
      /* 단위별 기간 합계 */
      let url = BASE + '/' + a.id + '/insights?level=' + lv + '&time_range=' + range
        + '&fields=' + encodeURIComponent(AD_LEVELS[lv].join(',') + ',' + base) + '&limit=200&' + tk;
      for (let p = 0; p < MAX_PAGES && url; p++) {
        const d = await getJson(url, f);
        (Array.isArray(d.data) ? d.data : []).forEach((r) => {
          const row = detailRow(r);
          row.account = a.name || a.id;
          row.campaign = String(r.campaign_name || '').slice(0, 120);
          row.adset = String(r.adset_name || '').slice(0, 120);
          row.ad = String(r.ad_name || '').slice(0, 120);
          row.id = String(r[lv + '_id'] || '');
          out.rows.push(row);
        });
        url = d.paging && d.paging.next ? d.paging.next : null;
      }
      /* 날마다 계정 합계 */
      url = BASE + '/' + a.id + '/insights?level=account&time_increment=1&time_range=' + range
        + '&fields=' + encodeURIComponent(base) + '&limit=100&' + tk;
      for (let p = 0; p < MAX_PAGES && url; p++) {
        const d = await getJson(url, f);
        (Array.isArray(d.data) ? d.data : []).forEach((r) => {
          const day = String(r.date_start || '').slice(0, 10);
          if (!day) return;
          const v = detailRow(r);
          const b = dayMap[day] || { d: day, spend: 0, impr: 0, reach: 0, clicks: 0, linkClicks: 0, purchaseValue: 0, conv: {} };
          b.spend += v.spend; b.impr += v.impr; b.clicks += v.clicks; b.linkClicks += v.linkClicks;
          b.reach += v.reach; b.purchaseValue += v.purchaseValue;
          Object.keys(v.conv).forEach((k) => { b.conv[k] = (b.conv[k] || 0) + v.conv[k]; });
          dayMap[day] = b;
        });
        url = d.paging && d.paging.next ? d.paging.next : null;
      }
    }
    out.rows.sort((x, y) => y.spend - x.spend);
    out.daily = Object.keys(dayMap).sort().map((k) => dayMap[k]);
    out.connected = true;
    return out;
  } catch (e) {
    out.reason = failReason(e);
    console.warn('메타 광고 상세 조회 실패:', out.reason);
    out.rows = []; out.daily = [];
    return out;
  }
}

/* =====================================================================
   픽셀이 받은 이벤트 전체 (2026-10-22 대표님 "광고탭에 메타에 이벤트로 넣은 페이지뷰나 결제 완료 데이터 연동 가능?")
   ---------------------------------------------------------------------
   insights 의 전환은 **광고에 기여된 것만**이다. 여기서는 픽셀 자체의 통계(/{pixel}/stats ·
   aggregation=event)로 광고와 상관없이 픽셀이 받은 이벤트를 **모두** 센다(PageView 포함).
   ★ 메타는 이 통계를 최근 7일치까지만 준다 — 그래서 기간을 최근 7일로 줄여서 묻고, 줄였으면 range 에 적는다.
   ★ 이 토큰(시스템 사용자)에 **픽셀(데이터 세트)** 이 배정돼 있어야 읽힌다. 안 돼 있으면 이유만 적는다.
   ★ 시간 단위 줄을 KST 날짜로 묶는다. 절대 throw 하지 않는다.
===================================================================== */
export const PIXEL_EVENTS = ['PageView', 'ViewContent', 'CompleteRegistration', 'InitiateCheckout', 'Purchase', 'ShareInvite'];
const PIXEL_DAYS = 7;
function kstDayOf(ms) { return new Date(ms + 9 * 3600 * 1000).toISOString().slice(0, 10); }
function kstMidnightMs(day) { return Date.parse(day + 'T00:00:00+09:00'); }

export async function fetchPixelStats({ since, until, fetchImpl, now } = {}) {
  const out = { connected: false, reason: null, pixelId: null, from: null, to: null, clipped: false, totals: {}, daily: [] };
  const token = process.env.META_ADS_TOKEN;
  if (!token) { out.reason = '광고 계정 연결 전이에요 (Vercel 에 META_ADS_TOKEN 이 없어요).'; return out; }
  const pid = String(process.env.META_PIXEL_ID || '739495668667523').trim();
  if (!/^\d{5,25}$/.test(pid)) { out.reason = 'META_PIXEL_ID 를 픽셀 번호로 못 읽었어요.'; return out; }
  out.pixelId = pid;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(since)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(until))) { out.reason = '기간을 못 읽었어요.'; return out; }
  const nowMs = typeof now === 'number' ? now : Date.now();
  const earliest = kstDayOf(nowMs - (PIXEL_DAYS - 1) * 86400000);
  let from = since, to = until;
  if (from < earliest) { from = earliest; out.clipped = true; }
  if (to < from) { out.reason = '메타가 픽셀 통계를 최근 ' + PIXEL_DAYS + '일치까지만 줘서 이 기간은 볼 수 없어요.'; out.clipped = true; return out; }
  out.from = from; out.to = to;
  const start = Math.floor(kstMidnightMs(from) / 1000);
  const end = Math.min(Math.floor((kstMidnightMs(to) + 86400000) / 1000), Math.floor(nowMs / 1000));
  const f = fetchImpl || globalThis.fetch;
  const tk = 'access_token=' + encodeURIComponent(token);
  try {
    const dayMap = {};
    let url = BASE + '/' + pid + '/stats?aggregation=event&start_time=' + start + '&end_time=' + end + '&' + tk;
    for (let p = 0; p < 20 && url; p++) {
      const d = await getJson(url, f);
      (Array.isArray(d.data) ? d.data : []).forEach((bucket) => {
        const ms = Date.parse(String(bucket.start_time || '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
        if (!isFinite(ms)) return;
        const day = kstDayOf(ms);
        if (day < from || day > to) return;
        const b = dayMap[day] || (dayMap[day] = { d: day, ev: {} });
        (Array.isArray(bucket.data) ? bucket.data : []).forEach((x) => {
          const name = String((x && x.value) || '').slice(0, 60);
          const n = Math.round(Number(x && x.count) || 0);
          if (!name || !n) return;
          b.ev[name] = (b.ev[name] || 0) + n;
          out.totals[name] = (out.totals[name] || 0) + n;
        });
      });
      url = d.paging && d.paging.next ? d.paging.next : null;
    }
    out.daily = Object.keys(dayMap).sort().map((k) => dayMap[k]);
    out.connected = true;
    return out;
  } catch (e) {
    const m = e && e.meta;
    if (m && (m.code === 10 || m.code === 100 || (m.code >= 200 && m.code < 300))) {
      out.reason = '토큰이 이 픽셀을 읽을 수 없어요. 메타 비즈니스 설정 → 사용자 → 시스템 사용자 → [자산 추가] → 데이터 세트(픽셀 ' + pid + ')를 배정해 주세요. (' + scrubMeta(m.message) + ')';
      /* 2026-10-22 배정을 확인했는데도 막혀서 — 원인을 가르려고 토큰 주인 이름과 픽셀 기본 정보가 읽히는지를 함께 적는다(읽기만 · 이름은 비밀 아님) */
      const diag = [];
      try { const me = await getJson(BASE + '/me?fields=id,name&' + tk, f); diag.push('토큰 주인: ' + scrubMeta(me.name || me.id)); }
      catch (e2) { diag.push('토큰 주인 확인 못 함 (' + scrubMeta(e2 && e2.meta && e2.meta.message) + ')'); }
      try { const px = await getJson(BASE + '/' + pid + '?fields=id,name&' + tk, f); diag.push('픽셀 기본 정보는 읽힘(' + scrubMeta(px.name || px.id) + ')'); }
      catch (e3) { diag.push('픽셀 기본 정보도 안 읽힘 (' + scrubMeta(e3 && e3.meta && e3.meta.message) + ')'); }
      try { const pm = await getJson(BASE + '/me/permissions?' + tk, f); diag.push('토큰 권한: ' + (Array.isArray(pm.data) ? pm.data.filter((x) => x.status === 'granted').map((x) => x.permission).join(',') : '?')); }
      catch (e4) { diag.push('토큰 권한 확인 못 함'); }
      try { await getJson(BASE + '/' + pid + '/stats?aggregation=event&' + tk, f); diag.push('기간 없이 물으면 읽힘'); }
      catch (e5) { diag.push('기간 없이도 막힘'); }
      out.reason += ' · 진단: ' + diag.join(' · ');
    } else out.reason = failReason(e);
    console.warn('메타 픽셀 통계 조회 실패:', out.reason);
    out.totals = {}; out.daily = [];
    return out;
  }
}
