/* =====================================================================
   토스 successUrl이 돌아오는 자리 — 결제 승인
   ---------------------------------------------------------------------
   흐름:
     /pay 에서 토스 결제창 → 사용자가 결제 → 토스가 여기로 보냄
     GET /api/confirm?paymentKey=...&orderId=...&amount=...
   여기서 하는 일:
     ① 주문을 우리 원장에서 찾는다 (없으면 거절 — 우리가 만들지 않은 주문은 승인하지 않는다)
     ② ★ 금액을 우리 원장 값과 대조한다 (토스가 준 amount를 믿지 않는다)
     ③ 토스에 승인 요청 (시크릿 키는 서버에만)
     ④ 성공하면 원장에 기록하고, 앱으로 ?receipt=... 를 달아 돌려보낸다

   ★ 이 함수는 브라우저 주소창 이동(GET)으로 들어온다. JSON이 아니라 리다이렉트로 답한다.
   ★ 결제한 사람의 세션에 이 주문을 붙여 둔다. 결제 시작 때와 다른 세션으로 돌아올 수 있어서
     (쿠키가 없던 새 브라우저 등) 여기서 현재 세션으로 다시 묶어 준다.
===================================================================== */
import { ensureSession } from './_lib/session.js';
import { getOrder, markPaid, markFailed, rebindOrder } from './_lib/store.js';
import { confirmPayment } from './_lib/toss.js';

function backTo(res, params) {
  const q = new URLSearchParams(params).toString();
  res.statusCode = 302;
  res.setHeader('Location', `/fortune.html?${q}`);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end();
}

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const paymentKey = url.searchParams.get('paymentKey');
  const orderId = url.searchParams.get('orderId');
  const amountRaw = url.searchParams.get('amount');

  if (!paymentKey || !orderId) {
    return backTo(res, { pay: 'fail', reason: '결제 정보가 올바르지 않습니다.' });
  }

  try {
    const order = await getOrder(orderId);
    if (!order) {
      return backTo(res, { pay: 'fail', reason: '주문을 찾을 수 없습니다.' });
    }

    /* 이미 승인된 주문으로 다시 들어온 경우(새로고침 등) — 실패로 만들지 않고 그대로 성공 처리한다. */
    if (order.status === 'paid') {
      const sessionId = ensureSession(req, res);
      await rebindOrder(orderId, sessionId);
      return backTo(res, { receipt: orderId, product: order.product_id });
    }

    /* ★ 금액 대조. 토스가 준 값이 아니라 우리가 적어 둔 값으로 승인한다. */
    if (amountRaw != null && Number(amountRaw) !== order.amount) {
      await markFailed(orderId);
      console.error('금액 불일치:', { orderId, expected: order.amount, got: amountRaw });
      return backTo(res, { pay: 'fail', reason: '결제 금액이 주문과 일치하지 않아 취소했습니다.' });
    }

    const result = await confirmPayment({ paymentKey, orderId, amount: order.amount });

    if (!result.ok) {
      await markFailed(orderId);
      console.error('토스 승인 실패:', result.code);
      return backTo(res, { pay: 'fail', reason: result.message || '결제 승인에 실패했습니다.' });
    }

    const paid = await markPaid(orderId, paymentKey);
    /* markPaid가 null이면 그사이 다른 요청이 먼저 처리한 것이다 — 그래도 결제는 된 것이므로 성공으로 본다. */
    const sessionId = ensureSession(req, res);
    await rebindOrder(orderId, sessionId);

    backTo(res, { receipt: orderId, product: (paid || order).product_id });
  } catch (err) {
    console.error('confirm 실패:', err?.message);
    backTo(res, { pay: 'fail', reason: '결제 처리 중 문제가 생겼습니다. 결제되었다면 영수증 번호로 복원할 수 있습니다.' });
  }
}
