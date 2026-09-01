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
import { readBody, json } from './_lib/http.js';
import { ensureSession } from './_lib/session.js';
import { productOf, aiQuotaOf } from './_lib/products.js';
import { KNOWLEDGE, KNOWLEDGE_CHARS } from './_lib/knowledge.js';
/* ★ 프롬프트·캐시 열쇠·권한은 api/content.js 와 함께 쓴다. 복사해 두면 언젠가 둘이 달라진다. */
import {
  MODEL, MAX_TOKENS, ANTHROPIC_URL, AI_PRODUCTS,
  userPrompt, cacheKeyOf, hasAiAccess, systemFor,
} from './_lib/aiprompt.js';
import {
  paidOrdersOf, testAccessOf,
  getAiCache, putAiCache, aiUsedCount, aiAlreadyUsed, noteAiUse, sweepAiOld,
} from './_lib/store.js';

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

/* ★ 오래 도는 함수다. 유료 열세 섹션이면 1~3분 걸린다.
   기본 제한(10초)으로 두면 글이 다 써지기 전에 함수가 잘린다.

   ★ 60이 아니라 300이다. 처음에 Hobby라고 단정하고 60을 박았는데, 실제로는 Pro였다.
     그 60 때문에 실제로 두 번 잘렸다 —
       "Vercel Runtime Timeout Error: Task timed out after 60 seconds"
     손님은 'HTTP 504'를 봤고, 미완성 글은 저장하지 않으므로 돈만 나가고 남는 게 없었다.
     요금제를 확인하지 않고 상한을 스스로 좁혀 놓은 것이 원인이다. */
export const config = { maxDuration: 300 };

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
      /* ★ 2026-08-27 — 상품별로 센다. 안 그러면 두 개째 산 손님이 곧바로 막힌다(store.js 주석 참고). */
      const used = await aiUsedCount(sessionId, productId);
      const quota = allowed.viaPass ? aiQuotaOf('pass') : aiQuotaOf(product.kind);
      if (used >= quota) {
        return json(res, 429, {
          error: 'quota_exceeded',
          reason: `새 해석을 만들 수 있는 횟수(${quota}회)를 다 쓰셨어요. 이미 만든 해석은 계속 보실 수 있어요.`,
        });
      }
    }

    /* ── 4. 만든다 ──
       ★ 2026-09-02 — 여기서 머리를 먼저 보내고 살아 있다는 신호를 흘린다.
         예전에는 Anthropic이 첫 글자를 줄 때까지 브라우저에 한 바이트도 안 갔다.
         화면 쪽에는 "45초 동안 글자가 안 오면 끊고 다시 받는다"는 감시가 있어서,
         글 한 편에 70초가 걸리는 이 서버에서는 **매번 45초에 끊겼다.**
         실측(라이브, 2026-09-02): 요청 7.3초 → 45초 무응답 → 52.4초에 끊김.
         끊겨도 이 함수는 계속 돌아 글을 다 쓰고 캐시에 넣으므로, 손님은 아무것도 못 보고
         돈만 나갔다. 신호를 보내면 감시가 "살아 있다"로 판단해 안 끊는다.
       ★ 머리를 먼저 보내면 그 뒤로는 JSON 오류를 못 쓴다. 아래 upstream 실패도
         사건(type:'error')으로 알린다. */
    sseHead(res);
    send(res, { type: 'ping' });
    const beat = setInterval(() => { try { send(res, { type: 'ping' }); } catch (e) {} }, 10000);
    const stopBeat = () => { if (beat) clearInterval(beat); };
    res.on('close', stopBeat);

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
        system: systemFor(KNOWLEDGE),
        messages: [{ role: 'user', content: userPrompt(payload) }],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = (await upstream.text().catch(() => '')).slice(0, 200);
      /* ★ 응답 본문을 그대로 손님에게 보여주지 않는다. 열쇠나 내부 사정이 섞여 나갈 수 있다. */
      console.error('anthropic 오류', upstream.status, detail);
      stopBeat();
      send(res, { type: 'error', reason: '해석을 만들지 못했어요. 잠시 후 다시 시도해 주세요.' });
      return res.end();
    }

    let full = '';
    /* ★ 2026-08-25 — 왜 끝났는지를 붙잡아 둔다.
       'max_tokens'면 분량 상한에 걸려 문장 한가운데서 잘렸다는 뜻이다.
       예전에는 이 값을 아예 안 봐서, 잘린 글이 조용히 캐시에 들어갔다. */
    let stopReason = null;
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
          } else if (ev.type === 'message_delta' && ev.delta?.stop_reason) {
            stopReason = ev.delta.stop_reason;
          } else if (ev.type === 'error') {
            console.error('anthropic 스트림 오류', ev.error?.type);
            stopBeat();
            send(res, { type: 'error', reason: '해석을 만들다가 끊겼어요.' });
            return res.end();
          }
        }
      }
    }

    /* ★ 끝까지 못 받았으면 저장하지도, 횟수를 쓰지도 않는다.
       반쪽짜리 글을 캐시에 넣으면 그 사람은 영영 반쪽만 보게 된다.
       ★ 2026-08-25 — 이 자리에 검사가 "200자보다 짧은가" 하나뿐이었다. 그래서 5,311자짜리
         잘린 글(마지막 섹션이 통째로 빠지고 문장 한가운데서 끊긴 글)이 그대로 통과해
         캐시에 들어갔다. 다시 눌러도 캐시가 먼저 나오므로 영영 잘린 글만 보게 된다.
         실제로 그 일이 일어났다(2026-08-25 12:47 생성분).
         옆 창구(api/content.js)에는 이미 섹션 개수를 세는 검사가 있었다. 스트리밍 쪽만 없었다 —
         같은 상품인데 창구에 따라 검사가 다르면 언젠가 반드시 이런 일이 난다. 맞춘다. */
    const wantTitles = Array.isArray(payload?.requested?.sectionTitles)
      ? payload.requested.sectionTitles.length : 0;
    const gotHeadings = (full.match(/^##/gm) || []).length;

    stopBeat();
    if (full.trim().length < 200) {
      send(res, { type: 'error', reason: '해석이 너무 짧게 끝났어요. 다시 시도해 주세요.' });
      return res.end();
    }
    if (stopReason === 'max_tokens') {
      console.error('해석이 분량 상한에 걸려 잘렸습니다', full.length, '자 ·', gotHeadings, '/', wantTitles, '섹션');
      send(res, { type: 'error', reason: '해석이 끝까지 만들어지지 않았어요. 다시 시도해 주세요.' });
      return res.end();
    }
    if (wantTitles && gotHeadings < wantTitles) {
      console.error('해석 섹션이 모자랍니다', gotHeadings, '/', wantTitles, 'stop_reason=', stopReason);
      send(res, { type: 'error', reason: '해석이 끝까지 만들어지지 않았어요. 다시 시도해 주세요.' });
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
