#!/usr/bin/env node
/* =====================================================================
   느린 층을 동시에 돌린다 (2026-10-21 대표님 "그래 해봐라 … 오류가 없어야돼")
   ---------------------------------------------------------------------
   예전에는 느린 검사 40여 개를 하나씩 줄 세워 10분 넘게 걸렸습니다.
   검사는 **하나도 빼지 않고** 여러 개를 동시에 돌립니다.

   ★ 거짓 실패를 막는 장치 — 동시에 돌리면 화면 여는 시간이 늘어 시간 초과로
     실패할 수 있습니다(2026-09-07 · 09-22 실제로 겪음). 그래서 동시에 돌려 실패한 것은
     **다른 검사가 다 끝난 뒤 혼자 한 번 더** 돌립니다.
       · 혼자서도 실패 → 진짜 실패(종료 코드 1)
       · 혼자서는 통과 → 통과로 치되 '흔들림'으로 **반드시 적어 둡니다**(숨기지 않음)
   ★ 오래 걸리는 것부터 먼저 띄웁니다(지난번 걸린 시간을 .parallel_times.json 에 적어 둠).

   사용: node run_parallel.cjs <로컬 주소> <동시 개수> <항목...>
     항목 = 폴더(안의 *.cjs 전부) 또는 '이름=스크립트경로[|추가 인자]'
   출력: 항목마다 ✓/✗ 한 줄(이름순) · 마지막 줄 'SUMMARY n=… fail=… flaky=… sec=…'
===================================================================== */
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');

const [,, LOCAL, JOBS_S, ...ITEMS] = process.argv;
const JOBS = Math.max(1, parseInt(JOBS_S, 10) || 4);
const TIMES_FILE = path.join(__dirname, '.parallel_times.json');
let times = {}; try{ times = JSON.parse(fs.readFileSync(TIMES_FILE, 'utf8')); }catch(e){}

const tasks = [];
/* 이름=경로 로 따로 적은 파일(예: 둘로 나눈 admin_buttons)은 폴더를 펼칠 때 다시 넣지 않는다 */
const explicit = ITEMS.filter(it => it.indexOf('=') > 0).map(it => path.resolve(it.slice(it.indexOf('=') + 1).split('|')[0]));
ITEMS.forEach(function(it){
  const eq = it.indexOf('=');
  if(eq > 0){
    const name = it.slice(0, eq), rest = it.slice(eq + 1).split('|');
    tasks.push({name, file: rest[0], args: rest[1] ? rest[1].split(' ') : [LOCAL]});
    return;
  }
  if(!fs.existsSync(it)) return;
  fs.readdirSync(it).filter(f => f.endsWith('.cjs') && explicit.indexOf(path.resolve(it, f)) < 0).sort().forEach(function(f){
    tasks.push({name: f, file: path.join(it, f), args: [LOCAL]});
  });
});

function runOne(t){
  return new Promise(function(resolve){
    const t0 = Date.now();
    const ch = spawn(process.execPath, [t.file].concat(t.args), {stdio: ['ignore', 'pipe', 'pipe']});
    let out = '';
    ch.stdout.on('data', d => { out += d; });
    ch.stderr.on('data', d => { out += d; });
    ch.on('close', function(code){ resolve({code, out, sec: (Date.now() - t0) / 1000}); });
  });
}

(async function(){
  const T0 = Date.now();
  const order = tasks.slice().sort((a, b) => (times[b.name] || 60) - (times[a.name] || 60));
  const res = {};
  let i = 0;
  async function worker(){
    while(i < order.length){
      const t = order[i++];
      const r = await runOne(t);
      res[t.name] = r; times[t.name] = Math.round(r.sec);
    }
  }
  await Promise.all(Array.from({length: Math.min(JOBS, order.length)}, worker));

  /* 실패한 것은 혼자 다시 */
  const flaky = [], fail = [];
  for(const t of tasks){
    if(res[t.name].code === 0) continue;
    const first = res[t.name];
    const r = await runOne(t);
    if(r.code === 0){ flaky.push(t.name); res[t.name] = Object.assign(r, {firstOut: first.out}); }
    else { fail.push(t.name); res[t.name] = r; }
  }
  try{ fs.writeFileSync(TIMES_FILE, JSON.stringify(times, null, 1)); }catch(e){}

  tasks.forEach(function(t){
    const r = res[t.name];
    if(fail.indexOf(t.name) >= 0){
      console.log('  ✗ ' + t.name + '  (혼자 다시 돌려도 실패)');
      r.out.trim().split('\n').slice(-6).forEach(l => console.log('     ' + l));
    } else if(flaky.indexOf(t.name) >= 0){
      console.log('  ⚠ ' + t.name + '  (동시 실행에서 실패 → 혼자 다시 돌려 통과 · 흔들림)');
      r.firstOut.trim().split('\n').filter(l => /✗|Error|error|시간/.test(l)).slice(-3).forEach(l => console.log('     첫 실패: ' + l.trim()));
    } else {
      console.log('  ✓ ' + t.name + '  ' + Math.round(r.sec) + '초');
    }
  });
  console.log('SUMMARY n=' + tasks.length + ' fail=' + fail.length + ' flaky=' + flaky.length + ' sec=' + Math.round((Date.now() - T0) / 1000)
    + (fail.length ? ' failed=' + fail.join(',') : '') + (flaky.length ? ' flakyList=' + flaky.join(',') : ''));
  process.exit(fail.length ? 1 : 0);
})();
