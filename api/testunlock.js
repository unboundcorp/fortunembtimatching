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

  /* ★ 세션 발급이 실패하면(SESSION_SECRET 없음) 그 자리에서 멈춘다.
     감싸지 않으면 그대로 튀어나가 Vercel의 "A server error has occurred"가 뜬다.
     그 화면은 무엇이 잘못됐는지 아무것도 알려주지 않아, 원인을 찾는 데만 한참 걸린다. */
  let sessionId;
  try {
    sessionId = ensureSession(req, res);
  } catch (err) {
    console.error('세션 발급 실패', err && err.message);
    return json(res, 500, { ok: false, reason: '서버 설정이 아직 끝나지 않았어요.' });
  }

  /* 켜지 않은 기능이라는 사실은 숨기지 않는다. 다만 '무엇이' 열쇠인지는 알리지 않는다. */
  if (!expected || expected.length < 8) {
    return json(res, 404, { ok: false, reason: '지금은 사용할 수 없어요.' });
  }

  const body = readBody(req);

  /* 상태 조회 — 이미 허가받았는지만 본다. 코드를 보내지 않으므로 시도로 세지 않는다. */
  if (body.action === 'status') {
    try {
      const cur = await testAccessOf(sessionId);
      return json(res, 200, { ok: !!cur, until: cur ? cur.expires_at : null });
    } catch (err) {
      return storeFail(res, err);
    }
  }

  const code = String(body.code || '');
  if (!code) return json(res, 400, { ok: false, reason: '코드를 입력해 주세요.' });

  try {
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
  } catch (err) {
    return storeFail(res, err);
  }
}

/* 저장소가 준비 안 됐을 때 — 무엇이 없는지 정확히 말한다.
   ★ "서버 오류"라고만 하면 표를 안 만든 것인지, 키가 틀린 것인지, 코드가 잘못된 것인지
     구분할 수가 없다. 실제로 이것 때문에 원인 찾는 데 시간을 썼다. */
function storeFail(res, err) {
  const msg = String((err && err.message) || '');
  console.error('testunlock 저장소 오류', msg.slice(0, 200));
  if (/Could not find the table/i.test(msg)) {
    return json(res, 503, { ok: false, reason: '서버 준비가 아직 안 끝났어요. (데이터베이스 표가 없습니다 — schema.sql을 실행해 주세요)' });
  }
  return json(res, 503, { ok: false, reason: '지금은 처리할 수 없어요. 잠시 후 다시 시도해 주세요.' });
}
