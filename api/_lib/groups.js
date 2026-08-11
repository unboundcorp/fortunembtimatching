/* =====================================================================
   저장된 그룹 — 이름과 관리용 PIN으로 다시 여는 그룹
   ---------------------------------------------------------------------
   ★ PIN을 그대로 저장하지 않는다. 저장소가 통째로 새어도 PIN을 알 수 없어야 한다.
     scrypt로 해시해서 넣고, 맞춰볼 때도 해시끼리 비교한다.
     그래서 "PIN을 잊으면 복구할 수 없다" — 대표님이 고르신 방식이고, 화면에도 그렇게 적는다.
     서버조차 PIN을 모르므로 알려줄 방법이 원리적으로 없다. 이건 불편이 아니라 안전장치다.

   ★ 링크를 아는 사람은 볼 수 있고, 고치거나 지우는 것만 PIN이 필요하다.
     그룹 그림은 여럿이 돌려 보라고 만든 것이라 열람까지 PIN으로 막으면 쓸모가 없어진다.

   ── 필요한 표 (schema.sql 에 함께 적어 두었다) ──────────────────────────
   create table groups (
     group_id   text primary key,
     name       text not null,
     pin_hash   text not null,
     pin_salt   text not null,
     members    text not null,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now(),
     expires_at timestamptz not null
   );
===================================================================== */
import crypto from 'node:crypto';

export const GROUP_TTL_DAYS = 365;
const SCRYPT_LEN = 32;

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
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`저장소 오류 (HTTP ${res.status}) ${text}`);
  }
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function hashPin(pin, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(String(pin), salt, SCRYPT_LEN, (err, buf) => {
      if (err) reject(err); else resolve(buf.toString('base64'));
    });
  });
}

/* 맞춰볼 때는 반드시 시간을 일정하게 쓰는 비교를 한다.
   보통 비교는 앞자리가 틀리면 바로 끝나서, 응답 시간 차이로 한 자리씩 알아낼 수 있다. */
async function pinMatches(pin, row) {
  const got = await hashPin(pin, row.pin_salt);
  const a = Buffer.from(got), b = Buffer.from(row.pin_hash);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function newGroupId() { return crypto.randomBytes(12).toString('base64url'); }
function expiryISO() { return new Date(Date.now() + GROUP_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(); }

/* 기한 지난 그룹을 실제로 지운다. 새 그룹을 만들 때마다 곁들여 부른다. */
async function sweepExpiredGroups() {
  try {
    await rest(`groups?expires_at=lt.${new Date().toISOString()}`, {
      method: 'DELETE', headers: { Prefer: 'return=minimal' },
    });
  } catch (err) {
    console.warn('기한 지난 그룹 정리 실패(무시하고 계속):', err?.message);
  }
}

export async function createGroup({ name, pin, members }) {
  await sweepExpiredGroups();
  const salt = crypto.randomBytes(16).toString('base64');
  const pin_hash = await hashPin(pin, salt);
  const groupId = newGroupId();
  await rest('groups', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      group_id: groupId, name: String(name).slice(0, 40),
      pin_hash, pin_salt: salt, members,
      expires_at: expiryISO(),
    }),
  });
  return { groupId, ttlDays: GROUP_TTL_DAYS };
}

/* =====================================================================
   ★ R34 — 그룹도 "마지막으로 연 지 1년"으로 센다 (밀어내기 만료, 대표님 승인)
   ---------------------------------------------------------------------
   1:1 궁합과 같은 규칙이다. 계속 쓰는 그룹은 계속 살아 있고, 아무도 안 여는 그룹만
   조용히 사라진다. 그룹에는 최대 30명분 생년월일이 들어가므로,
   쓰지도 않는 명단을 이유 없이 계속 쥐고 있지 않겠다는 뜻이다.
===================================================================== */
async function touchGroup(groupId) {
  try {
    await rest(`groups?group_id=eq.${encodeURIComponent(groupId)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ expires_at: expiryISO() }),
    });
  } catch (err) {
    console.warn('그룹 기한 연장 실패(무시하고 계속):', err?.message);
  }
}

/* 열람 — PIN 없이 된다. 링크를 아는 사람만 올 수 있다. 열었으니 기한을 다시 센다. */
export async function getGroup(groupId) {
  const rows = await rest(
    `groups?group_id=eq.${encodeURIComponent(groupId)}&expires_at=gt.${new Date().toISOString()}&select=group_id,name,members,created_at,updated_at&limit=1`
  );
  const row = rows && rows[0] ? rows[0] : null;
  if (row) await touchGroup(groupId);
  return row;
}

/* 고치기·지우기 — PIN이 맞아야 한다. */
async function getGroupWithPin(groupId) {
  const rows = await rest(
    `groups?group_id=eq.${encodeURIComponent(groupId)}&expires_at=gt.${new Date().toISOString()}&select=*&limit=1`
  );
  return rows && rows[0] ? rows[0] : null;
}

/* =====================================================================
   ★ R35 — 접수 주소로 들어온 사람이 스스로 참여한다
   ---------------------------------------------------------------------
   지금까지 그룹 명단은 "저장하는 사람"이 자기 프로필에서 골라 채웠다. 그래서 남의 생년월일을
   그 사람 대신 올리는 구조였다. 접수 주소는 그 방향을 뒤집는다 —
   각자 자기 정보를 스스로 올리므로, 동의가 본인에게서 나온다. 개인정보 면에서 더 낫다.

   ★ PIN을 요구하지 않는다. 요구하면 접수의 뜻이 사라진다(주소만 알면 참여할 수 있어야 한다).
     대신 세 가지로 막는다 — 정원(GROUP_MAX_MEMBERS), 같은 줄 중복 거부, 그룹이 없으면 거부.
===================================================================== */
export const GROUP_MAX_MEMBERS = 30;

export async function joinGroup(groupId, memberRow) {
  const row = await getGroupWithPin(groupId);
  if (!row) return { ok: false, reason: 'not_found' };

  const rows = String(row.members || '').split(';').filter(Boolean);
  /* 이미 똑같은 줄이 있으면 다시 넣지 않는다 — 새로고침이나 두 번 누름으로 늘어나면 안 된다. */
  if (rows.indexOf(memberRow) >= 0) {
    return { ok: true, already: true, name: row.name, members: row.members };
  }
  if (rows.length >= GROUP_MAX_MEMBERS) {
    return { ok: false, reason: 'full' };
  }
  rows.push(memberRow);
  const next = rows.join(';');
  await rest(`groups?group_id=eq.${encodeURIComponent(groupId)}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ members: next, updated_at: new Date().toISOString(), expires_at: expiryISO() }),
  });
  return { ok: true, name: row.name, members: next };
}

export async function updateGroup(groupId, pin, patch) {
  const row = await getGroupWithPin(groupId);
  if (!row) return { ok: false, reason: 'not_found' };
  if (!(await pinMatches(pin, row))) return { ok: false, reason: 'bad_pin' };
  const body = { updated_at: new Date().toISOString() };
  if (typeof patch.name === 'string' && patch.name.trim()) body.name = patch.name.trim().slice(0, 40);
  if (typeof patch.members === 'string' && patch.members) body.members = patch.members;
  const rows = await rest(`groups?group_id=eq.${encodeURIComponent(groupId)}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body),
  });
  return { ok: true, group: rows && rows[0] ? rows[0] : null };
}

export async function deleteGroup(groupId, pin) {
  const row = await getGroupWithPin(groupId);
  if (!row) return { ok: false, reason: 'not_found' };
  if (!(await pinMatches(pin, row))) return { ok: false, reason: 'bad_pin' };
  await rest(`groups?group_id=eq.${encodeURIComponent(groupId)}`, {
    method: 'DELETE', headers: { Prefer: 'return=minimal' },
  });
  return { ok: true };
}

/* PIN 무차별 대입 막기 — rooms의 복원 제한과 같은 표를 쓴다. */
export async function tooManyPinTries(groupId) {
  const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const rows = await rest(
    `restore_attempts?session_id=eq.${encodeURIComponent('pin:' + groupId)}&tried_at=gte.${since}&select=id`
  );
  return (rows || []).length >= 10;
}
export async function notePinTry(groupId) {
  await rest('restore_attempts', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ session_id: 'pin:' + groupId }),
  });
}
