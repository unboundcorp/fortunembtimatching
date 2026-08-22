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
import { createOrder, kakaoLinkOfSession } from './_lib/store.js';

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

    /* =====================================================================
       ★ 2026-08-22 대표님 지시 — 유료 결제는 카카오 로그인을 한 분만 할 수 있다.
       ---------------------------------------------------------------------
       왜 막는가: 지금까지 이용권은 브라우저 쿠키에만 매여 있었다. 그래서 브라우저 기록을
       지우거나 기기를 바꾸면 산 것이 안 보였고, 되찾는 길은 영수증 번호를 따로 적어 둔
       사람에게만 있었다. 대부분은 안 적어 둔다 — 그러면 돈을 내고 못 보는 일이 생긴다.
       로그인한 분만 결제하게 하면 회원번호에 주문이 묶여서 그런 일이 안 생긴다.

       ★ 화면에서도 막지만, 진짜 관문은 여기다. 화면 쪽 막음은 개발자도구로 넘길 수 있다.
       ★ 무료 기능에는 이 관문이 없다. 로그인은 결제할 때만 필요하다.
    ===================================================================== */
    let kakaoId = null;
    try {
      kakaoId = await kakaoLinkOfSession(sessionId);
    } catch (err) {
      /* 확인 자체를 못 했으면 열어주지 않는다. 이 앱은 실패를 늘 '잠금' 쪽으로 떨어뜨린다 —
         못 물어봤다고 통과시키면 그게 곧 관문이 없는 것과 같다. */
      console.error('카카오 연결 확인 실패:', err?.message);
      return fail(res, 503, '지금은 결제를 시작할 수 없습니다. 잠시 후 다시 시도해 주세요.');
    }
    if (!kakaoId) {
      return json(res, 401, {
        verified: false,
        error: 'login_required',
        reason: '결제 전에 카카오로 로그인해 주세요. 로그인하시면 결제한 것을 다른 기기에서도 보실 수 있어요.',
      });
    }

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
