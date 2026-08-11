-- =====================================================================
-- 인연점 결제 원장 — Supabase SQL 편집기에 그대로 붙여넣고 실행하세요.
-- =====================================================================
-- 설계 원칙: 권한을 따로 저장하지 않는다. 결제 기록(orders)이 유일한 사실이고,
-- "지금 무엇이 열려 있는지"는 매번 거기서 계산한다.
-- 권한 표를 따로 두면 언젠가 원장과 어긋난다(환불했는데 권한이 남는 식으로).

create table if not exists orders (
  order_id    text primary key,                    -- 영수증 번호이자 토스 orderId (24바이트 난수)
  product_id  text not null,                       -- saju_full / mbti_full / compat_full / premium_pass
  amount      integer not null,                    -- ★ 서버가 정한 금액. 브라우저가 보낸 값이 아니다.
  status      text not null default 'created',     -- created | paid | failed
  session_id  text not null,                       -- 이 구매가 붙어 있는 쿠키 세션 (복원 시 바뀐다)
  payment_key text,                                -- 토스가 준 결제 키 (승인 후에만 채워짐)
  created_at  timestamptz not null default now(),
  paid_at     timestamptz,
  constraint orders_status_chk check (status in ('created','paid','failed'))
);

create index if not exists orders_session_idx on orders (session_id);
create index if not exists orders_status_idx  on orders (status);

-- 구매 복원 속도 제한용. 영수증 번호가 난수라 사실상 못 맞히지만, 무차별 대입은 별도로 막는다.
create table if not exists restore_attempts (
  id         bigserial primary key,
  session_id text not null,
  tried_at   timestamptz not null default now()
);

create index if not exists restore_session_idx on restore_attempts (session_id, tried_at desc);

-- =====================================================================
-- RLS(행 수준 보안) — 반드시 켜세요.
-- ---------------------------------------------------------------------
-- 서버 함수는 service_role 키로 붙으므로 RLS를 우회합니다. 정책을 하나도 만들지 않으면
-- anon 키(공개 키)로는 아무 행도 못 읽습니다. 그게 우리가 원하는 상태입니다.
-- ★ 켜지 않으면, Supabase 프로젝트 주소와 anon 키만 알면 남의 결제 기록이 전부 읽힙니다.
-- =====================================================================
alter table orders           enable row level security;
alter table restore_attempts enable row level security;

-- 정책을 만들지 않습니다. (service_role만 통과 = 서버 함수만 접근)

-- =====================================================================
-- 운영 중 확인용 조회
-- =====================================================================
-- 오늘 결제된 건:
--   select product_id, count(*), sum(amount) from orders
--   where status='paid' and paid_at >= date_trunc('day', now()) group by product_id;
--
-- 결제창까지 갔는데 안 끝난 건(이탈률):
--   select status, count(*) from orders where created_at >= now() - interval '7 days' group by status;
