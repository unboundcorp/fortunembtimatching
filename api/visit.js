/* =====================================================================
   이용 기록 받기 (2026-10-24 · 표와 규칙은 api/_lib/visits.js)
   ---------------------------------------------------------------------
   화면이 하루에 몇 번만 보냅니다(같은 날 같은 것은 화면이 한 번만 보냄 · 서버도 unique 로 한 줄만).
   ★ 실패해도 손님 화면에 아무 일도 없어야 합니다 — 언제나 200 으로 답하고, 표가 아직 없으면 ready:false.
   ★ 날짜는 서버가 정합니다(KST). 화면이 보낸 날짜는 안 믿습니다.
===================================================================== */
import { readBody, json } from './_lib/http.js';
import { ensureSession } from './_lib/session.js';
import { kakaoLinkOfSession } from './_lib/store.js';
import { cleanItems, kstDay } from './_lib/visits.js';

function conf() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.');
  return { url: url.replace(/\/+$/, ''), key };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'method_not_allowed' });
  }
  let sessionId;
  try { sessionId = ensureSession(req, res); }
  catch (err) { return json(res, 200, { ok: false }); }
  const items = cleanItems(readBody(req).items);
  if (!items.length) return json(res, 200, { ok: true, n: 0 });

  let kakaoId = null;
  try { const k = await kakaoLinkOfSession(sessionId); kakaoId = k ? String(k.kakao_id) : null; } catch (e) {}
  const day = kstDay();
  const rows = items.map((what) => ({ day, session_id: sessionId, kakao_id: kakaoId, what }));
  try {
    const { url, key } = conf();
    const r = await fetch(`${url}/rest/v1/visit_log?on_conflict=day,session_id,what`, {
      method: 'POST',
      headers: {
        apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify(rows),
    });
    if (!r.ok) {
      const t = (await r.text().catch(() => '')).slice(0, 160);
      if (r.status === 404 || /visit_log|42P01|does not exist|schema cache/i.test(t)) return json(res, 200, { ok: false, ready: false });
      console.warn('이용 기록 저장 실패', r.status, t);
      return json(res, 200, { ok: false });
    }
  } catch (e) {
    console.warn('이용 기록 저장 실패', e && e.message);
    return json(res, 200, { ok: false });
  }
  /* 1년 지난 줄 지우기 — 방침 제2조 '1년'을 지키는 자리. 요청 100번에 한 번꼴로 · 실패해도 무시 */
  if (Math.random() < 0.01) {
    try {
      const { url, key } = conf();
      const cut = kstDay(Date.now() - 365 * 86400000);
      await fetch(`${url}/rest/v1/visit_log?day=lt.${cut}`, {
        method: 'DELETE', headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=minimal' },
      });
    } catch (e) {}
  }
  return json(res, 200, { ok: true, n: rows.length });
}
