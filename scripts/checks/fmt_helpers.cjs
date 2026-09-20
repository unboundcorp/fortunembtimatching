/* 화면 포맷터 한 벌(fmtDateTime · formatWon · fmtYmd · fmtHm)이 실제로 값을 돌려주는지 본다.
   ★ 왜 생겼나 (2026-09-21): toLocaleString 을 fmtDateTime 으로 모으는 치환이 **정의 자체까지**
     바꿔 `function fmtDateTime(v){ return fmtDateTime(v); }` 가 됐다. 문법도 통과하고 빠른 층도
     통과했다 — 그 함수를 부르는 화면(설정 결제 내역·주문 목록·회원 서랍)을 빠른 층이 안 열기 때문이다.
     이 검사는 함수 넷을 파일에서 떼어 **직접 불러** 본다. 1초. */
const fs = require('fs'); const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'fortune.html'), 'utf8');
let pass = 0, fail = 0;
function ok(name, cond, extra){ if(cond){ pass++; } else { fail++; console.log('  ✗', name, extra||''); } }
/* 함수 하나를 중괄호 짝으로 떼어 낸다 — formatWon 처럼 여러 줄짜리도 통째로. */
function pull(name){
  const at = html.search(new RegExp('^function '+name+'\\(', 'm')); if(at < 0) return null;
  let depth = 0, started = false;
  for(let i = at; i < html.length; i++){
    const ch = html[i];
    if(ch === '{'){ depth++; started = true; } else if(ch === '}'){ depth--; if(started && depth === 0) return html.slice(at, i+1); }
  }
  return null;
}
const src = ['pad2','fmtDateTime','formatWon','fmtYmd','fmtHm'].map(pull);
ok('함수 넷 + pad2 를 한 줄 정의로 찾음', src.every(Boolean), src.map((s,i)=>s?'':['pad2','fmtDateTime','formatWon','fmtYmd','fmtHm'][i]).join(','));
if(src.every(Boolean)){
  const fn = new Function(src.join('\n') + '\nreturn {fmtDateTime, formatWon, fmtYmd, fmtHm};')();
  let r; try{ r = fn.fmtDateTime(0); }catch(e){ r = 'THROW '+e.message; }
  ok('fmtDateTime(0) 이 문자열을 돌려줌 (자기 호출 아님)', typeof r === 'string' && /1970/.test(r), r);
  ok('formatWon(1900) = 1,900원', fn.formatWon(1900) === '1,900원', fn.formatWon(1900));
  ok('formatWon(undefined) = 0원', fn.formatWon(undefined) === '0원', fn.formatWon(undefined));
  ok('fmtYmd', fn.fmtYmd({y:1990,m:3,d:5}) === '1990-03-05', fn.fmtYmd({y:1990,m:3,d:5}));
  ok('fmtHm', fn.fmtHm({hour:9,minute:5}) === '09:05', fn.fmtHm({hour:9,minute:5}));
}
/* ★ 주석을 걷고 센다 — fmtDateTime 위 설명 주석이 옛 호출을 글로 적고 있어 그대로 세면 3이 된다
   (이 프로젝트에서 다섯 번째 겪은 함정). */
const code = html.replace(/\/\*[\s\S]*?\*\//g, '');
const direct = (code.match(/toLocaleString\('ko-KR'\)/g)||[]).length;
ok("화면에 toLocaleString('ko-KR') 직접 호출은 formatWon·fmtDateTime·adminNum 세 곳뿐", direct === 3, '실제 '+direct);
console.log('포맷터 — 통과 '+pass+'건 · 실패 '+fail+'건');
process.exit(fail ? 1 : 0);
