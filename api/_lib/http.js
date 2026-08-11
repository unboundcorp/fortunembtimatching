/* =====================================================================
   요청·응답 공통 처리
   ---------------------------------------------------------------------
   앱(fortune.html)은 모든 결제 요청을 이렇게 보낸다:
     POST · Content-Type: application/json · credentials:'include'
   따라서 서버는 (1) POST만 받고 (2) JSON을 돌려주고 (3) 쿠키를 유지해야 한다.

   ★ 앱과 서버가 같은 도메인에 있다는 전제다. 도메인이 갈리면 브라우저(특히 사파리)가
     쿠키를 막아, 결제는 됐는데 화면은 안 열리는 최악의 상태가 된다.
     그래서 앱 전체를 이 Vercel 프로젝트 안에 함께 둔다. CORS 설정으로 우회하지 않는다.
===================================================================== */

export function json(res, status, body) {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  /* 권한·결제 응답은 절대 캐시되면 안 된다. 잠긴 사람이 남의 캐시를 받으면 그대로 뚫린다. */
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.send(JSON.stringify(body));
}

export function methodGuard(req, res, allowed) {
  if (req.method === allowed) return true;
  res.setHeader('Allow', allowed);
  json(res, 405, { error: 'method_not_allowed' });
  return false;
}

/* Vercel은 보통 req.body를 이미 파싱해 주지만, Content-Type이 어긋나면 문자열로 온다.
   양쪽 다 견디게 한다 — 여기서 던지면 결제 흐름 전체가 죽는다. */
export function readBody(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'object') return b;
  try { return JSON.parse(b); } catch { return {}; }
}

/* 사람이 읽을 한 문장. 앱은 이 reason을 화면에 그대로 보여준다(규격 3항).
   ★ "그 번호는 있지만 다른 사람 것"처럼 존재 여부를 알려주는 말을 쓰지 않는다. */
export function fail(res, status, reason) {
  json(res, status, { verified: false, error: 'failed', reason });
}
