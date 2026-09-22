/* =====================================================================
   토스페이먼츠 결제 승인
   ---------------------------------------------------------------------
   ★ 이 파일이 이 프로젝트에서 시크릿 키를 만지는 유일한 자리다.
     시크릿 키는 Vercel 환경변수(TOSS_SECRET_KEY)에만 있고, 코드·로그·응답 어디에도 남기지 않는다.
     브라우저에 들어가는 것은 클라이언트 키(TOSS_CLIENT_KEY)뿐이고, 그건 원래 공개용이다.

   ★ 승인(confirm)을 서버에서 하는 이유가 결제 연동의 핵심이다.
     브라우저가 "결제 성공했어요"라고 말하는 것은 아무 근거가 없다. 토스에게 직접 물어서
     "이 결제가 정말 이 금액으로 승인됐다"는 답을 받아야만 권한을 준다.

   인증 방식: Authorization: Basic base64(secretKey + ':')  — 비밀번호 없이 콜론만 붙인다.
===================================================================== */
const CONFIRM_URL = 'https://api.tosspayments.com/v1/payments/confirm';

function authHeader() {
  const key = process.env.TOSS_SECRET_KEY;
  if (!key) throw new Error('TOSS_SECRET_KEY 환경변수가 없습니다.');
  return 'Basic ' + Buffer.from(key + ':').toString('base64');
}

/* 결제 승인.
   idempotencyKey를 함께 보낸다 — 같은 주문으로 두 번 들어와도 토스가 중복 승인하지 않는다.
   (사용자가 성공 화면에서 새로고침하거나, 네트워크가 끊겨 재시도되는 경우가 실제로 생긴다.) */
export async function confirmPayment({ paymentKey, orderId, amount }) {
  const res = await fetch(CONFIRM_URL, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      'Idempotency-Key': orderId,
    },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    /* 토스가 주는 code/message를 그대로 올린다. 화면에 보여줄 문장은 호출부가 고른다 —
       토스의 원문에는 가맹점 사정이 섞여 있어 그대로 손님에게 보이면 안 되는 경우가 있다. */
    return { ok: false, code: data.code || `HTTP_${res.status}`, message: data.message || '결제 승인에 실패했습니다.' };
  }

  /* ★ status가 DONE이어야만 실제로 돈이 승인된 것이다.
     가상계좌(WAITING_FOR_DEPOSIT)처럼 200이면서 아직 입금 전인 상태가 있다.
     여기서 걸러내지 않으면 "입금하지 않았는데 열리는" 구멍이 된다. */
  if (data.status !== 'DONE') {
    return { ok: false, code: 'NOT_DONE', message: '아직 결제가 완료되지 않았습니다.', status: data.status };
  }

  return { ok: true, payment: data };
}

/* =====================================================================
   ★ 2026-09-22 — 주문번호로 토스 결제 조회 (운영자 [주문 확인] 전용 · 읽기만)
   ---------------------------------------------------------------------
   왜: 첫 실결제가 INVALID_UNREGISTERED_SUBMALL 로 거절됐는데, 우리 서버 기록에는 오류 코드만
   남고 **결제수단·카드사·실패 사유가 없었다.** 토스 상점관리자를 열어야만 보였다.
   GET /v1/payments/orders/{orderId} 는 그 건의 Payment 객체(결제수단·카드사 코드·승인/실패)를 준다.

   ★ 승인·환불 경로가 아니다. 읽기만 한다. 호출부는 api/stats.js 의 action:'order'(운영자 관문 뒤) 하나다.
   ★ 시크릿 키는 여기서만 헤더로 쓰고 **돌려주는 값에는 절대 싣지 않는다.**
   ★ 카드사 이름표는 토스 문서 '기관 코드'(응답은 두 자리 코드)에서 옮겨 적었다. 모르는 코드는 코드 그대로 보여 준다 — 지어내지 않는다.
===================================================================== */
const ORDER_URL = 'https://api.tosspayments.com/v1/payments/orders/';

export const CARD_COMPANY = {
  '3K': '기업BC', '46': '광주은행', '71': '롯데카드', '30': '산업은행', '31': 'BC카드', '51': '삼성카드',
  '38': '새마을금고', '41': '신한카드', '62': '신협', '36': '씨티카드', '33': '우리BC카드', 'W1': '우리카드',
  '37': '우체국', '39': '저축은행', '35': '전북은행', '42': '제주은행', '15': '카카오뱅크', '3A': '케이뱅크',
  '24': '토스뱅크', '21': '하나카드', '61': '현대카드', '11': 'KB국민카드', '91': 'NH농협카드', '34': '수협',
  '6D': '다이너스', '4M': '마스터카드', '3C': '유니온페이', '7A': '아멕스', '4J': 'JCB', '4V': 'VISA',
};

export function cardCompanyName(code) {
  if (!code) return '';
  const c = String(code);
  return CARD_COMPANY[c] ? `${CARD_COMPANY[c]}(${c})` : c;
}

/* 토스 Payment 객체에서 운영자가 볼 것만 추린다. */
export function summarizePayment(p) {
  if (!p || typeof p !== 'object') return null;
  const card = p.card ? {
    issuerCode: p.card.issuerCode || '',
    issuer: cardCompanyName(p.card.issuerCode),
    acquirerCode: p.card.acquirerCode || '',
    acquirer: cardCompanyName(p.card.acquirerCode),
    number: p.card.number || '',
    cardType: p.card.cardType || '',
    ownerType: p.card.ownerType || '',
    approveNo: p.card.approveNo || '',
    installmentPlanMonths: p.card.installmentPlanMonths || 0,
  } : null;
  return {
    mId: p.mId || '',           /* 이 결제가 나간 상점아이디 — 심사가 끝난 MID 와 같은지 맞춰 볼 값 */
    status: p.status || '',
    method: p.method || '',
    easyPay: p.easyPay && p.easyPay.provider ? { provider: p.easyPay.provider, amount: p.easyPay.amount || 0 } : null,
    card,
    transferBank: p.transfer && p.transfer.bankCode ? String(p.transfer.bankCode) : '',
    requestedAt: p.requestedAt || null,
    approvedAt: p.approvedAt || null,
    totalAmount: p.totalAmount != null ? p.totalAmount : null,
    failure: p.failure && (p.failure.code || p.failure.message)
      ? { code: p.failure.code || '', message: p.failure.message || '' } : null,
    receiptUrl: p.receipt && p.receipt.url ? p.receipt.url : '',
  };
}

export async function lookupPaymentByOrder(orderId) {
  const id = String(orderId || '').trim();
  if (!id) return { found: false, code: 'bad_request', message: '주문번호가 없습니다.' };
  const res = await fetch(ORDER_URL + encodeURIComponent(id), {
    method: 'GET',
    headers: { Authorization: authHeader() },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { found: false, code: data.code || `HTTP_${res.status}`, message: data.message || '토스 조회에 실패했습니다.' };
  }
  return { found: true, payment: summarizePayment(data) };
}
