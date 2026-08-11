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
  premium_pass: { id: 'premium_pass', name: '전체 이용권 30일',    price: 4900, kind: 'pass', days: 30 },
};

export function productOf(id) {
  return Object.prototype.hasOwnProperty.call(PRODUCTS, id) ? PRODUCTS[id] : null;
}
