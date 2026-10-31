/* 링크 미리보기 갈래 (2026-10-30) — 궁합 링크는 궁합 그림, ?go=YYYY 는 그 해 그림.
   ① 그림 파일이 있고 1200×630 ② 로봇 user-agent 일 때만 preview 로 간다(손님 브라우저는 안 감)
   ③ 카카오톡 인앱 브라우저(KAKAOTALK)는 로봇으로 안 본다 ④ previewOf 가 갈래마다 다른 그림·문구 */
const fs = require('fs'), path = require('path');
const { ROOT, reporter } = require('../_lib.cjs');
const R = reporter('링크 미리보기 갈래');
(async function(){
  const P = await import('file://' + path.join(ROOT, 'api/preview.js'));
  const files = ['og-compat.png'].concat(Object.keys(P.PREVIEW_YEARS).map(y => 'og-' + y + '.png'));
  files.forEach(function(n){
    const f = path.join(ROOT, n); const ok = fs.existsSync(f);
    const b = ok ? fs.readFileSync(f) : Buffer.alloc(24);
    R.note(ok && b.readUInt32BE(16) === 1200 && b.readUInt32BE(20) === 630 && b.length < 300*1024, n + ' 가 있고 1200×630 · 300KB 안쪽');
  });
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const bots = v.rewrites.filter(r => /^\/api\/preview/.test(r.destination));
  R.note(bots.length === 6 && bots.every(r => (r.has || []).some(h => h.key === 'user-agent')), 'preview 로 가는 규칙은 여섯 개 모두 로봇 user-agent 조건이 있다', bots.length);
  /* 2026-10-31 대표님 "궁합 관련 링크는 전부 궁합 썸네일 · 2027 링크는 신년 썸네일" — ?go=compat 추가 */
  const gc = bots.find(r => (r.has || []).some(h => h.key === 'go' && h.value === 'compat'));
  const gy = bots.find(r => (r.has || []).some(h => h.key === 'go' && /\\d\{4\}/.test(h.value)));
  R.note(!!gc && /k=compat/.test(gc.destination) && bots.indexOf(gc) < bots.indexOf(gy), '?go=compat → 궁합 그림 (연도 규칙보다 앞)', gc ? gc.destination : '없음');
  R.note(!!gy && /k=newyear/.test(gy.destination), '?go=YYYY → 신년 그림', gy ? gy.destination : '없음');
  R.note(bots.filter(r => /^\/(j|g)\//.test(r.source)).every(r => /k=compat/.test(r.destination)), '/j/ · /g/ 초대 링크 → 궁합 그림');
  const firstStatic = v.rewrites.findIndex(r => r.destination === '/fortune.html');
  R.note(v.rewrites.findIndex(r => /^\/api\/preview/.test(r.destination)) < firstStatic && bots.every(r => v.rewrites.indexOf(r) < firstStatic), '로봇 규칙이 fortune.html 규칙보다 앞에 있다');
  const re = new RegExp('^' + bots[0].has.find(h => h.key === 'user-agent').value + '$');
  const UA = {
    kakaoScrap: 'facebookexternalhit/1.1; kakaotalk-scrap/1.0; +https://devtalk.kakao.com/docs/latest/scrap',
    fb: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', tg: 'TelegramBot (like TwitterBot)',
    kakaoInApp: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.4.0',
    insta: 'Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0', chrome: 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    naverApp: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.0)', daumApp: 'Mozilla/5.0 (iPhone) Mobile DaumApps/8.0',
  };
  R.note(re.test(UA.kakaoScrap) && re.test(UA.fb) && re.test(UA.tg), '카카오·페이스북·텔레그램 로봇은 걸린다');
  R.note(!re.test(UA.kakaoInApp) && !re.test(UA.insta) && !re.test(UA.chrome) && !re.test(UA.naverApp) && !re.test(UA.daumApp), '손님 브라우저(카톡 인앱·인스타·크롬·네이버·다음 앱)는 안 걸린다');
  const a = P.previewOf('compat'), b = P.previewOf('newyear', '2027'), c = P.previewOf('', null), d = P.previewOf('newyear', '1999');
  R.note(a.image !== b.image && b.image !== c.image && /og-compat/.test(a.image) && /og-2027/.test(b.image), '궁합·2027·기본이 서로 다른 그림');
  R.note(/궁합/.test(a.title) && /2027/.test(b.title) && d.image === c.image, '문구가 갈래에 맞고, 그림 없는 해는 기본으로');
  const html = fs.readFileSync(path.join(ROOT, 'fortune.html'), 'utf8');
  R.note(/og:image" content="https:\/\/www\.inyeonjeom\.kr\/og\.png\?v=20261014"/.test(html) && c.image.indexOf('og.png?v=20261014') > 0, '기본 미리보기가 fortune.html 과 같다');
  R.done();
})();
