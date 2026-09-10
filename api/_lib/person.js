/* =====================================================================
   사람 한 줄 풀기 — 화면 INVITE_FIELDS 와 한 쌍
   ---------------------------------------------------------------------
   궁합 초대 링크(#i1=)·그룹 링크(#meet=)·rooms 의 a_payload/b_payload·groups 의
   members 는 **전부 같은 형식**이다. 화면 fortune.html 의 INVITE_FIELDS 가 원본이고
   여기는 그것을 되읽는 쪽이다.

       n , m , y , mo , d , h , mi , g , lo , ts
       0   1   2    3   4   5    6   7    8    9

   ★ 이 순서가 화면과 어긋나면 관리자 화면에 **남의 생년월일이 다른 사람 이름 밑에**
     찍힌다. 오류가 안 나고 조용히 틀리는 종류라, 눈으로는 못 잡는다.
     `checks/stats_rows_pair.cjs` 가 화면 표를 읽어 이 순서와 대조한다.
   ★ 서버는 이 값을 **보여주기 위해서만** 쓴다. 계산에 쓰지 않는다.
   ★ 이름은 화면에서 encodeURIComponent 로 감싸 보낸다(쉼표·세미콜론이 구분자라서).
     그래서 되읽을 때 반드시 풀어야 한다. 풀다 실패하면 원문을 그대로 둔다 —
     여기서 던지면 관리자 화면 한 줄 때문에 표 전체가 안 뜬다.
===================================================================== */

/* 화면 INVITE_FIELDS 의 키 순서. 검사기가 이 배열과 화면 표를 대조한다. */
export const PERSON_FIELDS = ['n', 'm', 'y', 'mo', 'd', 'h', 'mi', 'g', 'lo', 'ts'];

const pad = (v) => String(v).padStart(2, '0');

export function decodePersonRow(row) {
  const f = String(row || '').split(',');
  if (f.length < PERSON_FIELDS.length) return null;

  let name = f[0] || '';
  try { name = decodeURIComponent(name); } catch { /* 원문 그대로 둔다 */ }

  const num = (v) => (v === '' || v == null ? null : Number(v));
  const y = num(f[2]), mo = num(f[3]), d = num(f[4]);
  const h = num(f[5]), mi = num(f[6]);

  return {
    name: name.slice(0, 20),
    mbti: f[1] || '',
    birth: y && mo && d ? `${y}-${pad(mo)}-${pad(d)}` : '',
    time: h == null ? '모름' : `${pad(h)}:${pad(mi == null ? 0 : mi)}`,
    gender: f[7] === 'M' ? '남' : f[7] === 'F' ? '여' : '',
    lon: f[8] || '',
    solarTime: f[9] === '1' ? '보정함' : '보정 안 함',
  };
}

/* =====================================================================
   프로필 한 개를 관리자 화면용으로 풀어 준다 (2026-09-10 대표님 지시)
   > "카카오 아이디랑 회원마다 넣은 사주랑 성격유형 넣어줘야지 유료결제 했는지 안했는지 유무도"
   ---------------------------------------------------------------------
   재료는 `user_sync.data.profiles` 의 프로필 객체다. 화면이 만든 그대로 서버에 사본이 있다.
   ★ 사주 여덟 글자는 **다시 계산하지 않는다.** 프로필 안의 `sajuCache` 를 그대로 읽는다.
     서버에 SajuEngine 사본을 두면 화면과 갈라지고, 갈라진 줄 아무도 모른다.
     캐시가 없으면 빈 값으로 두고 화면이 '아직 계산 안 됨'이라고 적는다.
   ★ 음력으로 넣으신 분은 **넣으신 날짜(inputY/M/D)와 양력으로 바꾼 날짜가 다르다.** 둘 다 적는다 —
     하나만 적으면 "내가 넣은 날짜가 아닌데?"가 된다.
===================================================================== */
export function describeProfile(p) {
  if (!p || typeof p !== 'object') return null;
  const bt = p.birthTime;
  const sc = p.sajuCache || null;
  const one = (x) => (x && x.text ? x.text : '');
  const ymd = (y, m, d) => (y && m && d ? `${y}-${pad(m)}-${pad(d)}` : '');
  const solar = ymd(p.year, p.month, p.day);
  const input = ymd(p.inputYear, p.inputMonth, p.inputDay);
  return {
    name: String(p.name || '').slice(0, 20),
    mbti: p.mbti || '',
    gender: p.gender === 'M' ? '남' : p.gender === 'F' ? '여' : '',
    birth: solar,
    /* 음력으로 넣으셨고 양력 변환 결과가 다를 때만 원래 날짜를 따로 적는다 */
    inputBirth: input && input !== solar ? input : '',
    calendar: p.calendarType === 'lunar' ? ('음력' + (p.lunarLeap ? ' 윤달' : '')) : '양력',
    time: bt && typeof bt.hour === 'number' ? `${pad(bt.hour)}:${pad(bt.minute || 0)}` : '모름',
    place: p.birthLonKey || '',
    lon: typeof p.birthLon === 'number' ? String(p.birthLon) : '',
    solarTime: p.solarTimeAdjust ? '보정함' : '보정 안 함',
    element: p.element || '',
    zodiac: p.zodiac || '',
    saju: sc ? [one(sc.year), one(sc.month), one(sc.day), one(sc.hour)].filter(Boolean).join(' ') : '',
    createdAt: p.createdAt || null,
  };
}
