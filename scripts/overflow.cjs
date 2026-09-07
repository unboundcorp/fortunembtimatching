#!/usr/bin/env node
/* =====================================================================
   글자 넘침 검사 — 좁은 화면에서 글자가 잘리는가
   ---------------------------------------------------------------------
   왜 만들었나 (2026-09-04 대표님 지시 "줄바꿈 텍스트 짤림 현상은 일어나지 않게"):
     화면에 글을 붙일 때마다 손으로 폭 390을 재 왔다. 손으로 재면 빠뜨린다.
     여기서 화면 여덟 개 + 안내 문서를 네 폭(320·360·390·1280)에서 한꺼번에 잰다.

   ★ 1280도 재는 이유: PC에서도 칸은 420px이다(2026-09-05 대표님 지시). 그런데
     반응형 규칙은 **화면 폭** 기준이라 좁은 화면용 규칙이 PC에서 저절로 안 걸린다.
     그래서 PC에서만 다르게 깨지는 자리가 생긴다.

   쓰는 법: node scripts/overflow.cjs [주소]
===================================================================== */
const L = require('./_lib.cjs');
const BASE = (process.argv[2] || 'http://127.0.0.1:8899').replace(/\/+$/, '');
const APP = BASE + '/fortune.html';

const WIDTHS = [320, 360, 390, 1280];
const TABS = ['home','today','saju','report','chars','compat','history','settings'];
const DOCS = ['서비스 소개','사주 가이드','성격유형 가이드','자주 묻는 질문','이용약관','개인정보처리방침'];

/* ★ 이미 알고 있는 것 — 이번 변경 때문이 아닌 자리다. 새 넘침만 걸리게 하려고 둔다.
   ★ 여기에 줄을 늘릴 때는 **왜 괜찮은지**를 반드시 함께 적으십시오. 이유 없이 늘리면
     이 검사는 그냥 꺼진 검사가 됩니다. */
const KNOWN = [
  {sel:'hd-figure', why:'홈 숫자 칸 — 390에서도 2px 넘침. 2026-09-05 이전부터 있던 것', max:4},
  {sel:'char-dex-item', why:'도감 칸 — 320·360에서 캐릭터 이름이 칸보다 김. 2026-09-05 확인', max:40},
];
function known(cls, over){
  return KNOWN.some(function(k){ return String(cls).indexOf(k.sel) >= 0 && over <= k.max; });
}

const SCAN = function(){
  const out = [];
  const roots = [document.querySelector('#main'), document.querySelector('.modal-box')].filter(Boolean);
  roots.forEach(function(root){
    root.querySelectorAll('*').forEach(function(e){
      if(!e.clientWidth) return;
      const over = e.scrollWidth - e.clientWidth;
      if(over <= 1) return;
      /* 일부러 옆으로 굴리는 자리(표·코드)는 넘치는 것이 정상이다 */
      const ov = getComputedStyle(e).overflowX;
      if(ov === 'auto' || ov === 'scroll') return;
      out.push({cls: String(e.className || e.tagName).slice(0,40), over: over,
                w: e.scrollWidth + '>' + e.clientWidth,
                txt: String(e.textContent||'').trim().slice(0,24)});
    });
  });
  return out;
};

(async () => {
  const R = L.reporter('글자 넘침');
  const exe = L.chromePath(), pp = L.puppeteer();
  if(!exe || !pp){ console.error('크롬 또는 puppeteer-core 를 못 찾았습니다.'); process.exit(2); }
  const browser = await pp.launch({executablePath:exe, headless:'new', args:['--no-sandbox']});
  const page = await L.openPage(browser, {width:390, height:1400});

  let skipped = 0;
  for(const W of WIDTHS){
    R.head('[폭 ' + W + 'px]');
    await page.setViewport({width:W, height:1400});
    await page.goto(APP, {waitUntil:'load'}); await L.wait(2000);

    for(const route of TABS){
      const moved = await page.evaluate(function(r){
        const t = document.querySelector('.tab-btn[data-route="' + r + '"]');
        if(t){ t.click(); return 'tab'; }
        const m = document.querySelector('.tab-btn[data-more]');
        if(!m) return null;
        m.click(); return 'sheet';
      }, route);
      if(moved === 'sheet'){
        await L.wait(600);
        await page.evaluate(function(r){
          const names = {report:'성격유형 리포트', chars:'캐릭터 도감', history:'히스토리', settings:'설정'};
          const hit = [...document.querySelectorAll('#activeModal .hd-row')]
            .find(function(x){ return x.textContent.indexOf(names[r]) >= 0; });
          if(hit) hit.click();
        }, route);
      }
      await L.wait(1100);
      const found = await page.evaluate(SCAN);
      const real = found.filter(function(f){ return !known(f.cls, f.over); });
      skipped += found.length - real.length;
      R.note(real.length === 0, route,
             real.length ? real.slice(0,2).map(function(f){ return f.cls+' '+f.w+' 「'+f.txt+'」'; }).join(' | ')
                         : '넘침 0건');
    }

    for(const doc of DOCS){
      await page.goto(APP, {waitUntil:'load'}); await L.wait(1500);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await L.wait(300);
      const got = await L.clickText(page, new RegExp('^' + doc + '$'), {all:true});
      if(got === null){ R.bad(doc, '링크를 못 찾음'); continue; }
      await L.wait(1300);
      const found = await page.evaluate(SCAN);
      const real = found.filter(function(f){ return !known(f.cls, f.over); });
      skipped += found.length - real.length;
      R.note(real.length === 0, doc,
             real.length ? real.slice(0,2).map(function(f){ return f.cls+' '+f.w+' 「'+f.txt+'」'; }).join(' | ')
                         : '넘침 0건');
    }
  }
  if(skipped) console.log('\n(이미 알고 있는 넘침 ' + skipped + '건은 건너뛰었습니다 — KNOWN 목록 참고)');

  await browser.close();
  R.done();
})().catch((e) => { console.error('검사 자체가 터졌습니다:', e && e.message); process.exit(2); });
