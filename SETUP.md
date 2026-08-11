# 인연점 결제 서버 — 설치 순서

토스페이먼츠 결제를 붙이기 위한 Vercel 서버입니다. 외부 라이브러리를 하나도 쓰지 않습니다.

## 왜 서버가 필요한가

토스 **시크릿 키**로 "이 결제가 정말 승인됐다"를 확인하는 일은 서버만 할 수 있습니다.
브라우저가 "결제 성공했어요"라고 말하는 것은 아무 근거가 없습니다 — 개발자도구에서 얼마든지 꾸며낼 수 있습니다.

그래서 **시크릿 키는 절대 브라우저에 넣지 않습니다.** 넣는 순간 누구나 꺼내 쓸 수 있고, 남이 그 키로 결제를 조작할 수 있습니다.

## 구조

```
fortune-server/
├── fortune.html          ← 앱 (output/fortune 에서 복사해 옵니다)
├── vercel.json           ← /pay 주소 연결
├── schema.sql            ← Supabase에 붙여넣을 테이블 정의
└── api/
    ├── checkout.js       ← 주문 생성 → 결제창 주소 반환
    ├── pay.js            ← 결제창 페이지 (클라이언트 키만 사용)
    ├── confirm.js        ← ★ 토스 successUrl. 시크릿 키로 승인
    ├── payfail.js        ← 토스 failUrl
    ├── entitlements.js   ← 이 사람이 무엇을 샀는지
    ├── verify.js         ← 영수증 검증 + 구매 복원
    └── _lib/             ← 공통 (상품표·세션·저장소·토스)
```

## 순서

### 1단계 — Supabase 준비

1. Supabase 프로젝트를 만듭니다.
2. **SQL Editor**에 `schema.sql` 내용을 그대로 붙여넣고 실행합니다.
3. **Settings → API**에서 두 값을 복사해 둡니다.
   - `Project URL`
   - `service_role` 키 ← **이 키는 절대 공개하면 안 됩니다.** 브라우저에 들어가면 결제 기록이 전부 뚫립니다.

### 2단계 — 앱 파일 복사

```bash
cp "output/fortune/fortune.html" "output/fortune-server/fortune.html"
```

### 3단계 — Vercel 프로젝트 만들고 환경변수 넣기

Vercel 대시보드 → **Settings → Environment Variables**에 네 개를 넣습니다.

| 이름 | 값 | 어디서 |
|---|---|---|
| `TOSS_SECRET_KEY` | 토스 시크릿 키 | 토스페이먼츠 개발자센터 |
| `TOSS_CLIENT_KEY` | 토스 클라이언트 키 | 토스페이먼츠 개발자센터 (공개용이라 노출돼도 됨) |
| `SUPABASE_URL` | Project URL | Supabase Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role 키 | Supabase Settings → API |
| `SESSION_SECRET` | 아래 명령으로 직접 생성 | — |

`SESSION_SECRET`은 쿠키 위조를 막는 서명 열쇠입니다. 아무 문자열이나 쓰지 말고 이렇게 만드세요.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

> **처음에는 토스 테스트 키로 시작하세요.** 실제 카드가 승인되지 않아 안전하게 전 과정을 시험할 수 있습니다.
> 라이브 키로 바꾸는 것은 마지막 단계입니다.

### 4단계 — 배포하고 확인

배포한 뒤 **반드시 아래를 눌러서 확인하세요.** "됐을 것"은 안 됩니다.

- [ ] `https://<주소>/fortune.html` 이 열리는가
- [ ] 결제 버튼 → `/pay` 로 넘어가고 **화면의 금액이 상품 가격과 같은가**
- [ ] 테스트 카드로 결제 → 앱으로 돌아오며 **유료 섹션이 열리는가**
- [ ] **결제 후 새로고침해도 계속 열려 있는가** (쿠키가 살아 있는지)
- [ ] 영수증 번호를 복사 → 시크릿 창에서 "구매 내역 복원" → **되살아나는가**
- [ ] **배포된 페이지 소스에 시크릿 키가 없는가** ← 가장 중요

시크릿 키 노출 검사:

```bash
curl -s https://<주소>/pay?order=<주문번호> | grep -c "test_sk\|live_sk"   # 0 이어야 정상
curl -s https://<주소>/fortune.html        | grep -c "test_sk\|live_sk"   # 0 이어야 정상
```

### 5단계 — 마지막에 앱의 서버 주소를 켠다

**이 단계를 먼저 하면 안 됩니다.** 주소를 넣는 순간 앱이 "서버 권위 모드"로 바뀌는데,
서버가 준비되지 않았으면 **모든 유료 기능이 잠깁니다.**

`fortune.html`에서 `BILLING_SOURCE`를 찾아 이렇게 바꿉니다.

```js
var BILLING_SOURCE = {
  entitlementEndpoint: '/api/entitlements',
  contentEndpoint:     null,              // 아래 "아직 안 한 것" 참고
  verifyEndpoint:      '/api/verify',
  checkoutEndpoint:    '/api/checkout'
};
```

같은 도메인이므로 상대 경로로 충분합니다. 그 뒤 다시 배포하고 4단계 확인을 한 번 더 돌립니다.

### 6단계 — 기존 GitHub Pages 주소 넘기기

`output/fortune`의 `index.html`을 새 주소로 보내도록 바꾸면, 예전 주소를 아는 분들도 자동으로 넘어갑니다.

---

## 아직 안 한 것 — `contentEndpoint`

이 주소는 **비워 뒀습니다.** 채우려면 사주 풀이 13섹션을 만드는 코드를 서버로 옮겨야 하는데,
그 생성기는 `fortune.html` 안에서 수천 줄이고 만세력 계산 엔진에 붙어 있습니다. 결제 연동과는 별개의 큰 작업입니다.

**비워 두면 어떻게 되나**: 유료 본문을 브라우저가 만듭니다. 잠긴 구간은 화면·DOM·저장소 어디에도
나오지 않지만, 개발자도구로 중단점을 걸 줄 아는 사람은 문장을 뽑아낼 수 있습니다.
이건 앱이 이미 알고 감수하기로 한 사항이고, 그 이유가 `fortune.html` 상단 주석에 적혀 있습니다.

**막고 싶으시면** 그때 규격을 새로 정해서 따로 작업하면 됩니다. 결제 자체는 이 상태로 문제없이 동작합니다.

---

## 안전장치 정리

| 무엇을 막는가 | 어떻게 |
|---|---|
| 결제 금액 위조 | 청구액은 서버 상품표에서만 가져옴. 브라우저가 보낸 `price`가 다르면 거절 |
| "결제했다"는 거짓말 | 토스에 시크릿 키로 직접 물어 `status === 'DONE'` 일 때만 권한 부여 |
| 입금 전 가상계좌로 열기 | `DONE`이 아닌 상태는 승인으로 치지 않음 |
| 같은 결제 두 번 적용 | 토스에 `Idempotency-Key` 전달 + 원장은 `status='created'`인 행만 갱신 |
| 남의 쿠키로 이용권 쓰기 | 세션 쿠키를 `SESSION_SECRET`으로 서명. 위조되면 새 세션 취급 |
| 영수증 번호 찍어보기 | 24바이트 난수 + 10분에 10회 제한 + 실패 사유에 존재 여부를 흘리지 않음 |
| 서버 장애 시 무료 개방 | 실패하면 500을 반환 → 앱이 잠금으로 처리 (열어주는 쪽으로 실패하지 않음) |
