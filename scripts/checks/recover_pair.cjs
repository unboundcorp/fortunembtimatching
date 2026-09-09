/* =====================================================================
   "결제하신 글은 무슨 일이 있어도 열린다" 안전망 — 표식이 옳은가 (빠른 층)
   ---------------------------------------------------------------------
   2026-09-09 대표님 승인으로 만든 되찾기 장치를 지킨다.

   ★ 이 장치의 **가장 위험한 실패**는 "글이 안 열리는 것"이 아니라
     **남의 글이 열리는 것**이다. 궁합은 짝마다 다른 글이라, 표식이 헐거우면
     A×B 를 결제하신 분에게 A×C 글이 나간다. 그건 결함이 아니라 사고다.
     그래서 여기서 제일 먼저 보는 것이 "달라야 할 것이 실제로 다른가" 이다.

   ★ 동시에 반대쪽도 봐야 한다 — 점수·등급·문구가 바뀌어도 표식은 **안 바뀌어야** 한다.
     바뀌면 이 안전망은 하는 일이 없어진다(cacheKey 와 똑같은 신세가 된다).
===================================================================== */
const fs = require('fs');
const path = require('path');
const { ROOT, reporter } = require('../_lib.cjs');

const R = reporter('되찾기 표식');

(async function(){
  let m;
  try{
    m = await import('file://' + path.join(ROOT, 'api/_lib/aiprompt.js'));
  }catch(e){
    R.bad('aiprompt.js 를 못 불러옴', String(e && e.message).slice(0,120));
    R.done(); return;
  }
  const sub = m.subjectKeyOf, ck = m.cacheKeyOf;
  R.head('── 표식을 만드는 함수가 있는가');
  R.note(typeof sub === 'function', 'subjectKeyOf 가 내보내진다');
  if(typeof sub !== 'function'){ R.done(); return; }

  const pilA = {year:{stem:'경',branch:'오'}, month:{stem:'기',branch:'묘'},
                day:{stem:'정',branch:'해'},  hour:{stem:'을',branch:'사'}};
  const pilB = {year:{stem:'갑',branch:'자'}, month:{stem:'병',branch:'인'},
                day:{stem:'무',branch:'술'},  hour:{stem:'경',branch:'신'}};
  const pilC = {year:{stem:'신',branch:'유'}, month:{stem:'임',branch:'술'},
                day:{stem:'계',branch:'축'},  hour:{stem:'갑',branch:'인'}};
  const A = {mbti:'ENFP', gender:'여', pillars:pilA, zodiac:'말'};
  const B = {mbti:'ISTJ', gender:'남', pillars:pilB, zodiac:'쥐'};
  const C = {mbti:'ISTJ', gender:'남', pillars:pilC, zodiac:'닭'};
  const cp = (a,b,rel,extra) => Object.assign({a:a, b:b, relation:rel||'친구'}, extra||{});

  R.head('── ① 달라야 할 것이 다른가 (남의 글이 열리면 안 된다)');
  const AB = sub('compat_full', cp(A,B));
  const AC = sub('compat_full', cp(A,C));
  R.note(AB && AC && AB !== AC, '상대가 다르면 표식이 다르다 (A×B ≠ A×C)');
  R.note(AB !== sub('compat_full', cp(B,A)), '두 분 순서가 바뀌면 표식이 다르다',
         '글이 보는 사람 쪽에서 쓰이므로 섞으면 안 된다');
  R.note(AB !== sub('compat_full', cp(A,B,'연인')), '사이가 다르면 표식이 다르다');
  /* 네 글자만 같고 여덟 글자가 다른 사람 — 표식이 성격유형만 보면 여기서 뚫린다 */
  R.note(sub('compat_full', cp(A,B)) !== sub('compat_full', cp(A, Object.assign({}, B, {pillars:pilC}))),
         '성격유형이 같아도 사주가 다르면 표식이 다르다');
  R.note(sub('mbti_full', {person:{mbti:'ENFP',gender:'여'}})
         !== sub('mbti_full', {person:{mbti:'ENFP',gender:'남'}}),
         '성격유형이 같아도 성별이 다르면 표식이 다르다');
  R.note(sub('saju_full:2026', {pillars:pilA, person:{gender:'남'}})
         !== sub('saju_full:2026', {pillars:pilB, person:{gender:'남'}}),
         '사주 여덟 글자가 다르면 표식이 다르다');

  R.head('── ② 같아야 할 것이 같은가 (점수를 고쳐도 살아 있어야 한다)');
  /* 점수·등급·문구만 다른 두 payload — 되찾기가 하려는 바로 그 상황이다 */
  const before = cp(A, B, '친구', {computed:{combined:73, tier:'강한 인연', mbtiScore:71}});
  const after  = cp(A, B, '친구', {computed:{combined:68, tier:'무난한 인연', mbtiScore:66}});
  R.note(sub('compat_full', before) === sub('compat_full', after),
         '점수·등급이 바뀌어도 표식은 그대로다');
  R.note(typeof ck === 'function' && ck('compat_full', before) !== ck('compat_full', after),
         '같은 경우에 저장 열쇠(cacheKey)는 **바뀐다**',
         '이게 안 바뀌면 애초에 안전망이 필요 없다는 뜻이라 검사가 무의미해진다');

  R.head('── ③ 재료가 없으면 표식을 만들지 않는다');
  R.note(sub('compat_full', {a:A}) === null, '상대가 없으면 null');
  R.note(sub('compat_full', {a:A, b:{mbti:'ISTJ'}}) === null, '사주가 없으면 null');
  R.note(sub('saju_full:2026', {person:{gender:'남'}}) === null, '사주가 없으면 null (사주 상품)');
  R.note(sub('mbti_full', {person:{gender:'남'}}) === null, '네 글자가 없으면 null');
  R.note(sub('premium_pass', {a:A,b:B}) === null, 'AI 상품이 아니면 null');

  R.head('── ④ 서버가 실제로 이 표식을 쓰는가');
  const store = fs.readFileSync(path.join(ROOT, 'api/_lib/store.js'), 'utf8');
  const content = fs.readFileSync(path.join(ROOT, 'api/content.js'), 'utf8');
  const interp = fs.readFileSync(path.join(ROOT, 'api/interpret.js'), 'utf8');
  R.note(/export async function latestAiForSubject/.test(store), 'latestAiForSubject 가 있다');
  R.note(/subject_key=eq\./.test(store) && /product_id=eq\./.test(store)
         && /session_id=eq\./.test(store),
         '되찾을 때 **이 사람 · 같은 상품 · 같은 대상** 셋을 다 본다');
  ['content.js', 'interpret.js'].forEach(function(f, i){
    const src = i ? interp : content;
    R.note(/subjectKeyOf\(productId, payload\)/.test(src), f + ' 가 표식을 만든다');
    R.note(/putAiCache\(\{[^}]*subjectKey[^}]*\}\)/.test(src), f + ' 가 저장할 때 표식을 함께 적는다');
    R.note(/latestAiForSubject\(sessionId, productId, subjectKey\)/.test(src),
           f + ' 가 횟수를 다 썼을 때 되찾는다');
    R.note(/recovered: true|recovered: true/.test(src), f + " 가 화면에 recovered 를 알려준다");
  });

  R.head('── ⑤ 화면이 그 사실을 손님께 적는가');
  const html = fs.readFileSync(path.join(ROOT, 'fortune.html'), 'utf8');
  R.note(/state\.recovered/.test(html), '화면이 recovered 를 들고 있다');
  R.note(/계산 방식이 바뀐 뒤라, 먼저 만들어 드린 풀이를 그대로 보여드려요/.test(html),
         '되찾아 온 글이라는 것을 화면에 적는다');
  R.note(/if\(ev\.recovered\) self\.lastRecovered = true;/.test(html),
         '흘려받기 창구에서도 받는다');
  R.note(/if\(data && data\.recovered\) Interpreter\.lastRecovered = true;/.test(html),
         '통짜 창구에서도 받는다 (두 창구가 같은 표식을 쓴다)');

  R.done();
})();
