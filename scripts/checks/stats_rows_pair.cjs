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

R.head('── 대시보드 (2026-09-10)');
R.note(/daily,/.test(api) && /const daily = dayList\.map/.test(api), '서버가 하루치 흐름을 내려준다');
R.note(/const DAILY_DAYS = 90/.test(api), '90일치를 담는다');
R.note(/t \+ 9 \* 3600 \* 1000/.test(api), '날짜를 한국 시간으로 가른다 (UTC 로 가르면 밤 일이 다음 날로 넘어간다)');
R.note(/o\.status === 'paid'/.test(api) && /o\.paid_at \|\| o\.created_at/.test(api),
       '매출은 결제가 끝난 날로 센다');
R.note(/function statsWindow/.test(html), '화면이 기간을 스스로 자른다 (서버를 다시 안 부른다)');
R.note(/function statsSum/.test(html), '기간 합계를 만드는 곳이 한 곳이다');
R.note(/type:'date'/.test(html), '날짜를 직접 고르는 칸이 있다');
R.note(/\['all','전체'\]/.test(html) && /\['custom','직접'\]/.test(html), '전체·직접 고르기가 있다');
R.note(/function statsChart/.test(html), '날짜별 그래프를 그린다');
R.note(/STATS_METRICS/.test(html) && (html.match(/\{k:'/g)||[]).length >= 6, '그래프 지표가 여섯이다');
R.note(/function statsDelta/.test(html), '앞 기간과 견준다');
/* 옛 배포본(daily 없음)에서도 화면이 살아야 한다 — 안 그러면 배포 사이에 현황판이 통째로 죽는다 */
R.note(/var HAS_DAILY = !!\(D\.daily && D\.daily\.length\)/.test(html),
       'daily 가 없는 옛 서버에서도 예전 방식으로 그린다');
R.note(/WSUM \? WSUM\.rooms : D\.rooms\[R\]/.test(html), '되돌림 길이 실제로 이어져 있다');
/* 라이브러리를 붙이지 않았는가 — 이 파일은 혼자 열려야 한다 */
R.note(!/cdn\.|chart\.js|d3\.min/i.test(html.slice(html.indexOf('function statsChart'),
       html.indexOf('function statsChart') + 3000)), '그래프에 바깥 라이브러리를 안 쓴다');

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
  /* ── 회원 한 줄 (2026-09-10 대표님 지시) ─────────────────────────
     > "카카오 아이디랑 회원마다 넣은 사주랑 성격유형 넣어줘야지 유료결제 했는지 안했는지 유무도"
     ★ 사주 여덟 글자를 **다시 계산하지 않고** 프로필의 sajuCache 를 읽는지 본다.
       서버가 스스로 계산하기 시작하면 화면과 갈라지고, 갈라진 줄 아무도 모른다. */
  R.head('── 회원 풀이(describeProfile) 를 실제로 돌린다');
  const { describeProfile } = person;
  const prof = {
    name:'가영', mbti:'ENFP', gender:'F',
    year:1990, month:3, day:5, inputYear:1990, inputMonth:2, inputDay:9,
    calendarType:'lunar', lunarLeap:false, birthTime:{hour:9, minute:30},
    birthLonKey:'seoul', birthLon:126.98, solarTimeAdjust:true,
    element:'목', zodiac:'말',
    sajuCache:{year:{text:'경오'}, month:{text:'임오'}, day:{text:'신해'}, hour:{text:'계사'}},
  };
  const dp = describeProfile(prof);
  [['name','가영'],['mbti','ENFP'],['gender','여'],['birth','1990-03-05'],
   ['inputBirth','1990-02-09'],['calendar','음력'],['time','09:30'],
   ['solarTime','보정함'],['saju','경오 임오 신해 계사']].forEach(function(pr){
    R.note(dp && dp[pr[0]] === pr[1], '회원 풀이의 ' + pr[0] + ' 가 맞다',
           (dp ? String(dp[pr[0]]) : '(없음)') + ' (기대 ' + pr[1] + ')');
  });
  /* 양력으로 넣으신 분은 '넣으신 날짜'를 따로 안 적는다 — 같은 값을 두 번 쓰지 않는다 */
  const dp2 = describeProfile(Object.assign({}, prof, {calendarType:'solar', inputMonth:3, inputDay:5}));
  R.note(dp2 && dp2.inputBirth === '', '양력이면 넣으신 날짜를 따로 안 적는다', dp2 ? ('"'+dp2.inputBirth+'"') : '(없음)');
  /* 시각 모름 · 사주 아직 계산 안 됨 */
  const dp3 = describeProfile(Object.assign({}, prof, {birthTime:null, sajuCache:null}));
  R.note(dp3 && dp3.time === '모름', '태어난 시각이 없으면 모름', dp3 ? dp3.time : '(없음)');
  R.note(dp3 && dp3.saju === '', '사주 캐시가 없으면 빈 값을 준다 (지어내지 않는다)');
  R.note(describeProfile(null) === null, '프로필이 없으면 null 을 준다');
  /* 서버가 사주를 스스로 계산하려 들지 않는가 */
  /* ★ 주석은 빼고 본다 — 안 그러면 "여기서 계산하지 마라"라고 적어 둔 주석이
     스스로 걸린다(실제로 걸렸다). 이 프로젝트에서 되풀이된 실수라 방식으로 막는다. */
  const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const personSrc = fs.readFileSync(path.join(ROOT, 'api/_lib/person.js'), 'utf8');
  const noComment = stripComments(api) + '\n' + stripComments(personSrc);
  R.note(!/computeSaju|SajuEngine/.test(noComment),
         '서버가 사주를 다시 계산하지 않는다 (sajuCache 를 읽는다)');
  R.note(/sajuCache/.test(stripComments(personSrc)), '프로필의 sajuCache 를 실제로 읽는다');

  R.head('── 회원 줄이 세 표를 맞대는가');
  R.note(/kakao_links\?select=/.test(api), 'kakao_links 를 읽는다');
  R.note(/user_sync\?kakao_id=in\./.test(api), '그 번호들의 user_sync 를 읽는다');
  R.note(/orders\?session_id=in\./.test(api), '그 세션들의 orders 를 읽는다');
  R.note(/paidCount:/.test(api) && /revenue:/.test(api), '결제 건수와 금액을 함께 준다');
  R.note(/\.map\(describeProfile\)/.test(api), '프로필을 describeProfile 로 푼다');
  R.note(/결제\s*안\s*한|paidCount \? /.test(html) || /없음/.test(html),
         "결제가 없으면 화면이 '없음'이라고 적는다");

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
