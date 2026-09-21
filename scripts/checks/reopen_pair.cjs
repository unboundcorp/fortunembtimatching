/* =====================================================================
   권한이 끝나도 **내가 만든 글**은 다시 열린다 — R76 의 짝 (빠른 층)
   ---------------------------------------------------------------------
   2026-09-21 대표님 영상: 테스트 허가가 끝난 세션이 9/16 에 만든 성격유형 풀이를 열자
   서버가 402('결제하신 뒤에 보실 수 있어요')로 거절했다. api/entitlements.js(R76)는
   "한 번 만든 글은 영구"라고 화면에 내려주는데, 글을 주는 두 창구(interpret·content)는
   hasAiAccess(결제·이용권·허가)만 봤다. 화면은 열림 · 서버는 거절 — 그 모순을 지킨다.

   ★ 가짜 저장소로 store.js 의 rest() 가 부르는 fetch 를 갈아 끼워 **실제 함수를 돌린다.**
     글자 대조가 아니다. 같은 함정(글이 안 열리는 것보다 **남의 글이 열리는 것**이 더 나쁘다)을
     여기서도 본다 — 다른 세션이 만든 글은 안 열려야 한다.
===================================================================== */
const fs = require('fs');
const path = require('path');
const { ROOT, reporter } = require('../_lib.cjs');

const R = reporter('만든 글 다시 열기');

const S_ME = 'sess-me', S_OTHER = 'sess-other';
const K_SAME = 'key-same', K_OLD = 'key-old', K_NEW = 'key-new';
const SUB = 'subj-1', PROD = 'mbti_full';

/* 가짜 PostgREST — 경로를 보고 표를 흉내 낸다 */
function fakeRows(url){
  const u = new URL(url);
  const table = u.pathname.split('/rest/v1/')[1];
  const q = u.searchParams;
  const eq = (k) => { const v = q.get(k); return v && v.startsWith('eq.') ? decodeURIComponent(v.slice(3)) : null; };
  if(table === 'test_grants') return [];
  if(table === 'orders') return [];
  if(table === 'ai_usage'){
    if(eq('session_id') !== S_ME) return [];
    const ck = eq('cache_key');
    const mine = [{cache_key:K_SAME},{cache_key:K_OLD}];
    if(ck) return mine.filter(r => r.cache_key === ck);
    return mine;
  }
  if(table === 'ai_cache'){
    const ck = eq('cache_key');
    if(ck === K_SAME) return [{cache_key:K_SAME, product_id:PROD, body:'BODY-SAME', subject_key:SUB}];
    if(ck === K_OLD)  return [{cache_key:K_OLD,  product_id:PROD, body:'BODY-OLD',  subject_key:SUB}];
    if(ck === K_NEW)  return [];
    const inList = q.get('cache_key') || '';
    if(inList.startsWith('in.(')){
      const keys = inList.slice(4, -1).split(',').map(decodeURIComponent);
      const prod = eq('product_id'), sub = eq('subject_key');
      const all = [{cache_key:K_SAME, product_id:PROD, body:'BODY-SAME', subject_key:SUB, created_at:'2026-09-16T14:40:00Z'},
                   {cache_key:K_OLD,  product_id:PROD, body:'BODY-OLD',  subject_key:SUB, created_at:'2026-09-16T13:00:00Z'}];
      return all.filter(r => keys.includes(r.cache_key) && (!prod || r.product_id === prod) && (!sub || r.subject_key === sub));
    }
    return [];
  }
  return [];
}

(async function(){
  process.env.SUPABASE_URL = 'https://fake.local';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'x'.repeat(40);
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const rows = fakeRows(String(url));
    return { ok:true, status:200, text: async () => JSON.stringify(rows) };
  };

  let m;
  try{ m = await import('file://' + path.join(ROOT, 'api/_lib/aiprompt.js')); }
  catch(e){ R.bad('aiprompt.js 를 못 불러옴', String(e && e.message).slice(0,120)); R.done(); return; }

  R.head('── ① 함수가 있는가');
  R.note(typeof m.ownAiOf === 'function', 'ownAiOf 가 내보내진다');
  R.note(typeof m.hasAiAccess === 'function', 'hasAiAccess 가 내보내진다');
  if(typeof m.ownAiOf !== 'function'){ R.done(); return; }

  R.head('── ② 권한은 여전히 없다 (새로 만드는 것은 막혀야 한다)');
  const acc = await m.hasAiAccess(S_ME, PROD);
  R.note(acc && acc.ok === false, '결제·허가가 없는 세션은 hasAiAccess 가 거절한다', acc && acc.reason);

  R.head('── ③ 내가 만든 글은 열린다');
  const same = await m.ownAiOf(S_ME, PROD, K_SAME, SUB);
  R.note(same && same.body === 'BODY-SAME' && same.recovered === false,
         '같은 열쇠로 만든 적이 있으면 그 글을 준다 (recovered=false)', JSON.stringify(same));
  const back = await m.ownAiOf(S_ME, PROD, K_NEW, SUB);
  R.note(back && back.body === 'BODY-SAME' && back.recovered === true,
         '열쇠가 달라졌어도 같은 상품·대상이면 가장 나중 글을 준다 (recovered=true)', JSON.stringify(back));

  R.head('── ④ 남의 글은 안 열린다');
  const other = await m.ownAiOf(S_OTHER, PROD, K_SAME, SUB);
  R.note(other === null, '다른 세션은 같은 열쇠를 알아도 못 연다 (null)', JSON.stringify(other));
  const otherSub = await m.ownAiOf(S_OTHER, PROD, K_NEW, SUB);
  R.note(otherSub === null, '다른 세션은 같은 대상 표식으로도 못 연다 (null)');
  const noSub = await m.ownAiOf(S_ME, PROD, K_NEW, null);
  R.note(noSub === null, '대상 표식이 없으면 되찾지 않는다 (null)');
  const wrongProd = await m.ownAiOf(S_ME, 'compat_full', K_NEW, SUB);
  R.note(wrongProd === null, '다른 상품으로는 못 연다 (null)');

  R.head('── ⑤ 두 창구가 실제로 쓰는가 (소스)');
  for(const f of ['api/interpret.js', 'api/content.js']){
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    R.note(/import\s*\{[^}]*\bownAiOf\b[^}]*\}\s*from\s*'\.\/_lib\/aiprompt\.js'/.test(src), f + ' 가 ownAiOf 를 가져온다');
    const noAccess = src.split("error: 'no_access'").length - 1;
    R.note(noAccess === 1, f + ' 의 no_access 거절이 한 곳뿐이다', '실제 ' + noAccess + '곳');
    const i = src.indexOf('ownAiOf(sessionId'), j = src.indexOf("error: 'no_access'");
    R.note(i > 0 && j > i, f + ' 가 402 를 주기 전에 ownAiOf 를 먼저 본다');
    R.note(/recovered:\s*!!own\.recovered/.test(src), f + ' 가 되찾은 글에 recovered 표식을 붙인다');
  }
  R.done();
})();
