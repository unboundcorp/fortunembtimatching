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

R.head('── 모임 목록 병합');
R.note(/'savedGroups'/.test(s.slice(s.indexOf('var SYNC_KEYS'), s.indexOf('var SYNC_LISTS'))),
  'savedGroups 가 카카오 동기화 목록에 있다');

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

R.done();
