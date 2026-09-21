/* 유료 13장(사주)·16장(성격유형) 빌더가 **한 벌의 부품**(reportNameKit · sectionCollector)을 쓰는지,
   그 부품이 이름·조사를 제대로 다루는지 본다 (2026-09-21 리팩터 R5).
   ★ 왜 생겼나: 두 빌더에 이름 전처리·조사 치환기 T()·add() 가 두 벌로 있어서 한쪽만 고쳐지는
     사고가 났었다(2026-08 호칭 '님'). 한 벌로 합친 뒤 누가 다시 두 벌로 되돌리면 여기서 걸린다.
   ★ 실제로 브라우저에서 빌더를 돌려 본다 — 문자열만 보면 "정의는 한 벌인데 안 쓰는" 상태를 못 잡는다. */
const fs = require('fs'); const path = require('path');
const L = require(path.join(__dirname, '..', '_lib.cjs'));
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'fortune.html'), 'utf8');
let pass = 0, fail = 0;
function ok(name, cond, extra){ if(cond){ pass++; } else { fail++; console.log('  ✗', name, extra||''); } }
function fnBody(name){
  const at = html.search(new RegExp('^function '+name+'\\(', 'm')); if(at < 0) return null;
  let d = 0, st = false;
  for(let i = at; i < html.length; i++){ const c = html[i]; if(c === '{'){ d++; st = true; } else if(c === '}'){ d--; if(st && d === 0) return html.slice(at, i+1); } }
  return null;
}
const b13 = fnBody('buildReport13'), b16 = fnBody('buildMbtiReport16');
ok('두 빌더를 찾음', !!b13 && !!b16);
if(b13 && b16){
  const code = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
  ok('사주 빌더 안에 자기만의 T()·add() 가 없음', !/function T\(|function add\(/.test(code(b13)));
  ok('성격유형 빌더 안에 자기만의 T()·add() 가 없음', !/function T\(|function add\(/.test(code(b16)));
  ok('둘 다 reportNameKit 을 씀', /reportNameKit\(profile\)/.test(b13) && /reportNameKit\(profile\)/.test(b16));
  ok('둘 다 sectionCollector 를 씀', /sectionCollector\(\)/.test(b13) && /sectionCollector\(\)/.test(b16));
}
(async()=>{
  const srv = await L.serve(L.ROOT, 0);
  const browser = await L.puppeteer().launch({executablePath:L.chromePath(), headless:'new', args:['--no-sandbox']});
  try{
    const p = await L.openPage(browser, {state:L.makeState(), width:390, height:800, hook:true});
    await p.goto(srv.url+'/fortune.html', {waitUntil:'networkidle0'});
    const r = await p.evaluate(()=>{
      const T = window.__INYEON_TEST__; const out = {};
      const k1 = T.reportNameKit({name:'가영'}), k2 = T.reportNameKit({name:''}), k3 = T.reportNameKit({name:'민수'}), k4 = T.reportNameKit({name:'<b>x</b>'});
      out.name = [k1.name, k2.name, k3.name, k4.safeName];
      out.josa = [k1.T('{n}은 {n}이 {n}을'), k3.T('{n}은 {n}이 {n}을'), k2.T('{n}은')];
      const prof = {id:'x', name:'가영', mbti:'ENFP', gender:'F', calendarType:'solar', year:1990, month:3, day:15, birthTime:{hour:9,minute:0}, birthLon:126.98, solarTimeAdjust:true};
      const s = T.buildReport13(prof, T.getSajuResult(prof)), m = T.buildMbtiReport16(prof);
      const all = s.sections.concat(m.sections);
      out.n = [s.sections.length, m.sections.length];
      out.leftover = all.filter(x => /\{n\}/.test(x.body) || /\{n\}/.test(x.title)).length;
      out.hasName = all.filter(x => /가영님/.test(x.body)).length;
      const bad = T.buildMbtiReport16({id:'y', name:'<b>x</b>', mbti:'ISTJ', gender:'M'});
      out.escaped = bad.sections.every(x => x.body.indexOf('<b>x</b>') < 0);
      return out;
    });
    ok("이름 규칙: '가영님' · 없으면 '이분'", r.name[0]==='가영님' && r.name[1]==='이분' && r.name[2]==='민수님', r.name.join(','));
    ok('이름은 이스케이프됨', r.name[3]==='&lt;b&gt;x&lt;/b&gt;님', r.name[3]);
    ok("조사: 가영님은·가영님이·가영님을 / 민수님은·민수님이·민수님을 / 이분은", r.josa[0]==='가영님은 가영님이 가영님을' && r.josa[1]==='민수님은 민수님이 민수님을' && r.josa[2]==='이분은', r.josa.join(' | '));
    ok('사주 13장 · 성격유형 13장 (16은 유형 수)', r.n[0]===13 && r.n[1]===13, r.n.join('/'));
    ok('본문에 {n} 이 남아 있지 않음', r.leftover===0, r.leftover);
    ok("본문 여러 장에 '가영님' 이 실제로 찍힘", r.hasName >= 5, r.hasName);
    ok('이름의 태그가 본문에 날것으로 안 들어감', r.escaped === true);
  }catch(e){ ok('브라우저 실행', false, e.message); }
  await browser.close(); srv.close();
  console.log('유료 빌더 부품 — 통과 '+pass+'건 · 실패 '+fail+'건');
  process.exit(fail ? 1 : 0);
})();
