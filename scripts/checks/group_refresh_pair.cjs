/* =====================================================================
   모임 [내 정보 갱신] — 화면 ↔ 서버 한 쌍 + 서버 함수 실제 실행 (빠른 층)
   ---------------------------------------------------------------------
   2026-09-21 대표님 지시("TEST 프로필은 ENTJ인데 테스트라는 프로필 ENFP로 들어가 있다" → "엉 바꿔야할 거 같다").
   명단은 링크로 들어온 순간의 값이라 프로필을 고쳐도 안 따라갔다. 이제 내 줄만 갈아 끼운다.
   ★ 제일 나쁜 실패는 **남의 줄을 바꾸는 것**이다 — 옛 줄이 정확히 있어야만 바꾸고, 새 줄이 이미
     다른 자리에 있으면 안 바꾼다. 여기서 그것을 서버 함수를 실제로 돌려 본다(가짜 저장소).
===================================================================== */
const fs = require('fs');
const path = require('path');
const { ROOT, reporter } = require('../_lib.cjs');
const R = reporter('모임 내 정보 갱신(짝)');

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
const html = strip(fs.readFileSync(path.join(ROOT, 'fortune.html'), 'utf8'));
const api  = strip(fs.readFileSync(path.join(ROOT, 'api/group.js'), 'utf8'));
const lib  = strip(fs.readFileSync(path.join(ROOT, 'api/_lib/groups.js'), 'utf8'));

R.head('── 화면 ↔ 서버 한 쌍');
R.note(/action:'refresh'/.test(html), "화면이 action:'refresh' 를 보낸다");
R.note(/body\.action === 'refresh'/.test(api), "서버가 action:'refresh' 를 받는다");
R.note(/export async function replaceMember\(/.test(lib), 'replaceMember 가 내보내진다');
R.note(/import \{[^}]*\breplaceMember\b[^}]*\} from '\.\/_lib\/groups\.js'/.test(api), '창구가 replaceMember 를 가져온다');
R.note(/tooManyPinTries\(limitKey\)/.test(api) && /'refresh:' \+ body\.groupId/.test(api), '무더기 갱신을 막는 횟수 제한이 있다');
R.note(/okRow\(body\.member\) \|\| !okRow\(body\.newMember\)/.test(api), '옛 줄·새 줄 둘 다 모양을 본다');
R.note(/function groupMyMemberIdx\(\)/.test(html) && /function groupMyRowStale\(\)/.test(html) && /function confirmRefreshMyRow\(\)/.test(html), '화면 함수 셋이 있다');
R.note(/onclick:confirmRefreshMyRow/.test(html), '[내 정보 갱신] 단추가 confirmRefreshMyRow 를 부른다');
R.note(/이 모임에 적힌 내 정보가 지금 프로필과 달라요/.test(html), '안내 문장이 있다');

(async function(){
  process.env.SUPABASE_URL = 'https://fake.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'x'.repeat(40);
  let members = 'A,ENFP,1990,1,2,10,0,F,126.97,1;B,ISTJ,1991,3,4,11,0,M,126.97,1';
  const patches = [];
  globalThis.fetch = async (url, init) => {
    const u = String(url);
    if ((init && init.method) === 'PATCH') { patches.push(JSON.parse(init.body)); members = patches[patches.length-1].members; return { ok:true, status:204, text: async () => '' }; }
    if (u.includes('/groups?group_id=eq.g1')) return { ok:true, status:200, text: async () => JSON.stringify([{group_id:'g1', name:'모임', members, expires_at:'2099-01-01T00:00:00Z'}]) };
    return { ok:true, status:200, text: async () => '[]' };
  };
  let m;
  try{ m = await import('file://' + path.join(ROOT, 'api/_lib/groups.js')); }
  catch(e){ R.bad('groups.js 를 못 불러옴', String(e && e.message).slice(0,120)); R.done(); return; }

  R.head('── 서버 함수를 실제로 돌린다');
  const A = 'A,ENFP,1990,1,2,10,0,F,126.97,1', A2 = 'TEST,ENTJ,1990,1,2,10,0,F,126.97,1', B = 'B,ISTJ,1991,3,4,11,0,M,126.97,1';
  const r1 = await m.replaceMember('g1', A, A2);
  R.note(r1 && r1.ok && members === A2 + ';' + B, '옛 줄이 있으면 그 자리만 새 줄로 바뀐다', members);
  R.note(patches.length === 1 && !('expires_at' in patches[0]), '기한은 안 민다');
  const r2 = await m.replaceMember('g1', 'X,ENFP,1990,1,2,10,0,F,126.97,1', A2);
  R.note(r2 && r2.ok === false && r2.reason === 'not_member', '옛 줄이 없으면 아무것도 안 바꾼다 (not_member)');
  const r3 = await m.replaceMember('g1', A2, B);
  R.note(r3 && r3.ok === false && r3.reason === 'duplicate' && members === A2 + ';' + B, '새 줄이 이미 다른 자리에 있으면 안 바꾼다 (duplicate)');
  const r4 = await m.replaceMember('g1', A2, A2);
  R.note(r4 && r4.ok && r4.same === true && patches.length === 1, '같은 줄이면 서버에 안 쓴다 (same)');
  const r5 = await m.replaceMember('nope', A2, B);
  R.note(r5 && r5.ok === false && r5.reason === 'not_found', '없는 모임은 not_found');
  R.done();
})();
