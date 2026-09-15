#!/usr/bin/env node
/* =====================================================================
   검사가 대표님 [다운로드] 폴더에 파일을 쌓지 않는가 (빠른 층)
   ---------------------------------------------------------------------
   2026-09-15 대표님 제보 — "인연점 결제내역 회원목록 AI 해석 csv파일 왜 맨날 다운로드 받아?"

   원인은 제 검사기였습니다. `checks-slow/admin_buttons.cjs` 가 관리자 화면의 단추를
   **전부 눌러 봅니다**(그게 그 검사의 목적입니다). 거기에 [CSV 내려받기] 세 개가 들어
   있어서, 돌릴 때마다 진짜 파일이 받아졌습니다. 실측으로 확인한 값입니다 —
   **한 번 돌 때 12개**, 쌓인 것 **264개**(2026-09-11 이후).

   ★ 단추를 안 누르는 쪽으로 피하지 않았습니다. 그러면 그 단추가 영영 안 검사됩니다.
     대신 브라우저가 **파일을 안 받게** 막았습니다(`Browser.setDownloadBehavior: deny`).
     눌리는 것·안 터지는 것은 그대로 재고, 디스크에는 아무것도 안 남습니다.
   ★ 실측: 막이를 빼면 252 → 264, 막이를 넣으면 264 → 264(검사는 43건 그대로 통과).
===================================================================== */
const fs = require('fs');
const path = require('path');
const L = require('../_lib.cjs');

const ROOT = path.join(__dirname, '..', '..');
const SCRIPTS = path.join(ROOT, 'scripts');
const lib = fs.readFileSync(path.join(SCRIPTS, '_lib.cjs'), 'utf8');

/* 검사기 폴더를 훑어 newPage() 를 직접 부르는 파일을 찾는다.
   openPage() 를 안 쓰면 이 막이가 안 걸린다. */
function walk(dir){
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(function(d){
    const f = path.join(dir, d.name);
    if(d.isDirectory()) return walk(f);
    return d.name.endsWith('.cjs') ? [f] : [];
  });
}

(async () => {
  const R = L.reporter('검사가 파일을 받아 쌓지 않는가');

  R.head('① 막이가 제자리에 있는가');
  R.note(/Browser\.setDownloadBehavior/.test(lib), "openPage 가 Browser.setDownloadBehavior 를 부른다");
  R.note(/behavior:\s*'deny'/.test(lib), "받기를 'deny' 로 막는다");
  R.note(/createCDPSession/.test(lib), 'CDP 통로를 연다');

  R.head('② 막이를 비켜 가는 검사기가 없는가');
  const offenders = walk(SCRIPTS)
    .filter(f => path.basename(f) !== '_lib.cjs')
    .filter(f => /\.newPage\(\)/.test(fs.readFileSync(f, 'utf8')))
    .map(f => path.relative(SCRIPTS, f));
  /* smoke.cjs · calc.cjs 는 화면을 돌아다니지 않고 관리자 화면을 열지 않는다.
     새 파일이 이 목록에 들어오면 openPage 를 쓰도록 고치십시오. */
  const KNOWN = ['smoke.cjs', 'calc.cjs'];
  const unexpected = offenders.filter(f => KNOWN.indexOf(f) < 0);
  R.note(unexpected.length === 0,
         'newPage() 를 직접 부르는 새 검사기가 없다',
         unexpected.length ? unexpected.join(' · ') : '알고 있는 둘뿐');

  R.head('③ 내려받기 단추를 검사에서 빼 두지 않았는가');
  const btns = fs.readFileSync(path.join(SCRIPTS, 'checks-slow', 'admin_buttons.cjs'), 'utf8');
  R.note(!/SKIP\s*=\s*\[[^\]]*내려받기/.test(btns),
         '[내려받기] 를 SKIP 으로 빼지 않았다 (막는 게 아니라 안 받게 하는 것이 답이다)');

  R.done();
})();
