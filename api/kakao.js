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
    /* ?account=1 — 카카오톡 앱을 건너뛰고 카카오계정 로그인 화면으로 보낸다(아래 주석 참고). */
    let viaAccount = false;
    try {
      viaAccount = new URL(req.url, 'http://x').searchParams.get('account') === '1';
    } catch { /* 주소를 못 읽으면 평소대로 간다 */ }
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
      /* ★ 2026-08-29 — ?account=1 이면 카카오톡 앱을 거치지 않고 카카오계정(아이디·비밀번호)
         화면으로 바로 보낸다.

         왜 필요한가. 카카오는 로그인을 시작한 IP를 auth_tran_id에 묶어 두고, 돌아왔을 때
         IP가 다르면 "접속 정보를 확인해 주세요"로 막는다. 그런데 아이폰의 iCloud 비공개
         릴레이가 켜져 있으면 **사파리만** 애플 중계서버를 거치고 카카오톡 앱은 안 거친다.
         같은 폰인데 두 IP가 달라서, 앱으로 넘어갔다 오는 순간 무조건 막힌다.
         비공개 릴레이를 끄라고 손님에게 시킬 수는 없다.

         브라우저를 벗어나지 않으면 IP가 바뀔 일 자체가 없다. 그래서 앱 로그인이 실패한
         손님에게만 이 길을 내준다. 기본은 그대로 앱 로그인이다 — 대부분은 그게 더 편하다. */
      if (viaAccount) q.set('through_account', 'true');
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
