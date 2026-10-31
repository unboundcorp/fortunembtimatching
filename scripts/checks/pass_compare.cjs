/* =====================================================================
   이용권 '따로 사면 ~~4,790원~~ → 3,900원' (빠른 층)
   ---------------------------------------------------------------------
   2026-10-08 대표님 지시 "2)는 바로 적용하고". 비교 값은 실제로 파는 값(단품 셋의 합)이어야 한다.
   ① passCompareNodes 가 singleProductsTotal()·PRODUCTS 에서 값을 읽는다(손으로 적은 금액 없음)
   ② 결제창 · 설정 이용권 단추 두 곳이 이것을 쓴다 — 2026-10-31 대표님 지시로 잠금 카드에서는 금액을 뺐다(결제창에서 처음 보임)
   ③ 판 적 없는 '정가·할인' 표기가 화면 문자열에 없다(정가 · 원래 · % 할인)
===================================================================== */
const fs = require('fs'), path = require('path');
const { ROOT, reporter } = require('../_lib.cjs');
const R = reporter('이용권 비교 표기');
const src = fs.readFileSync(path.join(ROOT, 'fortune.html'), 'utf8');
const m = src.match(/function passCompareNodes\(withPass\)\{[\s\S]*?\n\}/);
R.note(!!m, 'passCompareNodes 가 있다');
const body = m ? m[0] : '';
R.note(/singleProductsTotal\(\)/.test(body) && /PRODUCTS\.premium_pass\.price/.test(body), '값을 PRODUCTS 에서 더해 읽는다');
R.note(!/\d,\d{3}원/.test(body) && !/\b\d{4}\b/.test(body.replace(/2026-10-08/,'')), '함수 안에 손으로 적은 금액이 없다');
const uses = (src.match(/passCompareNodes\(/g) || []).length - 1;
R.note(uses >= 2, '두 곳(결제창 · 설정)에서 쓴다', String(uses));
const lb = (src.match(/function lockedBlock\([\s\S]*?\n\}/) || [''])[0];
R.note(lb && !/passCompareNodes|formatWon/.test(lb), '잠금 카드(lockedBlock)에는 금액·비교가 없다(10-31)');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const bad = (code.match(/['"][^'"\n]*(정가|원래 가격|% ?할인)[^'"\n]*['"]/g) || []);
R.note(bad.length === 0, "화면 문자열에 '정가·원래 가격·% 할인'이 없다(판 적 없는 값을 할인 전 가격으로 적지 않는다)", bad.slice(0,3).join(' / '));
R.done();
