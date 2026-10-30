/* =====================================================================
   링크 미리보기 — 메신저 로봇에게만 주는 짧은 페이지 (2026-10-30 대표님 지시)
   ---------------------------------------------------------------------
   > "궁합링크 신년운세 링크 … 외부 공유할 때 썸네일도 궁합은 궁합, 신년은 신년 맞게"
   카카오톡·인스타·텔레그램 같은 메신저는 자바스크립트를 안 돌리고 주소의 og 태그만 읽는다.
   그래서 vercel.json 이 **미리보기 로봇의 user-agent 일 때만** 이 함수로 보낸다.
   손님 브라우저는 예전처럼 fortune.html 을 그대로 받는다 — 이 함수를 거치지 않는다.
     k=compat         → /j/·/g/ 초대 링크 (궁합 그림)
     k=newyear&go=Y   → /?go=2027 광고 링크 (그 해 그림이 있으면 그것, 없으면 기본)
   ★ 손님 이름·모임 번호는 미리보기에 안 싣는다(남에게 보이는 글이다).
   ★ 그림을 바꾸면 ?v= 값도 올릴 것 — 메신저가 옛 그림을 기억한다.
===================================================================== */
const SITE = 'https://www.inyeonjeom.kr';
export const PREVIEW_YEARS = { 2027: '정미년' };
export const PREVIEW_V = '20261030';

export function previewOf(kind, goYear) {
  if (kind === 'compat') {
    return {
      title: '인연점 · 우리 궁합, 몇 점일까요?',
      desc: '링크를 열면 사주 × 성격유형으로 본 우리 사이 궁합이 나와요',
      image: `${SITE}/og-compat.png?v=${PREVIEW_V}`,
      alt: '인연점 — 우리 궁합, 몇 점일까요?',
    };
  }
  const y = Number(goYear);
  if (kind === 'newyear' && PREVIEW_YEARS[y]) {
    return {
      title: `인연점 · ${y}년 ${PREVIEW_YEARS[y]}, 새해 운세 미리 보기`,
      desc: '달마다의 흐름부터 금전운·사랑·일까지, 내 사주로 미리 봐요',
      image: `${SITE}/og-${y}.png?v=${PREVIEW_V}`,
      alt: `인연점 — ${y}년 새해 운세`,
    };
  }
  return {
    title: '인연점 · 사주 × 성격유형 궁합',
    desc: '링크 하나로 가족·친구·연인과 궁합 보기',
    image: `${SITE}/og.png?v=20261014`,
    alt: '인연점 — 사주 × 성격유형, 우리 사이 궁합',
  };
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export default function handler(req, res) {
  const q = req.query || {};
  const p = previewOf(String(q.k || ''), q.go);
  /* 원래 주소 — 로봇이 아닌데 잘못 들어왔어도 서비스로 넘어가게 */
  const back = (q.k === 'newyear' && /^\d{4}$/.test(String(q.go))) ? '/?go=' + q.go : String(q.path || '/').replace(/[^A-Za-z0-9/_?=&.-]/g, '');
  const url = SITE + (back.charAt(0) === '/' ? back : '/');
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="인연점">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(p.image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(p.alt)}">
<meta property="og:locale" content="ko_KR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(p.desc)}">
<meta name="twitter:image" content="${esc(p.image)}">
<meta http-equiv="refresh" content="0;url=${esc(url)}">
</head><body><a href="${esc(url)}">인연점으로 가기</a></body></html>`;
  res.status(200);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Vary', 'User-Agent');
  res.send(html);
}
