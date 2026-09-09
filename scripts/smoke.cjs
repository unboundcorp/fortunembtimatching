#!/usr/bin/env node
/* =====================================================================
   배포 전 검사 — 화면을 실제로 띄워 보고 오류가 0건인지 확인한다
   ---------------------------------------------------------------------
   왜 만들었나 (2026-08-13):
     하루에 사고를 네 번 냈다. 넷 다 "코드는 맞아 보이는데 실제로는 안 도는" 것이었다.

       · 카카오를 붙이면서 함수 정의를 통째로 빠뜨림 → 서비스를 켤 때마다 오류,
         하필 같은 함수 안에 있던 이용권 조회가 통째로 안 돌았다.
         결제해도 유료 해석이 안 열리는 상태로 20분 배포돼 있었다.
       · 뒤로가기를 붙이면서 프로필 수정·삭제가 눌러도 반응이 없게 됐다.
       · 함수 시간 제한을 60초로 잘못 박아 유료 해석이 끝까지 안 만들어졌다.
       · 말투를 존대로 바꾸랬는데 한쪽만 고쳐 AI가 반말로 썼다.

     앞의 두 건은 "화면을 띄워 콘솔 오류가 0건인지" 보는 것만으로 나가기 전에 걸린다.
     사람 눈으로는 안 보이는 종류라 자동으로 막는 편이 낫다.

   쓰는 법
     node scripts/smoke.cjs                       배포본을 검사
     node scripts/smoke.cjs http://localhost:3000 다른 주소를 검사
     BROWSER=/크롬/경로 node scripts/smoke.cjs     크롬 경로를 직접 줄 때

   ★ 확장자가 .cjs인 이유: 이 폴더의 package.json 에 "type":"module" 이 있어서
     .js 로 두면 ES 모듈로 읽혀 require 가 안 된다. 서버 함수(api/*.js)는 ESM 이어야 하므로
     그 설정은 그대로 두고, 이 검사기만 .cjs 로 둔다.

   ★ 이 검사가 통과한다고 기능이 맞다는 뜻은 아니다. "터지지 않는다"만 본다.
     기능이 맞는지는 그때그때 따로 봐야 한다.
   ★ 실패하면 0이 아닌 값으로 끝난다. 배포 파이프라인에 걸어도 된다.
===================================================================== */
const path = require('path');
const os = require('os');
const fsTop = require('fs');

const ARGS = process.argv.slice(2).filter((x) => x.indexOf('--') !== 0);
const FLAGS = process.argv.slice(2).filter((x) => x.indexOf('--') === 0);
/* ★ 2026-09-08 — 검사를 나눠 돌릴 수 있게 했다. 고친 파일은 정적 서버로 띄워 보는데
   그 서버에는 /api 가 없어서(501) 서버 함수 검사가 늘 실패한다. 그래서
   화면 검사는 로컬(--skip-api), 서버 함수 검사는 배포본(--only-api)으로 나눈다. */
const SKIP_API = FLAGS.indexOf('--skip-api') >= 0;
const ONLY_API = FLAGS.indexOf('--only-api') >= 0;
const BASE = ARGS[0] || 'https://fortunembtimatching.vercel.app';
const APP = BASE.replace(/\/+$/, '') + '/fortune.html';
const KEY = 'inyeonjeom.v2';

/* 크롬을 찾는다. 없으면 어디에 두면 되는지 알려주고 멈춘다. */
function chromePath() {
  if (process.env.BROWSER) return process.env.BROWSER;
  const guesses = [
    path.join(os.homedir(), '.cache/puppeteer/chrome/mac_arm-151.0.7922.71/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ];
  const fs = require('fs');
  for (const g of guesses) { try { if (fs.existsSync(g)) return g; } catch (e) {} }
  return null;
}

/* 검사용 프로필. 화면이 그려지려면 프로필이 하나는 있어야 한다. */
/* ★ 2026-09-09 — 화면에 '기기 비우기' 표식(STATE_RESET_ID)이 생겼다. 표식이 없는 저장분은
   열자마자 한 번 비워진다. 그래서 여기 심는 상태에도 붙여야 한다 —
   안 붙이면 프로필이 사라져서 [설정] 화면이 "화면이 안 그려짐"으로 잡힌다(실제로 그랬다).
   ★ 손으로 베껴 적지 말 것 — fortune.html 에서 그때그때 읽는다. */
const STATE_RESET_ID = (function(){
  try{
    const src = fsTop.readFileSync(path.join(__dirname, '..', 'fortune.html'), 'utf8');
    const m = /var STATE_RESET_ID = '([^']+)'/.exec(src);
    return m ? m[1] : null;
  }catch(e){ return null; }
})();
const STATE = {
  resetId: STATE_RESET_ID,
  onboarded: true, mode: 'self', pendingInviteGroup: null, activeId: 'p1',
  profiles: [{
    id: 'p1', name: '검사', mbti: 'ENTJ', gender: 'M', calendarType: 'solar', lunarLeap: false,
    year: 1990, month: 3, day: 15, birthTime: { hour: 9, minute: 0 }, sajuCache: null,
    birthLonKey: 'seoul', birthLon: 126.98, solarTimeAdjust: true,
    timeAdjustMigrated: true, termAccuracyMigrated: true, elementSyncMigrated: true, elementIdxBefore: null,
  }],
  fortuneHistory: [], compatHistory: [], sajuHistory: [], mbtiReportHistory: [],
  entitlements: { items: {}, pass: null, purchases: [] },
  billingConfig: null, interpreterConfig: null, receiptMemos: [],
};

/* 탭마다 '이 글자가 없으면 화면이 안 그려진 것' 하나씩. */
const TABS = [
  ['home', '궁합'], ['today', '운세'], ['saju', '사주'], ['report', '성격'],
  ['chars', '캐릭터'], ['compat', '궁합'], ['history', '기록'], ['settings', '프로필'],
];

/* 서버 함수 — 이 응답이 오면 정상이다.
   ★ 400/402/503도 정상이다. '살아서 제대로 거절한다'는 뜻이기 때문이다.
     500과 연결 실패만 고장으로 본다. */
const APIS = [
  ['/api/entitlements', { kind: 'entitlements' }, [200]],
  ['/api/checkout', {}, [400]],
  ['/api/verify', {}, [200]],
  ['/api/content', {}, [400, 503]],
  ['/api/interpret', {}, [400, 503]],
  ['/api/kakao', { action: 'status' }, [200, 503]],
  ['/api/group', {}, [400, 405]],
  ['/api/room', {}, [400, 405]],
  /* ★ 2026-08-22 추가 — /api/sync 가 methodGuard를 잘못 써서 POST에도 405를 주며
     통째로 죽어 있었다. 문법 검사와 import 검사는 둘 다 통과했다. 실제로 불러보는
     이 표에 없었기 때문에 배포까지 갔다. 창구를 새로 만들면 여기 한 줄을 반드시 늘린다.
     ★ 미로그인 세션이므로 401이 정상이다. 405가 나오면 또 같은 실수를 한 것이다. */
  ['/api/sync', { action: 'get' }, [401]],
];

const w = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const exe = chromePath();
  if (!exe) {
    console.error('크롬을 찾지 못했습니다. BROWSER=/크롬/경로 를 넣어 다시 실행해 주세요.');
    process.exit(2);
  }
  let puppeteer;
  try {
    puppeteer = require(path.join(process.cwd(), 'node_modules/puppeteer-core'));
  } catch (e) {
    try { puppeteer = require('puppeteer-core'); }
    catch (e2) {
      console.error('puppeteer-core 를 찾지 못했습니다. npm i -D puppeteer-core 후 다시 실행해 주세요.');
      process.exit(2);
    }
  }

  const fails = [];
  const note = (ok, what, detail) => {
    console.log(`  ${ok ? '✓' : '✗'} ${what}${detail ? '   ' + detail : ''}`);
    if (!ok) fails.push(what + (detail ? ' — ' + detail : ''));
  };

  const browser = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 1200, deviceScaleFactor: 1 });

  let errs = [];
  page.on('pageerror', (e) => errs.push('JS: ' + String(e.message).slice(0, 140)));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    /* 그림 하나 못 받은 것 같은 잡음은 거른다 — 화면이 죽는 종류가 아니다. */
    if (/favicon|net::ERR|Failed to load resource|status of [45]/.test(t)) return;
    errs.push('console: ' + t.slice(0, 120));
  });

  console.log('검사 대상: ' + APP + (SKIP_API ? '  (서버 함수는 건너뜀)' : ONLY_API ? '  (서버 함수만)' : '') + '\n');

  if(!ONLY_API){
  /* ── 1. 서비스가 뜨는가 · 켤 때 오류가 나는가 ────────────────────────── */
  console.log('[1] 서비스 부팅');
  let res;
  try { res = await page.goto(APP, { waitUntil: 'load', timeout: 45000 }); }
  catch (e) { note(false, '서비스 열기', String(e.message).slice(0, 90)); }
  note(!!res && res.status() === 200, '서비스가 열린다', res ? 'HTTP ' + res.status() : '응답 없음');
  await page.evaluate((k, v) => localStorage.setItem(k, JSON.stringify(v)), KEY, STATE);
  errs = [];
  await page.goto(APP, { waitUntil: 'load' });
  await w(2500);
  note(errs.length === 0, '켤 때 오류 0건', errs[0] || '');

  /* ── 1.5 문법 ──────────────────────────────────────────────────────
     ★ R96 — 화면을 열어 보기 전에 문법부터 본다. 괄호 하나가 빠지면 서비스가 통째로 안 뜨는데,
       그때 [2]는 "여덟 화면 전부 실패"라고만 말해 준다 — 어디가 잘못됐는지는 안 알려준다.
       여기서 잡으면 파일 몇 줄인지까지 나온다(실제로 그렇게 한 번 잡았다). */
  console.log('\n[1.5] 문법');
  try {
    const html = await (await fetch(APP)).text();
    const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const big = blocks.sort((x, y) => y.length - x.length)[0] || '';
    new (require('vm').Script)(big, { filename: 'fortune.html <script>' });
    note(true, '서비스 스크립트 문법', big.length.toLocaleString() + '자');
  } catch (e) {
    note(false, '서비스 스크립트 문법', String(e.message).slice(0, 160));
  }

  /* ── 2. 탭마다 화면이 그려지는가 ─────────────────────────────────── */
  console.log('\n[2] 화면 여덟 개');
  for (const [route, must] of TABS) {
    errs = [];
    /* ★ R93 — 탭 막대는 다섯 개(홈·오늘·내 사주·궁합·더보기)로 줄었다.
       나머지 네 화면은 [더보기] 시트를 거쳐야 닿는다. 예전처럼 data-route 만 찾으면
       버튼이 없어 아무 일도 안 일어나고, 앞 화면이 그대로 남아 "통과"로 읽힌다.
       (실제로 그 함정에 걸렸다 — 없는 버튼을 눌러 놓고 합격이라고 보고했다.) */
    const moved = await page.evaluate((r) => {
      const t = document.querySelector('.tab-btn[data-route="' + r + '"]');
      if (t) { t.click(); return 'tab'; }
      const more = document.querySelector('.tab-btn[data-more]');
      if (!more) return null;
      more.click();
      return 'sheet';
    }, route);
    if (moved === 'sheet') {
      await w(600);
      const picked = await page.evaluate((r) => {
        const names = { report: '성격유형 리포트', chars: '캐릭터 도감', history: '히스토리', settings: '설정' };
        const want = names[r];
        const rows = [...document.querySelectorAll('#activeModal .hd-row')];
        const hit = rows.find((x) => x.textContent.indexOf(want) >= 0);
        if (hit) { hit.click(); return true; }
        return false;
      }, route);
      if (!picked) { note(false, route, '더보기 시트에서 항목을 못 찾음'); continue; }
    } else if (!moved) { note(false, route, '탭도 더보기도 못 찾음'); continue; }
    await w(1200);
    const txt = await page.evaluate(() => (document.querySelector('#main') || { innerText: '' }).innerText);
    /* ★ 2026-09-09 — 동의·로그인 화면에 갇혀 있는데 통과로 읽히던 것을 막는다.
       그 화면의 글에 '궁합'·'운세' 같은 말이 들어 있어서, 여덟 화면 중 일곱이
       **똑같은 443자**인데도 전부 통과였다(실측). 찾는 낱말만 보면 이렇게 새어 나간다. */
    const stuck = txt.indexOf('만 14세 이상이에요') >= 0;
    const drew = txt.length > 120 && txt.indexOf(must) >= 0 && !stuck;
    note(errs.length === 0 && drew, route,
      errs[0] ? errs[0]
        : (stuck ? '동의·로그인 화면에 갇힘 (' + txt.length + '자)'
                 : (drew ? txt.length + '자' : '화면이 안 그려짐 (' + txt.length + '자)')));
  }

  }  /* !ONLY_API */

  /* ── 3. 서버 함수가 살아 있는가 ──────────────────────────────────── */
  if(!SKIP_API){
  /* ★ 서버 함수만 볼 때도 문서를 한 번은 열어야 한다. 안 열면 about:blank 라
     같은 출처로 fetch 를 못 해서 전부 -1 로 나온다(실제로 그렇게 나왔다). */
  if(ONLY_API){ try{ await page.goto(APP, {waitUntil:'load', timeout:45000}); }catch(e){} await w(400); }
  console.log('\n[3] 서버 함수');
  for (const [p, body, okCodes] of APIS) {
    let st = 0;
    try {
      st = await page.evaluate(async (u, b) => {
        const r = await fetch(u, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          credentials: 'include', body: JSON.stringify(b),
        });
        return r.status;
      }, BASE.replace(/\/+$/, '') + p, body);
    } catch (e) { st = -1; }
    note(okCodes.indexOf(st) >= 0, p, 'HTTP ' + st + ' (기대 ' + okCodes.join('/') + ')');
  }

  }  /* !SKIP_API */

  await browser.close();

  console.log('');
  if (fails.length) {
    console.log('실패 ' + fails.length + '건 — 배포하지 마세요');
    fails.forEach((f) => console.log('  · ' + f));
    process.exit(1);
  }
  console.log('전부 통과 — 내보내도 됩니다');
})().catch((e) => {
  console.error('검사 자체가 터졌습니다:', e && e.message);
  process.exit(2);
});
