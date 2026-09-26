/* 결제 권유 문구 · '걸리는 게 하나 있어요' 걸이 · 넘치는/모자란 기운 · 사주×성격유형 엮기 (2026-09-26 대표님 지시)
   ★ 걸이와 엮기 문장은 **계산에서 나온 사실만** 말해야 한다. 걸이가 "물 기운이 없어요"라고 했는데
     실제로 물이 두 개 있으면 그건 손님을 속여 결제를 받는 문장이 된다. 그래서 여기서는 문장을
     다시 읽어 **그 말이 계산과 맞는지**를 사람 수백 명으로 잰다.
   ★ 권유 문구(PRODUCTS.desc)가 약속하는 것이 실제로 열리는 것과 맞는지도 본다(표시광고). */
const fs = require('fs'); const path = require('path');
const L = require(path.join(__dirname, '..', '_lib.cjs'));
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'fortune.html'), 'utf8');
const prompt = fs.readFileSync(path.join(__dirname, '..', '..', 'api', '_lib', 'aiprompt.js'), 'utf8');
let pass = 0, fail = 0;
function ok(name, cond, extra){ if(cond){ pass++; } else { fail++; console.log('  ✗', name, extra||''); } }

/* ① 소스 — 재료가 AI 에 실제로 실려 가는가, 프롬프트가 그것을 쓰라고 하는가 */
ok('사주 payload 에 elementReading', /elementReading:\s*\(function\(\)\{[\s\S]{0,200}elemReadFacts\(saju\)/.test(html));
ok('궁합 payload 에 weave', /weave:\s*compatWeaveFacts\(pA, pB\)/.test(html));
ok('성격유형 payload 에 leastUsed', /leastUsed:\s*mbtiLeastFacts\(p\.mbti\)/.test(html));
ok('프롬프트 7-3(엮기)', /7-3\./.test(prompt) && /weave/.test(prompt));
ok('프롬프트 7-4(넘치는/모자란 기운)', /7-4\./.test(prompt) && /elementReading/.test(prompt));
ok('프롬프트 7-5(덜 쓰는 기능)', /7-5\./.test(prompt) && /leastUsed/.test(prompt));
ok('잠금 카드 세 곳에 걸이를 넘김',
   /buildSajuHook\(p, saju\)/.test(html) && /buildMbtiHook\(p\)\)/.test(html) && /buildCompatHook\(pA, pB\)\)/.test(html));

/* 씨앗 박은 난수 — 돌릴 때마다 같은 사람들 */
function rng(seed){ let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const R = rng(20260926);
const TYPES = ['ISTJ','ISFJ','INFJ','INTJ','ISTP','ISFP','INFP','INTP','ESTP','ESFP','ENFP','ENTP','ESTJ','ESFJ','ENFJ','ENTJ'];
const people = [];
for(let i = 0; i < 240; i++){
  const noTime = R() < 0.2;
  people.push({ id:'q'+i, name:'사람'+i, mbti:TYPES[Math.floor(R()*16)], gender:R()<0.5?'M':'F', calendarType:'solar',
    year:1975+Math.floor(R()*33), month:1+Math.floor(R()*12), day:1+Math.floor(R()*28),
    birthTime: noTime ? null : {hour:Math.floor(R()*24), minute:Math.floor(R()*60)}, timeUnknown:noTime,
    birthLon:126.98, solarTimeAdjust:true });
}

(async()=>{
  const srv = await L.serve(L.ROOT, 0);
  const browser = await L.puppeteer().launch({executablePath:L.chromePath(), headless:'new', args:['--no-sandbox']});
  try{
    const p = await L.openPage(browser, {state:L.makeState(), width:390, height:800, hook:true});
    await p.goto(srv.url+'/fortune.html', {waitUntil:'networkidle0'});
    const r = await p.evaluate((people)=>{
      const T = window.__INYEON_TEST__, E = T.ELEMENTS, out = {bad:[], n:{saju:0, mbti:0, weave:0, pairs:0, pairHook:0}, axes:{}};
      const LABEL = {'나무(목)':0,'불(화)':1,'흙(토)':2,'쇠(금)':3,'물(수)':4};
      const strip = s => String(s||'').replace(/<[^>]+>/g,'');
      const bad = (k, v) => { if(out.bad.length < 12) out.bad.push(k+' :: '+String(v).slice(0,160)); };
      const facts = {};
      people.forEach(pp => {
        const sj = T.getSajuResult(pp); pp.saju = sj;
        const f = T.elemReadFacts(sj); facts[pp.id] = f;
        const total = f.counts.reduce((a,b)=>a+b,0);
        if(total !== (pp.birthTime ? 8 : 6)) bad('글자 수', pp.id+' '+total);
        if(f.counts[f.strongest] !== Math.max.apply(null, f.counts)) bad('가장 진한 기운', pp.id);
        if(f.counts[f.lack] !== Math.min.apply(null, f.counts)) bad('가장 모자란 기운', pp.id);
        /* 걸이 — '없어요'/'N개뿐' 이 실제 개수와 같은가 */
        const h = strip(T.buildSajuHook(pp, sj));
        if(h){ out.n.saju++;
          const m = h.match(/사주엔 ([^ ]+\([^)]+\)) 기운이 (하나도 없어요|(\d)개뿐이에요)/);
          if(!m) bad('사주 걸이 모양', h);
          else { const i = LABEL[m[1]]; const c = f.counts[i];
            if(i !== f.lack) bad('걸이가 가장 모자란 기운이 아님', h);
            if(m[2] === '하나도 없어요' ? c !== 0 : +m[3] !== c) bad('걸이 개수 ≠ 실제', m[0]+' 실제 '+c); }
          if(/undefined|null|NaN/.test(h)) bad('사주 걸이 빈 값', h);
        }
        /* 성격유형 걸이 — 가장 덜 쓰는 기능이 MBTI_STACK 넷째인가 */
        const mh = strip(T.buildMbtiHook(pp)); out.n.mbti++;
        const least = T.MBTI_STACK[pp.mbti][3];
        const mm = mh.match(/\((외향|내향) (감각|직관|사고|감정)\)이에요/);
        const code = mm ? ({감각:'S',직관:'N',사고:'T',감정:'F'}[mm[2]] + (mm[1]==='외향'?'e':'i')) : null;
        if(!mm || code.toLowerCase() !== least.toLowerCase()) bad('성격유형 걸이 기능', pp.mbti+' '+least+' :: '+mh);
        if(/undefined|null|NaN/.test(mh)) bad('성격유형 걸이 빈 값', mh);
      });
      /* 엮기 — 쌍마다. 말하는 기운이 실제로 없거나(없어) 넘치는가(많아), 성격유형 글자가 실제로 있는가 */
      for(let i = 0; i + 1 < people.length; i += 2){
        const A = people[i], B = people[i+1]; out.n.pairs++;
        const w = T.buildCompatWeave(A, B);
        w.forEach(x => {
          out.n.weave++; out.axes[x.axis+'/'+x.kind] = (out.axes[x.axis+'/'+x.kind]||0) + 1;
          const who = x.who === 'a' ? A : B, other = x.who === 'a' ? B : A, f = facts[who.id];
          const em = x.sajuWhy.match(/^([^ ]+\([^)]+\)) 기운이 (없|많|넘)/);
          if(!em) bad('엮기 사주 근거 모양', x.sajuWhy);
          else { const c = f.counts[LABEL[em[1]]];
            if(em[2] === '없' ? c !== 0 : c < 3) bad('엮기 사주 근거 ≠ 실제', x.sajuWhy+' 실제 '+c); }
          const lm = x.mbtiWhy.match(/^([EISNTFJP](?:·[EISNTFJP])*)/);
          if(!lm) bad('엮기 성격유형 근거 모양', x.mbtiWhy);
          else lm[1].split('·').forEach(ch => { if(who.mbti.indexOf(ch) < 0) bad('엮기 성격유형 글자 없음', who.mbti+' :: '+x.mbtiWhy); });
          if(x.text.indexOf(who.name+'님은 사주에 ') !== 0) bad('엮기 주어', x.text);
          if(x.text.indexOf('그래서 '+other.name+'님은 ') < 0) bad('엮기 상대', x.text);
          if(!/자세가 필요해요\.$/.test(x.text)) bad('엮기 끝맺음', x.text);
          if(/undefined|null|NaN|\.\./.test(x.text)) bad('엮기 빈 값', x.text);
        });
        const ch = strip(T.buildCompatHook(A, B));
        if(w.length && !ch) bad('엮기가 있는데 걸이가 없음', A.id);
        if(ch){ out.n.pairHook++; if(!/다툴 때 어떻게 부딪히는지/.test(ch) || /undefined|\.\./.test(ch)) bad('궁합 걸이', ch); }
        /* AI 재료에는 이름이 없어야 한다(처리방침 제4조) */
        const facts2 = JSON.stringify(T.compatWeaveFacts(A, B));
        if(facts2.indexOf(A.name) >= 0 || facts2.indexOf(B.name) >= 0) bad('AI 재료에 이름', facts2);
      }
      /* 권유 문구와 실제로 열리는 것 */
      const P = T.PRODUCTS;
      out.desc = { saju:P.saju_full.desc, mbti:P.mbti_full.desc, compat:P.compat_full.desc, pass:P.premium_pass.desc };
      out.opens = { saju:(P.saju_full.opens||[]).join('|'), mbti:(P.mbti_full.opens||[]).join('|'), compat:(P.compat_full.opens||[]).join('|') };
      return out;
    }, people);

    console.log('  counts', JSON.stringify(r.n), JSON.stringify(r.axes));
    r.bad.forEach(b => console.log('    ', b));
    ok('계산과 어긋나는 문장 0건', r.bad.length === 0, r.bad.length+'건');
    ok('사주 걸이가 대부분의 사람에게 나옴(>=90%)', r.n.saju >= people.length * 0.9, r.n.saju+'/'+people.length);
    ok('성격유형 걸이 전원', r.n.mbti === people.length);
    ok('엮기 줄이 쌍의 80% 이상에서 나옴', r.n.pairHook >= r.n.pairs * 0.8, r.n.pairHook+'/'+r.n.pairs);
    ok('엮기 축이 셋 이상 쓰임(한 축만 도는 것 아님)', Object.keys(r.axes).length >= 3, JSON.stringify(r.axes));
    ok('불 기운이 많은 사람의 heat 축이 나옴', Object.keys(r.axes).some(k => /^heat\//.test(k)), JSON.stringify(r.axes));
    /* 권유 문구가 약속한 것이 실제로 열리는 것 안에 있는가 */
    const d = r.desc;
    ok('사주 권유: 월별 운세 → 열리는 것에 달마다의 흐름', /월별 운세/.test(d.saju) && /달마다/.test(r.opens.saju));
    ok('사주 권유: 대운 → 열리는 것에 대운', /대운/.test(d.saju) && /대운/.test(r.opens.saju));
    ok('사주 권유: 건강운 → 열리는 것에 건강', /건강운/.test(d.saju) && /건강/.test(r.opens.saju));
    ok('성격유형 권유: 강점·그림자 → 열리는 것에 강점과 그림자', /그림자/.test(d.mbti) && /강점과 그림자/.test(r.opens.mbti));
    ok('궁합 권유: 다툴 때·화해 → 13장 제목에 있음',
       /다툴 때/.test(d.compat) && /'다툴 때 벌어지는 일'/.test(html) && /'화해하는 법/.test(html));
    ok('이용권 권유가 세 가지를 말함', /사주/.test(d.pass) && /성격유형/.test(d.pass) && /궁합/.test(d.pass));

    /* 연도 — 올해가 아닌 사주 풀이는 '올해'라고 부르지 않는다 */
    const yr = await p.evaluate(()=>{
      const T = window.__INYEON_TEST__, now = new Date().getFullYear(), res = [];
      [now, now+1].forEach(y => { T.closeModal(); T.openPaywall(T.productDef('saju_full:'+y));
        const t = (document.querySelector('.pay-pitch')||{}).textContent || ''; res.push([y, t]); });
      T.closeModal(); return {now, res};
    });
    ok('결제창 권유 첫 줄(올해)', /^올해 전체 사주를 깊게 알아 봐요$/.test(yr.res[0][1]), yr.res[0][1]);
    ok('결제창 권유 첫 줄(내년은 연도로)', yr.res[1][1] === (yr.now+1)+'년 전체 사주를 깊게 알아 봐요', yr.res[1][1]);
    ok('JS 오류 0', (p.__errs||[]).length === 0, JSON.stringify(p.__errs));
  } finally { await browser.close(); srv.close(); }
  console.log(`pitch_hooks: ${pass} 통과 · ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
