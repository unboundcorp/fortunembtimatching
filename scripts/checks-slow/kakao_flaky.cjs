/* =====================================================================
   통신이 흔들려도 쓰고 계시던 분을 쫓아내지 않는가 (느린 층)
   ---------------------------------------------------------------------
   2026-09-09 대표님 영상 제보 "왜이러냐 이건" — 로그인해서 홈을 보고 계시던 화면이
   1초 뒤 **동의 화면**으로 바뀌었습니다. 머리글과 탭은 그대로 남은 채였습니다.

   ★ 원인: `kakaoRefresh` 의 `.catch` 가 **물어보지 못한 것을 '안 돼 있다'로** 바꿨습니다
     (`KAKAO.loaded = true` 를 켜는데 `linked` 는 false 그대로 → 관문이 바로 걸림).
     LTE 에서 요청 한 번이 흔들리기만 해도 이렇게 됩니다.

   재는 것 셋:
     ① `/api/kakao` 가 계속 실패해도 — **이 기기에서 로그인이 확인된 적 있으면** 안 쫓아낸다
     ② 서버가 `linked:false` 라고 **분명히 답하면** — 그때는 관문이 걸린다
     ③ 관문이 걸릴 때 머리글·탭이 함께 숨는다 (반쯤 들어와 있는 화면이 안 나온다)
===================================================================== */
const { chromePath, puppeteer, reporter, openPage, wait, ROOT, makeState, STORAGE_KEY }
  = require('../_lib.cjs');
const fs = require('fs');
const path = require('path');
const http = require('http');

const R = reporter('통신이 흔들릴 때');

/* 카카오 답을 마음대로 정하는 작은 서버 */
function serveWith(kakao){
  const html = fs.readFileSync(path.join(ROOT, 'fortune.html'));
  return new Promise(function(resolve){
    const srv = http.createServer(function(req, res){
      const u = String(req.url).split('?')[0];
      if(u.indexOf('/api/kakao') === 0){
        if(kakao === 'fail'){ req.socket.destroy(); return; }   /* 물어보지 못한 상태 */
        res.writeHead(200, {'content-type':'application/json'});
        res.end(JSON.stringify(kakao));
        return;
      }
      if(u.indexOf('/api/') === 0){ res.writeHead(501); res.end(); return; }
      if(u === '/' || /fortune\.html$/.test(u)){
        res.writeHead(200, {'content-type':'text/html; charset=utf-8'}); res.end(html); return;
      }
      res.writeHead(404); res.end();
    });
    srv.listen(0, '127.0.0.1', function(){
      resolve({port:srv.address().port, url:'http://127.0.0.1/'.replace('/','') , close:function(){ try{ srv.close(); }catch(e){} },
               base:'http://127.0.0.1:' + srv.address().port});
    });
  });
}

/* 서버가 느리게 답하게 해서 '아직 모르는 동안'을 실제로 만들어 본다 */
function serveSlow(kakao, delay){
  const html = fs.readFileSync(path.join(ROOT, 'fortune.html'));
  return new Promise(function(resolve){
    const srv = http.createServer(function(req, res){
      const u = String(req.url).split('?')[0];
      if(u.indexOf('/api/kakao') === 0){
        setTimeout(function(){
          res.writeHead(200, {'content-type':'application/json'});
          res.end(JSON.stringify(kakao));
        }, delay);
        return;
      }
      if(u.indexOf('/api/') === 0){ res.writeHead(501); res.end(); return; }
      res.writeHead(200, {'content-type':'text/html; charset=utf-8'}); res.end(html);
    });
    srv.listen(0, '127.0.0.1', function(){
      resolve({base:'http://127.0.0.1:' + srv.address().port,
               close:function(){ try{ srv.close(); }catch(e){} }});
    });
  });
}

async function look(browser, site, seen){
  const st = makeState({});
  if(seen) st.kakaoSeen = true;
  const p = await openPage(browser, {width:390, height:900, state:st});
  await p.goto(site.base + '/fortune.html', {waitUntil:'domcontentloaded'});
  await wait(6000);   /* 재시도(1.2초 · 2.4초)까지 다 지나가게 넉넉히 */
  const m = await p.evaluate(function(){
    const h = document.getElementById('appHeader'), t = document.getElementById('tabbarWrap');
    /* ★ 2026-09-11 — 떠 있는 단추도 함께 본다. 머리글·탭만 숨기고 이것만 남겨 두었더니
       동의 화면 오른쪽 아래에 [궁합도 봐보기] 가 떠 있어, 2026-09-09에 고친
       "반쯤 들어와 있는 화면"이 그대로 다시 났습니다(대표님 영상 제보). */
    const f = document.querySelector('.mode-fab');
    return { txt: document.body.innerText.slice(0, 400),
             headerHidden: !!(h && h.hidden), tabHidden: !!(t && t.hidden),
             fabShown: !!(f && f.getBoundingClientRect().width > 0),
             fabText: f ? (f.innerText || '').trim() : '' };
  });
  m.errs = p.__errs || [];
  await p.close();
  return m;
}

(async function(){
  const pptr = puppeteer(), chrome = chromePath();
  if(!pptr || !chrome){ console.log('크롬을 못 찾았습니다 — 건너뜁니다'); process.exit(0); }
  const browser = await pptr.launch({executablePath: chrome, headless:'new',
    args:['--no-sandbox','--disable-dev-shm-usage']});

  try{
    /* ① 물어보지 못함 + 전에 로그인이 확인된 기기 */
    R.head('── ① 통신이 안 되는데, 전에 로그인했던 기기');
    let site = await serveWith('fail');
    let m = await look(browser, site, true);
    R.note(m.fabShown, '정상 화면에서는 떠 있는 단추가 그대로 있다 (지나치게 숨기지 않는다)',
           m.fabShown ? m.fabText : '사라짐');
    R.note(m.txt.indexOf('만 14세 이상이에요') < 0, '동의 화면으로 쫓아내지 않는다',
           m.txt.slice(0,40).replace(/\n/g,' '));
    R.note(m.txt.indexOf('검사님의 오늘') >= 0 || m.txt.indexOf('오늘') >= 0,
           '서비스 화면이 그대로 보인다');
    site.close();

    /* ② 서버가 분명히 '로그인 안 됨'이라고 답할 때 */
    R.head("── ② 서버가 'linked:false' 라고 분명히 답할 때");
    site = await serveWith({ready:true, linked:false});
    m = await look(browser, site, true);
    R.note(m.txt.indexOf('만 14세 이상이에요') >= 0, '이때는 관문이 걸린다');
    R.note(m.headerHidden && m.tabHidden, '머리글과 탭이 함께 숨는다',
           '머리글 ' + (m.headerHidden?'숨김':'보임') + ' · 탭 ' + (m.tabHidden?'숨김':'보임'));
    R.note(!m.fabShown, '떠 있는 단추도 함께 숨는다 (반쯤 들어와 있는 화면이 안 된다)',
           m.fabShown ? ('보임: ' + m.fabText) : '숨김');
    site.close();

    /* ③ 한 번도 로그인한 적 없는 기기인데 통신도 안 될 때 —
       세 번 물어보고도 못 물어봤으면 그때는 막아야 한다(로그인 필수 규칙). */
    R.head('── ③ 로그인한 적 없는 기기 + 통신 안 됨');
    site = await serveWith('fail');
    m = await look(browser, site, false);
    R.note(m.txt.indexOf('만 14세 이상이에요') >= 0,
           '세 번 다 실패하면 막는다 (로그인 필수가 안 뚫린다)');
    R.note(m.errs.length === 0, 'JS 오류 0건', m.errs.join(' | ') || '없음');
    site.close();
    /* ④ 첫 그림이 깜빡이지 않는가 (2026-09-09 대표님 제보
       "초기 화면이 바로 안 뜨고 기존 화면이 0.5초 정도 보인다")
       ★ 부팅 직후에는 로그인 여부를 모른다. 그때 서비스 화면을 그려 두었다가 동의 화면으로
         바뀌면 **남의 화면이 잠깐 떴다 사라지는 것**이라 고장으로 보인다.
         모르는 동안에는 아무 말도 안 하는 기다림 화면을 둔다. */
    R.head('── ④ 첫 그림이 깜빡이지 않는가');
    for(const c of [
      {name:'쓰던 기기인데 로그인이 안 돼 있음', seen:false, onboarded:true,
       kakao:{ready:true, linked:false}, must:'동의'},
      {name:'로그인해 둔 기기(표식 있음)',       seen:true,  onboarded:true,
       kakao:{ready:true, linked:true},  must:'서비스'},
    ]){
      const site2 = await serveSlow(c.kakao, 500);
      const st = makeState({onboarded:c.onboarded});
      if(c.seen) st.kakaoSeen = true;
      const p2 = await openPage(browser, {width:390, height:900, state:st});
      await p2.evaluateOnNewDocument(function(){
        window.__shots = [];
        setInterval(function(){
          try{
            var t = document.body ? document.body.innerText : '';
            var kind = t.indexOf('잠시만요') >= 0 ? '기다림'
                     : (t.indexOf('만 14세 이상이에요') >= 0 ? '동의' : (t.trim() ? '서비스' : '빈화면'));
            var last = window.__shots[window.__shots.length-1];
            if(!last || last !== kind) window.__shots.push(kind);
          }catch(e){}
        }, 20);
      });
      await p2.goto(site2.base + '/fortune.html', {waitUntil:'load'});
      await wait(2200);
      const shots = await p2.evaluate(function(){ return window.__shots; });
      /* 틀린 화면이 먼저 뜨면 안 된다 — 기다림에서 곧장 제 화면으로 가야 한다 */
      const bad = shots.filter(function(x){ return x !== '기다림' && x !== c.must && x !== '빈화면'; });
      R.note(bad.length === 0 && shots[shots.length-1] === c.must,
             c.name + ' — 틀린 화면이 안 보인다', shots.join(' → '));
      await p2.close(); site2.close();
    }
  }catch(err){
    R.bad('검사 중 오류', String(err && err.message).slice(0,160));
  }finally{
    try{ await browser.close(); }catch(e){}
  }
  R.done();
})();
