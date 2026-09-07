#!/usr/bin/env node
/* =====================================================================
   공유 카드 검사 — 카드를 진짜 그려서 빠진 것이 없는지 본다
   ---------------------------------------------------------------------
   왜 만들었나 (2026-09-07):
     카드에 **캐릭터가 통째로 안 그려진 채 나가고 있었다.** 그림 캐시를 찾는 이름
     한 줄이 성별이 생기기 전 이름으로 남아 있었기 때문인데, 오류가 하나도 안 났다.
     같은 날 막대 색도 통째로 죽어 있었다 — canvas 는 CSS 변수를 **조용히 무시한다**.
     둘 다 "터지지 않는" 결함이라 부팅 검사로는 절대 안 잡힌다. 그려 놓고 픽셀을 세야 잡힌다.

   무엇을 보나
     · 카드가 그려지는가 (크기·잉크가 있는가)
     · **캐릭터가 들어 있는가** — 색 가짓수로 본다. 그림이 빠지면 글자뿐이라 색이 확 준다
     · 궁합 카드의 막대가 **제 색으로 칠해지는가** (금색 계열 픽셀이 있는가)
     · 그리는 동안 JS 오류가 0건인가

   ★ 이 검사가 진짜 잡는지 확인했습니다 (2026-09-07): fortune.html 사본에서 그 한 줄을
     옛 버그(`CHAR_IMG_CACHE[key]`)로 되돌려 놓고 돌렸더니 **성향 리포트 카드가
     "그림을 막으면 0% 달라짐"으로 걸렸습니다.** 검사기를 만들면 이렇게 한 번은
     일부러 고장 내서 걸리는지 보십시오 — 안 걸리는 검사가 통과하는 것이 제일 나쁩니다.

   쓰는 법: node scripts/cards.cjs [주소]
===================================================================== */
const L = require('./_lib.cjs');
const BASE = (process.argv[2] || 'http://127.0.0.1:8899').replace(/\/+$/, '');
const APP = BASE + '/fortune.html';

const HIST = [{
  id:'h1', profileId:'p1', relation:'friend', score:73, tier:'강한 인연', at:Date.now(),
  name:'민지', partnerName:'민지',
  inputs:{ b:{ name:'민지', mbti:'INFJ', gender:'F',
    birth:{y:1993, m:7, d:22, hour:14, minute:30, lon:126.98, adjust:true} } },
}];

/* 카드마다 [어디로 가서, 무엇을 누르면, 캐릭터가 몇 명 들어가는가] */
const CARDS = [
  {name:'오늘의 운세', go:/^오늘/,        press:/오늘의 운세 공유하기/,       chars:1},
  {name:'내 사주',     go:/^내 사주/,      press:/사주 요약 카드 저장하기/,     chars:1},
  {name:'성향 리포트', go:/^내 성격유형/,  press:/리포트 요약 공유하기/,        chars:1},
  {name:'궁합',        go:null,            press:/궁합 결과 공유하기/,          chars:2},
];

/* 캔버스를 재는 자 — 색 가짓수·잉크 비율과, 64x64로 줄인 흑백 지문을 함께 돌려준다.
   ★ 지문이 왜 필요한가: 캐릭터가 빠졌는지를 **색 가짓수로는 못 가린다**(실측 149 대 84 —
     글자 테두리만으로도 색이 여든 가지가 넘는다). 그래서 캐릭터 그림을 못 받게 막고
     한 번 더 그려서 **두 그림이 같은지**를 본다. 같으면 카드가 그림을 안 쓰는 것이다.
     이 방법은 카드 종류를 안 가리고, 그리는 자리를 손으로 안 적어도 된다. */
const MEASURE = function(){
  const c = document.querySelector('.modal-box canvas');
  if(!c) return null;
  const ctx = c.getContext('2d');
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const bgi = 4 * (5 * c.width + 5);              /* 왼쪽 위 모서리를 배경색으로 본다 */
  const bg = [d[bgi], d[bgi+1], d[bgi+2]];
  const seen = new Set();
  let ink = 0, gold = 0, total = 0;
  for(let i=0; i<d.length; i+=4*7){               /* 일곱 픽셀에 하나 — 충분하고 빠르다 */
    const r=d[i], g=d[i+1], b=d[i+2];
    total++;
    if(Math.abs(r-bg[0])>10 || Math.abs(g-bg[1])>10 || Math.abs(b-bg[2])>10) ink++;
    seen.add(((r>>4)<<8) | ((g>>4)<<4) | (b>>4));
    /* 금·붉은 계열(막대·강조) — 빨강이 뚜렷이 크고 파랑이 작다 */
    if(r>120 && r-b>60 && g<r-30) gold++;
  }
  /* 64x64 흑백 지문 */
  const N = 128, sig = new Array(N*N);
  for(let sy=0; sy<N; sy++){
    for(let sx=0; sx<N; sx++){
      const px = Math.floor(sx * c.width / N), py = Math.floor(sy * c.height / N);
      const i = 4 * (py * c.width + px);
      sig[sy*N+sx] = (d[i]*299 + d[i+1]*587 + d[i+2]*114) / 1000 | 0;
    }
  }
  return {w:c.width, h:c.height, colors:seen.size,
          inkPct:+(ink*100/total).toFixed(1), goldPct:+(gold*100/total).toFixed(2), sig:sig};
};

(async () => {
  const R = L.reporter('공유 카드');
  const exe = L.chromePath(), pp = L.puppeteer();
  if(!exe || !pp){ console.error('크롬 또는 puppeteer-core 를 못 찾았습니다.'); process.exit(2); }
  const browser = await pp.launch({executablePath:exe, headless:'new', args:['--no-sandbox']});
  const page = await L.openPage(browser, {width:390, height:900,
                 state: L.makeState({compatHistory: HIST})});

  /* 카드 하나를 그려서 재는 절차. blockChar 를 켜면 캐릭터 그림을 못 받게 막는다. */
  async function drawOne(card, blockChar){
    const page = await L.openPage(browser, {width:390, height:900,
                   state: L.makeState({compatHistory: HIST})});
    if(blockChar){
      await page.setRequestInterception(true);
      page.on('request', function(r){
        if(/\/char\/[^/]*\.webp/.test(r.url())) return r.abort();
        r.continue();
      });
    }
    await page.goto(APP, {waitUntil:'load'}); await L.wait(2200);
    if(card.go){ await L.clickText(page, card.go); await L.wait(1800); }
    else {
      await L.clickText(page, /^궁합/); await L.wait(1500);
      await L.clickText(page, /민지/);  await L.wait(2600);
    }
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await L.wait(400);
    page.__errs.length = 0;
    const pressed = await L.clickText(page, card.press);
    if(pressed === null){ await page.close(); return {err:'공유 버튼을 못 찾음'}; }
    await L.wait(2600);
    const m = await page.evaluate(MEASURE);
    const errs = page.__errs.slice();
    await page.close();
    if(!m) return {err:'카드(캔버스)가 안 그려짐'};
    m.errs = errs;
    return m;
  }
  /* 두 지문이 얼마나 다른가 (%) */
  function sigDiff(a, b){
    if(!a || !b || a.length !== b.length) return 100;
    let n = 0;
    for(let i=0;i<a.length;i++) if(Math.abs(a[i]-b[i]) > 8) n++;
    return +(n*100/a.length).toFixed(2);
  }

  for(const card of CARDS){
    const m = await drawOne(card, false);
    if(m.err){ R.bad(card.name, m.err); continue; }
    const detail = m.w+'x'+m.h+' · 색 '+m.colors+'가지 · 잉크 '+m.inkPct+'%';
    if(m.errs.length){ R.bad(card.name, m.errs[0]); continue; }
    if(m.h < 300 || m.w < 300){ R.bad(card.name, '카드가 너무 작다 ' + detail); continue; }
    if(m.inkPct < 3){ R.bad(card.name, '거의 빈 종이다 ' + detail); continue; }
    R.ok(card.name + ' 카드가 그려짐', detail);

    /* ★ 캐릭터 검사 — 그림을 막고 다시 그려서 달라지는지 본다.
       안 달라지면 카드가 그림을 아예 안 쓰는 것이다(2026-09-07에 실제로 그랬다). */
    const mb = await drawOne(card, true);
    if(mb.err){ R.bad(card.name + ' 캐릭터', mb.err); continue; }
    const diff = sigDiff(m.sig, mb.sig);
    /* ★ 문턱을 높게 잡지 마세요. 캐릭터는 카드의 1~2%밖에 안 차지합니다(72px 그림 /
       640x677 카드 = 1.2%). 0.5%로 뒀다가 멀쩡한 카드를 실패로 잡았습니다.
       그림이 정말 안 그려지면 **차이가 정확히 0**입니다 — 그리기는 결정적이라 잡음이 없습니다. */
    R.note(diff > 0.05, card.name + ' 카드에 캐릭터가 들어감',
           '그림을 막으면 ' + diff + '% 달라짐 (' + card.chars + '명)');

    if(card.name === '궁합'){
      /* ★ canvas 는 CSS 변수를 조용히 무시한다 — 막대가 통째로 괘선색으로 그려진 적이 있다.
         금·붉은 계열 픽셀이 아예 없으면 그 사고가 다시 난 것이다. */
      R.note(m.goldPct > 0.3, '궁합 카드 막대·강조가 제 색으로 칠해짐', '금색 계열 ' + m.goldPct + '%');
    }
  }

  await browser.close();
  R.done();
})().catch((e) => { console.error('검사 자체가 터졌습니다:', e && e.message); process.exit(2); });
