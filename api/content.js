/* =====================================================================
   contentEndpoint — 유료 본문 조회 (앱 규격 2항)
   ---------------------------------------------------------------------
   요청 : { "productId":"saju_full", "sectionFrom":3, "payload":{...} }
   응답 : { "sections":[ { "id":"...", "title":"...", "paragraphs":["...","..."] } ] }

   ★ 왜 이게 있어야 결제를 열 수 있나.
     이게 없으면 유료 문장을 브라우저가 스스로 만든다. 그러면 개발자도구를 열 줄 아는 사람은
     돈을 안 내고도 유료 본문을 꺼내 볼 수 있다. 그 상태로 파는 것은 파는 시늉일 뿐이다.
     그래서 앱은 이 주소가 비어 있으면 결제 버튼을 아예 잠가 둔다(PAYWALL_REQUIRED).

   ★ 무료 구간은 여기서 만들지 않는다. sectionFrom 앞쪽은 브라우저가 가진 것을 그대로 쓴다.
     돈 낸 사람에게만 해당하는 부분만 서버가 만든다 — "잠긴 것은 만들지도 않는다"는 원칙 그대로다.

   ★ api/interpret.js 와 같은 AI를 쓰지만 흘려보내지 않고 다 만들어서 한 번에 준다.
     프롬프트·캐시 열쇠·권한 판정은 _lib/aiprompt.js 한 곳에서 가져온다. 복사해 두면 언젠가
     둘이 달라지고, 그때는 같은 상품인데 결과가 다른 이유를 아무도 못 찾는다.

   ★ 둘이 동시에 돌지 않는다. 브라우저는 스트리밍을 쓸 수 있으면 그쪽만 쓰고 이 주소는
     부르지 않는다(fortune.html의 loadPaidBody 참고). 같은 글을 두 번 만들면 돈도 두 번 나간다.
===================================================================== */
import { readBody, json, methodGuard } from './_lib/http.js';
import { ensureSession } from './_lib/session.js';
import { productOf, aiQuotaOf } from './_lib/products.js';
import { KNOWLEDGE } from './_lib/knowledge.js';
import {
  MODEL, MAX_TOKENS, ANTHROPIC_URL, AI_PRODUCTS,
  userPrompt, cacheKeyOf, hasAiAccess, systemFor, parseSections,
} from './_lib/aiprompt.js';
import {
  getAiCache, putAiCache, aiUsedCount, aiAlreadyUsed, noteAiUse, sweepAiOld,
} from './_lib/store.js';

/* 스트리밍이 아니라 다 만들어서 한 번에 준다. 그만큼 함수가 오래 돌아야 한다.
   ★ 60은 Hobby 요금제의 상한이다. 더 큰 값을 적으면 배포 자체가 실패한다.
     유료 섹션 열 개를 한 번에 쓰면 60초를 넘길 수 있다 — 그때는 502가 나고 손님은
     '다시 시도해 주세요'를 본다. 실제로 팔기 전에 Pro로 올려야 하는 이유가 이것이다. */
export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    /* ★ 조용히 빈 배열을 주지 않는다. 그러면 결제한 사람이 "산 게 없는" 화면을 보게 되고,
       화면은 왜 그런지 말해 줄 수가 없다. 이유를 분명히 적어 보낸다. */
    console.error('ANTHROPIC_API_KEY 환경변수가 없습니다 — 유료 본문을 만들 수 없습니다.');
    return json(res, 503, {
      error: 'not_configured',
      reason: '유료 해석을 만드는 서버가 아직 연결되지 않았어요. 잠시 후 다시 시도해 주세요.',
    });
  }

  const body = readBody(req);
  const productId = String(body.productId || '');
  const payload = body.payload;
  if (!AI_PRODUCTS[productId] || !payload || typeof payload !== 'object') {
    return json(res, 400, { error: 'bad_request', reason: '요청 내용이 올바르지 않아요.' });
  }
  const product = productOf(productId);
  if (!product) return json(res, 400, { error: 'bad_request', reason: '없는 상품이에요.' });

  /* 목차 제목은 앱이 정한 것을 그대로 받아서 그대로 쓴다.
     ★ 없으면 만들지 않는다. AI가 제목을 새로 지으면 목차와 본문의 이름이 달라져,
       목차를 눌러도 그 자리로 가지 않는다. 그건 결제한 사람이 바로 알아채는 고장이다. */
  const allTitles = Array.isArray(payload?.requested?.sectionTitles)
    ? payload.requested.sectionTitles.map((t) => String(t || '').slice(0, 80)).filter(Boolean)
    : [];
  const from = Number.isInteger(body.sectionFrom) ? body.sectionFrom : Number(body.sectionFrom);
  if (!allTitles.length || !Number.isFinite(from) || from < 0 || from >= allTitles.length) {
    return json(res, 400, { error: 'bad_request', reason: '어느 부분을 만들지 알 수 없어요.' });
  }
  const paidTitles = allTitles.slice(from);

  let sessionId;
  try {
    sessionId = ensureSession(req, res);
  } catch (err) {
    console.error('세션 발급 실패', err && err.message);
    return json(res, 500, { error: 'server_error', reason: '서버 설정이 아직 끝나지 않았어요.' });
  }

  /* 열쇠는 서버가 payload에서 뽑는다. 브라우저가 보낸 열쇠를 믿으면 매번 다른 값을 보내
     캐시를 피하고 횟수를 무한히 쓸 수 있다. */
  const cacheKey = cacheKeyOf(productId, payload);

  try {
    /* ── 1. 이미 만들어 둔 글이 있으면 그대로 준다 (돈도 횟수도 안 쓴다) ── */
    const cached = await getAiCache(cacheKey);
    if (cached) {
      const allowed = await hasAiAccess(sessionId, productId);
      if (!allowed.ok) return json(res, 402, { error: 'no_access', reason: allowed.reason });
      const secs = toSections(cached.body, paidTitles, from);
      if (secs.length) return json(res, 200, { sections: secs, cached: true });
      /* 저장해 둔 글이 형식이 깨졌다면 캐시를 믿지 않고 새로 만든다. */
      console.warn('캐시된 유료 본문의 형식이 깨져 새로 만듭니다', cacheKey);
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

    /* ── 4. 만든다 — 유료 구간의 제목만 넘긴다 ── */
    const askPayload = {
      ...payload,
      requested: { ...(payload.requested || {}), sectionTitles: paidTitles, sections: paidTitles.length },
    };

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
        system: systemFor(KNOWLEDGE),
        messages: [{ role: 'user', content: userPrompt(askPayload) }],
      }),
    });

    if (!upstream.ok) {
      const detail = (await upstream.text().catch(() => '')).slice(0, 200);
      /* ★ 응답 본문을 손님에게 그대로 보여주지 않는다. 열쇠나 내부 사정이 섞여 나갈 수 있다. */
      console.error('anthropic 오류', upstream.status, detail);
      return json(res, 502, { error: 'upstream', reason: '해석을 만들지 못했어요. 잠시 후 다시 시도해 주세요.' });
    }

    const data = await upstream.json();
    const full = (Array.isArray(data?.content) ? data.content : [])
      .filter((b) => b && b.type === 'text')
      .map((b) => b.text)
      .join('');

    const secs = toSections(full, paidTitles, from);
    /* ★ 반쪽짜리 글은 저장하지도, 횟수를 쓰지도 않는다.
       캐시에 넣으면 그 사람은 영영 반쪽만 보게 된다. */
    if (secs.length < paidTitles.length) {
      console.error('유료 본문이 모자랍니다', secs.length, '/', paidTitles.length,
                    'stop_reason=', data?.stop_reason);
      return json(res, 502, { error: 'incomplete', reason: '해석이 끝까지 만들어지지 않았어요. 다시 시도해 주세요.' });
    }

    await putAiCache({ cacheKey, productId, body: full, model: MODEL });
    await noteAiUse(sessionId, cacheKey);
    /* 새로 만들 때 곁들여 오래된 기록을 지운다. 따로 도는 청소 작업이 없어도 쌓이지 않는다. */
    await sweepAiOld();

    return json(res, 200, { sections: secs, cached: false });
  } catch (err) {
    const msg = String((err && err.message) || '');
    console.error('content 실패', msg.slice(0, 200));
    if (/Could not find the table/i.test(msg)) {
      return json(res, 503, { error: 'not_ready', reason: '서버 준비가 아직 안 끝났어요. (데이터베이스 표가 없습니다 — schema.sql을 실행해 주세요)' });
    }
    return json(res, 500, { error: 'server_error', reason: '지금은 유료 해석을 불러올 수 없어요.' });
  }
}

/* AI가 쓴 글을 앱이 기대하는 모양으로 바꾼다.
   제목은 우리가 준 것을 쓴다(AI가 살짝 고쳐 쓰는 일이 있는데, 그러면 목차와 어긋난다). */
function toSections(text, paidTitles, from) {
  return parseSections(text, paidTitles)
    .slice(0, paidTitles.length)
    .map((s, i) => ({ id: `srv${from + i}`, title: s.title, paragraphs: s.paragraphs }));
}
