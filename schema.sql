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

-- =====================================================================
-- 궁합 방 (R33) — 두 사람 화면을 실시간으로 잇기 위한 표
-- ---------------------------------------------------------------------
-- ★ 여기 담기는 a_payload / b_payload 는 개인정보다
--   (이름·MBTI·생년월일·태어난 시각·성별·출생지). 그래서 반드시 기한을 둔다.
--   서버 코드는 expires_at 이 지난 방을 "없는 것"으로 취급하고, 방을 새로 만들 때마다
--   지난 방을 실제로 지운다. 화면에 적은 보관 기간과 코드가 같은 말을 해야 한다.
-- ★ 서버는 payload 안을 해석하지 않는다. 앱이 만든 문자열 한 줄을 그대로 보관한다.
-- =====================================================================
create table if not exists rooms (
  room_id    text primary key,                    -- 18바이트 난수 (추측 불가)
  a_payload  text not null,                       -- 방을 만든 사람(초대한 쪽)
  b_payload  text,                                -- 링크를 열고 들어온 사람
  created_at timestamptz not null default now(),
  joined_at  timestamptz,
  expires_at timestamptz not null                 -- 이 시각이 지나면 못 읽는다
);

create index if not exists rooms_expires_idx on rooms (expires_at);

alter table rooms enable row level security;
-- 정책을 만들지 않는다 = service_role(서버 함수)만 접근. 공개 키로는 한 줄도 못 읽는다.

-- 지금 몇 개가 살아 있는지 확인:
--   select count(*) from rooms where expires_at > now();

-- =====================================================================
-- 저장된 모임 (R34) — 이름과 관리용 PIN으로 다시 여는 그룹
-- ---------------------------------------------------------------------
-- ★ pin_hash 는 scrypt 해시다. PIN 원본은 어디에도 저장하지 않는다.
--   저장소가 통째로 새어도 PIN을 알 수 없고, 그래서 잊으면 복구할 수 없다.
-- ★ members 도 개인정보다(최대 30명분). 보관 기간을 두고 expires_at 으로 강제한다.
-- =====================================================================
create table if not exists groups (
  group_id   text primary key,
  name       text not null,
  pin_hash   text not null,
  pin_salt   text not null,
  members    text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists groups_expires_idx on groups (expires_at);

alter table groups enable row level security;
-- 정책 없음 = service_role(서버 함수)만 접근

-- R39 — 소유자 토큰. PIN 없이 만든 그룹을 "만든 기기"에서 관리할 수 있게 한다.
-- pin_hash 는 이제 선택이므로 not null 제약을 푼다.
alter table groups add column if not exists owner_hash text;
alter table groups add column if not exists owner_salt text;
alter table groups alter column pin_hash drop not null;
alter table groups alter column pin_salt drop not null;
