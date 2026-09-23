#!/usr/bin/env node
/* =====================================================================
   오늘 「한마디」 잇는 말 — 방향이 같으면 '이니', 다르면 '이지만' (빠른 층 · 함수를 직접 부른다 · 1초)
   ---------------------------------------------------------------------
   2026-09-24 대표님 지적: "판단력은 평소만큼 좋은 날이니, 새로 벌이는 일은 다음으로 미루세요"
   — 앞 토막(건강운 판정)과 뒤 토막(십이운성 행동)은 다른 계산에서 오는데 무조건 '이니'(인과)로
   붙여 절반의 경우가 모순이었다. 3 × 12 = 36 조합을 전부 만들어 본다.
===================================================================== */
const fs = require('fs'); const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'fortune.html'), 'utf8');
let pass = 0, fail = 0;
function ok(name, cond, extra){ if(cond){ pass++; } else { fail++; console.log('  ✗', name, extra||''); } }
function pullFn(name){
  const at = html.search(new RegExp('^function '+name+'\\(', 'm')); if(at < 0) return null;
  let depth = 0, started = false;
  for(let i = at; i < html.length; i++){
    const ch = html[i];
    if(ch === '{'){ depth++; started = true; } else if(ch === '}'){ depth--; if(started && depth === 0) return html.slice(at, i+1); }
  }
  return null;
}
function pullVar(name){
  const m = html.match(new RegExp('^var '+name+'\\s*=\\s*\\{[\\s\\S]*?\\n?\\};', 'm')) || html.match(new RegExp('^var '+name+'\\s*=\\s*\\{[^\\n]*\\};', 'm'));
  return m ? m[0] : null;
}
const parts = ['TODAY_STAGE_ACT','TODAY_STAGE_DIR','TODAY_DAY_WORD','TODAY_DAY_DIR'].map(pullVar);
const fnSrc = pullFn('todayEndLine');
ok('표 넷과 todayEndLine 을 찾음', parts.every(Boolean) && !!fnSrc, parts.map((p,i)=>p?'':['ACT','DIR','WORD','DAYDIR'][i]).join(','));
if(parts.every(Boolean) && fnSrc){
  const F = new Function(parts.join('\n') + '\n' + fnSrc + '\nreturn {todayEndLine, TODAY_STAGE_ACT, TODAY_STAGE_DIR, TODAY_DAY_WORD, TODAY_DAY_DIR};')();
  const stages = Object.keys(F.TODAY_STAGE_ACT);
  ok('열두 단계가 전부 방향표에 있다', stages.length === 12 && stages.every(s => s in F.TODAY_STAGE_DIR), stages.filter(s => !(s in F.TODAY_STAGE_DIR)).join(','));
  const push = stages.filter(s => F.TODAY_STAGE_DIR[s] === 1), hold = stages.filter(s => F.TODAY_STAGE_DIR[s] === -1);
  ok('밀어라 4 · 자제하라 7 · 중립 1(절)', push.length === 4 && hold.length === 7 && F.TODAY_STAGE_DIR['절'] === 0, push.length+'/'+hold.length);

  /* 36 조합 전부 — 규칙대로 잇는가 · 문장이 온전한가 */
  let bad = [];
  for(const tier of ['weak','most','else','',undefined]){
    const key = (tier === 'weak' || tier === 'most') ? tier : 'else';
    for(const st of stages){
      const t = F.todayEndLine(tier, st);
      const sd = F.TODAY_STAGE_DIR[st], dd = F.TODAY_DAY_DIR[key];
      const wantJoin = (sd !== 0 && sd !== dd) ? '이지만, ' : '이니, ';
      const want = F.TODAY_DAY_WORD[key] + wantJoin + F.TODAY_STAGE_ACT[st];
      if(t !== want) bad.push(tier + '/' + st + ' → ' + t);
    }
  }
  ok('3 × 12 조합(+빈 값)이 전부 규칙대로 이어진다', bad.length === 0, bad.slice(0,3).join(' | '));

  /* 대표님이 지적한 그 문장 */
  ok("좋은 날 × 묘 → '…좋은 날이지만, 새로 벌이는 일은 다음으로 미루세요.'",
     F.todayEndLine('else','묘') === '판단력은 평소만큼 좋은 날이지만, 새로 벌이는 일은 다음으로 미루세요.', F.todayEndLine('else','묘'));
  ok("좋은 날 × 절 → 대표님 원문 그대로 '이니'", F.todayEndLine('else','절') === '판단력은 평소만큼 좋은 날이니, 욕심만 덜어내면 무난하게 지나가요.', F.todayEndLine('else','절'));
  ok("쏠리기 쉬운 날 × 제왕 → '이지만, 밀어붙여도 버텨요'", F.todayEndLine('most','제왕') === '한쪽으로 쏠리기 쉬운 날이지만, 밀어붙여도 버텨요.', F.todayEndLine('most','제왕'));
  ok("쏠리기 쉬운 날 × 양 → '이니, 서두르지 않는 편이 나아요'", F.todayEndLine('most','양') === '한쪽으로 쏠리기 쉬운 날이니, 서두르지 않는 편이 나아요.', F.todayEndLine('most','양'));
  ok("덜 눌리는 날 × 건록 → '이니'", F.todayEndLine('weak','건록') === '몸과 마음이 덜 눌리는 날이니, 맡은 일을 밀고 나가기 좋아요.', F.todayEndLine('weak','건록'));
  ok("덜 눌리는 날 × 목욕 → '이지만'", F.todayEndLine('weak','목욕') === '몸과 마음이 덜 눌리는 날이지만, 결정은 한 박자 늦추세요.', F.todayEndLine('weak','목욕'));
  ok("모르는 단계면 '…날이에요.' 로 끝난다", F.todayEndLine('else','없음') === '판단력은 평소만큼 좋은 날이에요.', F.todayEndLine('else','없음'));

  /* 모순 문장(좋은 날이니 + 자제하라 / 조심 날이니 + 밀어라)이 한 조합도 없다 */
  let contra = 0;
  for(const key of ['weak','most','else']) for(const st of stages){
    const t = F.todayEndLine(key, st); const sd = F.TODAY_STAGE_DIR[st], dd = F.TODAY_DAY_DIR[key];
    if(sd !== 0 && sd !== dd && t.indexOf('이니, ') >= 0) contra++;
  }
  ok('방향이 어긋난 조합에 인과("이니")가 남아 있지 않다', contra === 0, '실제 ' + contra);
}
/* 화면이 이 함수를 실제로 쓰는가 (주석 걷고) */
const code = html.replace(/\/\*[\s\S]*?\*\//g, '');
ok('buildTodaySummaryRows 가 todayEndLine 을 쓴다', /tag:'한마디',\s*text:\s*todayEndLine\(b\.healthTier,\s*b\.stageName\)/.test(code));
ok("옛 방식(dayWord + '이니, ' + act)이 남아 있지 않다", code.indexOf("dayWord + '이니, ' + act") < 0);
console.log('오늘 한마디 잇는 말 — 통과 '+pass+'건 · 실패 '+fail+'건');
process.exit(fail ? 1 : 0);
