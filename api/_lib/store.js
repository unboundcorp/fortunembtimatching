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

/* =====================================================================
   최근 주문 — 승인된 것만이 아니라 '만들다 만 것'까지 함께 본다
   ---------------------------------------------------------------------
   왜 필요한가 (2026-08-22, 고객지원 화면):
     "결제했는데 결과가 안 보여요"라고 하시는 분의 절반은 실제로는 승인이 안 끝난 것이다
     (결제창을 닫았거나, 카드사 인증에서 멈췄거나). paidOrdersOf는 승인된 것만 보므로
     그런 주문은 아예 안 보이고, 손님 화면에는 "결제 내역 0건"만 뜬다. 그러면 손님은
     자기가 낸 돈이 사라졌다고 생각하고 한 번 더 결제한다 — 이게 중복 결제의 경로다.
   ★ 그래서 status를 가리지 않고 최근 것을 그대로 보여준다. 금액과 상태를 함께 보여주면
     "승인 전에서 멈췄다 = 돈이 나가지 않았다"를 손님이 스스로 확인할 수 있다.
===================================================================== */
export async function recentOrdersOf(sessionId, limit = 10) {
  const n = Math.max(1, Math.min(50, Number(limit) || 10));
  return (await rest(
    `orders?session_id=eq.${encodeURIComponent(sessionId)}&select=order_id,product_id,amount,status,created_at,paid_at&order=created_at.desc&limit=${n}`
  )) || [];
}

/* 구매 복원 — 영수증을 지금 이 세션으로 다시 연결한다(규격 3항 ②).
   ★ 이 재연결이 없으면 verified만 true로 돌려줘도 곧이어 나가는 권한 조회가 여전히 빈 값이라,
     "확인은 됐는데 안 열림"이라는 최악의 상태가 남는다. */
export async function rebindOrder(orderId, sessionId) {
  /* ★ 옮기기 전에 이 주문이 원래 어느 세션에 붙어 있었는지 알아 둔다.
     옮기고 나면 알 수 없게 되고, '만든 기록'을 어디서 가져와야 할지 모르게 된다. */
  const before = await getOrder(orderId);
  const rows = await rest(
    `orders?order_id=eq.${encodeURIComponent(orderId)}&status=eq.paid`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ session_id: sessionId }),
    }
  );
  /* ★ 2026-09-04 — 이 영수증의 상품으로 만든 기록도 함께 옮긴다.
     안 옮기면 ㉠ 이용권으로 만든 글이 잠기고 ㉡ 만든 횟수가 0으로 돌아간다
     (moveAiUsageToSession 주석 참고). 실패해도 복원 자체는 되게 둔다 —
     되찾는 길이 막히는 것이 더 나쁘다. */
  if (before && before.session_id && before.session_id !== sessionId) {
    try {
      await moveAiUsageToSession(before.session_id, sessionId, before.product_id);
    } catch (e) {
      console.warn('만든 기록 옮기기 실패', (e && e.message) || e);
    }
  }
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
     그래야 만들다 끊겨서 다시 눌러도 한 번으로 친다.

   ★ 2026-08-27 — productId를 받는다. 안 받으면 세션 전체를 세는데, 그게 실제 사고였다.
     단품 하나의 횟수는 1회다. 그런데 상품을 가리지 않고 세는 바람에
       ① 사주 풀이를 사서 한 번 본다  → 1회 씀
       ② 궁합 상세를 또 산다          → 이미 1 ≥ 1 이라 곧바로 429
       ③ 돈은 나갔는데 아무것도 안 열린다
     두 개째 사는 손님은 무조건 이 사고를 당하고 있었다.
     (대표님이 결제하신 뒤 '본문을 불러오지 못했어요'가 뜬 것도 같은 이유다 — 실측으로 잡았다.)

   ★ 표를 바꾸지 않고 고친다. ai_usage에는 상품 칸이 없지만 ai_cache에는 있다.
     같은 cache_key로 이어 붙여 그 상품의 것만 센다. 마이그레이션이 필요 없으므로
     되돌릴 일도 없다.
   ★ productId를 안 주면 예전처럼 전부 센다 — 옛 호출부가 조용히 틀리지 않게 남겨 둔다. */
export async function aiUsedCount(sessionId, productId) {
  /* ★ 2026-08-27 (대표님 지시: "해가 바뀌면 다 리셋을 해야 되지 않나?
     다만 우리 결제 이후에 열람 가능한 기한은 그대로 유지 해야겠지?")
     ---------------------------------------------------------------------
     풀이에는 올해의 두 글자(세운)와 지금 나이가 들어간다. 그래서 해가 바뀌면
     같은 사람이라도 글이 달라져야 하고, 실제로 캐시 열쇠도 달라진다.

     그런데 횟수를 처음부터 통틀어 세면, 1월 1일에 단품(1회) 손님은 이미 1을 다 쓴
     상태라 새 글을 못 만든다. 열람 기한은 영구라고 팔아 놓고 정작 그 해의 풀이를
     못 여는 것이다 — 파는 말과 도는 코드가 어긋난다.

     그래서 '올해 만든 것'만 센다. 해가 바뀌면 셈이 0부터 다시 시작하므로
     단품 손님은 새해에 그 해의 풀이를 한 번 받을 수 있고, 열람 기한(단품 영구·
     이용권 7일)은 지금과 똑같이 유지된다.
     ★ 이용권(10회)도 같은 규칙이다. 어차피 7일이라 해를 넘길 일이 거의 없다.

     ★ 경계는 한국 시각으로 잡는다. 열쇠에 들어가는 연도는 브라우저가 만드는
       (new Date()).getFullYear() — 즉 손님 폰의 시각이고, 손님은 한국에 있다.
       서버(Vercel)는 UTC로 돌기 때문에, 서버 기준으로 세면 1월 1일 0시부터 9시까지
       아홉 시간 동안 "열쇠는 새해인데 횟수는 작년 것"인 구간이 생긴다.
       그 아홉 시간에 결제한 손님만 막히는, 찾기 어려운 사고가 된다. */
  const KST = 9 * 60 * 60 * 1000;
  const kstNow = new Date(Date.now() + KST);
  /* 한국 기준 올해 1월 1일 0시를, 다시 UTC 시각으로 되돌린 값 */
  const yearStart = new Date(Date.UTC(kstNow.getUTCFullYear(), 0, 1) - KST).toISOString();
  const rows = await rest(
    `ai_usage?session_id=eq.${encodeURIComponent(sessionId)}` +
      `&created_at=gte.${encodeURIComponent(yearStart)}&select=cache_key`
  );
  if (!Array.isArray(rows)) return 0;
  if (!productId) return rows.length;
  /* 열쇠는 base64url(A-Z a-z 0-9 _ -)뿐이다. 그 밖의 글자가 섞인 것은 버린다 —
     우리가 만드는 조회 주소에 이상한 값이 끼어들 여지를 아예 없앤다. */
  const keys = rows
    .map((r) => (r && r.cache_key ? String(r.cache_key) : ''))
    .filter((k) => /^[A-Za-z0-9_-]+$/.test(k));
  if (!keys.length) return 0;

  /* 이 열쇠들 중 '그 상품'으로 만들어진 것만 골라 센다. */
  const inList = keys.join(',');
  const mine = await rest(
    `ai_cache?product_id=eq.${encodeURIComponent(productId)}&cache_key=in.(${inList})&select=cache_key`
  );
  if (!Array.isArray(mine)) return rows.length;   /* 못 물어봤으면 넉넉하게 막는 쪽(옛 방식) */
  return mine.length;
}

/* =====================================================================
   이 세션이 지금까지 '만들어 본' 상품들 (R76)
   ---------------------------------------------------------------------
   ★ 왜 필요한가: 이용권(7일)이 끝나면 그 기간에 만든 해석까지 다시 못 보는 상태였다.
     대표님은 "재열람은 무제한"이라고 알고 계셨는데 코드가 그렇지 않았다(외부 실사에서도
     '상위 상품이 하위 상품보다 불리하다'고 지적된 부분이다).

     한 번 만든 글은 계속 볼 수 있어야 한다. 그래서 만든 적이 있는 상품은
     기간이 끝난 뒤에도 열어 둔다.

   ★ 새로 만드는 것은 여전히 막힌다. 이용권이 끝나면 viaPass 가 아니게 되어
     횟수 상한이 단품 기준(1회)으로 내려가고, 이미 그만큼 썼으므로 새 생성은 거절된다.
     즉 '만료 뒤에는 새로 못 만들고, 이미 만든 건 계속 본다'가 된다.

   ai_usage(무엇을 썼나) → ai_cache(그게 어느 상품인가) 두 걸음으로 찾는다.
===================================================================== */
export async function aiUsedProductIds(sessionId) {
  const used = await rest(
    `ai_usage?session_id=eq.${encodeURIComponent(sessionId)}&select=cache_key`
  );
  const keys = (used || []).map((r) => r.cache_key).filter(Boolean);
  if (!keys.length) return [];
  /* PostgREST 의 in.(...) 목록. 열쇠는 base64url 이라 따옴표가 필요 없지만,
     값에 콤마가 섞이면 목록이 깨지므로 혹시 몰라 걸러 둔다. */
  const safe = keys.filter((k) => !/[,()"']/.test(k)).slice(0, 200);
  if (!safe.length) return [];
  const rows = await rest(
    `ai_cache?cache_key=in.(${safe.map(encodeURIComponent).join(',')})&select=product_id`
  );
  return [...new Set((rows || []).map((r) => r.product_id).filter(Boolean))];
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

/* 코드 맞히기를 막는다. 코드가 짧아도 무한정 찍어보지는 못하게 한다.
   ★ R86 (2026-08-18) — 세션만 세던 것을 접속 지점(IP)까지 함께 세도록 고쳤다.
     예전에는 session_id 하나로만 셌다. 그런데 세션은 쿠키일 뿐이라, 쿠키를 버리고
     다시 받으면 카운터가 0부터 시작한다. 실제로 확인했다 — 열 번 막힌 뒤에도
     쿠키 없이 요청하니 곧바로 다시 받아줬다. 즉 "무한정 찍어보지는 못하게 한다"는
     이 주석의 약속이 지켜지지 않고 있었다. 덤으로 시도할 때마다 표에 줄이 하나씩
     쌓이므로, 막히지 않는 시도는 데이터베이스를 부풀리는 통로이기도 했다.

     ★ 표를 바꾸지 않고 고친다. 같은 unlock_attempts 표의 session_id 칸에
       'ip:<해시>' 라는 다른 모양의 값을 한 줄 더 넣는 방식이다. 칸을 새로 만들면
       Supabase에 마이그레이션을 돌려야 하는데, 그건 대표님 손이 필요한 일이라
       고치는 시점이 미뤄진다. 지금 막는 쪽이 낫다.
     ★ IP 원본은 저장하지 않는다 — 해시만 넣는다(개인정보처리방침과 어긋나지 않게).
     ★ IP 한도는 세션 한도보다 넉넉하게 잡는다. 회사·카페처럼 여러 사람이 같은
       IP를 쓰는 곳에서 애먼 사람이 막히면 안 된다. */
const UNLOCK_MAX_SESSION = 10;
const UNLOCK_MAX_IP = 30;

export async function tooManyUnlockTries(sessionId, ipKey) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const q = async (key) => {
    const rows = await rest(
      `unlock_attempts?session_id=eq.${encodeURIComponent(key)}&tried_at=gte.${encodeURIComponent(since)}&select=id`
    );
    return Array.isArray(rows) ? rows.length : 0;
  };
  if ((await q(sessionId)) >= UNLOCK_MAX_SESSION) return true;
  if (ipKey && (await q(ipKey)) >= UNLOCK_MAX_IP) return true;
  return false;
}

export async function noteUnlockTry(sessionId, ipKey) {
  const rows = [{ session_id: sessionId }];
  if (ipKey) rows.push({ session_id: ipKey });
  await rest('unlock_attempts', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(rows),
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

/* =====================================================================
   기기 사이 이어보기 (R104, 2026-08-22 대표님 지시)
   ---------------------------------------------------------------------
   "폰에서 만든 걸 노트북에서도 보고 싶다"를 위한 서랍. 카카오 회원번호로 찾는다.
   ★ 로그인한 사람만 쓴다. 로그인하지 않으면 이 표에는 아무것도 안 들어간다 —
     "회원가입 없이 쓴다"는 이 서비스의 약속이 그대로 지켜져야 한다.
   ★ 담는 것은 이용자가 앱에 넣은 것(프로필·기록)이다. 이용권은 여기 담지 않는다 —
     그건 orders가 근거이고, 브라우저가 보낸 값을 권한의 근거로 삼으면 페이월이 뚫린다.

   create table if not exists user_sync (
     kakao_id   text primary key,
     data       jsonb not null,
     rev        bigint not null default 1,
     updated_at timestamptz not null default now(),
     created_at timestamptz not null default now()
   );
===================================================================== */
export async function getUserSync(kakaoId) {
  const rows = await rest(
    `user_sync?kakao_id=eq.${encodeURIComponent(kakaoId)}&select=data,rev,updated_at&limit=1`
  );
  return rows && rows[0] ? rows[0] : null;
}

export async function putUserSync(kakaoId, data) {
  /* 있으면 갈아 끼우고 없으면 새로 넣는다. rev는 서버가 센다 —
     브라우저가 보낸 번호를 믿으면 오래된 기기가 새 것을 덮어쓸 수 있다. */
  const now = new Date().toISOString();
  const cur = await getUserSync(kakaoId);
  const rev = (cur && Number(cur.rev) ? Number(cur.rev) : 0) + 1;
  await rest(`user_sync?on_conflict=kakao_id`, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ kakao_id: kakaoId, data, rev, updated_at: now }),
  });
  return { rev, updatedAt: now };
}

export async function deleteUserSync(kakaoId) {
  return rest(`user_sync?kakao_id=eq.${encodeURIComponent(kakaoId)}`, { method: 'DELETE' });
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
  /* ★ 2026-09-04 — 결제 기록만 옮기고 '만든 기록'을 두고 가던 것을 고쳤다.
     자세한 이유는 아래 moveAiUsageToSession 주석에 있다. */
  await moveAiUsageToSession(fromSessionId, toSessionId, null);
  return rows ? rows.length : 0;
}

/* =====================================================================
   '만든 기록'도 함께 옮긴다 (2026-09-04)
   ---------------------------------------------------------------------
   기기를 바꾸거나 영수증으로 되찾을 때, 예전에는 orders 표만 옮기고
   ai_usage 표는 옛 세션에 두고 갔다. 그래서 두 가지가 한꺼번에 망가졌다.

   ① 산 글을 못 보게 된다 —
      이용권으로 만든 글은 기간이 끝나면 '만든 적 있다'는 기록만이 유일한 열쇠다
      (api/entitlements.js의 R76). 그게 안 따라오니, 이용권이 끝난 뒤 폰을 바꾸면
      돈 내고 만든 글이 통째로 잠긴다. 단품으로 산 분은 주문 자체가 권한이라 무사했고,
      **이용권으로 산 분만 정확히 이 구멍에 빠졌다.**

   ② 만들 수 있는 횟수가 0으로 돌아간다 — 이쪽이 더 크다.
      브라우저 기록을 지우고 다시 로그인하면 결제는 따라오는데 쓴 횟수는 안 따라온다.
      한 번 결제로 몇 번이든 새로 만들 수 있고, 반복하면 제한이 없다.
      AI 한 편이 실제로 약 160원이므로 **팔수록 손해가 나는 구멍**이다.
      지금은 테스트 결제뿐이라 피해가 없지만, live 키를 넣는 순간 열린다.

   ★ ai_usage 에는 (session_id, cache_key) 유일 index 가 걸려 있다. 옮기려는 열쇠를
     받는 쪽이 이미 갖고 있으면 PATCH 가 통째로 실패한다. 그래서 겹치는 것은 빼고 옮긴다.
     겹치는 줄은 옛 세션에 그냥 둔다 — 받는 쪽에 이미 같은 값이 있으므로 잃는 것이 없다.
   ★ productId 를 주면 그 상품으로 만든 것만 옮긴다(영수증 한 장 복원). null 이면 전부.
===================================================================== */
export async function moveAiUsageToSession(fromSessionId, toSessionId, productId) {
  if (!fromSessionId || !toSessionId || fromSessionId === toSessionId) return 0;

  const fromRows = await rest(
    `ai_usage?session_id=eq.${encodeURIComponent(fromSessionId)}&select=cache_key`
  );
  /* 열쇠는 base64url 뿐이다. 그 밖의 글자가 섞인 것은 조회 주소를 깨뜨릴 수 있으니 버린다. */
  let keys = (fromRows || [])
    .map((r) => (r && r.cache_key ? String(r.cache_key) : ''))
    .filter((k) => /^[A-Za-z0-9_-]+$/.test(k));
  if (!keys.length) return 0;

  /* 영수증 한 장을 되찾는 경우 — 그 상품으로 만든 것만 골라 옮긴다. */
  if (productId) {
    const mine = await rest(
      `ai_cache?product_id=eq.${encodeURIComponent(productId)}` +
        `&cache_key=in.(${keys.slice(0, 200).join(',')})&select=cache_key`
    );
    if (!Array.isArray(mine)) return 0;   /* 못 물어봤으면 아무것도 옮기지 않는다 */
    const ok = new Set(mine.map((r) => r.cache_key));
    keys = keys.filter((k) => ok.has(k));
    if (!keys.length) return 0;
  }

  /* 받는 쪽이 이미 가진 열쇠는 뺀다. 안 그러면 유일 index 에 걸려 통째로 실패한다. */
  const already = await rest(
    `ai_usage?session_id=eq.${encodeURIComponent(toSessionId)}` +
      `&cache_key=in.(${keys.slice(0, 200).join(',')})&select=cache_key`
  );
  if (Array.isArray(already) && already.length) {
    const have = new Set(already.map((r) => r.cache_key));
    keys = keys.filter((k) => !have.has(k));
  }
  if (!keys.length) return 0;

  const moved = await rest(
    `ai_usage?session_id=eq.${encodeURIComponent(fromSessionId)}` +
      `&cache_key=in.(${keys.slice(0, 200).join(',')})`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ session_id: toSessionId }),
    }
  );
  return Array.isArray(moved) ? moved.length : 0;
}
