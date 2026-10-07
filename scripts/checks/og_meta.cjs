/* 링크 미리보기(og) — 태그와 그림 (빠른 층)
   2026-10-07 대표님 지시 "우리도 링크를 공유했을때 썸네일이 좀 있었으면 좋겠다".
   ① 태그가 있다 ② 그림 주소가 https 절대경로 ③ og.png 가 실제로 있고 1200×630 ④ .vercelignore 에 안 걸린다 */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'fortune.html'), 'utf8');
let fail = 0;
function ok(c, m, d){ console.log((c?'  ✓ ':'  ✗ ')+m+(d?'   '+d:'')); if(!c) fail++; }
function meta(k){ const m = html.match(new RegExp('<meta (?:property|name)="'+k.replace(/[:]/g,'\\:')+'" content="([^"]*)"')); return m ? m[1] : null; }
['og:title','og:description','og:image','og:url','twitter:card'].forEach(function(k){ ok(!!meta(k), k+' 태그가 있다', meta(k)||''); });
const img = meta('og:image') || '';
ok(/^https:\/\/www\.inyeonjeom\.kr\/og\.png$/.test(img), 'og:image 가 https 절대주소', img);
ok(meta('twitter:card') === 'summary_large_image', 'twitter:card 가 큰 그림');
const f = path.join(ROOT, 'og.png');
ok(fs.existsSync(f), 'og.png 가 있다');
if(fs.existsSync(f)){
  const b = fs.readFileSync(f);
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  ok(b.slice(1,4).toString() === 'PNG' && w === 1200 && h === 630, 'og.png 는 1200×630 PNG', w+'×'+h);
  ok(b.length < 300*1024, 'og.png 가 300KB 안쪽(메신저가 버리지 않게)', Math.round(b.length/1024)+'KB');
}
const vi = fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8').split('\n').map(function(l){ return l.trim(); });
ok(vi.indexOf('og.png') < 0 && vi.indexOf('*.png') < 0, '.vercelignore 가 og.png 를 빼지 않는다');
console.log('\n링크 미리보기 — ' + (fail ? '실패 '+fail+'건' : '통과'));
process.exit(fail ? 1 : 0);
