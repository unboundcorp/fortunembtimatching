/* =====================================================================
   관리자 원자료 표 — 화면과 서버가 한 쌍인지 (빠른 층)
   ---------------------------------------------------------------------
   2026-09-10 대표님 지시로 만든 기능을 지킨다.
     > "이거만 보이고 끝이야? 누르면 디테일하게 로우데이터 표가 있어야하는 거 아니냐?"
     > "관리자 페이지에서는 모든 정보가 다 보여야한다 일목 요연하게!
     >  시간부터 내용 멘트 하나하나 다 보여야된다"

   ★ 여기서 제일 중요한 두 줄
     ① **사람 한 줄을 푸는 순서가 화면 INVITE_FIELDS 와 같은가.** 서버 decodePerson 은
        n,m,y,mo,d,h,mi,g,lo,ts 순서를 손으로 세고 있다. 화면 쪽 표를 한 칸이라도 옮기면
        관리자 화면에 **남의 생년월일이 다른 사람 이름으로** 찍힌다. 조용히 틀리는 종류다.
     ② **이 창구가 운영자 관문 뒤에 있는가.** 손님이 부를 수 있게 되면 저장된 모든 분의
        이름·생년월일이 통째로 새어 나간다.

   ★ 화면을 띄우는 검사는 checks-slow/stats_rows.cjs 가 따로 한다.
===================================================================== */
const fs = require('fs');
const path = require('path');
const { ROOT, reporter } = require('../_lib.cjs');

const R = reporter('관리자 원자료(한 쌍)');
const html = fs.readFileSync(path.join(ROOT, 'fortune.html'), 'utf8');
const api  = fs.readFileSync(path.join(ROOT, 'api/stats.js'), 'utf8');

R.head('── 창구가 있는가');
R.note(/body\.action === 'rows'/.test(api), "서버가 action:'rows' 를 받는다");
R.note(/action:'rows', kind:kind/.test(html), "화면이 action:'rows' 와 갈래를 보낸다");

R.head('── 갈래가 양쪽에서 같은가');
const clientKinds = (function(){
  const m = /var STATS_ROW_KINDS = \{([\s\S]*?)\};/.exec(html);
  if(!m) return [];
  return (m[1].match(/(\w+)\s*:/g) || []).map(s => s.replace(/\s*:$/, ''));
})();
const serverKinds = (api.match(/kind === '(\w+)'/g) || []).map(s => /'(\w+)'/.exec(s)[1]);
R.note(clientKinds.length === 6, '화면 갈래가 여섯이다', clientKinds.join(','));
clientKinds.forEach(function(k){
  R.note(serverKinds.indexOf(k) >= 0, "서버가 '" + k + "' 를 안다");
  R.note(new RegExp("S\\.kind === '" + k + "'").test(html), "화면이 '" + k + "' 를 그린다");
});
serverKinds.forEach(function(k){
  R.note(clientKinds.indexOf(k) >= 0, "서버 갈래 '" + k + "' 를 화면이 부를 수 있다");
});

R.head('── 사람 한 줄을 푸는 순서 (여기가 어긋나면 남의 정보가 섞인다)');
const fieldKeys = (function(){
  const m = /var INVITE_FIELDS = \[([\s\S]*?)\n\];/.exec(html);
  if(!m) return [];
  return (m[1].match(/\{k:\s*'(\w+)'/g) || []).map(s => /'(\w+)'/.exec(s)[1]);
})();
R.note(fieldKeys.length === 10, '화면 INVITE_FIELDS 가 열 칸이다', fieldKeys.join(','));

R.head('── 운영자 관문 뒤에 있는가 (제일 중요)');
const grantAt = api.indexOf('const grant = await adminAccessOf(sessionId)');
const rowsAt  = api.indexOf("body.action === 'rows'");
R.note(grantAt > 0, '운영자 판정이 있다');
R.note(rowsAt > grantAt, '원자료 창구가 운영자 판정 **뒤에** 있다',
       '판정 ' + grantAt + ' · 창구 ' + rowsAt);
R.note(/if \(!grant\) return json\(res, 404/.test(api), '허가가 없으면 404 로 답한다');

R.head('── 시각을 초까지 적는가');
R.note(/second:'2-digit'/.test(html), '화면이 초까지 그린다');
R.note(/function statsTime/.test(html), '시각 만드는 곳이 한 곳이다 (statsTime)');

R.head('── 되돌아갈 길이 있는가');
R.note(/현황으로/.test(html), '[← 현황으로] 가 있다');
R.note(/STATS_ROWS=null/.test(html) || /STATS_ROWS = null/.test(html),
       '현황을 다시 불러오면 원자료 화면을 내려놓는다');
R.note(/parts\.push\(STATS_ROWS \?/.test(html), '원자료가 viewKeyNow 에 들어 있다 (스크롤 맨 위)');

/* ★ 여기서부터가 이 검사의 핵심이다 — 서버 디코더를 **실제로 돌려** 본다.
   글자 대조만 하면 f[2] 와 f[3] 을 맞바꿔도 통과한다(실제로 일부러 바꿔 확인했다).
   화면이 만드는 줄과 똑같은 문자열을 넣고, 나온 값이 그 사람이 맞는지 본다. */
(async () => {
  const person = await import('../../api/_lib/person.js');
  const { decodePersonRow, PERSON_FIELDS } = person;

  R.head('── 서버 디코더를 실제로 돌린다');
  R.note(PERSON_FIELDS.join(',') === fieldKeys.join(','),
         '서버 필드 순서가 화면 INVITE_FIELDS 와 글자까지 같다',
         PERSON_FIELDS.join(',') + ' vs ' + fieldKeys.join(','));

  /* 화면 gcMeetRow 와 같은 규칙으로 만든 줄 — 이름은 encodeURIComponent 로 감싼다 */
  const row = [encodeURIComponent('가영'), 'ENFP', '1990', '3', '5', '9', '30', 'F', '126.98', '1'].join(',');
  const got = decodePersonRow(row);
  R.note(!!got, '한 줄이 풀린다');
  const want = {name:'가영', mbti:'ENFP', birth:'1990-03-05', time:'09:30',
                gender:'여', lon:'126.98', solarTime:'보정함'};
  Object.keys(want).forEach(function(k){
    R.note(got && got[k] === want[k], '푼 값의 ' + k + ' 가 맞다',
           (got ? String(got[k]) : '(없음)') + ' (기대 ' + want[k] + ')');
  });

  /* 남자 · 시각 모름 · 보정 안 함 */
  const row2 = [encodeURIComponent('민수'), 'ISTJ', '1988', '11', '22', '', '', 'M', '129.08', '0'].join(',');
  const g2 = decodePersonRow(row2);
  R.note(g2 && g2.gender === '남', "성별 'M' 을 남으로 푼다", g2 ? g2.gender : '(없음)');
  R.note(g2 && g2.time === '모름', '태어난 시각이 비면 모름으로 적는다', g2 ? g2.time : '(없음)');
  R.note(g2 && g2.birth === '1988-11-22', '한 자리 달·날에 0을 채운다', g2 ? g2.birth : '(없음)');
  R.note(g2 && g2.solarTime === '보정 안 함', '진태양시 보정 안 함을 그대로 적는다');

  /* 칸이 모자라면 안 푼다 — 헐거운 값으로 남의 줄을 만들어 내면 안 된다 */
  R.note(decodePersonRow('가영,ENFP,1990') === null, '칸이 모자라면 null 을 준다');
  R.note(decodePersonRow('') === null, '빈 줄이면 null 을 준다');
  R.note(decodePersonRow(null) === null, '없는 값이면 null 을 준다');

  /* 이름에 쉼표·세미콜론이 들어 있어도 칸이 안 밀리는가 (구분자를 고른 이유) */
  const row3 = [encodeURIComponent('김,철;수'), 'INFJ', '2000', '1', '2', '0', '5', 'M', '127', '0'].join(',');
  const g3 = decodePersonRow(row3);
  R.note(g3 && g3.name === '김,철;수', '이름 속 쉼표·세미콜론이 칸을 안 민다', g3 ? g3.name : '(없음)');
  R.note(g3 && g3.mbti === 'INFJ', '그 다음 칸이 안 밀린다', g3 ? g3.mbti : '(없음)');
  R.note(g3 && g3.time === '00:05', '0시 5분을 00:05 로 적는다', g3 ? g3.time : '(없음)');

  /* 서버가 이 모듈을 실제로 쓰는가 (베껴 적어 두면 한쪽만 고쳐진다) */
  /* 이어보기 칸이 실제 저장 항목과 맞는가 — 여기가 어긋나면 관리자 화면이
     실제보다 적게 세고, 그것을 눈으로는 알 수 없다. */
  R.head('── 이어보기 셈이 저장 항목과 맞는가');
  const sync = fs.readFileSync(path.join(ROOT, 'api/sync.js'), 'utf8');
  const allowed = (function(){
    const m = /const ALLOWED = \[([\s\S]*?)\];/.exec(sync);
    return m ? (m[1].match(/'(\w+)'/g) || []).map(x => x.replace(/'/g,'')) : [];
  })();
  const histKeys = allowed.filter(k => /History$/.test(k));
  R.note(histKeys.length > 0, '저장 항목에서 기록 칸을 찾았다', histKeys.join(','));
  histKeys.forEach(function(k){
    R.note(new RegExp('cnt\\(d\\.' + k + '\\)').test(api), "관리자 화면이 '" + k + "' 도 센다");
  });
  R.note(/cnt\(d\.profiles\)/.test(api), '프로필도 센다');
  R.note(/cnt\(d\.savedGroups\)/.test(api), '저장한 그룹도 센다');

  R.head('── 서버가 그 모듈을 쓰는가');
  R.note(/from '\.\/_lib\/person\.js'/.test(api), 'api/stats.js 가 person.js 를 가져온다');
  R.note(/decodePerson = decodePersonRow/.test(api), '가져온 것을 그대로 쓴다 (베껴 적지 않았다)');
  R.note(!/f\[7\] === 'M'/.test(api), 'stats.js 안에 칸 번호를 다시 적어 두지 않았다');

  R.done();
})().catch((e) => { console.error('검사 자체가 터졌습니다:', e && e.message); process.exit(2); });
