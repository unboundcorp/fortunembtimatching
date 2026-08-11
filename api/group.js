/* =====================================================================
   저장된 모임 API
   ---------------------------------------------------------------------
   create — 이름·PIN·명단을 받아 저장하고 주소(group_id)를 돌려준다
   get    — 링크를 아는 사람이면 볼 수 있다 (PIN 불필요)
   update — 이름이나 명단을 고친다 (PIN 필요)
   delete — 지운다 (PIN 필요)

   ★ PIN이 틀렸을 때와 모임이 없을 때를 같은 문장으로 답한다.
     "그 모임은 있는데 PIN이 틀렸다"고 알려주면, 주소를 찍어보며 존재하는 모임을 골라낼 수 있다.
   ★ PIN은 서버도 모른다(해시만 보관). 잊으면 복구할 수 없고, 그건 설계된 결과다.
===================================================================== */
import { json, methodGuard, readBody } from './_lib/http.js';
import { createGroup, getGroup, updateGroup, deleteGroup, tooManyPinTries, notePinTry, GROUP_TTL_DAYS } from './_lib/groups.js';

const MAX_MEMBERS_TEXT = 8000;   /* 30명 × 한 줄 여유 */
const DENY = '모임을 찾을 수 없거나 PIN이 맞지 않아요.';

function badPin(v) { return typeof v !== 'string' || !/^\d{4,8}$/.test(v); }

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;
  const body = readBody(req);

  try {
    if (body.action === 'create') {
      if (typeof body.name !== 'string' || !body.name.trim()) return json(res, 400, { error: 'bad_name' });
      if (badPin(body.pin)) return json(res, 400, { error: 'bad_pin_format' });
      if (typeof body.members !== 'string' || !body.members || body.members.length > MAX_MEMBERS_TEXT) {
        return json(res, 400, { error: 'bad_members' });
      }
      const r = await createGroup({ name: body.name.trim(), pin: body.pin, members: body.members });
      return json(res, 200, { groupId: r.groupId, ttlDays: r.ttlDays });
    }

    if (body.action === 'get') {
      if (typeof body.groupId !== 'string' || !body.groupId) return json(res, 400, { error: 'bad_group' });
      const g = await getGroup(body.groupId);
      if (!g) return json(res, 404, { error: 'not_found' });
      return json(res, 200, { name: g.name, members: g.members, updatedAt: g.updated_at, ttlDays: GROUP_TTL_DAYS });
    }

    if (body.action === 'update' || body.action === 'delete') {
      if (typeof body.groupId !== 'string' || !body.groupId) return json(res, 400, { error: 'bad_group' });
      if (badPin(body.pin)) return json(res, 400, { ok: false, reason: DENY });

      if (await tooManyPinTries(body.groupId)) {
        return json(res, 429, { ok: false, reason: 'PIN 확인을 너무 자주 시도했어요. 10분 뒤에 다시 해주세요.' });
      }
      await notePinTry(body.groupId);

      const r = body.action === 'update'
        ? await updateGroup(body.groupId, body.pin, { name: body.name, members: body.members })
        : await deleteGroup(body.groupId, body.pin);

      /* 없는 모임과 틀린 PIN을 구분해 알려주지 않는다. */
      if (!r.ok) return json(res, 403, { ok: false, reason: DENY });
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: 'bad_action' });
  } catch (err) {
    console.error('group 실패:', err?.message);
    json(res, 500, { error: 'unavailable' });
  }
}
