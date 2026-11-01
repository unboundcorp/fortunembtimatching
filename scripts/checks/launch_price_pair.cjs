/* =====================================================================
   상품 값 — 화면·서버 한 쌍 (빠른 층)
   ---------------------------------------------------------------------
   2026-10-31 대표님 "시점은 바로 지금부터 해라 그리고 고지도 싹다 바꿔"
   — 출시 기념가를 그 자리에서 끝내고 사주 3,500 · 성격유형 1,900 · 궁합 1,900 · 이용권 5,900 → 같은 날 다시 4,900 · 3,900 · 2,900 · 8,900.
   ① 상품 값이 화면·서버 같고 위 값이다
   ② 기념가 장치가 양쪽 다 꺼져 있다(끝나는 시각 0 · 바뀔 값 없음)
   ③ 서버 productOf 가 연도 상품까지 새 값을 준다(오늘 · 11/1 · 내년 모두)
===================================================================== */
const fs = require('fs'), path = require('path');
const { ROOT, reporter } = require('../_lib.cjs');
const R = reporter('상품 값 (화면·서버)');
(async () => {
  const src = fs.readFileSync(path.join(ROOT, 'fortune.html'), 'utf8');
  const until = src.match(/var LAUNCH_PRICE_UNTIL = ([^;]*);/);
  const after = src.match(/var AFTER_LAUNCH_PRICE = (\{[^}]*\})/);
  const cliUntil = until ? eval(until[1]) : null;
  const cliAfter = after ? eval('(' + after[1] + ')') : null;
  const P = await import('file://' + path.join(ROOT, 'api/_lib/products.js'));
  const WANT = {saju_full:2900, mbti_full:1900, compat_full:1900, premium_pass:5900};
  Object.keys(WANT).forEach((k) => {
    const m = new RegExp(k + ":\\s*\\{ id:'" + k + "',[^}]*?price:(\\d+)").exec(src);
    const cli = m ? Number(m[1]) : null;
    R.note(cli === WANT[k] && P.PRODUCTS[k].price === WANT[k], '① ' + k + ' — 화면·서버 모두 ' + WANT[k], cli + ' / ' + P.PRODUCTS[k].price);
  });
  R.note(cliUntil === 0 && P.LAUNCH_PRICE_UNTIL === 0, '② 기념가 끝나는 시각 — 양쪽 다 꺼짐(0)', cliUntil + ' / ' + P.LAUNCH_PRICE_UNTIL);
  R.note(JSON.stringify(cliAfter) === '{}' && JSON.stringify(P.AFTER_LAUNCH_PRICE) === '{}', '② 바뀔 값 — 양쪽 다 없음');
  const realNow = Date.now;
  function at(ms, id){ Date.now = () => ms; try{ const p = P.productOf(id); return p && p.price; } finally { Date.now = realNow; } }
  const times = [Date.now(), Date.UTC(2026, 9, 31, 15, 0, 5), Date.UTC(2027, 5, 1)];
  [['saju_full:2026',2900],['saju_full:2027',2900],['mbti_full',1900],['compat_full',1900],['premium_pass:2027',5900]].forEach(([id, v]) => {
    const got = times.map((t) => at(t, id));
    R.note(got.every((x) => x === v), '③ ' + id + ' — 언제 물어도 ' + v, got.join(' · '));
  });
  R.done();
})().catch(e => { console.error(e); process.exit(2); });
