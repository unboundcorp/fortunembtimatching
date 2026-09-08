#!/usr/bin/env node
/* 모임 목록이 카카오 계정을 따라갈 때의 병합 규칙 (2026-09-08 대표님 지시로 생김).
   ---------------------------------------------------------------------
   왜 검사가 필요한가: 같은 모임인데 기기마다 아는 것이 다르다. 만든 기기에는
   관리 열쇠(token)가 있고 링크로 들어간 기기에는 없다. 보통 목록 병합처럼
   id만 보고 한쪽을 버리면 **열쇠가 사라져 다른 기기에서 관리가 안 된다.**
   그래서 "빈 칸만 채우고, 이 기기 값은 덮어쓰지 않는다"를 못 박아 둔다.
   ★ DOM이 없어도 도는 함수라 브라우저를 안 띄운다 — 빠른 층에 둔다. */
const fs = require('fs');
const path = require('path');
const { ROOT, reporter } = require('../_lib.cjs');

const R = reporter('모임 동기화');
const s = fs.readFileSync(path.join(ROOT, 'fortune.html'), 'utf8');

const i = s.indexOf('function syncMergeGroups(');
if (i < 0) { R.bad('syncMergeGroups 가 없다'); R.done(); }
const j = s.indexOf('\nfunction syncMerge(', i);
const merge = new Function('return (' + s.slice(i, j) + ')')();

/* 지운 표식(묘비) 병합 — 2026-09-09 대표님 제보("지웠는데 상대거에 반영이 안 되냐")로 생김 */
const ti = s.indexOf('function syncMergeTombs(');
if (ti < 0) { R.bad('syncMergeTombs 가 없다'); R.done(); }
const tj = s.indexOf('\n}', ti) + 2;
const DAY = 24 * 60 * 60 * 1000;
const mergeTombs = new Function('GROUP_TTL_MS',
  'return (' + s.slice(ti, tj) + ')')(365 * DAY);

R.head('── 모임 목록 병합');
R.note(/'savedGroups'/.test(s.slice(s.indexOf('var SYNC_KEYS'), s.indexOf('var SYNC_LISTS'))),
  'savedGroups 가 화면 동기화 목록에 있다');

/* ★ 화면 SYNC_KEYS와 서버 ALLOWED는 한 쌍이다. 화면에만 늘리면 서버가 조용히 버린다 —
   2026-09-08에 실제로 그렇게 됐다(savedGroups가 user_sync에 아예 안 올라갔다).
   그때는 화면만 보고 "됐다"고 할 뻔했다. 두 목록을 기계로 대조한다. */
const api = fs.readFileSync(path.join(ROOT, 'api', 'sync.js'), 'utf8');
const grab = (src, from, to) => {
  const a = src.indexOf(from); if (a < 0) return [];
  const b = src.indexOf(to, a);
  return (src.slice(a, b).match(/'([A-Za-z0-9_]+)'/g) || []).map((x) => x.replace(/'/g, ''));
};
const clientKeys = grab(s, 'var SYNC_KEYS', '];');
const serverKeys = grab(api, 'const ALLOWED', '];');
const missing = clientKeys.filter((k) => serverKeys.indexOf(k) < 0);
R.note(clientKeys.length > 0 && serverKeys.length > 0, '두 목록을 다 찾았다',
  '화면 ' + clientKeys.length + '칸 · 서버 ' + serverKeys.length + '칸');
R.note(missing.length === 0, '화면이 보내는 칸을 서버가 다 받는다',
  missing.length ? ('서버가 버리는 칸: ' + missing.join(', ')) : '버리는 칸 없음');

let r = merge([{ id: 'g1', name: '회사 모임', at: 200, token: null, n: 3, rel: null }],
              [{ id: 'g1', name: '회사', at: 100, token: 'TOK', n: null, rel: 'coworker' }]);
R.note(r.length === 1 && r[0].token === 'TOK' && r[0].rel === 'coworker' && r[0].n === 3,
  '빈 칸만 상대에게서 채운다 (열쇠·사이)', JSON.stringify(r[0]));

r = merge([{ id: 'g1', name: '내가 바꾼 이름', at: 5, token: 'A', n: 2, rel: 'friend' }],
          [{ id: 'g1', name: '옛 이름', at: 9, token: 'B', n: 9, rel: 'family' }]);
R.note(r[0].name === '내가 바꾼 이름' && r[0].token === 'A' && r[0].rel === 'friend',
  '이 기기에 있는 값은 덮어쓰지 않는다', JSON.stringify(r[0]));

r = merge([{ id: 'a', name: 'A', at: 1 }], [{ id: 'b', name: 'B', at: 2 }]);
R.note(r.length === 2 && r[0].id === 'b', '상대에만 있는 모임을 받아 최근 순으로 놓는다',
  r.map((x) => x.id).join(','));

R.note(merge(Array.from({ length: 30 }, (_, k) => ({ id: 'x' + k, at: k })), []).length === 20,
  '스무 개까지만 남긴다');

let died = false;
try { merge(null, null); merge([null, {}, { id: 'ok' }], undefined); } catch (e) { died = true; }
R.note(!died && merge(null, null).length === 0 && merge([null, {}, { id: 'ok' }], undefined).length === 1,
  '이상한 값에 죽지 않고 id 없는 줄은 버린다');

R.head('── 지운 모임이 되살아나지 않는가');

/* ★ 이것이 없으면 폰에서 지운 모임이 노트북에서 되돌아온다. 합집합 병합의 구조적 결함이다. */
{
  const now = Date.now();
  const tombs = [{ id: 'G2', at: now }];
  const got = merge(
    [{ id: 'G1', name: '남는 것', at: now, token: 't1', n: 2, rel: 'friend' }],
    [{ id: 'G1', name: '남는 것', at: now, token: 't1', n: 2, rel: 'friend' },
     { id: 'G2', name: '지운 것', at: now, token: 't2', n: 3, rel: null }],
    tombs);
  R.note(got.length === 1 && got[0].id === 'G1',
    '표식이 있는 모임은 상대 기기에 남아 있어도 되살아나지 않는다',
    got.map((x) => x.id).join(','));
}
{
  /* 이 기기에 아직 남아 있고 상대가 지웠을 때 — 이쪽에서도 사라져야 한다 */
  const now = Date.now();
  const got = merge([{ id: 'G9', name: '내가 들고 있던 것', at: now }], [], [{ id: 'G9', at: now }]);
  R.note(got.length === 0, '상대 기기에서 지운 것은 이 기기에서도 빠진다', '남은 ' + got.length + '개');
}
{
  /* 표식을 안 주면 예전 그대로 돌아야 한다 — 옛 저장본에는 deletedGroups 칸이 없다 */
  const now = Date.now();
  const got = merge([{ id: 'A', at: now }], [{ id: 'B', at: now - 1 }]);
  R.note(got.length === 2, '표식이 없던 옛 저장본에서도 그대로 돈다', got.map((x) => x.id).join(','));
}
{
  const now = Date.now();
  const t = mergeTombs([{ id: 'A', at: now - 1000 }], [{ id: 'A', at: now }, { id: 'B', at: now }]);
  R.note(t.length === 2, '표식을 합칠 때 같은 id는 한 줄로 모은다', t.map((x) => x.id).join(','));
  const a = t.filter((x) => x.id === 'A')[0];
  R.note(a && a.at === now, '같은 id면 나중에 지운 시각을 남긴다');
}
{
  const old = mergeTombs([{ id: 'OLD', at: Date.now() - 400 * DAY }], []);
  R.note(old.length === 0, '보관 기간이 지난 표식은 버린다 (서버에도 없는 모임이다)',
    '남은 ' + old.length + '개');
}
{
  const many = [];
  for (let k = 0; k < 80; k++) many.push({ id: 'X' + k, at: Date.now() - k });
  R.note(mergeTombs(many, []).length === 50, '표식은 쉰 개까지만 들고 있는다');
}
{
  const bad = mergeTombs([null, { at: 1 }, 'x'], [{ id: 'OK', at: Date.now() }]);
  R.note(bad.length === 1 && bad[0].id === 'OK', '이상한 값에 죽지 않고 id 없는 줄은 버린다');
}
R.note(/'deletedGroups'/.test(s.slice(s.indexOf('var SYNC_KEYS'), s.indexOf('var SYNC_LISTS'))),
  'deletedGroups 가 화면 동기화 목록에 있다');

R.done();
