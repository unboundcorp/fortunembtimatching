/* =====================================================================
   카카오 로그인 공통 (R72)
   ---------------------------------------------------------------------
   ★ 받는 것은 '카카오 회원번호' 하나뿐이다. 이름·이메일·전화번호는 요청하지 않는다.
     그 번호는 우리 앱 전용 식별자라 그것만으로는 누구인지 알 수 없다.
     동의항목을 하나도 받지 않으므로 카카오 비즈니스 앱 검수도 필요 없다.

   ★ 왜 쓰나: 지금은 쿠키가 곧 지갑이라, 기기를 바꾸면 산 것을 잃는다.
     되찾는 열쇠가 영수증 번호뿐인데 그걸 적어두는 사람은 많지 않다.

   ★ 로그인은 '결제한 분이 원할 때'만 건다. 궁합 링크로 들어오는 분은 이 길을 밟지 않는다.
     "회원가입 없이"라는 이 서비스의 약속을 깨지 않기 위해서다.

   ★ 열쇠는 이 서버에서만 쓴다. 브라우저는 KAKAO_REST_API_KEY를 모른다.
===================================================================== */
import crypto from 'node:crypto';

export const AUTH_URL = 'https://kauth.kakao.com/oauth/authorize';
export const TOKEN_URL = 'https://kauth.kakao.com/oauth/token';
export const ME_URL = 'https://kapi.kakao.com/v2/user/me';

/* 카카오 개발자센터에 등록하는 값과 한 글자도 다르면 안 된다.
   그래서 물음표 뒤에 아무것도 붙이지 않는 깔끔한 경로를 쓴다. */
export function hostOf(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
}

export function redirectUri(req) {
  return `https://${hostOf(req)}/api/kakaocb`;
}

/* =====================================================================
   돌아올 주소로 쓸 수 있는 집 주소들 (2026-08-22)
   ---------------------------------------------------------------------
   왜 필요한가: redirect_uri 는 손님이 접속한 주소를 그대로 쓴다. 그래서 Vercel이
   배포마다 만들어 주는 임시 주소(…-abc123.vercel.app)로 들어와 로그인을 누르면,
   카카오에 등록되지 않은 주소로 돌아오려 하므로 카카오가 KOE006을 띄운다.
   손님은 '앱 관리자 설정 오류'라는 남의 말로 된 화면을 보게 된다.

   ★ 그래서 우리 쪽에서 먼저 걸러, 우리 말로 안내한다. 카카오까지 보내지 않는다.
   ★ 목록은 환경변수 KAKAO_ALLOWED_HOSTS 로 덮어쓸 수 있다(쉼표로 구분).
     주소를 새로 붙일 때 코드를 고치고 배포하지 않아도 되게 하려는 것이다.
   ★ 여기 적는 주소와 카카오 개발자센터의 Redirect URI 는 반드시 같이 움직여야 한다.
     한쪽만 늘리면 다시 KOE006이 난다.
===================================================================== */
const DEFAULT_HOSTS = [
  'www.inyeonjeom.kr',
  'inyeonjeom.kr',
  'fortunembtimatching.vercel.app',
];
export function allowedHosts() {
  const raw = process.env.KAKAO_ALLOWED_HOSTS;
  if (!raw) return DEFAULT_HOSTS;
  const list = raw.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
  return list.length ? list : DEFAULT_HOSTS;
}
export function hostAllowed(req) {
  return allowedHosts().indexOf(hostOf(req).toLowerCase()) >= 0;
}

export function restKey() {
  const k = process.env.KAKAO_REST_API_KEY;
  if (!k) throw new Error('KAKAO_REST_API_KEY 환경변수가 없습니다.');
  return k;
}

/* =====================================================================
   state — 남이 시작한 로그인을 내 계정에 붙이지 못하게 막는다
   ---------------------------------------------------------------------
   이게 없으면 공격자가 자기 카카오로 만든 콜백 주소를 피해자에게 눌리게 해서,
   피해자의 구매를 공격자 계정에 묶어버릴 수 있다(로그인 CSRF).
   난수를 만들어 쿠키에 넣고, 돌아왔을 때 같은 값인지 본다.
===================================================================== */
const STATE_COOKIE = 'kstate';

function stateSecret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET 환경변수가 없거나 너무 짧습니다.');
  return s;
}

export function newState() {
  const nonce = crypto.randomBytes(18).toString('base64url');
  const mac = crypto.createHmac('sha256', stateSecret()).update(nonce).digest('base64url');
  return `${nonce}.${mac}`;
}

export function stateCookie(value) {
  /* 10분이면 충분하다. 로그인을 시작해 놓고 오래 두면 그냥 다시 시작하면 된다. */
  return `${STATE_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`;
}

export function clearStateCookie() {
  return `${STATE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export function checkState(req, got) {
  const raw = req.headers?.cookie || '';
  let saved = null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === STATE_COOKIE) saved = decodeURIComponent(part.slice(i + 1).trim());
  }
  if (!saved || !got) return false;
  /* 길이가 다르면 timingSafeEqual이 던진다 — 먼저 걸러낸다. */
  if (saved.length !== String(got).length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(saved), Buffer.from(String(got)))) return false;
  /* 쿠키 값 자체도 우리가 서명한 것인지 확인한다(쿠키를 손으로 넣었을 수 있다). */
  const dot = saved.lastIndexOf('.');
  if (dot < 1) return false;
  const nonce = saved.slice(0, dot), mac = saved.slice(dot + 1);
  const expect = crypto.createHmac('sha256', stateSecret()).update(nonce).digest('base64url');
  if (mac.length !== expect.length) return false;
  return crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect));
}

/* setHeader는 덮어쓴다. 세션 쿠키를 이미 내려보낸 뒤에 또 부르면 그게 사라진다.
   그래서 있던 것을 읽어 뒤에 덧붙인다. */
export function addCookie(res, cookie) {
  const prev = res.getHeader('Set-Cookie');
  const list = prev ? (Array.isArray(prev) ? prev.slice() : [prev]) : [];
  list.push(cookie);
  res.setHeader('Set-Cookie', list);
}

/* 인가 코드를 토큰으로 바꾸고, 회원번호만 꺼내 온다. */
export async function fetchKakaoId(code, uri) {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: restKey(),
    redirect_uri: uri,
    code: String(code),
  });
  /* 카카오 개발자센터에서 'Client Secret'을 켠 경우에만 보낸다. 안 켰으면 없어도 된다. */
  if (process.env.KAKAO_CLIENT_SECRET) form.set('client_secret', process.env.KAKAO_CLIENT_SECRET);

  const tokRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: form.toString(),
  });
  if (!tokRes.ok) {
    /* ★ 응답 본문을 손님에게 보여주지 않는다. 열쇠나 내부 사정이 섞여 나갈 수 있다. */
    const detail = (await tokRes.text().catch(() => '')).slice(0, 200);
    throw new Error(`카카오 토큰 발급 실패 (HTTP ${tokRes.status}) ${detail}`);
  }
  const tok = await tokRes.json();
  if (!tok || !tok.access_token) throw new Error('카카오 토큰 응답에 access_token이 없습니다.');

  const meRes = await fetch(ME_URL, {
    method: 'GET',
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  if (!meRes.ok) {
    const detail = (await meRes.text().catch(() => '')).slice(0, 200);
    throw new Error(`카카오 사용자 조회 실패 (HTTP ${meRes.status}) ${detail}`);
  }
  const me = await meRes.json();
  if (!me || me.id == null) throw new Error('카카오 응답에 회원번호가 없습니다.');
  /* 회원번호만 쓴다. 나머지 항목은 애초에 요청하지 않았고, 와도 버린다. */
  return String(me.id);
}
