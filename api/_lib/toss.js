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
