/* =====================================================================
   궁합 방 저장소
   ---------------------------------------------------------------------
   ★ 기한(TTL)을 코드에서 강제한다. 화면에 "48시간 뒤 지워집니다"라고 적어놓고
     실제로는 계속 읽히면 그건 거짓 고지다. 그래서 두 겹으로 막는다.
       ① 읽을 때 — 기한이 지난 방은 아예 없는 것으로 답한다(지워지기 전에도 못 읽는다).
       ② 지울 때 — 방을 만들 때마다 기한 지난 것들을 함께 지운다(따로 도는 청소 작업이 없어도 쌓이지 않는다).

   ★ 서버는 payload 안을 들여다보지 않는다. 앱이 만든 문자열을 그대로 넣고 그대로 꺼낸다.
===================================================================== */
import crypto from 'node:crypto';

export const ROOM_TTL_HOURS = 48;

function conf() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE 환경변수가 없습니다.');
  return { url: url.replace(/\/+$/, ''), key };
}

async function rest(path, init = {}) {
  const { url, key } = conf();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`저장소 오류 (HTTP ${res.status}) ${text}`);
  }
  /* 본문이 없을 수 있다(Prefer: return=minimal은 201 + 빈 본문). 상태 코드로 가르지 않는다. */
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

/* 방 번호 — 짧으면서도 못 맞힐 만큼 무작위여야 한다. 18바이트면 24글자가 되고,
   그 안에서 남의 방 하나를 찍어 맞힐 확률은 사실상 0이다. */
function newRoomId() {
  return crypto.randomBytes(18).toString('base64url');
}

function expiryISO() {
  return new Date(Date.now() + ROOM_TTL_HOURS * 60 * 60 * 1000).toISOString();
}

/* 기한이 지난 방을 실제로 지운다. 방을 만들 때마다 곁들여 부른다 —
   따로 도는 청소 작업 없이도 저장소에 남의 생년월일이 쌓이지 않는다.
   실패해도 방 만들기는 계속한다(청소가 안 됐다고 기능을 멈출 이유는 없다). */
async function sweepExpired() {
  try {
    await rest(`rooms?expires_at=lt.${new Date().toISOString()}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
  } catch (err) {
    console.warn('기한 지난 방 정리 실패(무시하고 계속):', err?.message);
  }
}

export async function createRoom(payload) {
  await sweepExpired();
  const roomId = newRoomId();
  await rest('rooms', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ room_id: roomId, a_payload: payload, expires_at: expiryISO() }),
  });
  return { room_id: roomId, ttlHours: ROOM_TTL_HOURS };
}

/* ★ 조회 조건에 기한을 넣는다. 아직 안 지워졌어도 기한이 지났으면 못 읽는다. */
export async function getRoom(roomId) {
  const rows = await rest(
    `rooms?room_id=eq.${encodeURIComponent(roomId)}&expires_at=gt.${new Date().toISOString()}&select=*&limit=1`
  );
  return rows && rows[0] ? rows[0] : null;
}

/* 들어온 사람의 정보를 놓는다.
   ★ b 자리가 비어 있을 때만 채운다. 이미 누가 들어와 있으면 덮어쓰지 않는다 —
     링크가 여러 사람에게 퍼졌을 때 먼저 연 사람의 결과가 나중 사람에게 밀려나면 안 된다. */
export async function joinRoom(roomId, payload) {
  const rows = await rest(
    `rooms?room_id=eq.${encodeURIComponent(roomId)}&b_payload=is.null&expires_at=gt.${new Date().toISOString()}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ b_payload: payload, joined_at: new Date().toISOString() }),
    }
  );
  if (rows && rows[0]) return rows[0];
  /* 못 채웠으면 두 경우다 — 방이 없거나(기한 지남 포함), 이미 누가 들어와 있거나.
     후자는 그 사람의 결과를 그대로 보여주면 되므로, 현재 상태를 읽어서 돌려준다. */
  return await getRoom(roomId);
}
