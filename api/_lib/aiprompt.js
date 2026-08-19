/* =====================================================================
   AI 해석의 공통 부분 — 프롬프트·캐시 열쇠·권한
   ---------------------------------------------------------------------
   ★ 두 곳에서 같은 AI를 부른다.
       api/interpret.js — 써지는 대로 흘려보낸다(스트리밍). 화면에 바로 얹힌다.
       api/content.js   — 다 만들어 놓고 한 번에 준다. 유료 본문 조회 규격(contentEndpoint).
     프롬프트를 양쪽에 복사해 두면 언젠가 둘이 달라지고, 그때는 같은 상품인데
     결과가 다른 이유를 아무도 못 찾는다. 그래서 여기 한 곳에만 둔다.

   ★ 이 파일은 열쇠를 직접 쓰지 않는다. 부르는 쪽에서 process.env로 꺼내 넘긴다.
===================================================================== */
import crypto from 'node:crypto';
import { testAccessOf, paidOrdersOf } from './store.js';
import { buildEntitlements } from './entitlements.js';

export const MODEL = 'claude-sonnet-5';
export const MAX_TOKENS = 12000;
export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/* AI가 쓸 수 있는 상품만. 없는 상품 이름을 보내 요금을 쓰게 만들 수 없다. */
export const AI_PRODUCTS = { saju_full: 'saju', mbti_full: 'mbti', compat_full: 'compat' };

/* ★ 프롬프트를 고치면 이 숫자를 올린다.
   캐시 열쇠는 payload에서만 뽑기 때문에, 시스템 프롬프트만 바꾸면 열쇠가 그대로다.
   그러면 말투를 존대로 바꿔도 예전에 만들어 둔 반말 글이 캐시에서 그대로 나온다.
   (실제로 겪었다 — 지식 문서에는 '해요체'라고 적어 두고 프롬프트에는 '반말체'가 남아 있어
    AI가 반말로 썼고, 그걸 고친 뒤에도 옛 글이 나올 뻔했다.)
   2 = 말투를 해요체로 통일한 판.
   3 = 궁합(compat_full)을 AI가 쓰기 시작한 판. 이름 자리표시자 규칙을 넣었다. */
export const PROMPT_VERSION = 3;

export const SYSTEM = `당신은 한국 사주명리와 MBTI를 함께 읽는 상담가입니다. 주어진 계산 결과를 바탕으로 그 사람에게만 해당하는 풀이를 씁니다.
앞서 주어진 해석 지식 문서를 따르세요. 그 문서에 없는 개념(신살·공망·격국 등)은 언급하지 마세요.
지식 문서 8.3절(도구의 한계)은 문장을 얼마나 단정적으로 쓸지 정하는 기준입니다. 그 내용을 풀이 본문에 옮겨 적지 마세요 — 읽는 사람에게 "이 도구는 못 믿을 만하다"고 말하지 않습니다.

[절대 규칙]
1. 주어진 사주 여덟 글자·오행 개수·십성·대운 값을 절대 바꾸거나 새로 계산하지 마세요. 이미 확정된 값입니다. 주어지지 않은 간지나 신살을 지어내지 마세요.
2. 태어난 시각이 없으면(hour가 null) 시주는 없는 것입니다. 시주를 언급하지 말고, 여섯 글자로만 읽으세요.
3. 의료·법률·투자 조언으로 읽힐 문장을 쓰지 마세요. "병원에 가라", "이 주식을 사라", "이혼하라" 같은 지시는 금지입니다. 생활 태도 수준에서 멈추세요.
4. 단정하지 마세요. "반드시 그렇다"가 아니라 "그런 경향이 있다"로 씁니다. 죽음·중병·사고를 예언하지 마세요.
5. 사실이 아닌 것을 사실처럼 쓰지 마세요. 모르면 쓰지 않습니다.
6. 사람 이름을 지어내지 마세요. 이름은 주어지지 않습니다. 요청서에 자리표시자(namePlaceholders)가 적혀 있으면 그것을 글자 그대로 쓰세요 — 앱이 실제 이름으로 바꿔 넣습니다. 자리표시자가 없으면 "이분", "두 분" 같은 말로 쓰세요.
7. 궁합(kind가 compat)일 때는 두 사람을 반드시 구분해서 쓰세요. 한쪽만 이야기하고 끝내지 마세요. 주어진 관계값(일간 관계·일지 관계·오행·띠·항목 점수)에서 읽히는 것만 쓰고, 주지 않은 글자나 관계를 새로 만들지 마세요.

[문체]
- 해요체로 통일합니다("~예요", "~어요"). 반말을 섞지 마세요. 다정하되 가볍지 않게.
- 한 섹션은 3~5문단, 각 문단 2~4문장.
- 명리 용어를 쓸 때는 괄호로 짧게 풀어 주세요. 예: 편관(나를 밀어붙이는 기운)
- 상투적인 운세 문구("대박이 날 거야")를 피하고, 주어진 값에서 실제로 읽히는 것만 쓰세요.

[출력 형식]
각 섹션을 아래 형식으로 순서대로 씁니다. 이 형식을 정확히 지키세요.

##제목
본문

- "##"은 반드시 줄 맨 앞에 오고, 그 줄에는 제목만 씁니다.
- 요청받은 섹션 제목을 그대로 쓰고, 순서를 바꾸거나 빼먹지 마세요.
- 머리말·맺음말·설명을 덧붙이지 마세요. 첫 글자는 "##"으로 시작합니다.`;

export function userPrompt(payload) {
  const sections = Array.isArray(payload?.requested?.sectionTitles) ? payload.requested.sectionTitles : [];
  const list = sections.length
    ? sections.map((t, i) => `${i + 1}. ${t}`).join('\n')
    : '(섹션 제목이 전달되지 않았습니다. 아래 계산 결과를 바탕으로 자유롭게 나누어 쓰세요.)';
  return `아래는 앱이 계산해 둔 결과입니다. 이 값만 사용하세요.

${JSON.stringify(payload, null, 2)}

아래 섹션을 이 순서 그대로, 빠짐없이 써 주세요.

${list}`;
}

/* 캐시 열쇠는 서버가 만든다.
   ★ 브라우저가 보낸 열쇠를 믿으면, 매번 다른 열쇠를 보내 캐시를 피하고 횟수를 무한히 쓸 수 있다.
     그래서 payload 자체에서 뽑는다. 같은 사람·같은 상품이면 반드시 같은 값이 나온다. */
export function cacheKeyOf(productId, payload) {
  const stable = JSON.stringify(payload, Object.keys(payload || {}).sort());
  return crypto.createHash('sha256')
    .update(`${MODEL}|v${PROMPT_VERSION}|${productId}|${stable}`)
    .digest('base64url')
    .slice(0, 43);
}

/* 결제했거나 테스트 허가를 받았는가.
   ★ 이용권으로 열렸는지(viaPass)를 함께 돌려준다 — 횟수 상한이 다르기 때문이다. */
export async function hasAiAccess(sessionId, productId) {
  const test = await testAccessOf(sessionId);
  if (test) return { ok: true, viaPass: true, test: true };

  const orders = await paidOrdersOf(sessionId);
  const ent = buildEntitlements(orders);
  if (ent.pass && ent.pass.expiresAt > Date.now()) return { ok: true, viaPass: true };
  if (ent.items[productId]) return { ok: true, viaPass: false };

  return { ok: false, reason: '이 해석은 결제하신 뒤에 보실 수 있어요.' };
}

/* 지식 문서를 시스템 프롬프트 앞에 둔다.
   ★ 앞에 두고 cache_control을 걸면 그 부분이 캐시된다 — 같은 지식을 매번 새로 읽히면
     그만큼 돈이 나간다. 캐시에서 읽으면 입력값의 10분의 1이다.
     (지식이 없으면 그 블록 자체를 넣지 않는다.) */
export function systemFor(knowledge) {
  return knowledge
    ? [
        { type: 'text', text: knowledge, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: SYSTEM },
      ]
    : SYSTEM;
}

/* =====================================================================
   "##제목\n본문" 을 섹션으로 나눈다
   ---------------------------------------------------------------------
   ★ 제목이 우리가 준 것과 다를 수 있다(AI가 살짝 고쳐 쓰는 일이 있다).
     그래서 순서를 믿고, 제목은 우리 것을 쓴다. 그래야 목차와 본문이 어긋나지 않는다.
     목차를 눌렀는데 그 자리로 안 가는 일이 여기서 생긴다.
===================================================================== */
export function parseSections(text, titles) {
  const out = [];
  const parts = String(text || '').split(/^##[ \t]*/m).slice(1);
  parts.forEach((part, i) => {
    const nl = part.indexOf('\n');
    const head = (nl < 0 ? part : part.slice(0, nl)).trim();
    const rest = nl < 0 ? '' : part.slice(nl + 1);
    const paras = rest.split(/\n{2,}/).map((s) => s.replace(/\s+$/, '').trim()).filter(Boolean);
    if (!paras.length) return;
    out.push({ title: (titles && titles[i]) || head, paragraphs: paras });
  });
  return out;
}
