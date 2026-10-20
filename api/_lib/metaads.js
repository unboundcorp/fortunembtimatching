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
    let accounts = [];
    const rawIds = String(process.env.META_AD_ACCOUNT_ID || '').trim();
    const fixed = rawIds.split(',').map(normAccount).filter(Boolean);
    /* 적어 두었는데 하나도 못 읽으면 조용히 '전부'로 넘어가지 않는다 — 엉뚱한 계정이 더해질 수 있다. */
    if (rawIds && !fixed.length) {
      out.reason = 'META_AD_ACCOUNT_ID 값을 광고 계정 번호로 못 읽었어요. 숫자(또는 act_숫자)로 넣어 주세요.';
      return out;
    }
    const fields = 'fields=' + encodeURIComponent('id,name,currency,timezone_name,account_status');
    if (fixed.length) {
      for (const id of fixed) {
        const a = await getJson(BASE + '/' + id + '?' + fields + '&' + tk, f);
        accounts.push(a);
      }
    } else {
      let url = BASE + '/me/adaccounts?' + fields + '&limit=50&' + tk;
      for (let p = 0; p < MAX_PAGES && url; p++) {
        const d = await getJson(url, f);
        accounts = accounts.concat(Array.isArray(d.data) ? d.data : []);
        url = d.paging && d.paging.next ? d.paging.next : null;
      }
    }
    out.accounts = accounts.map((a) => ({
      id: String(a.id || ''), name: String(a.name || '').slice(0, 60),
      currency: String(a.currency || ''), tz: String(a.timezone_name || ''),
      included: String(a.currency || '').toUpperCase() === 'KRW',
    }));
    if (!out.accounts.length) {
      out.reason = '토큰으로 볼 수 있는 광고 계정이 없어요. 시스템 사용자에게 광고 계정을 배정해 주세요.';
      return out;
    }

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
    if (e && e.name === 'AbortError') out.reason = '메타가 ' + (TIMEOUT_MS / 1000) + '초 안에 답하지 않았어요. 잠시 뒤 다시 열어 주세요.';
    else if (e && e.meta) out.reason = reasonOf(e.meta);
    else out.reason = '메타에 묻지 못했어요: ' + scrubMeta(e && e.message);
    console.warn('메타 광고비 조회 실패:', out.reason);
    out.byDay = {};
    return out;
  }
}
