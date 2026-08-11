/* =====================================================================
   테스트 허가 — 운영자가 결제 없이 유료 기능을 확인하기 위한 문
   ---------------------------------------------------------------------
   ★ 이 파일에 열쇠를 적지 않는다. Vercel 환경변수(TEST_UNLOCK_CODE)에만 둔다.
     예전에 fortune-test.html 안에 관리자 키를 박은 채 공개 저장소에
     올린 사고가 있었다. 그 주소를 아는 사람은 누구나 유료 기능을 전부 열 수 있었고,
     지운 뒤에도 과거 기록에는 그대로 남았다. 브라우저로 내려가는 파일에는 열쇠를 두지 않는다.

   ★ 환경변수를 넣지 않으면 이 기능은 아예 꺼져 있다. 켤지 말지를 코드가 아니라 설정이 정한다.
   ★ 화면 어디에도 이 문으로 가는 버튼을 두지 않는다. 주소 끝에 #unlock 을 붙여야 열린다.
     주소는 비밀이 아니다 — 비밀은 코드이고, 그 대조는 여기 서버에서만 한다.
   ★ 찍어보기를 막는다. 한 시간에 10번까지만 시도할 수 있다.
===================================================================== */
import crypto from 'node:crypto';
import { readBody, json } from './_lib/http.js';
import { ensureSession } from './_lib/session.js';
import { grantTestAccess, testAccessOf, tooManyUnlockTries, noteUnlockTry } from './_lib/store.js';

const GRANT_HOURS = 24 * 7; /* 일주일. 테스트하다 자꾸 풀리면 그것대로 일이 안 된다. */

/* 길이가 달라도 시간이 새지 않게 비교한다. 길이 자체가 단서가 되면 안 된다. */
function sameSecret(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'method_not_allowed' });
  }

  const expected = process.env.TEST_UNLOCK_CODE;
  const sessionId = ensureSession(req, res);

  /* 켜지 않은 기능이라는 사실은 숨기지 않는다. 다만 '무엇이' 열쇠인지는 알리지 않는다. */
  if (!expected || expected.length < 8) {
    return json(res, 404, { ok: false, reason: '지금은 사용할 수 없어요.' });
  }

  const body = readBody(req);

  /* 상태 조회 — 이미 허가받았는지만 본다. 코드를 보내지 않으므로 시도로 세지 않는다. */
  if (body.action === 'status') {
    const cur = await testAccessOf(sessionId);
    return json(res, 200, { ok: !!cur, until: cur ? cur.expires_at : null });
  }

  const code = String(body.code || '');
  if (!code) return json(res, 400, { ok: false, reason: '코드를 입력해 주세요.' });

  if (await tooManyUnlockTries(sessionId)) {
    return json(res, 429, { ok: false, reason: '시도가 너무 많아요. 한 시간 뒤에 다시 해주세요.' });
  }
  await noteUnlockTry(sessionId);

  if (!sameSecret(code, expected)) {
    /* 맞는지 틀리는지 외에 아무것도 알려주지 않는다. */
    return json(res, 403, { ok: false, reason: '코드가 맞지 않아요.' });
  }

  const until = await grantTestAccess(sessionId, GRANT_HOURS);
  return json(res, 200, { ok: true, until });
}
