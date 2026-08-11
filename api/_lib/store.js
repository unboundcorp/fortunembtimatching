/* =====================================================================
   결제 원장 — Supabase(PostgREST)에 직접 붙는다
   ---------------------------------------------------------------------
   ★ SDK를 쓰지 않고 fetch로 REST를 부른다. 이 프로젝트는 지금까지 외부 의존성 0으로 왔고,
     결제 경로에 굳이 남의 코드를 끌어들일 이유가 없다. 쓰는 기능도 조회·삽입·수정 세 가지뿐이다.

   ★ service_role 키를 쓴다 — RLS를 우회하는 키다. 절대 브라우저로 내려가면 안 된다.
     이 파일은 서버 함수에서만 실행되므로 안전하지만, 값 자체를 로그로 찍지 않는다.

   ── 필요한 테이블 (Supabase SQL 편집기에 그대로 붙여넣기) ─────────────────
   create table if not exists orders (
     order_id    text primary key,          -- 영수증 번호이자 토스 orderId
     product_id  text not null,
     amount      integer not null,          -- 서버가 정한 금액. 브라우저 값이 아니다.
     status      text not null default 'created',   -- created | paid | failed
     session_id  text not null,
     payment_key text,
     created_at  timestamptz not null default now(),
     paid_at     timestamptz
   );
   create index if not exists orders_session_idx on orders (session_id);
   create index if not exists orders_status_idx  on orders (status);

   create table if not exists restore_attempts (
     id         bigserial primary key,
     session_id text not null,
     tried_at   timestamptz not null default now()
   );
   create index if not exists restore_session_idx on restore_attempts (session_id, tried_at desc);
   ────────────────────────────────────────────────────────────────────────
===================================================================== */

function conf() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.');
  return { url: url.replace(/\/+$/, ''), key };
}

async function rest(path, init = {}) {
  const { url, key } = conf();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    /* ★ 응답 본문에 키가 섞여 나오는 일은 없지만, 그대로 던지면 상위에서 로그에 남을 수 있다.
       상태 코드와 짧은 본문만 남긴다. */
    const text = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`저장소 오류 (HTTP ${res.status}) ${text}`);
  }
  /* ★ 본문이 비어 있을 수 있다. `Prefer: return=minimal` 로 넣으면 PostgREST는
     201을 주면서 본문을 안 보낸다(204만 오는 게 아니다). 곧바로 res.json()을 부르면
     "Unexpected end of JSON input"으로 터진다 — 실제 배포에서 주문 생성이 이걸로 죽었다.
     상태 코드로 갈라내지 말고 "본문이 있으면 파싱한다"로 통일한다. */
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { return null; }
}

export async function createOrder({ orderId, productId, amount, sessionId }) {
  await rest('orders', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ order_id: orderId, product_id: productId, amount, session_id: sessionId, status: 'created' }),
  });
}

export async function getOrder(orderId) {
  const rows = await rest(`orders?order_id=eq.${encodeURIComponent(orderId)}&select=*&limit=1`);
  return rows && rows[0] ? rows[0] : null;
}

/* 결제 승인 성공을 기록한다.
   ★ status가 'created'인 행만 고른다. 이미 'paid'면 아무 행도 안 바뀌고 null이 온다 —
     같은 결제가 두 번 들어와도 두 번 적히지 않는다(토스가 재시도하거나 사용자가 새로고침하는 경우). */
export async function markPaid(orderId, paymentKey) {
  const rows = await rest(
    `orders?order_id=eq.${encodeURIComponent(orderId)}&status=eq.created`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'paid', payment_key: paymentKey, paid_at: new Date().toISOString() }),
    }
  );
  return rows && rows[0] ? rows[0] : null;
}

export async function markFailed(orderId) {
  await rest(`orders?order_id=eq.${encodeURIComponent(orderId)}&status=eq.created`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ status: 'failed' }),
  });
}

export async function paidOrdersOf(sessionId) {
  return (await rest(
    `orders?session_id=eq.${encodeURIComponent(sessionId)}&status=eq.paid&select=*&order=paid_at.asc`
  )) || [];
}

/* 구매 복원 — 영수증을 지금 이 세션으로 다시 연결한다(규격 3항 ②).
   ★ 이 재연결이 없으면 verified만 true로 돌려줘도 곧이어 나가는 권한 조회가 여전히 빈 값이라,
     "확인은 됐는데 안 열림"이라는 최악의 상태가 남는다. */
export async function rebindOrder(orderId, sessionId) {
  const rows = await rest(
    `orders?order_id=eq.${encodeURIComponent(orderId)}&status=eq.paid`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ session_id: sessionId }),
    }
  );
  return rows && rows[0] ? rows[0] : null;
}

/* 무차별 대입 막기 — 영수증 번호를 찍어보는 것을 어렵게 한다(규격 3항 안전장치).
   번호 자체가 24바이트 난수라 사실상 못 맞히지만, 속도 제한은 별개로 걸어 둔다. */
const RESTORE_WINDOW_MIN = 10;
const RESTORE_MAX_TRIES = 10;

export async function tooManyRestoreTries(sessionId) {
  const since = new Date(Date.now() - RESTORE_WINDOW_MIN * 60 * 1000).toISOString();
  const rows = await rest(
    `restore_attempts?session_id=eq.${encodeURIComponent(sessionId)}&tried_at=gte.${since}&select=id`
  );
  return (rows || []).length >= RESTORE_MAX_TRIES;
}

export async function noteRestoreTry(sessionId) {
  await rest('restore_attempts', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ session_id: sessionId }),
  });
}
