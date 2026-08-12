/* =====================================================================
   해석 지식 — knowledge_saju_mbti.md 를 읽어 AI에게 넘긴다
   ---------------------------------------------------------------------
   ★ 글은 .md 한 곳에만 둔다. 여기에 같은 내용을 복사해 두면 언젠가 둘이 달라지고,
     그때는 어느 쪽이 진짜인지 아무도 모른다. 이 파일은 읽어오는 일만 한다.

   ★ new URL(..., import.meta.url) 로 가리킨다. Vercel이 서버 함수를 묶을 때
     이 형태를 보고 파일을 함께 담는다. 경로 문자열을 조립하면 못 알아본다.

   ★ 못 읽어도 멈추지 않는다. 지식 없이도 해석은 나온다 — 다만 얕아질 뿐이다.
     기능 하나 때문에 결제한 사람의 해석을 통째로 못 만들면 그게 더 나쁘다.
     대신 무슨 일이 있었는지 로그에 남기고, 길이를 밖에서 확인할 수 있게 열어 둔다.
===================================================================== */
import fs from 'node:fs';

let text = '';
try {
  text = fs.readFileSync(new URL('../../knowledge_saju_mbti.md', import.meta.url), 'utf8');
} catch (err) {
  console.warn('해석 지식 문서를 읽지 못했습니다(지식 없이 진행):', err && err.message);
}

export const KNOWLEDGE = text;
export const KNOWLEDGE_CHARS = text.length;
