#!/usr/bin/env node
/* =====================================================================
   공개 페이지 둘 — 로그인 없이 주소로 열리는가 (느린 층)
   ---------------------------------------------------------------------
   2026-09-16 대표님 지시 — 토스페이먼츠 심사가 **"결제 상품/서비스 확인 URL"**과
   **"환불정책 확인 URL"**을 요구합니다. 우리는 카카오 로그인이 필수라, 이 두 화면이
   관문 뒤에 있으면 심사하시는 분이 아예 못 봅니다.

   ★ **로그인 관문을 켜 놓고(= linked:false) 재야 뜻이 있습니다.** `_lib.serve` 는
     검사 편의를 위해 "로그인돼 있다"고 답하므로, 여기서는 **자기 가짜 서버**로
     로그인 안 된 상태를 만들어 잽니다. 그렇게 안 하면 관문을 없애도 통과합니다.
   ★ 금액은 `PRODUCTS` 에서 **실제로 읽어** 화면과 대조합니다. 검사기에 숫자를 베껴
     적으면 값을 바꾼 날 둘이 갈라지고, 갈라진 줄 아무도 모릅니다.
   ★ 토스 규정: "구매자가 서비스제공기간을 인지할 수 있도록 상품페이지에 명확히 기재".
     그래서 상품 수만큼 제공기간 줄이 있는지도 봅니다.
===================================================================== */
const http = require('http');
const fs = require('fs');
const path = require('path');
const L = require('../_lib.cjs');

const ROOT = path.join(__dirname, '..', '..');

/* 로그인 안 된 손님(= 심사하시는 분)을 흉내 내는 서버 */
function serveNoLogin(){
  return new Promise(function(r){
    const srv = http.createServer(function(req, res){
      const u = decodeURIComponent(String(req.url).split('?')[0]);
      if(u.indexOf('/api/kakao') === 0){
        res.writeHead(200, {'content-type':'application/json'});
        return res.end(JSON.stringify({ready:true, linked:false}));
      }
      if(u.indexOf('/api/') === 0){ res.writeHead(501); return res.end(); }
      fs.readFile(path.join(ROOT, u === '/' ? '/index.html' : u), function(e, b){
        if(e){ res.writeHead(404); return res.end(); }
        res.writeHead(200); res.end(b);
      });
    });
    srv.listen(0, '127.0.0.1', function(){
      r({url:'http://127.0.0.1:' + srv.address().port, close:function(){ try{ srv.close(); }catch(e){} }});
    });
  });
}

/* 화면 파일에서 상품 금액을 그대로 읽어 온다 (베껴 적지 않는다) */
function pricesFromSource(){
  const src = fs.readFileSync(path.join(ROOT, 'fortune.html'), 'utf8');
  const out = {};
  ['saju_full','mbti_full','compat_full','premium_pass'].forEach(function(k){
    const m = new RegExp(k + ":\\s*\\{[^}]*?price:\\s*(\\d+)").exec(src);
    if(m) out[k] = Number(m[1]);
  });
  return out;
}

(async () => {
  const R = L.reporter('공개 페이지 (상품·환불)');
  const srv = await serveNoLogin();
  const browser = await L.puppeteer().launch({executablePath: L.chromePath(), headless:'new',
    args:['--no-sandbox']});
  const price = pricesFromSource();
  const state = () => L.makeState({onboarded:false, profiles:[], activeId:null});
  const won = (n) => Number(n).toLocaleString('ko-KR') + '원';

  R.head('① 로그인 없이 열리는가');
  const p1 = await L.openPage(browser, {width:390, state: state()});
  await p1.goto(srv.url + '/fortune.html#pricing', {waitUntil:'networkidle2'});
  await L.wait(1500);
  let o = await p1.evaluate(() => ({
    text: ((document.querySelector('#main')||{}).innerText || ''),
    body: document.body.innerText || '',
    hash: location.hash,
  }));
  R.note(!/만 14세 이상이에요/.test(o.text), '동의 화면에 안 갇힌다 (관문을 비켜 간다)');
  R.note(/상품과 가격/.test(o.text), '상품 화면이 그려진다');
  R.note(o.hash === '#pricing', '주소에 #pricing 이 남는다', o.hash || '(없음)');

  R.head('② 값을 화면 상품표에서 읽어 오는가');
  R.note(Object.keys(price).length === 4, '상품 넷의 금액을 소스에서 읽었다', JSON.stringify(price));
  Object.keys(price).forEach(function(k){
    R.note(o.text.indexOf(won(price[k])) >= 0, k + ' 금액이 화면에 있다', won(price[k]));
  });

  R.head('③ 토스가 요구하는 고지가 있는가');
  const provides = (o.text.match(/서비스 제공기간/g) || []).length;
  R.note(provides === 4, '상품마다 서비스 제공기간이 적혀 있다', provides + '개');
  R.note(/정기 결제는 없어요|정기 결제가 없/.test(o.text), '정기 결제가 없다고 적었다');
  R.note(/청약철회가 제한/.test(o.text), '열람하면 청약철회가 제한된다고 적었다');
  R.note(/사업자등록번호|통신판매/.test(o.body), '사업자 정보가 펼쳐져 있다');

  R.head('④ 환불정책 페이지');
  const p2 = await L.openPage(browser, {width:390, state: state()});
  await p2.goto(srv.url + '/fortune.html#refund', {waitUntil:'networkidle2'});
  await L.wait(1500);
  let r2 = await p2.evaluate(() => ({
    text: ((document.querySelector('#main')||{}).innerText || ''),
    hash: location.hash,
  }));
  R.note(!/만 14세 이상이에요/.test(r2.text), '동의 화면에 안 갇힌다');
  R.note(r2.hash === '#refund', '주소에 #refund 가 남는다', r2.hash || '(없음)');
  R.note(/7일 이내에 청약철회/.test(r2.text), '7일 기한이 적혀 있다');
  R.note(/제17조 제2항/.test(r2.text), '근거 법조문이 적혀 있다');
  R.note(/3영업일/.test(r2.text), '처리 기한이 적혀 있다');

  R.head('⑤ 새로고침해도 같은 화면인가 (즐겨찾기·심사 재방문)');
  await p2.reload({waitUntil:'networkidle2'});
  await L.wait(1500);
  const after = await p2.evaluate(() => ({hash:location.hash,
    text:((document.querySelector('#main')||{}).innerText||'').slice(0,40)}));
  R.note(after.hash === '#refund' && /환불/.test(after.text),
         '새로고침 뒤에도 환불 정책이다', after.hash + ' · ' + after.text.replace(/\n/g,' '));

  R.head('⑥ 법 조항을 두 벌로 베껴 두지 않았는가');
  const src = fs.readFileSync(path.join(ROOT, 'fortune.html'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const dup = (src.match(/이용자는 결제일로부터 7일 이내에 청약철회를 할 수 있습니다/g) || []).length;
  R.note(dup === 1, '제8조 본문이 한 벌만 있다 (약관·환불 페이지가 같이 읽는다)', dup + '곳');

  R.head('⑦ 서비스로 돌아가는 길이 있는가 (2026-09-16 대표님 지적)');
  const btns = await p1.evaluate(() => [...document.querySelectorAll('#main button')]
    .map(b => (b.textContent||'').trim()));
  R.note(btns.some(t => /인연점 홈으로/.test(t)), '맨 위에 [← 인연점 홈으로] 가 있다');
  R.note(btns.some(t => /^인연점 시작하기$/.test(t)), '맨 아래에 [인연점 시작하기] 가 있다');
  R.note((await p1.evaluate(() => document.querySelectorAll('#main .scroll-card').length)) >= 5,
         '상품마다 카드로 나뉘어 있다');
  await L.clickText(p1, /인연점 홈으로/, {all:true});
  await L.wait(900);
  const back = await p1.evaluate(() => ({hash:location.hash,
    consent:/만 14세 이상이에요/.test(document.body.innerText||'')}));
  R.note(back.consent === true, '누르면 서비스 입구(동의·로그인 화면)로 간다');
  R.note(back.hash === '', '서비스로 돌아가면 주소에서 해시가 빠진다', back.hash || '(없음)');

  R.note(p1.__errs.length === 0, '상품 화면 JS 오류 0건', p1.__errs[0] || '');
  R.note(p2.__errs.length === 0, '환불 화면 JS 오류 0건', p2.__errs[0] || '');

  await browser.close(); srv.close();
  R.done();
})();
