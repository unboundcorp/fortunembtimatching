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
