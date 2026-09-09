#!/usr/bin/env node
/* =====================================================================
   배포본 건강 검사 — "라이브에서 지금 문제가 있나?" 한 줄로 보는 것
   ---------------------------------------------------------------------
   2026-09-09 대표님 지시 "라이브 나고 문제나면 대안을 마련해야지"

   verify.sh 는 **내보내기 전** 검사입니다. 이건 **내보낸 뒤** 검사입니다.
   손님이 실제로 쓰는 주소에 대고 재고, 무엇이 죽었는지 사람 말로 알려줍니다.

       node output/fortune/scripts/live.cjs
       node output/fortune/scripts/live.cjs https://다른주소

   ★ 이 검사는 **아무것도 고치지 않습니다.** 읽기만 합니다 — 라이브에 대고 도는 것이라
     쓰기를 섞으면 손님 자료를 건드리게 됩니다.
   ★ 여기서 실패가 나오면 되돌리는 법은 output/fortune/ROLLBACK.md 에 있습니다.
===================================================================== */
const fs = require('fs');
const path = require('path');
const { chromePath, puppeteer, reporter, openPage, wait, ROOT } = require('./_lib.cjs');

const BASE = (process.argv[2] || 'https://www.inyeonjeom.kr').replace(/\/+$/, '');
const APIS = [
  ['/api/entitlements', {kind:'entitlements'}, [200]],
  ['/api/checkout', {}, [400]],
  ['/api/verify', {}, [200]],
  ['/api/content', {}, [400,503]],
  ['/api/interpret', {}, [400,503]],
  ['/api/kakao', {action:'status'}, [200,503]],
  ['/api/group', {}, [400,405]],
  ['/api/room', {}, [400,405]],
  ['/api/sync', {action:'get'}, [401]],
];

(async () => {
  const R = reporter('배포본 건강 검사 (' + BASE + ')');
  const exe = chromePath(), pp = puppeteer();
  if(!exe || !pp){ console.log('크롬을 못 찾았습니다 — 건너뜁니다'); process.exit(0); }
  const browser = await pp.launch({executablePath:exe, headless:'new',
    args:['--no-sandbox','--disable-dev-shm-usage']});

  try{
    /* ── 1. 지금 나가 있는 것이 내 손의 파일과 같은가 ───────────────
       다른 세션이 먼저 올렸거나 배포가 실패해 옛 파일이 남아 있는 것을 여기서 잡는다. */
    R.head('── 1. 지금 나가 있는 파일');
    const page = await openPage(browser, {width:390, height:900});
    const res = await page.goto(BASE + '/fortune.html?live=' + Date.now(), {waitUntil:'load'});
    R.note(res && res.status() === 200, '페이지가 열린다', 'HTTP ' + (res ? res.status() : '연결 실패'));
    /* ★ 길이를 못 읽으면 **통과시키지 않는다.** 처음에 '못 읽으면 통과'로 짰다가
       content-length 가 안 와서 조용히 통과하는 것을 잡았다 — 그게 거짓 통과다.
       머리글이 없으면 몸통을 직접 세어 본다. */
    /* ★ 바이트로 재지 않는다. 압축돼 오면 content-length 가 없고, 몸통을 받아 세면
       **글자 수**라 한글이 섞인 순간 바이트 수와 안 맞는다(실측 130만 대 188만).
       양쪽 다 글자 수로 세야 견줄 수 있다. */
    let liveLen = 0;
    try{ liveLen = (await res.text()).length; }catch(e){}
    let localLen = 0;
    try{ localLen = fs.readFileSync(path.join(ROOT, 'fortune.html'), 'utf8').length; }catch(e){}
    R.note(liveLen > 0 && localLen > 0 && liveLen === localLen,
           '나가 있는 파일이 내 손의 파일과 같다',
           liveLen + ' / ' + localLen + ' 글자'
           + (liveLen && localLen && liveLen !== localLen
              ? '  ← 배포가 아직 안 끝났거나, 다른 곳에서 먼저 올렸습니다' : ''));

    /* ★ 2초로는 모자랐습니다(실측 — 배포본에서 거짓 실패 2건). 1.8MB 짜리 파일을
       내려받아 파싱하고 /api/kakao 왕복까지 끝나야 화면이 정해집니다. 넉넉히 기다립니다. */
    await wait(5000);
    R.note((page.__errs||[]).length === 0, '켜자마자 나는 JS 오류가 없다',
           (page.__errs||[]).join(' | ') || '없음');

    /* ── 2. 손님이 들어올 수 있는가 ────────────────────────────────
       ★ 로그인이 예외 없이 필수라, 카카오가 안 되면 서비스 전체가 멈춥니다. */
    R.head('── 2. 손님이 들어올 수 있는가');
    const txt = await page.evaluate(function(){ return document.body.innerText; });
    R.note(txt.indexOf('만 14세 이상이에요') >= 0, '동의 화면이 뜬다 (관문이 살아 있다)');
    R.note(txt.indexOf('동의하고 시작하기') >= 0, '[동의하고 시작하기] 단추가 있다');

    /* ── 3. 서버 창구 아홉 개 ──────────────────────────────────── */
    R.head('── 3. 서버 창구');
    for(const [p, body, ok] of APIS){
      let st = 0, body2 = '';
      try{
        const r = await page.evaluate(async function(u, b){
          const r = await fetch(u, {method:'POST', headers:{'content-type':'application/json'},
            credentials:'include', body: JSON.stringify(b)});
          return {st:r.status, t:(await r.text()).slice(0,200)};
        }, BASE + p, body);
        st = r.st; body2 = r.t;
      }catch(e){ st = -1; }
      R.note(ok.indexOf(st) >= 0, p, 'HTTP ' + st);
      if(p === '/api/kakao' && st === 200){
        let ready = null;
        try{ ready = JSON.parse(body2).ready; }catch(e){}
        R.note(ready === true,
               '★ 카카오 로그인이 켜져 있다 — false면 아무도 서비스에 못 들어옵니다',
               'ready=' + String(ready));
      }
    }

    /* ── 4. 결제 키가 test 인가 live 인가 ─────────────────────────
       ★ 파는 중인데 test 키면 매출이 0원입니다. 반대로 아직 안 파는데 live 면
         손님에게 진짜 돈이 청구됩니다. 어느 쪽인지 **눈으로 보이게** 적습니다. */
    R.head('── 4. 결제 키');
    /* 클라이언트 키 자체는 주문이 있어야 나오는 /api/pay 안에만 있다. 대신 서버가
       `testPayment` 한 칸으로 알려준다 — 화면의 "테스트 결제입니다" 띠와 같은 값이다. */
    let tp = null;
    try{
      tp = await page.evaluate(async function(u){
        const r = await fetch(u, {method:'POST', headers:{'content-type':'application/json'},
          credentials:'include', body: JSON.stringify({kind:'entitlements'})});
        const d = await r.json().catch(function(){ return {}; });
        return (d && typeof d.testPayment === 'boolean') ? d.testPayment : null;
      }, BASE + '/api/entitlements');
    }catch(e){}
    if(tp === null){ R.bad('결제 키가 test 인지 live 인지 확인 못 함', 'testPayment 칸이 안 왔습니다'); }
    else if(tp){ R.ok('지금은 test 키입니다', '결제창에 "테스트 결제입니다"가 뜨고 매출은 0원입니다'); }
    else { R.ok('지금은 live 키입니다', '실제로 돈이 청구됩니다'); }

    await page.close();
  }catch(err){
    R.bad('검사 중 오류', String(err && err.message).slice(0,160));
  }finally{
    try{ await browser.close(); }catch(e){}
  }
  R.done();
})();
