/* =====================================================================
   새로 나오게 된 등급 화면을 실제로 띄워 본다 (느린 층)
   ---------------------------------------------------------------------
   2026-09-09 — 등급 자르는 선을 80/74/64/56 으로 옮기면서 **'상극 인연'이 처음으로
   손님 화면에 나가게 됐습니다.** 옛 선(40 미만)에서는 수학적으로 도달할 수 없어서
   그 갈래의 문구·색·별명이 **한 번도 그려진 적이 없습니다.**
   한 번도 안 그려진 자리는 조용히 비어 있어도 아무도 모릅니다 — 그래서 재웁니다.

   ★ 두 끝(상극·찰떡)을 실제로 만들어 화면에 띄우고, 그 갈래의 글이 다 채워지는지,
     세 폭(320·360·390)에서 글자가 넘치지 않는지, JS 오류가 없는지를 봅니다.
   ★ 짝은 손으로 고른 값이 아니라 **찾아서 넣은 값**입니다(기준 프로필 ENFP 1990-03-15 기준).
     점수표를 바꾸면 이 짝의 등급이 달라질 수 있습니다 — 그때는 검사가 실패로 알려줍니다.
===================================================================== */
const L = require('../_lib.cjs');

const ME_TIER = {   /* 기준 프로필과 맞물려 이 등급이 나오는 상대 */
  '상극 인연':   {name:'상극상대', mbti:'ISTP', y:1985, m:1,  d:25},
  '찰떡 인연':   {name:'찰떡상대', mbti:'ISFJ', y:1991, m:7,  d:15},
};

function hist(who){
  return [{
    id:'h1', profileId:'p1', relation:'friend', score:0, tier:'', at:Date.now(),
    name:who.name, partnerName:who.name,
    inputs:{ b:{ name:who.name, mbti:who.mbti, gender:'F',
      birth:{y:who.y, m:who.m, d:who.d, hour:14, minute:30, lon:126.98, adjust:true} } },
  }];
}

(async () => {
  const R = L.reporter('등급 화면(상극·찰떡)');
  const exe = L.chromePath(), pp = L.puppeteer();
  if(!exe || !pp){ console.log('크롬을 못 찾았습니다 — 건너뜁니다'); process.exit(0); }
  const base = process.argv[2];
  const site = base ? {url:base, close:function(){}} : await L.serve(L.ROOT, 0);
  const browser = await pp.launch({executablePath:exe, headless:'new',
    args:['--no-sandbox','--disable-dev-shm-usage']});

  try{
    for(const tier of Object.keys(ME_TIER)){
      const who = ME_TIER[tier];
      R.head('── ' + tier);
      for(const w of [320, 360, 390]){
        const page = await L.openPage(browser, {width:w, height:900,
                       state: L.makeState({compatHistory: hist(who)})});
        await page.goto(site.url + '/fortune.html', {waitUntil:'load'});
        await L.wait(1800);
        await L.clickText(page, /^궁합/);           await L.wait(1200);
        await L.clickText(page, new RegExp(who.name)); await L.wait(2600);

        const m = await page.evaluate(function(t){
          const txt = document.body.innerText;
          const nick = document.querySelector('.csb-nick');
          const num  = document.querySelector('.csb-num');
          /* 화면 안에서 글자가 칸을 넘는 곳 */
          let over = [];
          document.querySelectorAll('#main *').forEach(function(el){
            if(el.children.length) return;
            if(el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0){
              over.push((el.textContent||'').trim().slice(0,24) + ' (' + el.scrollWidth + '>' + el.clientWidth + ')');
            }
          });
          return {
            hasTier: txt.indexOf(t) >= 0,
            nick: nick ? (nick.textContent||'').trim() : '',
            score: num ? (num.textContent||'').trim() : '',
            /* 총평 한 줄 — 등급별로 다른 문장이 들어가는 자리 */
            summaryLen: (function(){
              const b = document.querySelector('.compat-summary-box, .csb-line, .compat-tier-line');
              return b ? (b.textContent||'').trim().length : txt.length;
            })(),
            over: over.slice(0,5),
          };
        }, tier);

        R.note(m.hasTier, tier + ' · ' + w + 'px — 등급 이름이 화면에 나온다', m.score || '');
        R.note(!!m.nick && m.nick.length > 3, tier + ' · ' + w + 'px — 한 줄 별명이 채워진다',
               m.nick || '(비어 있음)');
        R.note(m.over.length === 0, tier + ' · ' + w + 'px — 글자 넘침 0건',
               m.over.join(' | ') || '없음');
        R.note((page.__errs||[]).length === 0, tier + ' · ' + w + 'px — JS 오류 0건',
               (page.__errs||[]).join(' | ') || '없음');
        if(w === 390 && process.env.SHOT){
          await page.screenshot({path:'/tmp/tier_' + (tier==='상극 인연'?'bad':'best') + '.png',
                                 fullPage:true});
        }
        await page.close();
      }
    }
  }catch(err){
    R.bad('검사 중 오류', String(err && err.message).slice(0,160));
  }finally{
    try{ await browser.close(); }catch(e){}
    site.close();
  }
  R.done();
})();
