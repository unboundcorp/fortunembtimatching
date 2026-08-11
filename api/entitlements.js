/* =====================================================================
   entitlementEndpoint — 권한 조회 (앱 규격 1항)
   ---------------------------------------------------------------------
   요청 : { "kind":"entitlements" }
   응답 : { items:{...}, pass:{...}|null, purchases:[...] }

   ★ 이 주소가 앱의 BILLING에 채워지는 순간 앱은 "서버 권위 모드"가 된다.
     그때부터 잠금 판정의 근거는 오직 이 응답이다. 그래서 실패는 반드시 "잠금" 쪽으로 떨어져야 한다.
     앱도 그렇게 되어 있지만(에러 시 defaultEntitlements), 서버도 애매한 200을 주지 않는다.
===================================================================== */
import { json, methodGuard } from './_lib/http.js';
import { ensureSession } from './_lib/session.js';
import { paidOrdersOf } from './_lib/store.js';
import { buildEntitlements } from './_lib/entitlements.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;

  try {
    const sessionId = ensureSession(req, res);
    const orders = await paidOrdersOf(sessionId);
    json(res, 200, buildEntitlements(orders));
  } catch (err) {
    console.error('entitlements 실패:', err?.message);
    /* 500을 준다 — 앱은 이걸 받으면 잠근다. 빈 200을 주면 "정상적으로 아무것도 없음"과
       "서버가 고장남"을 구분할 수 없어 화면에 이유를 못 적는다. */
    json(res, 500, { error: 'unavailable' });
  }
}
