/* =====================================================================
   checkoutEndpoint — 결제 세션 생성 (앱 규격 4항)
   ---------------------------------------------------------------------
   요청 : { "productId":"saju_full", "price":1900 }
   응답 : { "checkoutUrl":"/pay?order=..." }

   ★ 요청에 담겨 오는 price는 읽되 믿지 않는다. 청구 금액은 서버의 상품표에서만 가져온다.
     브라우저 값을 그대로 쓰면 개발자도구에서 1900을 100으로 고쳐 보내는 것을 못 막는다.
     보내온 값이 다르면 조용히 무시하지 않고 거절한다 — 가격이 바뀐 옛 화면일 수도 있어서,
     "지금 화면에 적힌 값과 실제 청구액이 다른 채로" 결제가 진행되면 안 되기 때문이다.

   ★ 결제창 자체는 브라우저에서 토스 SDK로 열어야 한다(카드사 창 때문에 서버가 대신 못 연다).
     그래서 여기서는 주문만 만들고, 그 주문을 여는 우리 페이지 주소(/pay)를 돌려준다.
     앱은 이 주소로 이동하기만 하면 되므로 규격을 한 글자도 바꾸지 않는다.
===================================================================== */
import { json, methodGuard, readBody, fail } from './_lib/http.js';
import { productOf } from './_lib/products.js';
import { ensureSession, newReceiptId } from './_lib/session.js';
import { createOrder } from './_lib/store.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;

  try {
    const body = readBody(req);
    const product = productOf(body.productId);
    if (!product) return fail(res, 400, '알 수 없는 상품입니다.');

    /* 화면이 말한 가격과 서버가 청구할 가격이 다르면 멈춘다. */
    if (body.price != null && Number(body.price) !== product.price) {
      return fail(res, 409, '표시된 가격이 최신이 아닙니다. 화면을 새로고침한 뒤 다시 시도해 주세요.');
    }

    const sessionId = ensureSession(req, res);
    const orderId = newReceiptId();

    await createOrder({
      orderId,
      productId: product.id,
      amount: product.price,   /* ★ 서버 표의 값 */
      sessionId,
    });

    json(res, 200, { checkoutUrl: `/pay?order=${encodeURIComponent(orderId)}` });
  } catch (err) {
    console.error('checkout 실패:', err?.message);
    fail(res, 500, '결제를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
}
