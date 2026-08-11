/* =====================================================================
   verifyEndpoint — 영수증 검증 + 구매 복원 (앱 규격 3항)
   ---------------------------------------------------------------------
   요청 : { receiptId, productId|null, intent:"return"|"restore" }
   응답 : { verified, reason, restored, productIds }

   intent="return"  — 결제창에서 돌아온 직후 자동 1회.
   intent="restore" — 이용자가 영수증 번호를 직접 입력한 경우. 이때 ★재연결(rebind)을 해야 한다.
                      이게 없으면 verified:true를 줘도 곧이어 나가는 권한 조회가 빈 값이라
                      "확인은 됐는데 안 열림"이 된다.

   ★ 실패 사유에 존재 여부를 흘리지 않는다.
     "그 번호는 있지만 다른 사람 것"이라고 말하면 번호를 찍어보며 남의 구매를 찾을 수 있다.
     없는 번호든 남의 번호든 같은 문장으로 답한다.
===================================================================== */
import { json, methodGuard, readBody } from './_lib/http.js';
import { ensureSession } from './_lib/session.js';
import { getOrder, rebindOrder, paidOrdersOf, tooManyRestoreTries, noteRestoreTry } from './_lib/store.js';

const NOT_FOUND = '확인되지 않는 영수증 번호예요. 번호를 다시 확인해 주세요.';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;

  try {
    const { receiptId, intent } = readBody(req);
    if (!receiptId || typeof receiptId !== 'string') {
      return json(res, 200, { verified: false, reason: NOT_FOUND });
    }

    const sessionId = ensureSession(req, res);

    if (intent === 'restore') {
      if (await tooManyRestoreTries(sessionId)) {
        return json(res, 429, { verified: false, reason: '복원 시도가 너무 잦아요. 10분 뒤에 다시 시도해 주세요.' });
      }
      await noteRestoreTry(sessionId);
    }

    const order = await getOrder(receiptId.trim());

    /* 없는 번호 · 아직 결제되지 않은 주문 — 같은 문장으로 답한다. */
    if (!order || order.status !== 'paid') {
      return json(res, 200, { verified: false, reason: NOT_FOUND });
    }

    if (intent === 'restore') {
      /* ★ 이 구매를 지금 이 세션으로 옮긴다. 한 영수증은 한 세션에만 붙는다 —
         옮기면 이전 세션에서는 자동으로 떨어진다(동시 사용 방지). */
      await rebindOrder(order.order_id, sessionId);
    }

    const productIds = (await paidOrdersOf(sessionId)).map((o) => o.product_id);

    json(res, 200, {
      verified: true,
      restored: intent === 'restore',
      productIds: [...new Set(productIds)],
    });
  } catch (err) {
    console.error('verify 실패:', err?.message);
    json(res, 500, { verified: false, reason: '지금은 확인할 수 없어요. 잠시 후 다시 시도해 주세요.' });
  }
}
