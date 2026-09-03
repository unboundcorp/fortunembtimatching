/* =====================================================================
   권한 계산 — 결제 원장에서 "지금 무엇이 열려 있는지"를 만든다
   ---------------------------------------------------------------------
   권한을 따로 저장하지 않고 결제 기록에서 매번 계산한다. 원장이 유일한 사실이고,
   따로 둔 권한 표는 언젠가 원장과 어긋난다(환불했는데 권한이 남는 식으로).

   응답 형식은 fortune.html의 normalizeEntitlements()가 읽는 그대로다:
     { items: { saju_full: {purchasedAt} },
       pass:  { productId, purchasedAt, expiresAt } | null,
       purchases: [ {productId, at, price, receiptId} ] }
   ★ 앱은 PRODUCTS에 없는 키를 버리고, pass는 expiresAt이 있어야만 인정한다.
===================================================================== */
import { productOf, splitProductId } from './products.js';

export function buildEntitlements(paidOrders) {
  const out = { items: {}, pass: null, purchases: [] };

  for (const row of paidOrders) {
    const p = productOf(row.product_id);
    if (!p) continue; /* 상품표에서 사라진 옛 주문은 권한을 주지 않는다 */
    const at = row.paid_at ? new Date(row.paid_at).getTime() : Date.now();

    out.purchases.push({
      productId: p.id,
      at,
      price: row.amount,
      receiptId: row.order_id,
    });

    if (p.kind === 'pass') {
      /* ★ 2026-09-04 — 연도가 붙은 이용권('premium_pass:2026')은 그 해 마지막 날까지다.
         산 날로부터 365일이 아니다. 1월에 사든 5월에 사든 같은 해 것이다(대표님 지시).
         ★ 경계는 한국 시각이다. 서버(Vercel)는 UTC로 도는데 손님은 한국에 있다.
           UTC로 끊으면 12월 31일 밤 9시부터 자정까지 아홉 시간이 먼저 잠긴다.
           store.js의 aiUsedCount가 한국 시각으로 해를 세는 것과 같은 이유·같은 방식이다.
         ★ 연도가 없는 옛 주문은 예전처럼 days로 센다. 상품표에서 지우지 않고 비켜 간다. */
      const expiresAt = (p.year != null)
        ? Date.UTC(p.year + 1, 0, 1) - 9 * 60 * 60 * 1000
        : at + p.days * 24 * 60 * 60 * 1000;
      /* 이용권을 여러 번 샀으면 가장 늦게 끝나는 것을 남긴다 — 짧은 쪽으로 덮어쓰면 산 만큼 못 쓴다. */
      if (!out.pass || expiresAt > out.pass.expiresAt) {
        out.pass = { productId: p.id, purchasedAt: at, expiresAt };
      }
    } else {
      /* 같은 상품을 두 번 샀으면 처음 산 시각을 남긴다(구매 시점 표시용). */
      if (!out.items[p.id] || at < out.items[p.id].purchasedAt) {
        out.items[p.id] = { purchasedAt: at };
      }
    }
  }

  /* 기간이 끝난 이용권은 내려주지 않는다. 앱도 다시 검사하지만, 서버가 먼저 판단한다. */
  if (out.pass && out.pass.expiresAt <= Date.now()) out.pass = null;

  return out;
}

/* 그 사람이 이 상품을 지금 볼 수 있는가 — 유료 본문(contentEndpoint)을 내려줄지 판단할 때 쓴다.
   ★ 2026-09-04 — 연도 이용권은 '그 해 것'만 연다.
     예전에는 이용권이 살아 있으면 무엇이든 열었다. 그러면 12월에 2026년 이용권을 산 분이
     2027년 사주까지 받아 간다 — "연도마다 따로 결제"라고 팔아 놓고 한 해를 덤으로 주는 셈이다.
   ★ 연도가 없는 쪽은 막지 않는다.
     · 옛 이용권(연도 없음)은 예전처럼 전부 연다 — 뒤늦게 조건을 붙여 이미 산 것을 좁히지 않는다.
     · 궁합·성격유형은 애초에 연도가 없는 상품이라 어느 해 이용권으로든 열린다.
   ★ 화면(fortune.html)의 hasAccess와 한 쌍이다. 한쪽만 고치면 화면은 열어 주는데
     서버가 본문을 안 주는(또는 그 반대) 어긋남이 생긴다. */
export function hasAccess(ent, productId) {
  if (ent.pass && ent.pass.expiresAt > Date.now()) {
    const passYear = splitProductId(ent.pass.productId).year;
    const wantYear = splitProductId(productId).year;
    if (passYear == null || wantYear == null || passYear === wantYear) return true;
  }
  return !!ent.items[productId];
}
