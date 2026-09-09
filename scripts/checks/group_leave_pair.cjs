/* =====================================================================
   스스로 그룹 나가기 — 화면과 서버가 한 쌍인지 (빠른 층)
   ---------------------------------------------------------------------
   2026-09-09 대표님 지시 "내가 스스로 그룹 못나가?" 로 만든 기능을 지킨다.

   ★ 왜 이 검사가 필요한가: 이 프로젝트에서 지금까지 나간 결함은 성격이 거의 하나다 —
     **한쪽만 고쳤다.** 화면이 보내는 action 과 서버가 받는 action 이 갈리면 아무 표시 없이
     "지금은 나갈 수 없어요"만 뜬다. 글자 대조는 몇 밀리초면 되고 절대 낡지 않는다.
   ★ 화면을 띄우는 검사는 checks-slow/group_leave.cjs 가 따로 한다.
===================================================================== */
const fs = require('fs');
const path = require('path');
const { ROOT, reporter } = require('../_lib.cjs');

const R = reporter('그룹 나가기(한 쌍)');
R.head('── 화면 ↔ 서버 한 쌍');

const html = fs.readFileSync(path.join(ROOT, 'fortune.html'), 'utf8');
const api  = fs.readFileSync(path.join(ROOT, 'api/group.js'), 'utf8');
const lib  = fs.readFileSync(path.join(ROOT, 'api/_lib/groups.js'), 'utf8');

R.note(/action:\s*'leave'/.test(html), "화면이 action:'leave' 를 보낸다");
R.note(/body\.action === 'leave'/.test(api), "서버가 action:'leave' 를 받는다");
R.note(/export async function leaveGroup\(/.test(lib), 'leaveGroup 이 내보내진다');
R.note(/import \{[^}]*\bleaveGroup\b[^}]*\} from '\.\/_lib\/groups\.js'/.test(api),
       'api/group.js 가 leaveGroup 을 가져온다');

/* 자기 줄만 뺀다 — 남의 줄을 지우거나 그룹을 통째로 지우는 길이 열리면 안 된다 */
R.note(/rows\.indexOf\(memberRow\)/.test(lib), '명단에서 그 줄 하나를 찾아 뺀다');
R.note(/if \(idx < 0\) return \{ ok: false, reason: 'not_member' \}/.test(lib),
       '명단에 없는 줄이면 거절한다');
R.note(/tooManyPinTries\(limitKey\)/.test(api), '무더기로 비우지 못하게 횟수를 제한한다');

/* 화면 쪽 부품 */
R.note(/function groupMyMemberRow\(\)/.test(html), 'groupMyMemberRow 가 있다');
R.note(/function confirmLeaveGroup\(\)/.test(html), 'confirmLeaveGroup 이 있다');
R.note(/onclick:confirmLeaveGroup/.test(html), '단추가 confirmLeaveGroup 을 부른다');
R.note(/GROUP_VIEW = \{id:id, name:d\.name, rows:gvRaw\}/.test(html),
       '서버가 준 줄 원문을 자리 맞춰 들고 있는다');
R.note(/forgetGroup\(gid\)/.test(html), '나가면 내 저장 목록에서도 빠진다(묘비 포함)');

/* ★ 안내 글 — 기능이 생겼으면 "만든 분께 부탁하라"는 낡은 문장이 남아 있으면 안 된다 */
R.note(!/그룹을 만든 분께 빼달라고/.test(html),
       "'만든 분께 빼달라고' 라는 낡은 안내가 남아 있지 않다");
const leaveLabelCount = (html.match(/이 그룹에서 나가기/g) || []).length;
R.note(leaveLabelCount >= 3, '[이 그룹에서 나가기] 가 화면·안내·FAQ 에 함께 적혀 있다',
       leaveLabelCount + '곳');

R.done();
