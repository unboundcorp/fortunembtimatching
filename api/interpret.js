/* =====================================================================
   AI 해석 — 사주·MBTI·궁합 풀이를 문장으로 써 준다
   ---------------------------------------------------------------------
   앱이 계산한 사주 여덟 글자·오행·십성·대운을 받아, 그 사람에게만 해당하는 풀이를 쓴다.

   ★ 사주를 AI에게 뽑게 하지 않는다. 계산은 앱이 하고 AI는 '이미 나온 값을 풀어쓰는' 일만 한다.
     AI에게 만세력을 시키면 없는 글자를 지어낸다. 그건 손님이 확인할 방법이 없는 거짓말이 된다.
     그래서 payload에는 이미 확정된 값만 담고, 시스템 프롬프트에서 "주어진 값을 바꾸지 말라"고 못 박는다.

   ★ 열쇠는 이 파일에서만 쓴다. 브라우저는 ANTHROPIC_API_KEY를 모른다.
     HTML에 키를 넣으면 개발자도구만 열면 누구나 가져가 남의 요금으로 쓴다.

   ★ 돈이 나가는 경로다. 그래서 세 겹으로 막는다.
       1) 권한 — 결제했거나 테스트 허가를 받은 세션만
       2) 횟수 — 단품 1회 / 이용권 10회 (products.js의 AI_QUOTA)
       3) 캐시 — 같은 사주·같은 상품이면 만들어 둔 글을 그대로 (횟수도 안 쓰고 돈도 안 나간다)

   ★ 응답은 스트리밍(SSE)이다. 이 글은 7천 토큰쯤 되어 다 쓰는 데 1~3분 걸린다.
     결제한 사람을 3분 동안 빈 화면 앞에 두면 그건 고장으로 보인다.
     써지는 대로 흘려보내면 3초 만에 첫 문장이 뜨고, 읽는 동안 나머지가 채워진다.
===================================================================== */
import crypto from 'node:crypto';
import { readBody, json } from './_lib/http.js';
import { ensureSession } from './_lib/session.js';
import { productOf, aiQuotaOf } from './_lib/products.js';
import { buildEntitlements } from './_lib/entitlements.js';
import { KNOWLEDGE, KNOWLEDGE_CHARS } from './_lib/knowledge.js';
import {
  paidOrdersOf, testAccessOf,
  getAiCache, putAiCache, aiUsedCount, aiAlreadyUsed, noteAiUse, sweepAiOld,
} from './_lib/store.js';

const MODEL = 'claude-sonnet-5';
const MAX_TOKENS = 12000;
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

/* AI가 쓸 수 있는 상품만. 없는 상품 이름을 보내 요금을 쓰게 만들 수 없다. */
const AI_PRODUCTS = { saju_full: 'saju', mbti_full: 'mbti', compat_full: 'compat' };

/* =====================================================================
   시스템 프롬프트
   ---------------------------------------------------------------------
   ★ 여기 적는 규칙이 곧 상품의 품질이다. 특히 아래 두 가지는 반드시 지켜져야 한다.
     · 주어진 값을 바꾸지 말 것 — 앱 화면에 표시된 사주와 풀이가 어긋나면 손님이 즉시 알아챈다.
     · 의료·법률·투자 조언으로 읽힐 말을 쓰지 말 것 — 약관에 "오락 및 참고 목적"이라 적어 두었다.
       그 말과 실제 내용이 어긋나면 고지가 무의미해진다.
===================================================================== */
const SYSTEM = `당신은 한국 사주명리와 MBTI를 함께 읽는 상담가입니다. 주어진 계산 결과를 바탕으로 그 사람에게만 해당하는 풀이를 씁니다.
앞서 주어진 해석 지식 문서를 따르세요. 그 문서에 없는 개념(신살·공망·격국 등)은 언급하지 마세요.

[절대 규칙]
1. 주어진 사주 여덟 글자·오행 개수·십성·대운 값을 절대 바꾸거나 새로 계산하지 마세요. 이미 확정된 값입니다. 주어지지 않은 간지나 신살을 지어내지 마세요.
2. 태어난 시각이 없으면(hour가 null) 시주는 없는 것입니다. 시주를 언급하지 말고, 여섯 글자로만 읽으세요.
3. 의료·법률·투자 조언으로 읽힐 문장을 쓰지 마세요. "병원에 가라", "이 주식을 사라", "이혼하라" 같은 지시는 금지입니다. 생활 태도 수준에서 멈추세요.
4. 단정하지 마세요. "반드시 그렇다"가 아니라 "그런 경향이 있다"로 씁니다. 죽음·중병·사고를 예언하지 마세요.
5. 사실이 아닌 것을 사실처럼 쓰지 마세요. 모르면 쓰지 않습니다.

[문체]
- 따뜻한 반말체("~야", "~해"). 다정하되 가볍지 않게.
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

function userPrompt(payload) {
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
function cacheKeyOf(productId, payload) {
  const stable = JSON.stringify(payload, Object.keys(payload || {}).sort());
  return crypto.createHash('sha256')
    .update(`${MODEL}|${productId}|${stable}`)
    .digest('base64url')
    .slice(0, 43);
}

/* SSE 한 줄. 앱은 이걸 받아 화면에 바로 얹는다. */
function send(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

function sseHead(res) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Connection', 'keep-alive');
  /* Vercel이 중간에서 모아 두었다가 한꺼번에 보내면 스트리밍이 의미가 없어진다. */
  res.setHeader('X-Accel-Buffering', 'no');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'method_not_allowed' });
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    /* 아직 열쇠를 안 넣은 상태. 조용히 실패하지 않고 이유를 말한다 —
       화면은 이 말을 받아 "기본 풀이로 보여드리는 중"이라고 안내한다.
       ★ knowledgeChars를 함께 내려보낸다. 지식 문서가 서버에 제대로 실렸는지
         밖에서 확인할 방법이 이것뿐이다(열쇠가 없으면 실제 호출을 못 해 보므로). */
    return json(res, 503, {
      error: 'not_configured',
      reason: 'AI 해석이 아직 연결되지 않았어요.',
      knowledgeChars: KNOWLEDGE_CHARS,
    });
  }

  const body = readBody(req);
  const productId = String(body.productId || '');
  const payload = body.payload;
  const kind = AI_PRODUCTS[productId];
  if (!kind || !payload || typeof payload !== 'object') {
    return json(res, 400, { error: 'bad_request', reason: '요청 내용이 올바르지 않아요.' });
  }
  const product = productOf(productId);
  if (!product) return json(res, 400, { error: 'bad_request', reason: '없는 상품이에요.' });

  let sessionId;
  try {
    sessionId = ensureSession(req, res);
  } catch (err) {
    console.error('세션 발급 실패', err && err.message);
    return json(res, 500, { error: 'server_error', reason: '서버 설정이 아직 끝나지 않았어요.' });
  }
  const cacheKey = cacheKeyOf(productId, payload);

  try {
    /* ── 1. 이미 만들어 둔 글이 있으면 그대로 준다 (돈도 횟수도 안 쓴다) ── */
    const cached = await getAiCache(cacheKey);
    if (cached) {
      /* 캐시가 있어도 권한은 본다. 남의 해석을 열쇠만 알면 볼 수 있으면 안 된다.
         다만 열쇠는 payload에서 뽑히므로, 열쇠를 안다는 건 그 사람의 생년월일을 안다는 뜻이다. */
      const allowed = await hasAiAccess(sessionId, productId);
      if (!allowed.ok) return json(res, 402, { error: 'no_access', reason: allowed.reason });
      sseHead(res);
      send(res, { type: 'delta', text: cached.body });
      send(res, { type: 'done', cached: true });
      return res.end();
    }

    /* ── 2. 권한 ── */
    const allowed = await hasAiAccess(sessionId, productId);
    if (!allowed.ok) return json(res, 402, { error: 'no_access', reason: allowed.reason });

    /* ── 3. 횟수 ── */
    const already = await aiAlreadyUsed(sessionId, cacheKey);
    if (!already) {
      const used = await aiUsedCount(sessionId);
      const quota = allowed.viaPass ? aiQuotaOf('pass') : aiQuotaOf(product.kind);
      if (used >= quota) {
        return json(res, 429, {
          error: 'quota_exceeded',
          reason: `새 해석을 만들 수 있는 횟수(${quota}회)를 다 쓰셨어요. 이미 만든 해석은 계속 보실 수 있어요.`,
        });
      }
    }

    /* ── 4. 만든다 ── */
    const upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        stream: true,
        /* ★ 지식 문서를 시스템 프롬프트 앞에 둔다.
           앞에 두고 cache_control을 걸면 그 부분이 캐시된다 — 같은 지식을 매번
           새로 읽히면 그만큼 돈이 나간다. 캐시에서 읽으면 입력값의 10분의 1이다.
           (지식이 없으면 그 블록 자체를 넣지 않는다.) */
        system: KNOWLEDGE
          ? [
              { type: 'text', text: KNOWLEDGE, cache_control: { type: 'ephemeral' } },
              { type: 'text', text: SYSTEM },
            ]
          : SYSTEM,
        messages: [{ role: 'user', content: userPrompt(payload) }],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = (await upstream.text().catch(() => '')).slice(0, 200);
      /* ★ 응답 본문을 그대로 손님에게 보여주지 않는다. 열쇠나 내부 사정이 섞여 나갈 수 있다. */
      console.error('anthropic 오류', upstream.status, detail);
      return json(res, 502, { error: 'upstream', reason: '해석을 만들지 못했어요. 잠시 후 다시 시도해 주세요.' });
    }

    sseHead(res);
    let full = '';
    const reader = upstream.body.getReader();
    const dec = new TextDecoder();
    let buf = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      /* SSE는 빈 줄로 사건이 나뉜다. 마지막 조각은 아직 안 끝났을 수 있으니 남겨 둔다. */
      const parts = buf.split('\n\n');
      buf = parts.pop() || '';
      for (const part of parts) {
        for (const line of part.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === '[DONE]') continue;
          let ev;
          try { ev = JSON.parse(raw); } catch { continue; }
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
            full += ev.delta.text;
            send(res, { type: 'delta', text: ev.delta.text });
          } else if (ev.type === 'error') {
            console.error('anthropic 스트림 오류', ev.error?.type);
            send(res, { type: 'error', reason: '해석을 만들다가 끊겼어요.' });
            return res.end();
          }
        }
      }
    }

    /* ★ 끝까지 못 받았으면 저장하지도, 횟수를 쓰지도 않는다.
       반쪽짜리 글을 캐시에 넣으면 그 사람은 영영 반쪽만 보게 된다. */
    if (full.trim().length < 200) {
      send(res, { type: 'error', reason: '해석이 너무 짧게 끝났어요. 다시 시도해 주세요.' });
      return res.end();
    }

    await putAiCache({ cacheKey, productId, body: full, model: MODEL });
    await noteAiUse(sessionId, cacheKey);
    /* 새로 만들 때 곁들여 오래된 기록을 지운다. 따로 도는 청소 작업이 없어도 쌓이지 않는다. */
    await sweepAiOld();
    send(res, { type: 'done', cached: false });
    return res.end();

  } catch (err) {
    const msg = String((err && err.message) || '');
    console.error('interpret 실패', msg.slice(0, 200));
    if (!res.headersSent && /Could not find the table/i.test(msg)) {
      return json(res, 503, { error: 'not_ready', reason: '서버 준비가 아직 안 끝났어요. (데이터베이스 표가 없습니다 — schema.sql을 실행해 주세요)' });
    }
    /* 이미 스트리밍을 시작했으면 헤더를 다시 못 쓴다 — 사건으로 알린다. */
    if (res.headersSent) {
      send(res, { type: 'error', reason: '해석을 만들다가 문제가 생겼어요.' });
      return res.end();
    }
    return json(res, 500, { error: 'server_error', reason: '지금은 해석을 만들 수 없어요.' });
  }
}

/* 결제했거나 테스트 허가를 받았는가.
   ★ 이용권으로 열렸는지(viaPass)를 함께 돌려준다 — 횟수 상한이 다르기 때문이다. */
async function hasAiAccess(sessionId, productId) {
  const test = await testAccessOf(sessionId);
  if (test) return { ok: true, viaPass: true, test: true };

  const orders = await paidOrdersOf(sessionId);
  const ent = buildEntitlements(orders);
  if (ent.pass && ent.pass.expiresAt > Date.now()) return { ok: true, viaPass: true };
  if (ent.items[productId]) return { ok: true, viaPass: false };

  return { ok: false, reason: '이 해석은 결제하신 뒤에 보실 수 있어요.' };
}
