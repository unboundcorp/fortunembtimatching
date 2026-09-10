/* =====================================================================
   어드민 — 화면과 서버가 한 쌍인지 (빠른 층)
   ---------------------------------------------------------------------
   2026-09-10~11 대표님 지시로 만든 관리자 화면을 지킨다.
     > "누르면 디테일하게 로우데이터 표가 있어야하는 거 아니냐?"
     > "관리자 페이지에서는 모든 정보가 다 보여야한다 일목 요연하게!"
     > "카카오 아이디랑 회원마다 넣은 사주랑 성격유형 넣어줘야지 유료결제 했는지 안했는지 유무도"
     > "대시보드도 좀 넣어둬라! 날짜 요소도 넣어두고!"
     > "어드민 페이지 고도화해라 … 모바일 버전도 호환되게 해야한다"
     > "공지/배너는 나중을 위해서 구현은 해놔라"

   ★ 이 검사의 핵심 두 줄
     ① **사람 정보를 푸는 코드를 실제로 돌려 본다.** 글자 대조만 하면 칸 번호를 뒤섞어도
        통과한다(실제로 그렇게 통과시킨 적이 있어 이 검사를 만들었다).
     ② **운영자 관문 뒤에 있는지 본다.** 손님이 부를 수 있게 되면 저장된 모든 분의
        이름·생년월일이 통째로 샌다.
   ★ 화면을 띄우는 검사는 checks-slow/admin_shell.cjs 가 따로 한다.
===================================================================== */
const fs = require('fs');
const path = require('path');
const { ROOT, reporter } = require('../_lib.cjs');

const R = reporter('어드민(한 쌍)');
const html   = fs.readFileSync(path.join(ROOT, 'fortune.html'), 'utf8');
const api    = fs.readFileSync(path.join(ROOT, 'api/stats.js'), 'utf8');
const notice = fs.readFileSync(path.join(ROOT, 'api/notice.js'), 'utf8');
const sync   = fs.readFileSync(path.join(ROOT, 'api/sync.js'), 'utf8');
const personSrc = fs.readFileSync(path.join(ROOT, 'api/_lib/person.js'), 'utf8');

/* 주석은 빼고 본다 — 안 그러면 "여기서 하지 마라"라고 적어 둔 주석이 스스로 걸린다.
   이 프로젝트에서 되풀이된 실수라 방식으로 막는다. */
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

R.head('── 원자료 창구');
R.note(/body\.action === 'rows'/.test(api), "서버가 action:'rows' 를 받는다");
R.note(/action:'rows', kind:kind/.test(html), "화면이 action:'rows' 와 갈래를 보낸다");

const serverKinds = [...new Set((api.match(/kind === '(\w+)'/g) || []).map(s => /'(\w+)'/.exec(s)[1]))];
['rooms','groups','orders','ai','kakao','sync'].forEach(function(k){
  R.note(serverKinds.indexOf(k) >= 0, "서버가 '" + k + "' 갈래를 안다");
});

R.head('── 어드민 메뉴가 실제 화면과 짝이 맞는가');
const menuKeys = (function(){
  const m = /var ADMIN_MENUS = \[([\s\S]*?)\n\];/.exec(html);
  return m ? (m[1].match(/key:'(\w+)'/g) || []).map(x => /'(\w+)'/.exec(x)[1]) : [];
})();
R.note(menuKeys.length === 8, '메뉴가 여덟이다', menuKeys.join(','));
menuKeys.forEach(function(k){
  const fn = 'admin' + k[0].toUpperCase() + k.slice(1);
  R.note(new RegExp('function ' + fn + '\\(').test(html), k + ' 메뉴를 그리는 함수가 있다 (' + fn + ')');
  R.note(new RegExp("\\b" + k + ":\\s*\\{title:").test(html), k + ' 의 제목·서브라인이 적혀 있다');
});
/* 메뉴에서 쓰는 아이콘이 실제로 그려지는가 — 없으면 조용히 다른 그림이 나온다 */
const iconKeys = (function(){
  const m = /var P = \{([\s\S]*?)\n  \};/.exec(html);
  return m ? (m[1].match(/^\s*(\w+):'/gm) || []).map(x => /(\w+):/.exec(x)[1]) : [];
})();
const usedIcons = (html.match(/icon:'(\w+)'/g) || []).map(x => /'(\w+)'/.exec(x)[1]);
[...new Set(usedIcons)].forEach(function(i){
  R.note(iconKeys.indexOf(i) >= 0, "아이콘 '" + i + "' 가 실제로 그려진다");
});

R.head('── 없는 기능에 단추를 만들지 않았는가');
/* ★ 주석을 뺀 코드에서 본다. 안 그러면 "이건 안 만들었다"라고 적어 둔 주석이 스스로 걸린다 —
   실제로 걸렸다(이 프로젝트에서 세 번째다). */
const codeOnly = strip(html);
const menuLabels = (function(){
  const m = /var ADMIN_MENUS = \[([\s\S]*?)\n\];/.exec(html);
  return m ? (m[1].match(/label:'([^']+)'/g) || []).map(x => /'([^']+)'/.exec(x)[1]) : [];
})();
['신고','쿠폰','A/B','푸시','감사'].forEach(function(w){
  R.note(!menuLabels.some(function(l){ return l.indexOf(w) >= 0; }),
         "메뉴에 '" + w + "' 가 없다 (기능이 없으므로)");
});
R.note(!/function adminReports\(|function adminCoupons\(/.test(codeOnly),
       '신고·쿠폰 화면을 그리는 함수 자체가 없다');
R.note(/환불 처리 단추는 아직 없어요/.test(html), '환불 단추를 왜 안 만들었는지 화면에 적었다');
R.note(/접속자 수\(DAU\/MAU\)/.test(html), '없는 지표를 지어내지 않고 그 사실을 적었다');

R.head('── 바깥에 기대지 않는가 (이 파일은 혼자 열려야 한다)');
const adminBlock = html.slice(html.indexOf('function adminIcon'), html.indexOf('function renderStats'));
R.note(!/unpkg\.com|cdn\.jsdelivr|phosphoricons|googleapis/.test(adminBlock),
       '어드민이 바깥 CDN 을 안 부른다');
R.note(/createElementNS\('http:\/\/www\.w3\.org\/2000\/svg','svg'\)/.test(adminBlock),
       '아이콘·그래프를 인라인 SVG 로 그린다');

R.head('── 셸이 #app 밖에 있는가 (안에 두면 넓은 화면에서 420px 에 갇힌다)');
R.note(/<div id="adminRoot" hidden><\/div>/.test(html), '#adminRoot 가 문서에 있다');
const appEnd = html.indexOf('<div id="adminRoot"');
const appStart = html.indexOf('<div id="app">');
R.note(appStart > 0 && appEnd > appStart && html.slice(appStart, appEnd).lastIndexOf('</div>') > 0,
       '#adminRoot 가 #app 바깥에 있다');
R.note(/#adminRoot\{position:fixed;inset:0;z-index:45;/.test(html),
       '겹침 순서가 탭 막대(30)·떠 있는 단추(40) 위다');
R.note(/\.modal-backdrop\{[^}]*z-index:50/.test(html), '창(모달)은 그보다 위라 어드민 위에 뜬다');
R.note(/@media \(max-width:899px\)/.test(html), '900px 밑에서 서랍으로 바뀐다');

R.head('── 운영자 관문 뒤에 있는가 (제일 중요)');
const grantAt = api.indexOf('const grant = await adminAccessOf(sessionId)');
const rowsAt  = api.indexOf("body.action === 'rows'");
R.note(grantAt > 0, 'stats 에 운영자 판정이 있다');
R.note(rowsAt > grantAt, '원자료 창구가 운영자 판정 **뒤에** 있다', '판정 ' + grantAt + ' · 창구 ' + rowsAt);
R.note(/if \(!grant\) return json\(res, 404/.test(api), '허가가 없으면 404 로 답한다');
/* 공지 — 'active' 만 손님이 부를 수 있고 나머지는 관문 뒤여야 한다 */
const nActive = notice.indexOf("body.action === 'active'");
const nGrant  = notice.indexOf('const grant = await adminAccessOf(sessionId)');
const nList   = notice.indexOf("body.action === 'list'");
const nSave   = notice.indexOf("body.action === 'save'");
R.note(nActive > 0 && nGrant > nActive, "공지: 손님용 'active' 가 관문 앞에 있다");
R.note(nList > nGrant && nSave > nGrant, '공지: list·save 는 관문 **뒤**에 있다');
R.note(/select=id,title,body,kind,starts_at,ends_at/.test(notice) && /\{ id: r\.id, title: r\.title, body: r\.body, kind: r\.kind \}/.test(notice),
       '손님에게는 제목·본문·종류만 준다 (관리용 값을 안 얹는다)');
R.note(/action:'active'/.test(html), '화면이 손님용 창구를 부른다');

R.head('── 시각·날짜');
R.note(/second:'2-digit'/.test(html), '시각을 초까지 적는다');
R.note(/function statsTime/.test(html), '시각 만드는 곳이 한 곳이다 (statsTime)');
R.note(/t \+ 9 \* 3600 \* 1000/.test(api), '날짜를 한국 시간으로 가른다');
R.note(/const DAILY_DAYS = 90/.test(api), '하루치 흐름을 90일 담는다');
R.note(/o\.paid_at \|\| o\.created_at/.test(api), '매출은 결제가 끝난 날로 센다');
R.note(/function statsWindow/.test(html) && /function statsSum/.test(html),
       '기간은 화면에서 자른다 (서버를 다시 안 부른다)');
R.note(/type:'date'/.test(html), '날짜를 직접 고르는 칸이 있다');
R.note(/type:'datetime-local'/.test(html), '공지 기간을 시각까지 고른다');

R.head('── 주소에 화면이 적히는가 (새로고침해도 그 자리)');
R.note(/function adminSyncHash/.test(html), '주소에 화면을 적는다');
R.note(/function adminFromHash/.test(html), '주소를 읽어 화면을 맞춘다');
R.note(/keepHash = \/\^#admin\(\\\/\|\$\)\/\.test/.test(html) || /#admin\(/.test(html),
       '부팅 때 주소를 지우면서 #admin 은 남긴다');
R.note(/history\.replaceState\(history\.state, '', location\.pathname \+ location\.search \+ want\)/.test(html),
       'pushState 가 아니라 replaceState 다 (뒤로가기가 어드민 안에서 맴돌지 않게)');

R.head('── 옛 화면을 지웠는가 (두 벌 두면 한쪽만 고치게 된다)');
R.note(!/function renderStatsRows/.test(html), '옛 원자료 화면을 지웠다');
R.note(!/STATS_ROWS/.test(html), '옛 상태값을 지웠다');
R.note(/function renderStats\(\)\{\n  var main=\$\('#main'\); main\.innerHTML='';\n  main\.appendChild\(buildAdminLocked\(\)\);/.test(html),
       'renderStats 에는 잠김 안내만 남았다');

/* ── 여기서부터가 이 검사의 핵심 — 서버 코드를 **실제로 돌려** 본다 ── */
(async () => {
  const person = await import('../../api/_lib/person.js');
  const { decodePersonRow, PERSON_FIELDS, describeProfile } = person;

  R.head('── 사람 한 줄 푸는 코드를 실제로 돌린다');
  const fieldKeys = (function(){
    const m = /var INVITE_FIELDS = \[([\s\S]*?)\n\];/.exec(html);
    return m ? (m[1].match(/\{k:\s*'(\w+)'/g) || []).map(x => /'(\w+)'/.exec(x)[1]) : [];
  })();
  R.note(fieldKeys.length === 10, '화면 INVITE_FIELDS 가 열 칸이다', fieldKeys.join(','));
  R.note(PERSON_FIELDS.join(',') === fieldKeys.join(','),
         '서버 필드 순서가 화면과 글자까지 같다', PERSON_FIELDS.join(','));

  const row = [encodeURIComponent('가영'),'ENFP','1990','3','5','9','30','F','126.98','1'].join(',');
  const got = decodePersonRow(row);
  const want = {name:'가영', mbti:'ENFP', birth:'1990-03-05', time:'09:30',
                gender:'여', lon:'126.98', solarTime:'보정함'};
  Object.keys(want).forEach(function(k){
    R.note(got && got[k] === want[k], '푼 값의 ' + k + ' 가 맞다',
           (got ? String(got[k]) : '(없음)') + ' (기대 ' + want[k] + ')');
  });
  const g2 = decodePersonRow([encodeURIComponent('민수'),'ISTJ','1988','11','22','','','M','129.08','0'].join(','));
  R.note(g2 && g2.gender === '남', "성별 'M' 을 남으로 푼다");
  R.note(g2 && g2.time === '모름', '태어난 시각이 비면 모름으로 적는다');
  R.note(g2 && g2.birth === '1988-11-22', '한 자리 달·날에 0을 채운다');
  R.note(decodePersonRow('가영,ENFP,1990') === null, '칸이 모자라면 null 을 준다');
  R.note(decodePersonRow('') === null, '빈 줄이면 null 을 준다');
  const g3 = decodePersonRow([encodeURIComponent('김,철;수'),'INFJ','2000','1','2','0','5','M','127','0'].join(','));
  R.note(g3 && g3.name === '김,철;수', '이름 속 쉼표·세미콜론이 칸을 안 민다', g3 ? g3.name : '');
  R.note(g3 && g3.mbti === 'INFJ', '그 다음 칸이 안 밀린다');
  R.note(g3 && g3.time === '00:05', '0시 5분을 00:05 로 적는다');

  R.head('── 회원 풀이(describeProfile) 를 실제로 돌린다');
  const prof = {
    name:'가영', mbti:'ENFP', gender:'F', year:1990, month:3, day:5,
    inputYear:1990, inputMonth:2, inputDay:9, calendarType:'lunar', lunarLeap:false,
    birthTime:{hour:9, minute:30}, birthLonKey:'seoul', birthLon:126.98, solarTimeAdjust:true,
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
  const dp2 = describeProfile(Object.assign({}, prof, {calendarType:'solar', inputMonth:3, inputDay:5}));
  R.note(dp2 && dp2.inputBirth === '', '양력이면 넣으신 날짜를 따로 안 적는다');
  const dp3 = describeProfile(Object.assign({}, prof, {birthTime:null, sajuCache:null}));
  R.note(dp3 && dp3.time === '모름', '태어난 시각이 없으면 모름');
  R.note(dp3 && dp3.saju === '', '사주 캐시가 없으면 빈 값을 준다 (지어내지 않는다)');
  R.note(describeProfile(null) === null, '프로필이 없으면 null 을 준다');
  R.note(!/computeSaju|SajuEngine/.test(strip(api) + strip(personSrc)),
         '서버가 사주를 다시 계산하지 않는다 (sajuCache 를 읽는다)');
  R.note(/sajuCache/.test(strip(personSrc)), '프로필의 sajuCache 를 실제로 읽는다');

  R.head('── 회원 줄이 세 표를 맞대는가');
  R.note(/kakao_links\?select=/.test(api), 'kakao_links 를 읽는다');
  R.note(/user_sync\?kakao_id=in\./.test(api), '그 번호들의 user_sync 를 읽는다');
  R.note(/orders\?session_id=in\./.test(api), '그 세션들의 orders 를 읽는다');
  R.note(/paidCount:/.test(api) && /revenue:/.test(api), '결제 건수와 금액을 함께 준다');
  R.note(/\.map\(describeProfile\)/.test(api), '프로필을 describeProfile 로 푼다');

  R.head('── 이어보기 셈이 저장 항목과 맞는가');
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

  R.done();
})().catch((e) => { console.error('검사 자체가 터졌습니다:', e && e.message); process.exit(2); });
