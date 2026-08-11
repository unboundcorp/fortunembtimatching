/* =====================================================================
   궁합 방(room) — 두 사람 화면을 실시간으로 잇는다
   ---------------------------------------------------------------------
   이 앱은 원래 서버 없이 링크 하나로만 정보를 옮겼다. 그래서 받는 사람 화면에서만
   결과가 나오고, 보낸 사람 화면은 상대가 링크를 열었는지조차 몰랐다.
   그걸 잇기 위해 "방"을 만든다. 방에는 두 사람 자리(a=만든 사람, b=들어온 사람)가 있고,
   양쪽 모두 방을 들여다보다가 상대 자리가 채워지면 그때 결과를 그린다.

   ★ 저장하는 값이 개인정보다 — 이름·MBTI·생년월일·태어난 시각·성별·출생지.
     그래서 아래 세 가지를 코드로 못 박는다. 문구로만 약속하지 않는다.
       1) 정해진 시간이 지나면 못 읽는다 (ROOM_TTL_HOURS). 지난 방은 조회 자체가 없는 것처럼 답한다.
       2) 방 번호는 추측할 수 없다(18바이트 난수). 번호를 모르면 남의 방을 볼 수 없다.
       3) 서버는 내용을 해석하지 않는다. 앱이 만든 문자열 한 줄을 그대로 보관했다가 그대로 돌려준다.
          어떤 값이 어떤 뜻인지는 서버가 알지 못한다.

   ★ 방이 안 만들어지면 앱은 예전처럼 링크에 정보를 담는 방식으로 되돌아간다.
     서버가 죽었다고 궁합 기능 자체가 멈추면 안 된다.
===================================================================== */
import { json, methodGuard, readBody } from './_lib/http.js';
import { createRoom, getRoomAndTouch, joinRoom } from './_lib/rooms.js';

/* 앱이 보내는 한 줄(예: "TS,ENTJ,1992,2,14,19,0,F,126.98,1")의 최대 길이.
   넉넉히 잡되 무제한은 아니다 — 저장소에 아무 길이나 밀어 넣을 수 있으면 안 된다. */
const MAX_PAYLOAD = 400;

function badPayload(v) {
  return typeof v !== 'string' || v.length === 0 || v.length > MAX_PAYLOAD;
}

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;

  const body = readBody(req);
  const action = body.action;

  try {
    /* ---- 방 만들기: 초대 링크를 만드는 쪽 ---- */
    if (action === 'create') {
      if (badPayload(body.payload)) return json(res, 400, { error: 'bad_payload' });
      const room = await createRoom(body.payload);
      return json(res, 200, { roomId: room.room_id, ttlHours: room.ttlHours });
    }

    /* ---- 방 들여다보기: 양쪽 다 쓴다 ---- */
    if (action === 'get') {
      if (typeof body.roomId !== 'string' || !body.roomId) return json(res, 400, { error: 'bad_room' });
      const room = await getRoomAndTouch(body.roomId);   /* 열었으니 기한을 다시 센다 */
      /* 없는 방과 기한이 지난 방을 구분해 알려주지 않는다 — 방 번호를 찍어보며
         "있는 번호"를 골라낼 수 있게 되기 때문이다. */
      if (!room) return json(res, 404, { error: 'not_found' });
      return json(res, 200, { a: room.a_payload, b: room.b_payload || null });
    }

    /* ---- 방에 들어가기: 링크를 연 쪽이 자기 정보를 놓는다 ---- */
    if (action === 'join') {
      if (typeof body.roomId !== 'string' || !body.roomId) return json(res, 400, { error: 'bad_room' });
      if (badPayload(body.payload)) return json(res, 400, { error: 'bad_payload' });
      const room = await joinRoom(body.roomId, body.payload);
      if (!room) return json(res, 404, { error: 'not_found' });
      return json(res, 200, { a: room.a_payload, b: room.b_payload || null });
    }

    return json(res, 400, { error: 'bad_action' });
  } catch (err) {
    console.error('room 실패:', err?.message);
    /* 실패는 실패라고 답한다. 앱은 이걸 받으면 링크에 정보를 담는 예전 방식으로 되돌아간다. */
    json(res, 500, { error: 'unavailable' });
  }
}
