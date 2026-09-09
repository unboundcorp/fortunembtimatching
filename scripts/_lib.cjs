/* =====================================================================
   검사기 공용 부품
   ---------------------------------------------------------------------
   왜 만들었나 (2026-09-07 대표님 지시 "다 잡히는 방법이 없어?" → "1) 해라"):
     그때그때 임시 폴더에 검사 스크립트를 만들어 쓰고 버렸다. 116개를 만들었는데
     저장소에 남은 건 smoke.cjs 하나뿐이었다. 그래서 8월에 잡았던 종류의 결함을
     9월에 똑같이 다시 냈다. **검사가 쌓이지 않는 것이 진짜 문제였다.**
     여기 모아 두면 새 검사를 만들 때 이 부품을 가져다 쓰면 되고, 검사가 늘어난다.

   ★ 이 폴더의 package.json 에 "type":"module" 이 있어서 .cjs 로 둔다(smoke.cjs와 같은 이유).
===================================================================== */
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');

const ROOT = path.join(__dirname, '..');          /* output/fortune */

/* ── 크롬 찾기 (smoke.cjs와 같은 규칙) ───────────────────────────── */
function chromePath(){
  if(process.env.BROWSER) return process.env.BROWSER;
  const guesses = [
    path.join(os.homedir(), '.cache/puppeteer/chrome/mac_arm-151.0.7922.71/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  for(const g of guesses){ try{ if(fs.existsSync(g)) return g; }catch(e){} }
  return null;
}
function puppeteer(){
  const tries = [
    path.join(ROOT, '../../node_modules/puppeteer-core'),   /* 프로젝트 루트 */
    path.join(process.cwd(), 'node_modules/puppeteer-core'),
    'puppeteer-core',
  ];
  for(const t of tries){ try{ return require(t); }catch(e){} }
  return null;
}

/* ── 검사용 프로필 ────────────────────────────────────────────────
   ★ 여기 값을 바꾸면 모든 검사가 함께 바뀐다. 한 검사만 다른 값이 필요하면
     makeState({profiles:[...]}) 로 그 검사에서만 갈아 끼운다. */
function person(o){
  return Object.assign({
    id:'p1', name:'검사', mbti:'ENFP', gender:'M', calendarType:'solar', lunarLeap:false,
    year:1990, month:3, day:15, birthTime:{hour:9,minute:0}, sajuCache:null,
    birthLonKey:'seoul', birthLon:126.98, solarTimeAdjust:true,
    timeAdjustMigrated:true, termAccuracyMigrated:true, elementSyncMigrated:true, elementIdxBefore:null,
  }, o||{});
}
function makeState(o){
  return Object.assign({
    onboarded:true, mode:'self', pendingInviteGroup:null, activeId:'p1',
    profiles:[person({})],
    fortuneHistory:[], compatHistory:[], sajuHistory:[], mbtiReportHistory:[],
    entitlements:{items:{}, pass:null, purchases:[]},
    billingConfig:null, interpreterConfig:null, receiptMemos:[],
  }, o||{});
}
const STORAGE_KEY = 'inyeonjeom.v2';

/* ── 정적 서버 ────────────────────────────────────────────────────
   ★ 왜 필요한가: verify.sh 가 오래도록 **배포본**을 검사하고 있었다. 그래서
     "방금 고친 파일"은 한 번도 안 보고 통과 도장을 찍었다(2026-09-07 확인).
     이제 고친 파일을 직접 띄워서 검사한다.
   ★ /api/* 는 501을 돌려준다 — 정적 서버라 서버 함수가 없다. 그건 고장이 아니다.
     서버 함수는 배포본에 대고 따로 본다(smoke.cjs --api-only). */
const MIME = {'.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml',
  '.ico':'image/x-icon', '.woff2':'font/woff2', '.txt':'text/plain; charset=utf-8'};
function serve(dir, port){
  return new Promise(function(resolve){
    const srv = http.createServer(function(req, res){
      const u = decodeURIComponent(String(req.url).split('?')[0]);
      /* ★ 2026-09-09 — 카카오 로그인이 예외 없이 필수가 되면서(대표님 지시), 로그인 상태를
         모르는 브라우저는 **어느 화면도 못 봅니다.** 그러면 화면 검사가 전부 동의 화면만
         보게 됩니다. 그래서 이 시험용 서버는 `/api/kakao` 에만 "로그인돼 있다"고 답합니다 —
         검사기들이 보려는 것은 로그인한 손님이 보는 화면이기 때문입니다.
         ★ 관문 자체는 `checks-slow/consent_login.cjs` 가 **자기 가짜 서버로** 따로 봅니다
           (로그인 안 함 · 카카오 꺼짐 · 이미 쓰던 분). 여기서 통과시켜도 그 검사는 그대로 돕니다.
         ★ 나머지 `/api/*` 는 그대로 501 입니다. 그건 고장이 아니라 정적 서버라서입니다. */
      if(u.indexOf('/api/kakao') === 0){
        res.writeHead(200, {'content-type':'application/json; charset=utf-8'});
        res.end(JSON.stringify({ready:true, linked:true, since:Date.now()}));
        return;
      }
      if(u.indexOf('/api/') === 0){ res.writeHead(501); res.end('no api on static server'); return; }
      let f = path.join(dir, u === '/' ? '/index.html' : u);
      if(!f.startsWith(dir)){ res.writeHead(403); res.end(); return; }
      fs.readFile(f, function(err, buf){
        if(err){ res.writeHead(404); res.end(); return; }
        res.writeHead(200, {'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream'});
        res.end(buf);
      });
    });
    srv.listen(port||0, '127.0.0.1', function(){
      resolve({ srv:srv, port:srv.address().port,
                url:'http://127.0.0.1:' + srv.address().port,
                close:function(){ try{ srv.close(); }catch(e){} } });
    });
  });
}

/* ── 결과 모으기 ──────────────────────────────────────────────────
   ★ 통과만 세지 말고 **무엇이 실패했는지**를 들고 있어야 한다. 실패 목록이 없으면
     "몇 건 실패"만 남고 고칠 자리를 못 찾는다. */
function reporter(title){
  const fails = [];
  let pass = 0;
  return {
    head: function(t){ console.log('\n' + t); },
    ok: function(what, detail){ pass++; console.log('  ✓ ' + what + (detail ? '   ' + detail : '')); },
    bad: function(what, detail){ fails.push(what + (detail ? ' — ' + detail : ''));
      console.log('  ✗ ' + what + (detail ? '   ' + detail : '')); },
    note: function(cond, what, detail){ cond ? this.ok(what, detail) : this.bad(what, detail); },
    skip: function(what, why){ console.log('  · ' + what + ' — 건너뜀 (' + why + ')'); },
    done: function(){
      console.log('');
      if(fails.length){
        console.log(title + ' — 실패 ' + fails.length + '건 (통과 ' + pass + ')');
        fails.forEach(function(f){ console.log('  · ' + f); });
        process.exit(1);
      }
      console.log(title + ' — 통과 ' + pass + '건 · 실패 0건');
      process.exit(0);
    },
    fails: fails,
  };
}

/* ── 페이지 만들기 (오류를 자동으로 모은다) ──────────────────────── */
async function openPage(browser, opt){
  opt = opt || {};
  const page = await browser.newPage();
  await page.setViewport({width: opt.width||390, height: opt.height||900,
                          deviceScaleFactor: opt.scale||1});
  const errs = [];
  page.on('pageerror', function(e){ errs.push('JS: ' + String(e.message).slice(0,140)); });
  page.on('console', function(m){
    if(m.type() !== 'error') return;
    const t = m.text();
    /* 그림 한 장 못 받은 잡음은 거른다 — 화면이 죽는 종류가 아니다 */
    if(/favicon|net::ERR|Failed to load resource|status of [45]/.test(t)) return;
    errs.push('console: ' + t.slice(0,120));
  });
  const state = opt.state || makeState();
  /* hook:true 를 주면 fortune.html 맨 끝의 검사 통로가 열린다(window.__INYEON_TEST__).
     ★ 문서를 읽기 **전에** 심어야 한다 — 나중에 심으면 이미 지나간 뒤다. */
  await page.evaluateOnNewDocument(function(k, v, hook){
    try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){}
    if(hook) window.__INYEON_TEST__ = true;
  }, STORAGE_KEY, state, !!opt.hook);
  page.__errs = errs;
  return page;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* 글자로 버튼을 찾아 누른다. 누른 글자를 돌려주고, 못 찾으면 null.
   ★ 유료 풀이의 circleCTA 는 글자가 <button> 밖에 있다 — 글자 요소에서 위로
     올라가며 진짜 button 을 찾는다. 안 그러면 눌러도 아무 일이 안 일어난다. */
async function clickText(page, re, opt){
  return page.evaluate(function(src, flags, all){
    const rx = new RegExp(src, flags);
    const btns = [...document.querySelectorAll(all ? 'button, [role="button"], a[href]' : 'button')];
    let hit = btns.find(function(x){ return rx.test((x.textContent||'').trim()) && !x.disabled; });
    if(!hit){
      const node = [...document.querySelectorAll('span,div,p,h1,h2,h3,h4,li')]
        .find(function(x){ return rx.test((x.textContent||'').trim()) && x.children.length===0; });
      if(node){ let up = node; for(let i=0;i<5 && up;i++){ if(up.tagName==='BUTTON'){ hit = up; break; } up = up.parentElement; } }
    }
    if(!hit) return null;
    hit.click();
    return (hit.textContent||'').trim().slice(0,40);
  }, re.source || String(re), re.flags || '', !!(opt && opt.all));
}

module.exports = { ROOT, chromePath, puppeteer, person, makeState, STORAGE_KEY,
                   serve, reporter, openPage, wait, clickText };
