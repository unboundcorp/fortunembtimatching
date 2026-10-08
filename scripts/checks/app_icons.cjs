/* =====================================================================
   아이콘 — 브라우저 타일·폰 홈 화면이 로고를 보이는가 (빠른 층)
   ---------------------------------------------------------------------
   2026-10-08 대표님 지시 "아이콘도 로고로 바꿔라" — [자주 방문] 타일에 글자 'I' 가 떴다.
   주소 안에 담은 SVG 파비콘만 있고 PNG 파일이 없었기 때문이다.
   ① 파일 다섯이 있고 크기가 맞는가 ② 머리에 링크가 있고 가리키는 파일이 실제로 있는가
   ③ .vercelignore 가 빼지 않는가
===================================================================== */
const fs = require('fs'), path = require('path');
const { ROOT, reporter } = require('../_lib.cjs');
const R = reporter('아이콘');
function pngSize(f){ const b = fs.readFileSync(f); return b.slice(1,4).toString() === 'PNG' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; }
const want = {'favicon-32.png':32, 'icon-192.png':192, 'icon-512.png':512, 'apple-touch-icon.png':180};
for(const [f,s] of Object.entries(want)){
  const p = path.join(ROOT, f), ok = fs.existsSync(p), sz = ok && pngSize(p);
  R.note(ok && sz && sz[0] === s && sz[1] === s, f + ' — ' + s + '×' + s + ' PNG', ok ? JSON.stringify(sz) : '없음');
}
const ico = path.join(ROOT, 'favicon.ico'), ib = fs.existsSync(ico) && fs.readFileSync(ico);
R.note(ib && ib.readUInt16LE(2) === 1 && ib.readUInt16LE(4) >= 1, 'favicon.ico — 아이콘 파일', ib ? ib.readUInt16LE(4)+'장' : '없음');
const html = fs.readFileSync(path.join(ROOT, 'fortune.html'), 'utf8');
const head = html.slice(0, html.indexOf('</head>'));
R.note(/rel="apple-touch-icon"[^>]*href="\/apple-touch-icon\.png"/.test(head), '머리에 apple-touch-icon 링크');
const hrefs = [...head.matchAll(/<link rel="(?:icon|apple-touch-icon)"[^>]*href="\/([^"]+)"/g)].map(m => m[1]);
R.note(hrefs.length >= 3 && hrefs.every(h => fs.existsSync(path.join(ROOT, h))), '머리의 아이콘 링크가 가리키는 파일이 다 있다', hrefs.join(', '));
const ign = fs.existsSync(path.join(ROOT, '.vercelignore')) ? fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8') : '';
R.note(!/^[^#\n]*(\*\.png|\*\.ico|icon|favicon)/m.test(ign), '.vercelignore 가 아이콘을 빼지 않는다');
R.done();
