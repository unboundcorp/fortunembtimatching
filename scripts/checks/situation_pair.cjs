/* =====================================================================
   고민 고르기 — 화면·서버 한 쌍 (빠른 층) · 2026-10-19
   ① 기기 사이 병합: 상대 기기의 aiSituation 은 빈 칸만 채운다(이 기기 값은 안 덮음)
   ② 서버 권한 창구가 made 를 내려준다 ③ AI 규칙 7-7 이 있다 · PROMPT_VERSION 은 그대로(저장 열쇠 안 바뀜)
   ④ 화면이 이미 만든 풀이에는 안 묻는다(aiMadeFor) · 모르면 묻지 않는다
===================================================================== */
const fs = require('fs'), path = require('path');
const { ROOT, reporter } = require('../_lib.cjs');
const R = reporter('고민 고르기 한 쌍');
const html = fs.readFileSync(path.join(ROOT, 'fortune.html'), 'utf8');
const m = /function syncMergeList\(local, remote\)\{[\s\S]*?\n\}/.exec(html);
R.note(!!m, 'syncMergeList 를 찾았다');
if(m){
  const syncMergeList = new Function(m[0] + '; return syncMergeList;')();
  const local = [{id:'p1', aiSituation:{'mbti_full':{love:'solo'}}}];
  const remote = [{id:'p1', aiSituation:{'mbti_full':{love:'dating'}, 'saju_full:2026':{focus:'money'}}}, {id:'p2'}];
  const out = syncMergeList(local, remote);
  R.note(out[0].aiSituation.mbti_full.love === 'solo', '① 이 기기 값은 안 덮는다', JSON.stringify(out[0].aiSituation));
  R.note(out[0].aiSituation['saju_full:2026'] && out[0].aiSituation['saju_full:2026'].focus === 'money', '① 빈 칸은 상대 값으로 채운다');
  R.note(out.length === 2, '① 새 프로필은 그대로 더한다');
}
const ent = fs.readFileSync(path.join(ROOT, 'api/entitlements.js'), 'utf8');
R.note(/ent\.made = \(madeR\.value/.test(ent), '② 권한 창구가 made 를 내려준다');
R.note(/if\(Array\.isArray\(raw\.made\)\) out\.made =/.test(html), '② 화면이 made 를 받아 둔다');
const ap = fs.readFileSync(path.join(ROOT, 'api/_lib/aiprompt.js'), 'utf8');
R.note(/7-7\. \*\*요청서에 situation/.test(ap), '③ AI 규칙 7-7');
R.note(/PROMPT_VERSION = 14;/.test(ap), '③ PROMPT_VERSION 그대로 14 (올리면 모든 저장 열쇠가 바뀝니다)');
R.note(/return Array\.isArray\(m\) \? m\.indexOf\(pid\) >= 0 : true;/.test(html), '④ made 를 모르면 만든 것으로 본다(묻지 않음)');
R.note(/!situationAsked\(sitP, product\.id\) && !aiMadeFor\(product\.id\)/.test(html), '④ 이미 만든 풀이에는 안 묻는다');
R.done();
