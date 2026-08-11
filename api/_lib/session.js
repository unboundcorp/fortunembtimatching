/* =====================================================================
   세션 — 이 앱에는 로그인이 없다
   ---------------------------------------------------------------------
   이용자를 알아보는 유일한 수단이 쿠키다. 그래서 쿠키가 곧 지갑이다.
   쿠키 값을 그냥 난수로 두고 "이 값이 곧 그 사람"이라고 하면, 남의 쿠키 값을 알아내거나
   찍어보는 것만으로 남의 이용권을 쓸 수 있다. 그래서 서버 비밀키로 서명해서 내려준다.
   서명이 맞지 않으면 아예 새 세션으로 취급한다(조용히 남의 것이 되지 않게).

   ★ 브라우저 저장소를 지우거나 기기를 바꾸면 이 쿠키가 사라진다. 그때 되찾는 열쇠가
     영수증 번호이고, 그 처리는 api/verify.js가 한다(규격 3항의 rebind).
===================================================================== */
import crypto from 'node:crypto';

const COOKIE = 'fsid';
const MAX_AGE = 60 * 60 * 24 * 400; /* 400일 — 브라우저가 허용하는 상한에 맞춘다 */

function secret() {
  const s = process.env.SESSION_SECRET;
  /* ★ 비밀키가 없으면 서명이 의미를 잃는다. 조용히 넘어가지 않고 멈춘다 —
     "동작은 하는데 안전하지 않은 상태"가 가장 위험하다. */
  if (!s || s.length < 32) {
    throw new Error('SESSION_SECRET 환경변수가 없거나 너무 짧습니다(32자 이상 필요).');
  }
  return s;
}

function sign(id) {
  return crypto.createHmac('sha256', secret()).update(id).digest('base64url');
}

function parseCookies(req) {
  const raw = req.headers?.cookie || '';
  const out = {};
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/* 쿠키에서 세션 id를 읽는다. 없거나 서명이 안 맞으면 null. */
export function readSession(req) {
  const v = parseCookies(req)[COOKIE];
  if (!v) return null;
  const dot = v.lastIndexOf('.');
  if (dot < 1) return null;
  const id = v.slice(0, dot), mac = v.slice(dot + 1);
  const expect = sign(id);
  /* 길이가 다르면 timingSafeEqual이 던진다 — 먼저 걸러낸다. */
  if (mac.length !== expect.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return null;
  return id;
}

export function newSessionId() {
  return crypto.randomBytes(24).toString('base64url');
}

export function setSession(res, id) {
  const value = `${id}.${sign(id)}`;
  res.setHeader('Set-Cookie', [
    `${COOKIE}=${encodeURIComponent(value)}`,
    'Path=/',
    `Max-Age=${MAX_AGE}`,
    'HttpOnly',           /* JS로 못 읽는다 — XSS가 나도 지갑은 못 훔친다 */
    'Secure',
    'SameSite=Lax',       /* 결제창에서 돌아오는 이동(top-level GET)에 쿠키가 따라온다 */
  ].join('; '));
}

/* 있으면 쓰고 없으면 만들어 내려준다. 결제·조회 어느 쪽으로 들어와도 세션이 생긴다. */
export function ensureSession(req, res) {
  const found = readSession(req);
  if (found) return found;
  const id = newSessionId();
  setSession(res, id);
  return id;
}

/* 영수증 번호 — 순번이면 남의 구매를 가져갈 수 있으므로 반드시 추측 불가능해야 한다(규격 3항).
   토스의 orderId 규칙(6~64자, 영문/숫자/-/_)도 함께 만족시킨다. */
export function newReceiptId() {
  return 'R' + crypto.randomBytes(24).toString('base64url');
}
