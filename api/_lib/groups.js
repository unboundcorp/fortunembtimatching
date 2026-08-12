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
async function hashMatches(value, hash, salt) {
  if (!value || !hash || !salt) return false;
  const got = await hashPin(value, salt);
  const a = Buffer.from(got), b = Buffer.from(hash);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
/* PIN이 맞거나, 만든 기기의 토큰이 맞으면 통과. 둘 중 하나면 된다. */
async function canManage(row, pin, ownerToken) {
  if (await hashMatches(ownerToken, row.owner_hash, row.owner_salt)) return true;
  return await hashMatches(pin, row.pin_hash, row.pin_salt);
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

/* =====================================================================
   ★ R39 — PIN을 안 정해도 그룹을 만들 수 있게 한다 (대표님 지시)
   ---------------------------------------------------------------------
   "링크를 만드는 순간 바로 그룹이 되게" 하려면, 링크 한 번 만들자고 PIN까지 정하라고
   할 수는 없다. 그래서 만들 때 소유자 토큰(owner_token)을 하나 발급해 만든 사람 기기에
   저장해 둔다. 그 기기에서는 PIN 없이도 고치고 지울 수 있다.

   PIN은 "다른 기기에서도 관리하고 싶을 때" 나중에 정하는 선택 사항이 된다.
   ★ 토큰도 되돌릴 수 없는 형태로만 저장한다 — 저장소가 새어도 남의 그룹을 만질 수 없다.
     PIN과 같은 원칙이다.
===================================================================== */
export async function createGroup({ name, pin, members }) {
  await sweepExpiredGroups();
  const groupId = newGroupId();
  const ownerToken = crypto.randomBytes(24).toString('base64url');
  const tokSalt = crypto.randomBytes(16).toString('base64');
  const row = {
    group_id: groupId, name: String(name).slice(0, 40), members,
    owner_hash: await hashPin(ownerToken, tokSalt), owner_salt: tokSalt,
    expires_at: expiryISO(),
  };
  /* PIN은 없어도 된다. 정한 경우에만 해시를 넣는다. */
  if (pin) {
    const salt = crypto.randomBytes(16).toString('base64');
    row.pin_hash = await hashPin(pin, salt);
    row.pin_salt = salt;
  }
  await rest('groups', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(row) });
  return { groupId, ownerToken, ttlDays: GROUP_TTL_DAYS };
}

/* =====================================================================
   ★ R47 — 기한은 '만든 날'부터 센다 (대표님 지시, 2026-08-12)
   ---------------------------------------------------------------------
   예전에는 열 때마다 다시 밀었다. 이제는 그룹을 만든 날로부터 1년이 지나면 지운다.
   매일 쓰는 그룹도 1년이 되면 사라진다 — 부작용이 아니라 정한 규칙이다.
   대신 "언제까지 남는지"를 처음부터 한 문장으로 말할 수 있다.
===================================================================== */
/* 열람 — PIN 없이 된다. 링크를 아는 사람만 올 수 있다. 기한은 밀지 않는다. */
export async function getGroup(groupId) {
  const rows = await rest(
    `groups?group_id=eq.${encodeURIComponent(groupId)}&expires_at=gt.${new Date().toISOString()}&select=group_id,name,members,created_at,updated_at&limit=1`
  );
  return rows && rows[0] ? rows[0] : null;
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
    /* ★ 사람이 새로 들어와도 기한은 안 민다. 기준은 어디까지나 '만든 날'이다. */
    body: JSON.stringify({ members: next, updated_at: new Date().toISOString() }),
  });
  return { ok: true, name: row.name, members: next };
}

export async function updateGroup(groupId, pin, patch, ownerToken) {
  const row = await getGroupWithPin(groupId);
  if (!row) return { ok: false, reason: 'not_found' };
  if (!(await canManage(row, pin, ownerToken))) return { ok: false, reason: 'denied' };
  const body = { updated_at: new Date().toISOString() };
  if (typeof patch.name === 'string' && patch.name.trim()) body.name = patch.name.trim().slice(0, 40);
  if (typeof patch.members === 'string' && patch.members) body.members = patch.members;
  /* 나중에 PIN을 새로 정하는 경우 — 다른 기기에서도 관리하고 싶을 때 쓴다. */
  if (typeof patch.newPin === 'string' && /^\d{4,8}$/.test(patch.newPin)) {
    const salt = crypto.randomBytes(16).toString('base64');
    body.pin_hash = await hashPin(patch.newPin, salt);
    body.pin_salt = salt;
  }
  const rows = await rest(`groups?group_id=eq.${encodeURIComponent(groupId)}`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(body),
  });
  return { ok: true, group: rows && rows[0] ? rows[0] : null };
}

export async function deleteGroup(groupId, pin, ownerToken) {
  const row = await getGroupWithPin(groupId);
  if (!row) return { ok: false, reason: 'not_found' };
  if (!(await canManage(row, pin, ownerToken))) return { ok: false, reason: 'denied' };
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
