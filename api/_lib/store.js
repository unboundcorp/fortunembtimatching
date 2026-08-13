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

   -- 카카오 연결 (R72) — 기기를 바꿔도 산 것을 되찾기 위한 유일한 목적
   -- ★ 담는 것은 '카카오 회원번호' 하나뿐이다. 이름·이메일·전화번호는 받지 않는다.
   --   이 번호는 우리 앱 전용이라 그 값만으로는 누구인지 알 수 없다.
   create table if not exists kakao_links (
     kakao_id   text primary key,           -- 카카오 회원번호 (우리 앱 전용 식별자)
     session_id text not null,              -- 지금 이 사람의 세션
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   );
   create index if not exists kakao_session_idx on kakao_links (session_id);
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

/* =====================================================================
   AI 해석 — 캐시 / 사용 횟수 / 테스트 허가
   ---------------------------------------------------------------------
   ── 필요한 테이블 (schema.sql에 같은 내용이 있다) ─────────────────────
   create table if not exists ai_cache (
     cache_key  text primary key,
     product_id text not null,
     body       text not null,
     model      text not null,
     created_at timestamptz not null default now()
   );
   create table if not exists ai_usage (
     id         bigserial primary key,
     session_id text not null,
     cache_key  text not null,
     created_at timestamptz not null default now()
   );
   create unique index if not exists ai_usage_uniq on ai_usage (session_id, cache_key);
   create table if not exists test_grants (
     session_id text primary key,
     expires_at timestamptz not null
   );
   create table if not exists unlock_attempts (
     id bigserial primary key,
     session_id text not null,
     tried_at   timestamptz not null default now()
   );
   ────────────────────────────────────────────────────────────────────── */

/* 같은 사주·같은 상품이면 만들어 둔 글을 그대로 쓴다.
   ★ 돈 문제만이 아니다. 다시 열 때마다 다른 말이 나오면 "아까랑 다른데?"가 된다.
     한 사람의 풀이는 한 번 정해지면 그대로여야 읽는 사람이 믿을 수 있다. */
export async function getAiCache(cacheKey) {
  const rows = await rest(`ai_cache?cache_key=eq.${encodeURIComponent(cacheKey)}&select=*&limit=1`);
  return rows && rows[0] ? rows[0] : null;
}

export async function putAiCache({ cacheKey, productId, body, model }) {
  /* 같은 열쇠가 이미 있으면 덮지 않는다(먼저 만든 것이 정본이다).
     동시에 두 번 눌러 둘 다 만들어졌을 때 뒤엣것으로 바뀌면 방금 읽던 글이 달라진다. */
  await rest('ai_cache?on_conflict=cache_key', {
    method: 'POST',
    headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' },
    body: JSON.stringify({ cache_key: cacheKey, product_id: productId, body, model }),
  });
}

/* 이 사람이 '새로 만든' 해석이 몇 개인가.
   ★ 세는 단위는 호출 횟수가 아니라 서로 다른 해석의 수(session_id + cache_key 한 쌍)다.
     그래야 만들다 끊겨서 다시 눌러도 한 번으로 친다. */
export async function aiUsedCount(sessionId) {
  const rows = await rest(
    `ai_usage?session_id=eq.${encodeURIComponent(sessionId)}&select=cache_key`
  );
  return Array.isArray(rows) ? rows.length : 0;
}

export async function noteAiUse(sessionId, cacheKey) {
  await rest('ai_usage?on_conflict=session_id,cache_key', {
    method: 'POST',
    headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' },
    body: JSON.stringify({ session_id: sessionId, cache_key: cacheKey }),
  });
}

/* 이 세션이 이미 만든 적 있는 해석인가 — 다시 만드는 게 아니라 다시 보는 것이면 횟수를 안 쓴다. */
export async function aiAlreadyUsed(sessionId, cacheKey) {
  const rows = await rest(
    `ai_usage?session_id=eq.${encodeURIComponent(sessionId)}&cache_key=eq.${encodeURIComponent(cacheKey)}&select=cache_key&limit=1`
  );
  return !!(rows && rows[0]);
}

/* ---- 테스트 허가 ----
   운영자가 결제 없이 유료 기능을 확인하기 위한 것이다.
   ★ 열쇠는 코드에 넣지 않는다. Vercel 환경변수(TEST_UNLOCK_CODE)에만 두고 서버가 대조한다.
     예전에 fortune-test.html에 관리자 키를 박아 공개 저장소에 올린 사고가 있었다.
     그때 그 주소를 아는 사람은 누구나 유료 기능을 전부 열 수 있었다. 같은 실수를 반복하지 않는다. */
export async function grantTestAccess(sessionId, hours) {
  const expires = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  await rest('test_grants?on_conflict=session_id', {
    method: 'POST',
    headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
    body: JSON.stringify({ session_id: sessionId, expires_at: expires }),
  });
  return expires;
}

export async function testAccessOf(sessionId) {
  const rows = await rest(`test_grants?session_id=eq.${encodeURIComponent(sessionId)}&select=*&limit=1`);
  const row = rows && rows[0] ? rows[0] : null;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;
  return row;
}

/* 코드 맞히기를 막는다. 코드가 짧아도 무한정 찍어보지는 못하게 한다. */
export async function tooManyUnlockTries(sessionId) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const rows = await rest(
    `unlock_attempts?session_id=eq.${encodeURIComponent(sessionId)}&tried_at=gte.${encodeURIComponent(since)}&select=id`
  );
  return Array.isArray(rows) && rows.length >= 10;
}

export async function noteUnlockTry(sessionId) {
  await rest('unlock_attempts', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ session_id: sessionId }),
  });
}

/* =====================================================================
   R48 — AI 관련 기록도 기한이 지나면 지운다
   ---------------------------------------------------------------------
   방(rooms)과 그룹(groups)에는 정리 코드가 있었는데, AI를 붙이면서 만든 네 표에는 없었다.
   그대로 두면 사주 풀이·이용 기록이 무기한 쌓인다. 개인정보처리방침에
   "기간이 지나면 지운다"고 적어 놓고 실제로는 안 지우면 그 자체가 어긋남이다.

   ★ 기준은 '만든 날'이다(대표님 지시). 다시 열어도 기간이 늘어나지 않는다.
   ★ 해석 글이 지워져도 산 사람이 손해 보지 않는다 — 이미 만든 적 있는 해석은
     다시 만들 때 횟수를 쓰지 않게 돼 있다(api/interpret.js의 aiAlreadyUsed).
   ★ 따로 도는 청소 작업을 두지 않는다. 새로 만들 때 곁들여 부른다.
     실패해도 본래 일은 계속한다 — 청소가 안 됐다고 기능을 멈출 이유가 없다.
===================================================================== */
export const AI_KEEP_DAYS = 365;

export async function sweepAiOld() {
  const cut = new Date(Date.now() - AI_KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const jobs = [
    `ai_cache?created_at=lt.${cut}`,
    `ai_usage?created_at=lt.${cut}`,
    `test_grants?expires_at=lt.${now}`,
    /* 코드 시도 기록은 한 시간만 쓰인다. 하루 지난 것은 남길 이유가 없다. */
    `unlock_attempts?tried_at=lt.${dayAgo}`,
  ];
  for (const path of jobs) {
    try {
      await rest(path, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
    } catch (err) {
      console.warn('오래된 AI 기록 정리 실패(무시하고 계속):', path.split('?')[0], err?.message);
    }
  }
}

/* =====================================================================
   카카오 연결 (R72)
   ---------------------------------------------------------------------
   왜 만드나: 지금은 쿠키가 곧 지갑이라, 기기를 바꾸거나 브라우저 기록을 지우면
   산 것을 잃는다. 되찾는 열쇠가 영수증 번호뿐인데 그걸 적어두는 사람은 많지 않다.

   ★ 담는 것은 카카오 회원번호 하나뿐이다. 이름·이메일·전화번호는 받지 않는다.
     그 번호는 우리 앱에만 쓰이는 값이라, 그것만으로는 누구인지 알 수 없다.
     전화번호를 받는 쪽보다 훨씬 가벼운 정보다.

   ★ 로그인은 '결제한 분이 원할 때'만 건다. 궁합 링크로 들어오는 분은 이 경로를 밟지 않는다.
     "회원가입 없이"라는 이 서비스의 약속은 그대로 지켜져야 한다.
===================================================================== */
export async function getKakaoLink(kakaoId) {
  const rows = await rest(
    `kakao_links?kakao_id=eq.${encodeURIComponent(kakaoId)}&select=*&limit=1`
  );
  return rows && rows[0] ? rows[0] : null;
}

export async function linkKakaoSession(kakaoId, sessionId) {
  /* 있으면 갱신, 없으면 넣는다. 카카오 회원번호가 기본키라 충돌하면 갱신으로 처리된다. */
  return rest('kakao_links?on_conflict=kakao_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      kakao_id: String(kakaoId),
      session_id: sessionId,
      updated_at: new Date().toISOString(),
    }),
  });
}

export async function kakaoLinkOfSession(sessionId) {
  const rows = await rest(
    `kakao_links?session_id=eq.${encodeURIComponent(sessionId)}&select=kakao_id,created_at&limit=1`
  );
  return rows && rows[0] ? rows[0] : null;
}

/* 연결 끊기 — 카카오 회원번호를 지운다.
   ★ 주문 기록은 지우지 않는다. 전자상거래법이 대금 결제 기록을 5년 보관하라고 정하고 있어
     지울 수 없다. 다만 그 기록에 카카오 회원번호는 애초에 들어 있지 않다. */
export async function unlinkKakao(sessionId) {
  return rest(`kakao_links?session_id=eq.${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
}

/* 다른 기기에서 로그인했을 때 — 예전 세션에 붙어 있던 구매를 지금 세션으로 옮긴다.
   ★ 영수증 복원(rebindOrder)과 같은 방식이다. 한 구매는 한 세션에만 붙는다.
     옮기면 이전 기기에서는 떨어진다 — 계정을 돌려 쓰는 것을 막기 위해서다.
   ★ 옮길 게 없으면(처음 연결) 아무 일도 하지 않는다. */
export async function moveOrdersToSession(fromSessionId, toSessionId) {
  if (!fromSessionId || fromSessionId === toSessionId) return 0;
  const rows = await rest(
    `orders?session_id=eq.${encodeURIComponent(fromSessionId)}&status=eq.paid`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ session_id: toSessionId }),
    }
  );
  return rows ? rows.length : 0;
}
