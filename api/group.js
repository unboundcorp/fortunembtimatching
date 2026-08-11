/* =====================================================================
   저장된 그룹 API
   ---------------------------------------------------------------------
   create — 이름·PIN·명단을 받아 저장하고 주소(group_id)를 돌려준다
   get    — 링크를 아는 사람이면 볼 수 있다 (PIN 불필요)
   update — 이름이나 명단을 고친다 (PIN 필요)
   delete — 지운다 (PIN 필요)

   ★ PIN이 틀렸을 때와 그룹이 없을 때를 같은 문장으로 답한다.
     "그 그룹은 있는데 PIN이 틀렸다"고 알려주면, 주소를 찍어보며 존재하는 그룹을 골라낼 수 있다.
   ★ PIN은 서버도 모른다(해시만 보관). 잊으면 복구할 수 없고, 그건 설계된 결과다.
===================================================================== */
import { json, methodGuard, readBody } from './_lib/http.js';
import { createGroup, getGroup, joinGroup, updateGroup, deleteGroup, tooManyPinTries, notePinTry, GROUP_TTL_DAYS, GROUP_MAX_MEMBERS } from './_lib/groups.js';

const MAX_MEMBERS_TEXT = 8000;   /* 30명 × 한 줄 여유 */
const DENY = '그룹을 찾을 수 없거나 PIN이 맞지 않아요.';

function badPin(v) { return typeof v !== 'string' || !/^\d{4,8}$/.test(v); }

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;
  const body = readBody(req);

  try {
    if (body.action === 'create') {
      if (typeof body.name !== 'string' || !body.name.trim()) return json(res, 400, { error: 'bad_name' });
      /* ★ R39 — PIN은 선택이다. 넣었으면 형식만 본다. 안 넣으면 만든 기기의 토큰으로 관리한다. */
      if (body.pin && badPin(body.pin)) return json(res, 400, { error: 'bad_pin_format' });
      if (typeof body.members !== 'string' || !body.members || body.members.length > MAX_MEMBERS_TEXT) {
        return json(res, 400, { error: 'bad_members' });
      }
      const r = await createGroup({ name: body.name.trim(), pin: body.pin || null, members: body.members });
      return json(res, 200, { groupId: r.groupId, ownerToken: r.ownerToken, ttlDays: r.ttlDays });
    }

    if (body.action === 'get') {
      if (typeof body.groupId !== 'string' || !body.groupId) return json(res, 400, { error: 'bad_group' });
      const g = await getGroup(body.groupId);
      if (!g) return json(res, 404, { error: 'not_found' });
      return json(res, 200, { name: g.name, members: g.members, updatedAt: g.updated_at, ttlDays: GROUP_TTL_DAYS });
    }

    /* 접수 주소로 들어온 사람이 스스로 참여한다. PIN을 요구하지 않는다. */
    if (body.action === 'join') {
      if (typeof body.groupId !== 'string' || !body.groupId) return json(res, 400, { error: 'bad_group' });
      if (typeof body.member !== 'string' || !body.member || body.member.length > 400) {
        return json(res, 400, { error: 'bad_member' });
      }
      const r = await joinGroup(body.groupId, body.member);
      if (!r.ok) {
        if (r.reason === 'full') {
          return json(res, 409, { ok: false, reason: '이 그룹은 정원('+GROUP_MAX_MEMBERS+'명)이 다 찼어요.' });
        }
        return json(res, 404, { ok: false, reason: '그룹을 찾을 수 없거나 기간이 지났어요.' });
      }
      return json(res, 200, { ok: true, already: !!r.already, name: r.name, members: r.members });
    }

    if (body.action === 'update' || body.action === 'delete') {
      if (typeof body.groupId !== 'string' || !body.groupId) return json(res, 400, { error: 'bad_group' });
      var hasToken = typeof body.ownerToken === 'string' && body.ownerToken.length > 10;
      if (!hasToken && badPin(body.pin)) return json(res, 400, { ok: false, reason: DENY });

      /* 만든 기기의 토큰으로 오는 요청은 속도 제한을 걸지 않는다 —
         찍어 맞히는 시도가 아니라 본인이 자기 그룹을 만지는 것이고,
         제 그룹을 몇 번 고쳤다고 잠기면 그게 더 이상하다. */
      if (!hasToken) {
        if (await tooManyPinTries(body.groupId)) {
          return json(res, 429, { ok: false, reason: 'PIN 확인을 너무 자주 시도했어요. 10분 뒤에 다시 해주세요.' });
        }
        await notePinTry(body.groupId);
      }

      const r = body.action === 'update'
        ? await updateGroup(body.groupId, body.pin, { name: body.name, members: body.members, newPin: body.newPin }, body.ownerToken)
        : await deleteGroup(body.groupId, body.pin, body.ownerToken);

      /* 없는 그룹과 틀린 PIN을 구분해 알려주지 않는다. */
      if (!r.ok) return json(res, 403, { ok: false, reason: DENY });
      return json(res, 200, { ok: true });
    }

    return json(res, 400, { error: 'bad_action' });
  } catch (err) {
    console.error('group 실패:', err?.message);
    json(res, 500, { error: 'unavailable' });
  }
}
