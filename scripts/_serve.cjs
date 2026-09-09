#!/usr/bin/env node
/* 고친 파일을 그대로 띄우는 작은 정적 서버. verify.sh 가 쓴다.
   ★ /api/* 는 501이다 — 서버 함수가 없다. 그건 고장이 아니라 이 서버가 정적이기 때문이다.
     서버 함수는 배포본에 대고 따로 본다(smoke.cjs --only-api).
   ★ 딱 하나 예외: /api/kakao 만 "로그인돼 있다"고 답한다(_lib.serve). 2026-09-09부터
     로그인이 필수라, 그러지 않으면 모든 화면 검사가 동의 화면만 보게 된다.
   ★ 포트를 주지 않으면 비어 있는 포트를 골라 첫 줄에 주소를 찍는다. */
const L = require('./_lib.cjs');
L.serve(L.ROOT, Number(process.argv[2]) || 0).then(function(s){
  console.log(s.url);
  process.on('SIGTERM', function(){ s.close(); process.exit(0); });
  process.on('SIGINT',  function(){ s.close(); process.exit(0); });
});
