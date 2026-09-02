/* =====================================================================
   나눠서 동시에 쓰고, 순서대로 흘려준다 (2026-09-02)
   ---------------------------------------------------------------------
   대표님 지시 — "빨리 땡길 수 있는 방법 없어?"

   실측(라이브, 궁합 유료 10장 한 편):
     한 번에 통째로 쓰게 하면  첫 글자 55.5초 · 다 오기까지 126.7초
   시간의 거의 전부가 글자를 뽑아내는 데 든다. 그래서 장을 몇 덩이로 나눠 **동시에** 맡기면
   전체 시간이 제일 오래 걸리는 덩이 하나로 줄어든다.

   ★ 동시에 쓰되, 화면에는 반드시 목차 순서대로 흘려보낸다.
     3장이 먼저 다 써졌다고 3장부터 보내면, 읽는 사람 화면에는 3장이 1장 자리에 붙는다.
     그래서 모든 덩이를 동시에 받아 각자 통에 담아 두고(그래야 받는 쪽이 안 막힌다),
     내보내는 것은 앞 덩이부터 차례로 한다. 앞 덩이를 내보내는 동안 뒤 덩이는 이미 써지고 있다.

   ★ 통에 담아 두기를 빼먹으면 안 된다. 앞 덩이만 읽고 뒤 덩이를 안 읽으면
     그쪽 연결에 물이 차서(backpressure) 생성이 멎는다. 그러면 나눈 의미가 없어진다.

   ★ 이 파일 하나를 api/interpret.js(흘려받기)와 api/content.js(통짜)가 함께 쓴다.
     복사해서 두 벌로 만들지 마라 — 이 저장소에서 그 사고가 반복해서 났다.

   ★ 캐시 열쇠는 건드리지 않는다. 합쳐 놓은 결과물이 한 번에 쓰던 때와 같은 모양
     (## 제목 …)이라 저장·재열람 규칙이 그대로 성립한다. 열쇠를 바꾸면 이미 사신 분들의
     글이 통째로 사라지고, 단품은 횟수가 1회라 다시 만들지도 못한다.
===================================================================== */
import { KNOWLEDGE } from './knowledge.js';
import {
  MODEL, MAX_TOKENS, ANTHROPIC_URL, systemFor, splitTitles, userPromptChunk,
} from './aiprompt.js';

/* 덩이 사이를 잇는 글자. 합친 결과와 흘려보낸 결과가 **한 글자도 다르면 안 된다** —
   다르면 캐시에 저장된 글과 그때 화면에 뜬 글이 갈린다. 그래서 상수 하나로 둔다. */
const JOIN = '\n\n';

/* 한 덩이를 Anthropic에 맡기고, 오는 대로 통(st.text)에 담는다. 던지지 않는다 —
   실패도 통에 적어 두고 끝낸다. 그래야 다른 덩이가 도중에 버려지지 않는다. */
async function drainChunk({ key, payload, allTitles, chunk, st }) {
  try {
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
        messages: [{ role: 'user', content: userPromptChunk(payload, allTitles, chunk) }],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = (await upstream.text().catch(() => '')).slice(0, 200);
      /* ★ 본문을 그대로 위로 올리지 않는다. 열쇠나 내부 사정이 섞여 나갈 수 있다. */
      console.error('anthropic 오류', upstream.status, detail);
      st.err = new Error('upstream_' + upstream.status);
      return;
    }

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
            st.text += ev.delta.text;
          } else if (ev.type === 'message_delta' && ev.delta?.stop_reason) {
            st.stop = ev.delta.stop_reason;
          } else if (ev.type === 'error') {
            console.error('anthropic 스트림 오류', ev.error?.type);
            st.err = new Error('stream_error');
            return;
          }
        }
      }
    }
  } catch (e) {
    st.err = e instanceof Error ? e : new Error(String(e));
  } finally {
    st.done = true;
  }
}

/* 여러 덩이를 동시에 쓰게 하고, 목차 순서대로 onDelta로 흘려준다.
     onDelta(piece)  — 조각을 순서대로 준다. 안 넘기면 흘려보내지 않고 다 모아서만 준다.
   돌려주는 값: { full, stops, parts }
     full  — 다 이어 붙인 글. 한 번에 쓰던 때와 같은 모양이다.
     stops — 덩이별 stop_reason. 하나라도 'max_tokens'면 어딘가 잘렸다는 뜻이다.
     parts — 몇 덩이로 나눴는지(기록용). */
export async function generateChunked({ key, payload, allTitles, onDelta }) {
  const chunks = splitTitles(allTitles);
  if (!chunks.length) throw new Error('no_titles');

  const states = chunks.map(() => ({ text: '', done: false, err: null, stop: null, flushed: 0 }));

  /* 모든 덩이를 한꺼번에 출발시킨다. 여기가 시간을 줄이는 자리다. */
  const drains = chunks.map((chunk, i) =>
    drainChunk({ key, payload, allTitles, chunk, st: states[i] }));

  /* 내보내기는 앞에서부터 차례로. 앞 덩이가 끝나야 다음 덩이로 넘어간다. */
  const emit = (async () => {
    if (!onDelta) return;
    for (let i = 0; i < chunks.length;) {
      const st = states[i];
      if (st.text.length > st.flushed) {
        const piece = st.text.slice(st.flushed);
        st.flushed = st.text.length;
        onDelta(piece);
      } else if (st.done) {
        if (st.err) throw st.err;
        i += 1;
        if (i < chunks.length) onDelta(JOIN);
      } else {
        await new Promise((r) => setTimeout(r, 40));
      }
    }
  })();

  await Promise.all([...drains, emit]);

  const bad = states.find((s) => s.err);
  if (bad) throw bad.err;

  return {
    full: states.map((s) => s.text).join(JOIN),
    stops: states.map((s) => s.stop),
    parts: chunks.length,
  };
}
