/* ★ 2026-10-19 대표님 "그래 오케이" — 공유 카드 칸에 넣는 짧은 문장 표를 지킨다.
   한 줄이 길어지면 칸 안에서 다시 접혀 뜻 중간에서 끊긴다(대표님 "줄 바꾸면 조금 어색하다").
   폭 410px(25px 글꼴) 실측 최대 327px 일 때 한 줄 최대 18자(실측 327px) — 18자를 넘으면 실패. */
const fs = require('fs'), path = require('path');
const s = fs.readFileSync(path.join(__dirname, '..', '..', 'fortune.html'), 'utf8');
function grab(name){ const a = s.indexOf('var '+name+' = {'); if(a < 0) return null;
  let d = 0, i = s.indexOf('{', a); for(; i < s.length; i++){ if(s[i]=='{') d++; else if(s[i]=='}'){ d--; if(!d) break; } }
  return eval('(' + s.slice(s.indexOf('{', a), i+1) + ')'); }
let fail = 0, n = 0;
function ok(c, msg){ n++; if(!c){ fail++; console.log('  ✗ ' + msg); } }
const E = grab('SQ_ELEM_CARD'), V = grab('SQ_LACK_VIEW'), M = grab('SQ_MBTI_CARD');
ok(E && Object.keys(E).length === 5, '오행 다섯 칸이 다 있는가');
ok(M && Object.keys(M).length === 16, '성격유형 16종이 다 있는가');
const lines = [];
if(E) for(const k in E){ ['trait','shadow','lack','fill'].forEach(f => { ok(E[k][f], '오행 '+k+' '+f+' 빠짐'); (E[k][f]||'').split('\n').forEach(l => lines.push(l)); }); }
if(V) for(const k in V) V[k].split('\n').forEach(l => lines.push(l));
if(M) for(const k in M){ ok(M[k].length === 4, k+' 칸 넷'); M[k].forEach(x => x.split('\n').forEach(l => lines.push(l))); }
/* 화면 ELEM_LACK_VIEW 와 짝이 같아야 한다 */
const VV = grab('ELEM_LACK_VIEW');
ok(VV && V && Object.keys(VV).sort().join() === Object.keys(V).sort().join(), '카드 SQ_LACK_VIEW 짝 = 화면 ELEM_LACK_VIEW 짝');
lines.forEach(l => ok(l.length <= 18, '너무 긴 줄('+l.length+'자): '+l));
ok(lines.length > 150, '줄 수가 이상하게 적음: '+lines.length);
ok(/SQ_MBTI_CARD\[t\]/.test(s) && /SQ_LACK_VIEW\[f\.strongest/.test(s), '카드 함수가 표를 실제로 읽는가');
console.log('공유 카드 짧은 문장 — 검사 '+n+'건 · 실패 '+fail+'건');
process.exit(fail ? 1 : 0);
