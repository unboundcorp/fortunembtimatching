/* =====================================================================
   기기 사이 이어보기 — 프로필·기록을 카카오 계정에 붙여 두고 내려받는다
   ---------------------------------------------------------------------
   POST /api/sync {action:'get'}            → { ok, data, rev, updatedAt }  (없으면 data:null)
   POST /api/sync {action:'put', data:{…}}  → { ok, rev, updatedAt }
   POST /api/sync {action:'clear'}          → { ok }   서랍을 비운다

   ★ 카카오 로그인을 한 세션만 쓸 수 있다. 안 했으면 401을 준다.
     로그인하지 않은 사람의 생년월일은 이 서버에 한 글자도 오지 않는다.
   ★ 이용권은 여기 담지 않는다. 권한의 근거는 orders 뿐이다 —
     브라우저가 보낸 값을 근거로 삼으면 페이월이 통째로 뚫린다.
   ★ 크기 상한을 둔다. 저장소를 지키는 선이고, 터무니없는 요청을 일찍 끊는다.
===================================================================== */
import { readBody, json, methodGuard } from './_lib/http.js';
import { ensureSession } from './_lib/session.js';
import { kakaoLinkOfSession, getUserSync, putUserSync, deleteUserSync } from './_lib/store.js';

/* 한 사람 몫으로 넉넉하되 무한은 아니다. 프로필 30명 + 기록 수백 건이 들어가고도 남는다. */
const MAX_BYTES = 512 * 1024;

/* 담아도 되는 칸만 옮겨 적는다. 브라우저가 무엇을 보내든 이 목록 밖은 버린다.
   ★ entitlements·billingConfig·interpreterConfig는 일부러 뺐다. 권한과 설정은 서버 것이다. */
const ALLOWED = [
  'profiles', 'activeId', 'onboarded', 'mode',
  'fortuneHistory', 'compatHistory', 'sajuHistory', 'mbtiReportHistory',
  'receiptMemos',
];

function pick(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const out = {};
  for (const k of ALLOWED) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  }
  return out;
}

export default async function handler(req, res) {
  /* ★ 2026-08-22 — 여기서 두 가지를 한꺼번에 틀렸었다(배포 뒤 실측으로 잡음).
       ① allowed 를 배열로 넘겼다. methodGuard는 문자열과 === 로 비교하므로 영영 안 맞는다.
       ② 반환값의 뜻을 뒤집어 읽었다. methodGuard는 '방식이 맞으면 true'다.
     둘이 겹쳐서 이 창구는 POST에도 405를 돌려주며 통째로 죽어 있었다 —
     문법도 통과하고 import도 되므로, 실제로 불러보기 전까지는 멀쩡해 보였다.
     ★ 다른 창구들과 같은 모양으로 쓴다: if (!methodGuard(req, res, 'POST')) return; */
  if (!methodGuard(req, res, 'POST')) return;

  let sessionId;
  try {
    sessionId = ensureSession(req, res);
  } catch (err) {
    console.error('세션 발급 실패', err && err.message);
    return json(res, 500, { error: 'server_error', reason: '서버 설정이 아직 끝나지 않았어요.' });
  }

  let link;
  try {
    link = await kakaoLinkOfSession(sessionId);
  } catch (err) {
    console.error('카카오 연결 조회 실패', err && err.message);
    return json(res, 503, { error: 'store', reason: '지금은 이어보기를 쓸 수 없어요. 잠시 후 다시 시도해 주세요.' });
  }
  if (!link || !link.kakao_id) {
    return json(res, 401, { error: 'no_link', reason: '카카오로 로그인하시면 기기 사이에서 이어볼 수 있어요.' });
  }

  const body = await readBody(req);
  const action = String((body && body.action) || '');

  try {
    if (action === 'get') {
      const row = await getUserSync(link.kakao_id);
      return json(res, 200, {
        ok: true,
        data: row ? row.data : null,
        rev: row ? Number(row.rev) : 0,
        updatedAt: row ? row.updated_at : null,
      });
    }

    if (action === 'put') {
      const data = pick(body && body.data);
      if (!data) return json(res, 400, { error: 'bad_request', reason: '보낼 내용이 없어요.' });
      const size = Buffer.byteLength(JSON.stringify(data), 'utf8');
      if (size > MAX_BYTES) {
        return json(res, 413, { error: 'too_big', reason: '저장할 내용이 너무 커요. 오래된 기록을 지우고 다시 시도해 주세요.' });
      }
      const r = await putUserSync(link.kakao_id, data);
      return json(res, 200, { ok: true, rev: r.rev, updatedAt: r.updatedAt });
    }

    if (action === 'clear') {
      await deleteUserSync(link.kakao_id);
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: 'bad_request', reason: '무엇을 할지 알 수 없어요.' });
  } catch (err) {
    console.error('이어보기 처리 실패', err && err.message);
    return json(res, 503, { error: 'store', reason: '지금은 이어보기를 쓸 수 없어요. 잠시 후 다시 시도해 주세요.' });
  }
}
