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
import { productOf } from './products.js';

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
      const expiresAt = at + p.days * 24 * 60 * 60 * 1000;
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

/* 그 사람이 이 상품을 지금 볼 수 있는가 — 유료 본문(contentEndpoint)을 내려줄지 판단할 때 쓴다. */
export function hasAccess(ent, productId) {
  if (ent.pass && ent.pass.expiresAt > Date.now()) return true;
  return !!ent.items[productId];
}
