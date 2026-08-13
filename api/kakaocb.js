/* =====================================================================
   카카오에서 돌아오는 자리 (R72)
   ---------------------------------------------------------------------
   카카오 개발자센터의 "Redirect URI"에 이 주소를 등록한다.
       https://<도메인>/api/kakaocb
   물음표 뒤에 아무것도 붙이지 않는다 — 등록한 주소와 한 글자라도 다르면 거절당한다.

   여기서 하는 일은 딱 두 가지다.
     1) 정말 우리가 시작한 로그인인지 확인한다(state)
     2) 카카오 회원번호를 이 브라우저의 세션에 붙인다

   ★ 처음 연결이면 지금 세션을 그대로 적어 둔다.
   ★ 이미 연결된 적이 있으면(= 기기를 바꿨다) 예전 세션에 붙어 있던 구매를
     지금 세션으로 옮긴다. 그게 이 기능을 만든 이유다.

   ★ 회원번호 말고는 아무것도 저장하지 않는다. 이름·이메일·전화번호는 요청조차 하지 않았다.
===================================================================== */
import { ensureSession } from './_lib/session.js';
import { getKakaoLink, linkKakaoSession, moveOrdersToSession } from './_lib/store.js';
import { redirectUri, checkState, clearStateCookie, addCookie, fetchKakaoId } from './_lib/kakao.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.statusCode = 405;
    return res.end();
  }

  const url = new URL(req.url, 'https://x');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const err = url.searchParams.get('error');

  /* 이용자가 동의화면에서 취소를 눌렀다. 잘못된 게 아니므로 조용히 돌려보낸다. */
  if (err || !code) return done(res, '/fortune.html?kakao=cancel');

  /* ★ 남이 시작한 로그인을 내 계정에 붙이지 못하게 막는다(로그인 CSRF).
     이 검사가 없으면 공격자가 자기 계정으로 만든 주소를 피해자에게 눌리게 해서
     피해자의 구매를 공격자 계정에 묶을 수 있다. */
  if (!checkState(req, state)) {
    console.warn('카카오 state 불일치 — 요청을 버립니다');
    return done(res, '/fortune.html?kakao=fail');
  }

  try {
    const sessionId = ensureSession(req, res);
    const kakaoId = await fetchKakaoId(code, redirectUri(req));

    const prev = await getKakaoLink(kakaoId);
    let moved = 0;
    if (prev && prev.session_id && prev.session_id !== sessionId) {
      /* 기기를 바꾼 경우다. 예전 세션의 구매를 지금 세션으로 옮긴다.
         한 구매는 한 세션에만 붙는다 — 영수증 복원과 같은 방식이고,
         옮기면 이전 기기에서는 떨어진다(계정 돌려쓰기 방지). */
      moved = await moveOrdersToSession(prev.session_id, sessionId);
    }
    await linkKakaoSession(kakaoId, sessionId);

    return done(res, `/fortune.html?kakao=ok&moved=${moved}`);
  } catch (e) {
    const msg = String((e && e.message) || '');
    /* ★ 회원번호나 토큰이 로그에 남지 않게 앞부분만 남긴다. */
    console.error('카카오 연결 실패', msg.slice(0, 200));
    if (/Could not find the table/i.test(msg)) return done(res, '/fortune.html?kakao=notready');
    return done(res, '/fortune.html?kakao=fail');
  }
}

function done(res, to) {
  /* 돌아갈 때 state 쿠키를 지운다. 한 번 쓰면 그만이다. */
  addCookie(res, clearStateCookie());
  res.statusCode = 302;
  res.setHeader('Location', to);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.end();
}
