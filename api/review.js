/* =====================================================================
   후기 (2026-10-19 대표님 지시 "3) 후기 해라" — 동백당 분석에서 나온 제안)
   ---------------------------------------------------------------------
   ① 결제한 분이 유료 풀이 끝에서 별점과 한 줄을 남긴다(상품마다 한 번 · 고치면 다시 '검토 대기')
   ② 운영자가 관리자 화면에서 [공개]/[숨김]을 고른다
   ③ **운영자가 공개로 고른 것만** 손님 화면(결제 단추 위)에 보인다. 공개한 것이 없으면 아무것도 안 보인다.

   ★ 후기를 지어내지 마십시오. 이 표에 들어오는 것은 결제(또는 테스트 허가)가 확인된 세션이 쓴 글뿐이고,
     화면은 이 표의 public 줄만 그대로 보여 줍니다. 테스트 허가로 쓴 글은 tester=true 로 남습니다 —
     운영자 화면이 그 표시를 보여 주므로 공개하지 마십시오(표시광고법상 거짓 후기가 됩니다).
   ★ 이름은 서버에서 가린다(첫 글자 + *). 화면이 보낸 이름을 그대로 내보내지 않는다.

   표 (대표님이 SQL Editor 에서 만드심 — MCP 로 DDL 하지 않음)
     create table if not exists reviews (
       id bigserial primary key,
       created_at timestamptz not null default now(),
       updated_at timestamptz not null default now(),
       session_id text not null,
       kakao_id text,
       product text not null,
       stars int not null check (stars between 1 and 5),
       body text not null,
       nick text,
       status text not null default 'pending' check (status in ('pending','public','hidden')),
       tester boolean not null default false,
       unique (session_id, product)
     );
     alter table reviews enable row level security;
===================================================================== */
import { readBody, json } from './_lib/http.js';
import { ensureSession } from './_lib/session.js';
import { adminAccessOf, paidOrdersOf, testPassOf, kakaoLinkOfSession } from './_lib/store.js';
import { splitProductId } from './_lib/products.js';

export const REVIEW_PRODUCTS = ['saju_full', 'mbti_full', 'compat_full'];
export const REVIEW_MAX = 200;

function conf() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.');
  return { url: url.replace(/\/+$/, ''), key };
}
async function rest(path, init) {
  const { url, key } = conf();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json', ...(init && init.headers),
    },
  });
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 200);
    const e = new Error(`저장소 오류 (HTTP ${res.status}) ${text}`);
    e.status = res.status; e.body = text;
    throw e;
  }
  const text = await res.text();
  if (!text) return [];
  try { return JSON.parse(text); } catch { return []; }
}

/* 표가 아직 없으면(대표님이 SQL 을 돌리기 전) 손님 화면이 터지지 않게 '없음'으로 답한다 */
function missingTable(err) {
  return err && (err.status === 404 || /reviews|42P01|does not exist|schema cache/i.test(String(err.body || err.message)));
}

/* 이름 가리기 — 첫 글자만 남긴다. 이름이 없으면 '구매자' */
export function maskNick(name) {
  const s = Array.from(String(name || '').replace(/\s+/g, '').trim());
  if (!s.length) return '구매자';
  return s[0] + '*'.repeat(Math.max(1, Math.min(3, s.length - 1)));
}

/* 이 세션이 그 상품을 실제로 샀는가 — 같은 상품(사주는 아무 해나) 또는 이용권 */
export function boughtProduct(orders, product) {
  return (orders || []).some((o) => {
    const base = splitProductId(o.product_id).base;
    return base === product || base === 'premium_pass';
  });
}

const publicRow = (r) => ({ stars: r.stars, text: r.body, nick: r.nick || '구매자', at: r.updated_at || r.created_at });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'method_not_allowed' });
  }
  let sessionId;
  try { sessionId = ensureSession(req, res); }
  catch (err) {
    console.error('세션 발급 실패', err && err.message);
    return json(res, 500, { error: 'server_error', reason: '서버 설정이 아직 끝나지 않았어요.' });
  }
  const body = readBody(req);
  const product = REVIEW_PRODUCTS.indexOf(body.product) >= 0 ? body.product : null;

  try {
    /* ── 손님: 공개된 후기 (누구나) ── */
    if (body.action === 'public') {
      if (!product) return json(res, 400, { error: 'bad_request' });
      let rows = [];
      try {
        rows = await rest(`reviews?product=eq.${product}&status=eq.public&select=stars,body,nick,created_at,updated_at&order=updated_at.desc&limit=20`);
      } catch (e) { if (!missingTable(e)) throw e; }
      const items = (rows || []).map(publicRow);
      const avg = items.length ? Math.round(items.reduce((a, r) => a + r.stars, 0) / items.length * 10) / 10 : 0;
      return json(res, 200, { items, sum: { n: items.length, avg } });
    }

    /* ── 손님: 내가 쓴 후기 + 쓸 수 있는가 ── */
    if (body.action === 'mine' || body.action === 'write') {
      if (!product) return json(res, 400, { error: 'bad_request' });
      const [orders, tester] = await Promise.all([paidOrdersOf(sessionId), testPassOf(sessionId)]);
      const bought = boughtProduct(orders, product);
      const canWrite = bought || !!tester;

      if (body.action === 'mine') {
        let row = null;
        try {
          const rows = await rest(`reviews?session_id=eq.${encodeURIComponent(sessionId)}&product=eq.${product}&select=stars,body,status,updated_at&limit=1`);
          row = rows && rows[0] ? rows[0] : null;
        } catch (e) { if (!missingTable(e)) throw e; return json(res, 200, { canWrite: false, mine: null, ready: false }); }
        return json(res, 200, { canWrite, mine: row ? { stars: row.stars, text: row.body, status: row.status } : null, ready: true });
      }

      if (!canWrite) return json(res, 403, { error: 'not_bought', reason: '결제한 풀이에만 후기를 남길 수 있어요.' });
      const stars = Math.round(Number(body.stars));
      const text = String(body.text == null ? '' : body.text).replace(/\s+/g, ' ').trim().slice(0, REVIEW_MAX);
      if (!(stars >= 1 && stars <= 5)) return json(res, 400, { error: 'bad_request', reason: '별점을 골라 주세요.' });
      if (text.length < 2) return json(res, 400, { error: 'bad_request', reason: '한 줄을 적어 주세요.' });
      let kakaoId = null;
      try { const k = await kakaoLinkOfSession(sessionId); kakaoId = k ? k.kakao_id : null; } catch (e) {}
      const row = {
        session_id: sessionId, kakao_id: kakaoId, product, stars, body: text,
        nick: maskNick(body.nick), status: 'pending', tester: !bought && !!tester,
        updated_at: new Date().toISOString(),
      };
      try {
        await rest('reviews?on_conflict=session_id,product', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(row),
        });
      } catch (e) {
        if (missingTable(e)) return json(res, 503, { error: 'not_ready', reason: '후기 받기를 준비하고 있어요. 잠시 뒤 다시 남겨 주세요.' });
        throw e;
      }
      return json(res, 200, { ok: true });
    }

    /* ── 여기부터는 운영자만 ── */
    const grant = await adminAccessOf(sessionId);
    if (!grant) return json(res, 404, { error: 'not_found', reason: '없는 주소예요.' });

    if (body.action === 'list') {
      let rows = [], ready = true;
      try { rows = await rest('reviews?select=*&order=updated_at.desc&limit=500'); }
      catch (e) { if (!missingTable(e)) throw e; ready = false; }
      return json(res, 200, { items: rows || [], ready });
    }
    if (body.action === 'set') {
      const id = Number(body.id);
      const status = ['pending', 'public', 'hidden'].indexOf(body.status) >= 0 ? body.status : null;
      if (!id || !status) return json(res, 400, { error: 'bad_request' });
      await rest(`reviews?id=eq.${id}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ status }),
      });
      return json(res, 200, { ok: true });
    }
    return json(res, 400, { error: 'bad_request' });
  } catch (err) {
    console.error('후기 창구 오류', err && err.message);
    return json(res, 500, { error: 'server_error', reason: '잠시 뒤 다시 해 주세요.' });
  }
}
