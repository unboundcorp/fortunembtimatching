/* =====================================================================
   출시 기념가 → 2027-01-01 자동 값 바꿈 (빠른 층)
   ---------------------------------------------------------------------
   2026-10-08 대표님 지시 "12/31까지로 하고 그날 지나면 자동으로 값바꿔" · "A로 가자"
   ① 화면과 서버의 끝나는 시각 · 바뀐 값이 같다(한 쌍)
   ② 끝나는 시각은 한국 시각 2027-01-01 00:00 이다
   ③ 서버 productOf 가 그 시각 전에는 기념가, 그 뒤에는 새 값을 준다(연도 상품 포함)
   ④ 바뀐 값이 A안(2,900 · 2,900 · 1,500 · 5,900)이다
===================================================================== */
const fs = require('fs'), path = require('path');
const { ROOT, reporter } = require('../_lib.cjs');
const R = reporter('출시 기념가 자동 전환');
(async () => {
  const src = fs.readFileSync(path.join(ROOT, 'fortune.html'), 'utf8');
  const until = src.match(/var LAUNCH_PRICE_UNTIL = Date\.UTC\(([^)]*)\)/);
  const after = src.match(/var AFTER_LAUNCH_PRICE = (\{[^}]*\})/);
  const cliUntil = until ? eval('Date.UTC(' + until[1] + ')') : null;
  const cliAfter = after ? eval('(' + after[1] + ')') : null;
  const P = await import('file://' + path.join(ROOT, 'api/_lib/products.js'));
  R.note(cliUntil === P.LAUNCH_PRICE_UNTIL, '① 끝나는 시각이 화면·서버 같다', cliUntil + ' / ' + P.LAUNCH_PRICE_UNTIL);
  R.note(JSON.stringify(cliAfter) === JSON.stringify(P.AFTER_LAUNCH_PRICE), '① 바뀐 값이 화면·서버 같다', JSON.stringify(cliAfter));
  R.note(new Date(P.LAUNCH_PRICE_UNTIL).toISOString() === '2026-12-31T15:00:00.000Z', '② 한국 시각 2027-01-01 00:00', new Date(P.LAUNCH_PRICE_UNTIL).toISOString());
  R.note(JSON.stringify(P.AFTER_LAUNCH_PRICE) === JSON.stringify({saju_full:2900, mbti_full:2900, compat_full:1500, premium_pass:5900}), '④ A안 값');
  const realNow = Date.now;
  function at(ms, id){ Date.now = () => ms; try{ const p = P.productOf(id); return p && p.price; } finally { Date.now = realNow; } }
  const before = P.LAUNCH_PRICE_UNTIL - 1000, aft = P.LAUNCH_PRICE_UNTIL;
  const rows = [['saju_full:2026',1900,2900],['saju_full:2027',1900,2900],['mbti_full',1900,2900],['compat_full',990,1500],['premium_pass:2027',3900,5900]];
  rows.forEach(([id, b, a]) => {
    const pb = at(before, id), pa = at(aft, id);
    R.note(pb === b && pa === a, '③ ' + id + ' — 12/31 23:59:59 ' + b + ' · 1/1 00:00 ' + a, pb + ' → ' + pa);
  });
  R.note(P.PRODUCTS.saju_full.price === 1900, '③ 상품표 자체(기념가)는 안 바뀐다 — 값은 productOf 가 그때그때');
  R.done();
})().catch(e => { console.error(e); process.exit(2); });
