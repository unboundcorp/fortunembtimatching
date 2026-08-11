/* =====================================================================
   토스 failUrl이 돌아오는 자리
   ---------------------------------------------------------------------
   ★ 실패 경로에서는 승인 API를 절대 부르지 않는다(토스 문서 지침). 주문만 실패로 닫고 돌려보낸다.
   ★ 토스가 주는 message를 그대로 화면에 던지지 않는다. 손님에게 필요한 것은
     "왜 안 됐고 이제 뭘 하면 되는지"이지 가맹점 사정이 아니다. 아는 코드만 우리 말로 바꾼다.
===================================================================== */
import { markFailed } from './_lib/store.js';

const KNOWN = {
  PAY_PROCESS_CANCELED: '결제를 취소하셨어요. 다시 시도하실 수 있어요.',
  PAY_PROCESS_ABORTED: '결제가 중단됐어요. 다시 시도해 주세요.',
  REJECT_CARD_COMPANY: '카드사에서 승인을 거절했어요. 다른 카드로 시도해 보세요.',
  INVALID_CARD_EXPIRATION: '카드 유효기간이 올바르지 않아요.',
  EXCEED_MAX_DAILY_PAYMENT_COUNT: '하루 결제 가능 횟수를 넘었어요. 내일 다시 시도해 주세요.',
  NOT_SUPPORTED_INSTALLMENT_PLAN_CARD_OR_MERCHANT: '이 카드로는 할부가 되지 않아요. 일시불로 시도해 주세요.',
};

export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host}`);
  const code = url.searchParams.get('code') || '';
  const orderId = url.searchParams.get('orderId');

  if (orderId) {
    try { await markFailed(orderId); }
    catch (err) { console.error('실패 처리 중 오류:', err?.message); }
  }

  const reason = KNOWN[code] || '결제가 완료되지 않았어요. 다시 시도해 주세요.';
  res.statusCode = 302;
  res.setHeader('Location', `/fortune.html?pay=fail&reason=${encodeURIComponent(reason)}`);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end();
}
