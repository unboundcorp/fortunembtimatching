#!/usr/bin/env node
/* =====================================================================
   단추 너비 (느린 층) — 2026-09-26 대표님 지시 "다시 보기 버튼 너비 맞춰 … 다른데도 너비 안맞는 버튼 다 맞춰라"
   ---------------------------------------------------------------------
   화면 열두 곳(홈·오늘·내 사주·성격유형·풀이 둘·설정·궁합 둘이서/여럿이서·1:1 결과·그림·모임 결과)을 320·390 에서 열어
   ① 한 줄에 선 단추들이 줄을 채우고 너비가 같은가 ② 카드 안에 혼자 선 단추가 폭을 채우는가를 잰다.
   ★ 일부러 작게 둔 것은 뺀다: 맨 위 '…로 돌아가기'(뒤로 가기 길) · '다음 섹션'(목차 넘기기) · 고르기 줄·칩·목록 줄.
   ③ [다른 사람과도 궁합 보기] → 궁합 둘이서 첫 화면 · 맨 위 / [다른 모임 궁합 보기] → 여럿이서 첫 화면 · 맨 위
===================================================================== */
const L = require('/Users/beautymacmini/dev/harness-project(coding)/output/fortune/scripts/_lib.cjs');
(async function(){
 const bad=[]; let navOk=[];
 for(const W of [320, 390]){
  const site = await L.serve(L.ROOT, 0);
  const b = await L.puppeteer().launch({executablePath:L.chromePath(), headless:'new', args:['--no-sandbox']});
  const me = L.person({mbti:'ENTJ', name:'TEST'});
  const p2 = L.person({id:'p2', name:'둘째', mbti:'ISFP', gender:'F', year:1995, month:7, day:28, birthTime:{hour:14,minute:30}});
  let roster='';
  const p = await L.openPage(b, {hook:true, width:W, height:900, state:L.makeState({profiles:[me,p2], activeId:me.id,
    savedGroups:[{id:'g3', name:'셋 모임', at:Date.now(), token:'tok', n:3, rel:'friend', pair:0, profileId:me.id, pchk:1}]})});
  await p.setRequestInterception(true);
  p.on('request', req => { if(req.url().indexOf('/api/group')>=0) return req.respond({status:200, contentType:'application/json', body:JSON.stringify({name:'셋 모임', members:roster, ttlDays:365})}); req.continue(); });
  await p.goto(site.url+'/fortune.html', {waitUntil:'domcontentloaded'}); await L.wait(1200);
  roster = await p.evaluate(()=>{ const T=window.__INYEON_TEST__, m=T.activeProfile(); return [m, Object.assign({},m,{name:'가',mbti:'ISFP',day:3}), Object.assign({},m,{name:'나',mbti:'INTJ',day:5})].map(T.gcMeetRow).join(';'); });
  const audit = async (label) => p.evaluate((label)=>{
    const out=[];
    const scope = document.querySelector('.modal-box') || document.querySelector('#main');
    scope.querySelectorAll('button.btn, a.btn').forEach(bt=>{
      const r=bt.getBoundingClientRect(); if(!r.width || getComputedStyle(bt).display==='none') return;
      if(bt.closest('.seg-toggle,.gc-members,.mq-chips,.modal-actions,.tabbar,.swipe-row,.sr-row,.hist-item,.chip-row')) return;
      const par=bt.parentElement, cs=getComputedStyle(par);
      const inner=par.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
      const sib=[...par.children].filter(x=>x.matches('button.btn,a.btn'));
      let rowW=0; sib.forEach(x=>rowW+=x.getBoundingClientRect().width);
      const gap = sib.length>1 ? (sib.length-1)*8 : 0;
      const fill=(rowW+gap)/inner;
      const widths=sib.map(x=>Math.round(x.getBoundingClientRect().width));
      const uneven = sib.length>1 && Math.max(...widths)-Math.min(...widths)>4;
      if(fill<0.93 || uneven) out.push({t:bt.textContent.trim().slice(0,30), w:Math.round(r.width), inner:Math.round(inner), n:sib.length, fill:+fill.toFixed(2), uneven, cls:bt.className, pcls:par.className.slice(0,30)});
    });
    const seen={}; return out.filter(o=>{const k=o.t+o.pcls; if(seen[k]) return false; seen[k]=1; return true;}).map(o=>label+' | '+JSON.stringify(o));
  }, label);
  const T = (fn, ...a) => p.evaluate(fn, ...a);
  const res=[];
  for(const r of ['home','today','saju','mbti','report13','mbtiReport','settings']){
    await T(r=>window.__INYEON_TEST__.goRoute(r), r); await L.wait(900); res.push(...await audit(r));
  }
  await T(()=>window.__INYEON_TEST__.goRoute('compat')); await L.wait(700); res.push(...await audit('compatPair'));
  await L.clickText(p,/^여럿이서 보기$/); await L.wait(700); res.push(...await audit('compatGroupEntry'));
  await T((mid)=>window.__INYEON_TEST__.reopenCompat({id:'h1', profileId:mid, relation:'lover', inputs:{b:{name:'로또', mbti:'ISFP', gender:'F', birth:{y:1995,m:7,d:28,hour:14,minute:30}}}}), me.id);
  await L.wait(1200); res.push(...await audit('compatResult'));
  await T(()=>{ const T=window.__INYEON_TEST__; T.ENT.data=Object.assign({},T.ENT.data||{},{items:{compat_full:{at:Date.now()}}}); });
  await L.clickText(p,/그림으로 한눈에 보기/); await L.wait(900); res.push(...await audit('compatVisual'));
  await T(()=>window.__INYEON_TEST__.openSavedGroup('g3')); await L.wait(1800); res.push(...await audit('groupResult'));
  await T(()=>window.__INYEON_TEST__.goRoute('more')); await L.wait(700); res.push(...await audit('more'));
  res.filter(x => !/돌아가기|다음 섹션/.test(x) && !/"n":[3-9],"fill":[1-9]|"n":2,"fill":1\.[5-9]/.test(x)).forEach(x => bad.push(W+' '+x));
  /* ③ 새 단추 두 개 — 여럿이서 결과에서 [다른 모임 궁합 보기] */
  await p.evaluate(()=>window.__INYEON_TEST__.openSavedGroup('g3')); await L.wait(1800);
  await p.evaluate(()=>window.scrollTo(0, 99999)); await L.wait(200);
  await L.clickText(p, /^다른 모임 궁합 보기$/); await L.wait(900);
  const g = await p.evaluate(()=>({route:window.__INYEON_TEST__.route(), y:window.scrollY, t:document.querySelector('#main').innerText}));
  navOk.push([W+' 다른 모임 궁합 보기 → 여럿이서 첫 화면·맨 위', g.route==='compat' && g.y===0 && /상대방에게 궁합 링크 보내기/.test(g.t) && /이 모임은 어떤 사이인가요/.test(g.t), JSON.stringify({route:g.route,y:g.y,t:g.t.slice(0,160)})]);
  await p.evaluate((mid)=>window.__INYEON_TEST__.reopenCompat({id:'h1', profileId:mid, relation:'lover', inputs:{b:{name:'로또', mbti:'ISFP', gender:'F', birth:{y:1995,m:7,d:28,hour:14,minute:30}}}}), me.id);
  await L.wait(1000); await p.evaluate(()=>window.scrollTo(0, 99999)); await L.wait(200);
  await L.clickText(p, /^다른 사람과도 궁합 보기$/); await L.wait(900);
  const q = await p.evaluate(()=>({route:window.__INYEON_TEST__.route(), y:window.scrollY, t:document.querySelector('#main').innerText}));
  navOk.push([W+' 다른 사람과도 궁합 보기 → 둘이서 첫 화면·맨 위', q.route==='compat' && q.y===0 && /상대방에게 궁합 링크 보내기/.test(q.t) && /어떤 사이인가요/.test(q.t) && !/이 모임은 어떤 사이인가요/.test(q.t), JSON.stringify({route:q.route,y:q.y})]);
  navOk.push([W+' JS 오류 0', (p.__errs||[]).length===0, JSON.stringify(p.__errs)]);
  await b.close(); site.close();
 }
 const R = L.reporter('단추 너비');
 R.note(bad.length===0, '줄을 못 채우거나 너비가 다른 단추 0건', bad.length+'건');
 bad.forEach(x=>console.log('    '+x));
 navOk.forEach(n=>R.note(n[1], n[0], n[2]));
 R.done(); process.exit(0);
})().catch(e=>{ console.error(e); process.exit(1); });
