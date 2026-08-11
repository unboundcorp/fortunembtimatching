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

export async function createGroup({ name, pin, members }) {
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

/* 열람 — PIN 없이 된다. 링크를 아는 사람만 올 수 있다. */
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
