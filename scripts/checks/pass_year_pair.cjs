#!/usr/bin/env node
/* =====================================================================
   이용권도 연도별인가 (빠른 층)
   ---------------------------------------------------------------------
   2026-09-11 대표님 지시 **"연도별로 가야지 전체 이용권도"**

   사주 풀이는 연도별 상품인데, **연도가 안 붙은 이용권**(옛 결제 · 테스트 허가)이
   `passYear == null` 갈래로 빠져 **모든 해를 열고 있었습니다.** 실측으로 확인한 상태입니다 —
   연도 없는 이용권 하나로 2026·2027이 다 열렸습니다.

   ★ 서버 판정 함수를 **실제로 불러서** 잽니다. 글자 대조가 아닙니다.
     (2026-09-10에 가짜 서버로 재는 검사가 서버 코드를 하나도 안 거쳐 거짓 통과한 적이 있습니다.)
   ★ 화면(fortune.html)이 같은 규칙을 쓰는지는 글자로 확인합니다 — 한 쌍이어야 합니다.
===================================================================== */
const fs = require('fs');
const path = require('path');
const L = require('../_lib.cjs');

const ROOT = path.join(__dirname, '..', '..');
const html = fs.readFileSync(path.join(ROOT, 'fortune.html'), 'utf8');
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = strip(html);

(async () => {
  const R = L.reporter('이용권 연도');
  const ent = await import('file://' + path.join(ROOT, 'api', '_lib', 'entitlements.js'));

  const now = Date.now();
  const Y = new Date(now + 9 * 3600 * 1000).getUTCFullYear();
  const alive = now + 86400000;
  const can = (pass, pid) => ent.hasAccess({ pass, items: {} }, pid);
  const withYear = (y) => ({ productId: 'premium_pass:' + y, purchasedAt: now, expiresAt: alive });
  const noYear = (bought) => ({ productId: 'premium_pass', purchasedAt: bought, expiresAt: alive });

  R.head('① 연도가 붙은 이용권 — 그 해만 연다');
  R.note(can(withYear(Y), 'saju_full:' + Y), '올해 이용권 → 올해 사주 열림');
  R.note(!can(withYear(Y), 'saju_full:' + (Y + 1)), '올해 이용권 → **내년 사주는 잠김**');
  R.note(!can(withYear(Y + 1), 'saju_full:' + Y), '내년 이용권 → 올해 사주는 잠김');
  R.note(can(withYear(Y + 1), 'saju_full:' + (Y + 1)), '내년 이용권 → 내년 사주 열림');

  R.head('② 연도가 안 붙은 이용권 — 산 해로 본다 (이번에 막은 구멍)');
  R.note(can(noYear(now), 'saju_full:' + Y), '올해 산 이용권 → 올해 사주 열림');
  R.note(!can(noYear(now), 'saju_full:' + (Y + 1)),
         '올해 산 이용권 → **내년 사주는 잠김** (예전에는 열렸습니다)');
  const lastYear = Date.UTC(Y - 1, 5, 1) - 9 * 3600 * 1000;
  R.note(!can(noYear(lastYear), 'saju_full:' + Y), '작년에 산 이용권 → 올해 사주는 잠김');
  R.note(can(noYear(null), 'saju_full:' + (Y + 1)),
         '산 시각을 모르면 가리지 않는다 (모르는 것으로 손님을 막지 않는다)');

  R.head('③ 연도가 없는 상품은 이용권으로 그대로 열린다');
  ['compat_full', 'mbti_full'].forEach((pid) => {
    R.note(can(withYear(Y), pid), pid + ' 은 이용권으로 열린다');
  });

  R.head('④ 끝난 이용권은 아무것도 안 연다');
  R.note(!can({ productId: 'premium_pass:' + Y, purchasedAt: now, expiresAt: now - 1000 },
              'saju_full:' + Y), '만료된 이용권은 그 해도 안 연다');

  R.head('⑤ 12월 31일 밤 — 한국 시각으로 가른다');
  /* 한국 12월 31일 22시 = UTC 13시. UTC 로 재면 같은 해지만, 한 시간만 밀려도 갈린다. */
  const kstDec31 = Date.UTC(Y, 11, 31, 13, 0, 0);   /* KST 22:00 */
  R.note(ent.kstYearOf(kstDec31) === Y, '한국 12월 31일 밤 22시는 올해다', String(ent.kstYearOf(kstDec31)));
  const kstJan1 = Date.UTC(Y, 11, 31, 16, 0, 0);    /* KST 다음날 01:00 */
  R.note(ent.kstYearOf(kstJan1) === Y + 1, '한국 1월 1일 새벽 1시는 내년이다', String(ent.kstYearOf(kstJan1)));

  R.head('⑥ 화면도 같은 규칙을 쓴다 (한 쌍)');
  R.note(/function passYearOf/.test(code), '화면에 passYearOf 가 있다');
  R.note(/function kstYearOf/.test(code), '화면에 kstYearOf 가 있다');
  R.note(/kstYearOf\(pass\.purchasedAt\)/.test(code), '연도가 없으면 산 해를 본다');
  R.note(/var py = passYearOf\(entitlements\(\)\.pass\)/.test(code),
         'hasAccess 가 passYearOf 를 쓴다 (옛 splitProductId 직접 읽기가 아니다)');
  R.note(!/var py = pid \? splitProductId\(pid\)\.year : null;/.test(code),
         '옛 방식(연도 없으면 다 열기)이 남아 있지 않다');
  R.note(/productIdFor\('premium_pass', kstYearOf\(now\)\)/.test(code),
         '체험 모드 지급에도 연도가 붙는다 (테스터 화면이 손님 화면과 같아진다)');

  R.head('⑦ 서버 창구도 허가에 연도를 붙인다');
  const api = fs.readFileSync(path.join(ROOT, 'api', 'entitlements.js'), 'utf8');
  R.note(/productIdFor\('premium_pass', kstYearOf\(Date\.now\(\)\)\)/.test(strip(api)),
         '테스트 허가 이용권에 올해 연도가 붙는다');
  R.note(!/productOf\('premium_pass'\)/.test(strip(api)),
         "연도 없이 productOf('premium_pass') 를 부르던 자리가 없다");

  R.head('⑧ 결제창이 그 조건을 미리 알린다');
  R.note(/사주 풀이는 고르신 해의 것이에요/.test(html),
         "이용권 결제창이 '사주는 고르신 해의 것'이라고 적는다");
  R.note(/성격유형 · 궁합은 해와 상관없어요/.test(html),
         '무엇이 해와 상관없는지도 함께 적는다 (전부 막힌다고 읽히지 않게)');

  R.done();
})();
