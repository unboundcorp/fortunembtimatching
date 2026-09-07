#!/usr/bin/env node
/* =====================================================================
   운영자 문지기 검사 (빠른 층 · 파일만 읽는다 · 1초 미만)
   ---------------------------------------------------------------------
   왜: 손님 문의(연락처 포함)와 매출을 보는 창구는 **운영자**만 지나야 한다.
   2026-09-08 이전에는 `testAccessOf`(테스터 허가)로 지키고 있어서,
   **테스트 코드만 아는 사람이 손님 연락처와 주문 내역을 전부 볼 수 있었다.**
   화면 쪽 문지기는 checks-slow/admin.cjs 가 브라우저로 확인한다. 여기서는
   서버 쪽이 되돌아가지 않았는지만 본다 — 되돌아가면 화면이 아무리 막아도 소용없다.
===================================================================== */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

/* [파일, 그 파일에서 운영자만 지나야 하는 갈래] */
const MUST_BE_ADMIN = [
  ['api/feedback.js', "action === 'list'"],
  ['api/feedback.js', "action === 'reply'"],
  ['api/stats.js',    null],   /* 파일 전체가 운영자 전용이다 */
];

let bad = 0;
function note(ok, what, detail){
  console.log('  ' + (ok ? '✓' : '✗') + ' ' + what + (detail ? '   ' + detail : ''));
  if(!ok) bad++;
}

console.log('운영자 문지기 (서버)');
for(const [file, marker] of MUST_BE_ADMIN){
  let src;
  try{ src = fs.readFileSync(path.join(ROOT, file), 'utf8'); }
  catch(e){ note(false, file, '읽을 수 없음'); continue; }

  if(marker === null){
    note(src.indexOf('adminAccessOf') >= 0 && src.indexOf('testAccessOf') < 0,
         file + ' 전체가 운영자 전용',
         src.indexOf('testAccessOf') >= 0 ? 'testAccessOf 가 남아 있다' : 'adminAccessOf 사용');
    continue;
  }
  const at = src.indexOf(marker);
  if(at < 0){ note(false, file + ' — ' + marker, '그 갈래를 못 찾음 (이름이 바뀌었나?)'); continue; }
  /* 그 갈래가 시작된 뒤 400자 안에서 문지기를 부르는지 본다 */
  const near = src.slice(at, at + 400);
  note(near.indexOf('adminAccessOf') >= 0, file + ' — ' + marker + ' 는 운영자만',
       near.indexOf('testAccessOf') >= 0 ? '★ testAccessOf(테스터)로 지키고 있다' : 'adminAccessOf 사용');
}

/* 화면 쪽 — 손님 설정 화면에 관리자 입구를 다시 놓지 않았는지 */
try{
  const html = fs.readFileSync(path.join(ROOT, 'fortune.html'), 'utf8');
  note(html.indexOf("settingsRow('운영 현황판 (운영자)'") < 0
    && html.indexOf("settingsRow('문의 관리 (운영자)'") < 0,
    '손님 설정 화면에 관리자 입구를 다시 놓지 않았다', '');
  note(html.indexOf('buildAdminLocked') > 0, '관리자 잠금 화면이 있다', '');
  /* 운영자 판정은 adminAccess 를 본다 */
  note(/data\.adminAccess/.test(html), '화면이 adminAccess 를 본다', '');
}catch(e){ note(false, 'fortune.html', '읽을 수 없음'); }

console.log(bad ? ('\n운영자 문지기 — 실패 ' + bad + '건') : '\n운영자 문지기 — 실패 0건');
process.exit(bad ? 1 : 0);
