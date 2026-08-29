/* =====================================================================
   카카오 연결 — 시작 / 상태 조회 / 연결 끊기 (R72)
   ---------------------------------------------------------------------
   GET  /api/kakao?step=start   → 카카오 로그인 화면으로 보낸다
   POST /api/kakao {action:'status'}  → { linked, since }
   POST /api/kakao {action:'unlink'}  → 연결을 끊는다

   돌아오는 곳은 /api/kakaocb 다(카카오 개발자센터에 등록하는 주소).

   ★ 받는 것은 카카오 회원번호 하나뿐이다. 이름·이메일·전화번호는 요청하지 않는다.
     그래서 동의화면에 추가 항목이 뜨지 않고, 비즈니스 앱 검수도 필요 없다.
===================================================================== */
import { readBody, json } from './_lib/http.js';
import { ensureSession } from './_lib/session.js';
import { kakaoLinkOfSession, unlinkKakao } from './_lib/store.js';
import { AUTH_URL, redirectUri, restKey, newState, stateCookie, addCookie, hostAllowed, hostOf, allowedHosts } from './_lib/kakao.js';

export default async function handler(req, res) {
  /* ── 로그인 시작 — 카카오로 보낸다 ─────────────────────────────── */
  if (req.method === 'GET') {
    try {
      restKey();
    } catch (err) {
      console.error('카카오 설정 없음:', err && err.message);
      return backTo(res, '/fortune.html?kakao=notready');
    }
    /* ★ 등록되지 않은 주소에서는 카카오까지 가지 않는다. 가면 카카오가 KOE006을 띄우는데,
       그건 우리가 손님에게 보여줄 말이 아니다. 여기서 막고 우리 말로 안내한다. */
    if (!hostAllowed(req)) {
      console.warn('등록되지 않은 주소에서 카카오 로그인 시도:', hostOf(req), '허용:', allowedHosts().join(', '));
      return backTo(res, '/fortune.html?kakao=badhost');
    }
    try {
      /* 세션을 먼저 만든다. 돌아왔을 때 '누구에게 붙일지'가 있어야 한다. */
      ensureSession(req, res);
      const st = newState();
      addCookie(res, stateCookie(st));

      const q = new URLSearchParams({
        client_id: restKey(),
        redirect_uri: redirectUri(req),
        response_type: 'code',
        state: st,
        /* scope를 적지 않는다 — 회원번호는 동의 없이도 늘 온다. */
      });
      /* ★ 2026-08-29 — 여기에 through_account=true 를 붙였다가 되돌렸다. 기록으로 남긴다.
         앱 로그인이 IP 검사에 막히는 걸 피하려고, 카카오톡을 안 거치는 계정 로그인으로
         바로 보내려 했다. 그런데 through_account 는 **카카오가 스스로 붙이는 내부 표시**이고
         카카오가 만드는 거래번호(auth_tran_id)와 짝으로만 뜻이 있다. 문서에도 없다.
         우리가 처음 요청에 임의로 붙이니 짝이 없어서, 로그인은 성공하는데 우리 앱으로
         **돌아오지 못했다.** 대표님이 "로그인됐다고 하고 확인 눌러도 안 돌아온다"고
         제보하셔서 알았다. 고치려던 것보다 나쁜 상태를 만들었다.
         ★ 다시 붙이지 마라.
         애초에 필요도 없었다 — 카카오 로그인 화면(accounts.kakao.com/login)에는
         노란 [카카오톡으로 로그인] 아래에 아이디·비밀번호 칸이 이미 같이 있다. */
      return backTo(res, `${AUTH_URL}?${q.toString()}`);
    } catch (err) {
      console.error('카카오 시작 실패:', err && err.message);
      return backTo(res, '/fortune.html?kakao=fail');
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
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
    if (body.action === 'status') {
      /* 카카오 설정이 없으면 '쓸 수 없음'이라고 분명히 말한다.
         화면은 이걸 보고 버튼 자체를 감춘다 — 눌러도 안 되는 버튼을 두지 않는다. */
      let ready = true;
      try { restKey(); } catch { ready = false; }
      const link = await kakaoLinkOfSession(sessionId);
      return json(res, 200, { ready, linked: !!link, since: link ? link.created_at : null });
    }

    if (body.action === 'unlink') {
      await unlinkKakao(sessionId);
      /* ★ 주문 기록은 지우지 않는다. 전자상거래법이 대금 결제 기록을 5년 보관하라고 정한다.
         다만 그 기록에는 카카오 회원번호가 애초에 들어 있지 않다.
         연결을 끊어도 이 브라우저에서는 계속 보인다(쿠키가 그대로이므로). */
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: 'bad_request', reason: '알 수 없는 요청이에요.' });
  } catch (err) {
    const msg = String((err && err.message) || '');
    console.error('kakao 실패', msg.slice(0, 200));
    if (/Could not find the table/i.test(msg)) {
      return json(res, 503, { error: 'not_ready', reason: '서버 준비가 아직 안 끝났어요. (데이터베이스 표가 없습니다 — schema.sql을 실행해 주세요)' });
    }
    return json(res, 500, { error: 'server_error', reason: '지금은 처리할 수 없어요.' });
  }
}

function backTo(res, url) {
  res.statusCode = 302;
  res.setHeader('Location', url);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  return res.end();
}
