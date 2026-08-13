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
import { paidOrdersOf, testAccessOf, aiUsedProductIds } from './_lib/store.js';
import { buildEntitlements } from './_lib/entitlements.js';
import { productOf } from './_lib/products.js';
import { isTossTestKey } from './_lib/company.js';

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;

  try {
    const sessionId = ensureSession(req, res);
    const orders = await paidOrdersOf(sessionId);
    const ent = buildEntitlements(orders);

    /* =====================================================================
       ★ R73 — 테스트 허가도 여기서 함께 내려준다.
       ---------------------------------------------------------------------
       예전에는 #unlock 으로 허가를 받으면 화면 쪽 잠금을 브라우저가 직접 열었다
       (grantAllForTest). 그때는 BILLING_SOURCE가 비어 있어 권한이 브라우저에 있었기 때문이다.

       그런데 결제를 열면서 서버 권위 모드가 됐다. 이제 앱은 잠금 판정에 이 응답만 쓴다.
       그래서 허가를 받아도 화면은 잠긴 채였다 — 서버는 열어주는데 화면이 안 열리니,
       유료 기능을 확인할 방법이 사라졌다(실측으로 잡음).

       허가는 이용권(pass)과 같은 모양으로 내려준다. api/interpret.js·content.js의
       권한 판정(hasAiAccess)도 테스트 허가를 이용권으로 취급하므로 앞뒤가 맞는다.
       ★ 이 허가는 TEST_UNLOCK_CODE를 아는 사람만 받을 수 있다(api/testunlock.js).
    ===================================================================== */
    /* =====================================================================
       ★ R76 — 한 번 만든 해석은 이용권이 끝나도 계속 볼 수 있게 한다 (대표님 승인).
       ---------------------------------------------------------------------
       이용권은 7일인데 단품은 영구라, 상위 상품이 하위 상품보다 불리했다.
       게다가 대표님은 "재열람은 무제한"이라고 알고 계셨는데 코드가 그렇지 않았다 —
       7일이 지나면 그동안 만든 해석까지 잠겼다.

       만든 적이 있는 상품은 영구 항목으로 넣어 준다. 그러면
       '7일 동안 열 개까지 만들 수 있고, 만든 건 영원히 내 것'이 되어 앞뒤가 맞는다.

       ★ 새로 만드는 것은 여전히 막힌다 — 이용권이 끝나면 횟수 상한이 단품 기준(1회)으로
         내려가고 이미 그만큼 썼으므로 새 생성은 거절된다.
    ===================================================================== */
    try {
      const madeBefore = await aiUsedProductIds(sessionId);
      for (const pid of madeBefore) {
        const p = productOf(pid);
        if (!p || p.kind === 'pass') continue;   /* 이용권 자체를 영구로 만들지는 않는다 */
        if (!ent.items[p.id]) ent.items[p.id] = { purchasedAt: Date.now() };
      }
    } catch (err) {
      /* 못 읽어도 앱은 그대로 돌아간다. 다만 만료된 이용권의 옛 해석이 잠길 뿐이다. */
      console.warn('이미 만든 해석 조회 실패(무시하고 진행):', err && err.message);
    }

    const test = await testAccessOf(sessionId);
    if (test) {
      const until = test.expires_at ? new Date(test.expires_at).getTime() : Date.now() + 86400000;
      if (!ent.pass || until > ent.pass.expiresAt) {
        const pass = productOf('premium_pass');
        ent.pass = {
          productId: pass ? pass.id : 'premium_pass',
          purchasedAt: Date.now(),
          expiresAt: until,
        };
      }
    }

    /* ★ 지금 붙어 있는 토스 키가 테스트 키인지 알려준다 (외부 실사 지적).
       화면은 이 값을 보고 결제창에 "실제로 결제되지 않습니다"를 띄운다.
       이게 없으면 손님은 토스 결제창에 들어가서야 알게 되고, 그 전까지
       진짜 결제인 줄 알고 카드번호와 주민등록번호를 입력한다.
       ★ 키 값 자체는 절대 내려보내지 않는다. '테스트인가 아닌가'만 보낸다. */
    ent.testPayment = isTossTestKey();

    json(res, 200, ent);
  } catch (err) {
    console.error('entitlements 실패:', err?.message);
    /* 500을 준다 — 앱은 이걸 받으면 잠근다. 빈 200을 주면 "정상적으로 아무것도 없음"과
       "서버가 고장남"을 구분할 수 없어 화면에 이유를 못 적는다. */
    json(res, 500, { error: 'unavailable' });
  }
}
