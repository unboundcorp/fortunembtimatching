/* =====================================================================
   공지 · 배너 (2026-09-11 대표님 지시 "공지/배너는 나중을 위해서 구현은 해놔라")
   ---------------------------------------------------------------------
   ★ **모든 창구가 운영자 전용이다**(adminAccessOf). 허가가 없으면 404 로 답한다.
   ★ 2026-09-11 대표님 지시 "공지는 관리자 화면에만 할 거야 본 서비스에는 만들지 마" 로
     손님용 창구(action:'active')를 없앴다. 읽는 데가 없는데 밖에서 부를 수 있는 문을
     열어 둘 이유가 없다. **나중에 손님께 띄우기로 정하면 그때 다시 만든다.**
   ★ 기간은 비워 둘 수 있다. 시작이 없으면 '지금부터', 끝이 없으면 '계속'이다.
===================================================================== */
import { readBody, json } from './_lib/http.js';
import { ensureSession } from './_lib/session.js';
import { adminAccessOf } from './_lib/store.js';

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
    throw new Error(`저장소 오류 (HTTP ${res.status}) ${text}`);
  }
  const text = await res.text();
  if (!text) return [];
  try { return JSON.parse(text); } catch { return []; }
}

const clean = (v, max) => String(v == null ? '' : v).slice(0, max);
/* 빈 문자열은 null 로 — 빈 칸을 '1970년'으로 읽으면 기간이 통째로 어긋난다 */
const when = (v) => {
  const s = String(v || '').trim();
  if (!s) return null;
  const t = new Date(s).getTime();
  return isFinite(t) ? new Date(t).toISOString() : null;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'method_not_allowed' });
  }

  let sessionId;
  try {
    sessionId = ensureSession(req, res);
  } catch (err) {
    console.error('세션 발급 실패', err && err.message);
    return json(res, 500, { error: 'server_error', reason: '서버 설정이 아직 끝나지 않았어요.' });
  }

  const body = readBody(req);

  try {
    /* ── 여기부터는 운영자만 ───────────────────────────────────── */
    const grant = await adminAccessOf(sessionId);
    if (!grant) return json(res, 404, { error: 'not_found', reason: '없는 주소예요.' });

    if (body.action === 'list') {
      const rows = await rest('notices?select=*&order=id.desc&limit=200');
      return json(res, 200, { items: rows || [] });
    }

    if (body.action === 'save') {
      const title = clean(body.title, 80).trim();
      if (!title) return json(res, 400, { error: 'bad_request', reason: '제목을 넣어주세요.' });
      const row = {
        title,
        body: clean(body.body, 2000),
        kind: body.kind === 'banner' ? 'banner' : 'notice',
        starts_at: when(body.startsAt),
        ends_at: when(body.endsAt),
        active: !!body.active,
        updated_at: new Date().toISOString(),
      };
      if (body.id) {
        const rows = await rest(`notices?id=eq.${Number(body.id)}`, {
          method: 'PATCH', headers: { Prefer: 'return=representation' },
          body: JSON.stringify(row),
        });
        return json(res, 200, { ok: true, item: (rows && rows[0]) || null });
      }
      const rows = await rest('notices', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify(row),
      });
      return json(res, 200, { ok: true, item: (rows && rows[0]) || null });
    }

    if (body.action === 'delete') {
      if (!body.id) return json(res, 400, { error: 'bad_request', reason: '어느 것인지 알려주세요.' });
      await rest(`notices?id=eq.${Number(body.id)}`, {
        method: 'DELETE', headers: { Prefer: 'return=minimal' },
      });
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: 'bad_request', reason: '알 수 없는 요청이에요.' });
  } catch (err) {
    const msg = String((err && err.message) || '');
    console.error('notice 실패', msg.slice(0, 200));
    if (/Could not find the table/i.test(msg)) {
      return json(res, 503, { error: 'not_ready', reason: '공지 표가 아직 없어요 — schema.sql 을 실행해 주세요.' });
    }
    return json(res, 500, { error: 'server_error', reason: '지금은 처리할 수 없어요.' });
  }
}
