/* =====================================================================
   상품·가격 — 서버가 믿는 유일한 출처
   ---------------------------------------------------------------------
   ★ 가격은 반드시 서버에 있어야 한다. 브라우저가 보내온 금액을 그대로 믿으면
     개발자도구에서 1900을 100으로 고쳐 보내는 것을 막을 방법이 없다.
     그래서 결제 생성도, 승인도, 여기 적힌 값으로만 한다.
   ★ 이 표는 fortune.html의 PRODUCTS와 같은 내용이어야 한다.
     한쪽만 고치면 화면에 적힌 가격과 실제 청구액이 달라진다 — 그건 표시광고 문제가 된다.
     (fortune.html: var PRODUCTS = { saju_full: {price:1900}, ... })
===================================================================== */
export const PRODUCTS = {
  saju_full:    { id: 'saju_full',    name: '사주 풀이 전체 해석', price: 1900, kind: 'once' },
  mbti_full:    { id: 'mbti_full',    name: 'MBTI 풀이 전체 해석', price: 1900, kind: 'once' },
  compat_full:  { id: 'compat_full',  name: '궁합 상세 전체',      price: 1900, kind: 'once' },
  premium_pass: { id: 'premium_pass', name: '전체 이용권 7일',     price: 4900, kind: 'pass', days: 7 },
};

/* =====================================================================
   AI 해석을 '새로 만들 수 있는' 횟수
   ---------------------------------------------------------------------
   AI 해석은 한 번 만들 때마다 실제로 돈이 나간다. 그런데 이용권은 브라우저 단위라
   프로필을 여러 개 만들면 한 번 결제로 몇 번이든 만들 수 있었다. 그대로 두면
   단품 1,900원을 받고 원가를 그보다 더 쓰는 일이 생긴다.

   ★ '다시 보기'는 횟수를 쓰지 않는다. 한 번 만든 해석은 서버에 저장해 두고 그대로 내어준다.
     그래서 산 사람이 손해 볼 일은 없다 — 같은 사주를 백 번 열어도 1회다.
   ★ 만들다 실패한 것도 세지 않는다. 실패는 우리 잘못이지 이용자가 쓴 횟수가 아니다.
   ★ 이 숫자는 화면과 약관에도 같이 적어야 한다. 서버에서만 막고 말하지 않으면
     "왜 안 되냐"는 문의가 되고, 미리 알리지 않은 제한은 분쟁거리가 된다.
===================================================================== */
export const AI_QUOTA = { once: 1, pass: 10 };

export function aiQuotaOf(kind) {
  return kind === 'pass' ? AI_QUOTA.pass : AI_QUOTA.once;
}

/* =====================================================================
   연도가 붙는 상품 (2026-09-03 대표님 지시: "연도별로 따로 결제가 맞아")
   ---------------------------------------------------------------------
   사주 풀이와 월별 운세는 "그 해"의 흐름을 읽는 글이라 해마다 내용이 달라진다.
   그래서 상품 이름에 연도를 붙여 판다.

       saju_full:2026   ← 2026년 사주 풀이
       saju_full:2027   ← 2027년 사주 풀이 (따로 결제)

   ★ 왜 이렇게 하나. 예전에는 캐시 열쇠 재료에 "올해 연도와 나이"가 몰래 들어 있었다.
     그래서 1월 1일이 되면 열쇠가 통째로 바뀌어 **그때까지 산 모든 분의 글이 안 열렸다.**
     단품은 만드는 횟수가 1회라 다시 만들지도 못한다.
     연도를 손님이 고르는 값으로 끌어올리면, 산 연도의 글은 몇 년이 지나도 그대로 열린다.
   ★ 덤으로 12월에 "내년 것도 미리 보시겠어요?"를 팔 수 있다.

   ★ 궁합·성격유형에는 연도를 붙이지 않는다. 그 풀이는 해가 바뀌어도 같은 이야기다.
     YEARLY에 없는 상품에 연도를 붙여 보내면 null을 돌려준다 — 없는 상품을 사게 두지 않는다.
===================================================================== */
export const YEARLY = { saju_full: true };
export const YEAR_MIN = 1900, YEAR_MAX = 2100;

/* 'saju_full:2027' → { base:'saju_full', year:2027 }.  연도가 없으면 year는 null. */
export function splitProductId(id) {
  const s = String(id == null ? '' : id);
  const i = s.indexOf(':');
  if (i < 0) return { base: s, year: null };
  const year = Number(s.slice(i + 1));
  return { base: s.slice(0, i), year: Number.isInteger(year) ? year : NaN };
}

/* 연도가 붙는 상품이면 붙여서, 아니면 그대로. 화면과 서버가 같은 규칙을 쓰게 하는 자리다. */
export function productIdFor(base, year) {
  if (!YEARLY[base] || !Number.isInteger(year)) return base;
  return base + ':' + year;
}

export function productOf(id) {
  const { base, year } = splitProductId(id);
  if (!Object.prototype.hasOwnProperty.call(PRODUCTS, base)) return null;
  const p = PRODUCTS[base];
  if (year === null) return p;                 /* 연도 없이 온 것 — 예전 주문도 여기로 온다 */
  if (!YEARLY[base]) return null;              /* 연도를 붙일 수 없는 상품 */
  if (!Number.isInteger(year) || year < YEAR_MIN || year > YEAR_MAX) return null;
  /* ★ id는 연도까지 붙은 값을 그대로 둔다. 권한(items)·캐시 열쇠가 이 값으로 갈린다.
     baseId는 값(가격·종류)을 찾을 때 쓴다. name은 화면과 영수증에 그대로 나간다. */
  return { ...p, id: base + ':' + year, baseId: base, year, name: p.name + ' · ' + year + '년' };
}
