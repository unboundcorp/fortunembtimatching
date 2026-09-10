/* =====================================================================
   운영 현황판 — 대표님이 서비스가 어떻게 쓰이는지 보는 자리
   ---------------------------------------------------------------------
   ★ 새로 수집하는 것은 하나도 없다. 이미 쌓여 있는 기록(주문·궁합 방·그룹·AI 사용)을
     세어서 보여줄 뿐이다. 개인정보처리방침에 "광고·분석 도구를 하나도 쓰지 않는다"고
     적어 두었으므로, 방문자 수를 세려고 추적 도구를 붙이면 그 문장이 거짓이 된다.
     그래서 방문자 수는 이 화면에 없다 — 없는 것을 있는 척하지 않는다.

   ★ 누가 볼 수 있나: 테스트 허가(test_grants)를 받은 세션만.
     그 허가는 Vercel 환경변수의 코드를 아는 사람만 받을 수 있다(api/testunlock.js).
     화면 어디에도 이 주소로 가는 버튼을 두지 않는다.

   ★ 환불 판단에 쓸 수 있게 주문 하나를 영수증 번호로 조회할 수 있다.
     약관 제4조의2가 "열람한 콘텐츠는 청약철회 제한"이라고 정하고 있어,
     그 사람이 실제로 무엇을 열어봤는지가 판단의 근거가 되기 때문이다.
===================================================================== */
import { readBody, json } from './_lib/http.js';
import { ensureSession } from './_lib/session.js';
import { adminAccessOf } from './_lib/store.js';
import { productOf, aiQuotaOf } from './_lib/products.js';
import { buildEntitlements } from './_lib/entitlements.js';
import { decodePersonRow, describeProfile } from './_lib/person.js';

/* AI 해석 1건당 대략 얼마가 나가는지 — 원가 감을 잡기 위한 값이다.
   Sonnet 5 기준 입력 $2 / 출력 $10 per MTok, 유료 10섹션 ≈ 7천 토큰으로 잡았다.
   ★ 실제 청구액이 아니라 추정이다. 화면에도 '추정'이라고 적는다. */
const AI_COST_KRW = 101;

function conf() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.');
  return { url: url.replace(/\/+$/, ''), key };
}

async function rest(path) {
  const { url, key } = conf();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`저장소 오류 (HTTP ${res.status}) ${text}`);
  }
  const text = await res.text();
  if (!text) return [];
  try { return JSON.parse(text); } catch { return []; }
}

const iso = (d) => new Date(d).toISOString();
const daysAgo = (n) => iso(Date.now() - n * 24 * 60 * 60 * 1000);

/* 며칠 안에 만들어진 것만 세는 작은 도우미. */
function within(rows, field, since) {
  const t = new Date(since).getTime();
  return rows.filter((r) => r[field] && new Date(r[field]).getTime() >= t);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { error: 'method_not_allowed' });
  }

  let sessionId;
  try {
    sessionId = ensureSession(req, res);
  } catch (err) {
    console.error('세션 발급 실패', err && err.message);
    return json(res, 500, { error: 'server_error', reason: '서버 설정이 아직 끝나지 않았어요.' });
  }

  try {
    /* 허가 없이는 아무것도 알려주지 않는다. '없는 화면'처럼 보이게 404로 답한다. */
    /* ★ 2026-09-08 — 매출·주문은 운영자만. 테스터에게 줄 것이 아니다. */
    const grant = await adminAccessOf(sessionId);
    if (!grant) return json(res, 404, { error: 'not_found', reason: '없는 주소예요.' });

    const body = readBody(req);

    /* ── 주문 하나 조회 — 환불을 판단할 때 쓴다 ────────────────────── */
    if (body.action === 'order') {
      const receipt = String(body.receiptId || '').trim();
      if (!receipt) return json(res, 400, { error: 'bad_request', reason: '영수증 번호를 넣어주세요.' });

      const rows = await rest(`orders?order_id=eq.${encodeURIComponent(receipt)}&select=*&limit=1`);
      const order = rows && rows[0] ? rows[0] : null;
      if (!order) return json(res, 200, { found: false });

      const p = productOf(order.product_id);
      /* 이 사람이 AI 해석을 실제로 만든 적이 있는지 — '열람했는가'의 근거가 된다.
         ★ AI가 아닌 유료 글은 브라우저 안에서 만들어지므로 서버에 열람 기록이 없다.
           그 사실을 함께 내려보내서, 화면이 '기록 없음'을 '안 봤음'으로 오해하지 않게 한다. */
      const uses = await rest(
        `ai_usage?session_id=eq.${encodeURIComponent(order.session_id)}&select=cache_key,created_at&order=created_at.asc`
      );
      const allOrders = await rest(
        `orders?session_id=eq.${encodeURIComponent(order.session_id)}&status=eq.paid&select=*&order=paid_at.asc`
      );
      const ent = buildEntitlements(allOrders || []);
      const quota = ent.pass ? aiQuotaOf('pass') : aiQuotaOf(p ? p.kind : 'once');

      return json(res, 200, {
        found: true,
        order: {
          receiptId: order.order_id,
          productId: order.product_id,
          productName: p ? p.name : order.product_id,
          amount: order.amount,
          status: order.status,
          createdAt: order.created_at,
          paidAt: order.paid_at,
          paymentKey: order.payment_key ? '있음' : '없음',
        },
        aiUses: (uses || []).length,
        aiQuota: quota,
        firstAiAt: uses && uses[0] ? uses[0].created_at : null,
        lastAiAt: uses && uses.length ? uses[uses.length - 1].created_at : null,
        passUntil: ent.pass ? new Date(ent.pass.expiresAt).toISOString() : null,
        note: 'AI 해석이 아닌 유료 글은 브라우저 안에서 만들어져 서버에 열람 기록이 남지 않습니다.',
      });
    }

    /* ── 이 문의를 보낸 분의 주문 목록 (2026-09-08 대표님 지시) ────────
       ---------------------------------------------------------------
       왜 만들었나: 환불 문의에서 주문번호는 "모르시면 비워두세요"인데, 비워 두시면
       운영자가 그 손님의 결제를 짚을 길이 「최근 주문」 40건을 눈으로 훑는 것뿐이었다.
       문의 줄에는 이미 session_id 와 (로그인하셨으면) kakao_id 가 들어 있으므로
       그걸로 바로 찾아 준다.
       ★ 카카오는 표에 세션이 한 줄만 남는다(가장 최근). 그래서 문의의 세션과
         카카오가 가리키는 세션 **둘 다** 본다 — 기기를 바꾸셨으면 서로 다르다. */
    if (body.action === 'customerOrders') {
      const fid = Number(body.feedbackId);
      if (!fid || !Number.isFinite(fid)) {
        return json(res, 400, { error: 'bad_request', reason: '문의 번호가 필요해요.' });
      }
      const fs = await rest(`feedback?id=eq.${fid}&select=session_id,kakao_id&limit=1`);
      const f = fs && fs[0] ? fs[0] : null;
      if (!f) return json(res, 200, { found: false, reason: '그 번호의 문의가 없어요.' });

      const ids = [];
      if (f.session_id) ids.push(String(f.session_id));
      if (f.kakao_id) {
        try {
          const link = await rest(
            `kakao_links?kakao_id=eq.${encodeURIComponent(f.kakao_id)}&select=session_id&limit=1`
          );
          const sid2 = link && link[0] ? link[0].session_id : null;
          if (sid2 && ids.indexOf(String(sid2)) < 0) ids.push(String(sid2));
        } catch (e) { console.warn('카카오 세션 조회 실패', e && e.message); }
      }
      if (!ids.length) return json(res, 200, { found: true, hasKakao: false, orders: [] });

      const inList = ids.map((v) => '"' + v.replace(/"/g, '') + '"').join(',');
      const rows = await rest(
        `orders?session_id=in.(${encodeURIComponent(inList)})&select=*&order=created_at.desc&limit=30`
      );
      return json(res, 200, {
        found: true,
        hasKakao: !!f.kakao_id,
        orders: (rows || []).map((o) => {
          const p = productOf(o.product_id);
          return { receiptId: o.order_id, name: p ? p.name : o.product_id,
                   amount: o.amount, status: o.status, at: o.paid_at || o.created_at };
        }),
      });
    }

    /* ── 원자료 표 (2026-09-10 대표님 지시) ─────────────────────────
       > "관리자 페이지에서는 모든 정보가 다 보여야한다 일목 요연하게!
       >  시간부터 내용 멘트 하나하나 다 보여야된다"

       왜 만들었나: 현황판이 셈한 숫자만 보여 줘서, "그룹 2개 · 3명"에서 그게 어느
       그룹인지 볼 길이 없었습니다. 이제 카드를 누르면 그 원자료를 그대로 봅니다.
       ★ 처음에는 생년월일을 빼고 내려보내려 했는데, 대표님이 전부 보이라고 정하셨습니다.
         운영자(주식회사 언바운드)는 이 자료의 관리자이고, 화면에 닿는 길은 운영자
         코드 하나뿐입니다(adminAccessOf). **손님 화면에는 이 창구를 절대 붙이지 마십시오.**
       ★ 사람 한 줄(a_payload · members 의 한 칸)은 화면의 INVITE_FIELDS 와 같은 형식입니다 —
         n,m,y,mo,d,h,mi,g,lo,ts. 여기서 손으로 다시 세지 말고 아래 decodePerson 을 쓰십시오. */
    if (body.action === 'rows') {
      const kind = String(body.kind || '');
      const N = 200;

      const decodePerson = decodePersonRow;   /* api/_lib/person.js — 화면 INVITE_FIELDS 와 한 쌍 */

      if (kind === 'rooms') {
        const rows = await rest(
          `rooms?select=room_id,a_payload,b_payload,created_at,joined_at,expires_at&order=created_at.desc&limit=${N}`
        );
        return json(res, 200, { kind, rows: (rows || []).map((r) => ({
          id: r.room_id,
          a: decodePerson(r.a_payload),
          b: decodePerson(r.b_payload),
          at: r.created_at,
          joinedAt: r.joined_at || null,
          expiresAt: r.expires_at || null,
        })) });
      }

      if (kind === 'groups') {
        const rows = await rest(
          `groups?select=group_id,name,members,pin_hash,owner_hash,created_at,updated_at,expires_at&order=created_at.desc&limit=${N}`
        );
        return json(res, 200, { kind, rows: (rows || []).map((g) => {
          const parts = String(g.members || '').split(';').filter(Boolean);
          return {
            id: g.group_id,
            name: g.name || '',
            people: parts.length,
            members: parts.map(decodePerson).filter(Boolean),
            hasPin: !!g.pin_hash,
            hasOwner: !!g.owner_hash,
            at: g.created_at,
            updatedAt: g.updated_at || null,
            expiresAt: g.expires_at || null,
          };
        }) });
      }

      if (kind === 'orders') {
        const rows = await rest(
          `orders?select=order_id,session_id,product_id,amount,status,payment_key,created_at,paid_at&order=created_at.desc&limit=${N}`
        );
        return json(res, 200, { kind, rows: (rows || []).map((o) => {
          const p = productOf(o.product_id);
          return {
            id: o.order_id,
            productId: o.product_id,
            name: p ? p.name : o.product_id,
            amount: o.amount,
            status: o.status,
            sessionId: o.session_id || '',
            paymentKey: o.payment_key ? '있음' : '없음',
            at: o.created_at,
            paidAt: o.paid_at || null,
          };
        }) });
      }

      if (kind === 'ai') {
        /* ai_usage 는 '언제 만들었나'만 알고, 무슨 글인지는 ai_cache 에 있다. 열쇠로 맞댄다. */
        const [uses, cache] = await Promise.all([
          rest(`ai_usage?select=session_id,cache_key,created_at&order=created_at.desc&limit=${N}`),
          rest('ai_cache?select=cache_key,product_id,model,body&order=created_at.desc&limit=2000'),
        ]);
        const by = {};
        (cache || []).forEach((c) => { by[c.cache_key] = c; });
        return json(res, 200, { kind, rows: (uses || []).map((u) => {
          const c = by[u.cache_key] || null;
          const p = c ? productOf(c.product_id) : null;
          return {
            id: String(u.cache_key || '').slice(0, 12),
            name: p ? p.name : (c ? c.product_id : '(저장된 글이 지워졌어요)'),
            model: c ? c.model : '',
            chars: c && c.body ? String(c.body).length : 0,
            sessionId: u.session_id || '',
            at: u.created_at,
          };
        }) });
      }

      /* ── 회원 한 명을 통째로 (2026-09-10 대표님 지시) ──────────────
         > "카카오 아이디랑 회원마다 넣은 사주랑 성격유형 넣어줘야지 유료결제 했는지 안했는지 유무도"

         카카오 로그인 줄만 보여 주니 번호와 시각뿐이라 "이 사람이 누구인지"를 알 수 없었습니다.
         세 표를 맞대어 한 줄로 만듭니다 — kakao_links(누구) · user_sync(무엇을 넣었나) ·
         orders(돈을 냈나).
         ★ 결제는 **kakao_links 가 가리키는 세션**으로 찾습니다. 기기를 바꾸시면 그 표에
           최신 세션 하나만 남으므로, 옛 기기에서만 한 결제는 여기 안 잡힙니다.
           그 경우는 [결제] 원자료나 영수증 번호로 찾으십시오 — 없는 것을 있는 척하지 않습니다. */
      if (kind === 'kakao') {
        const links = await rest(
          `kakao_links?select=kakao_id,session_id,created_at,updated_at&order=created_at.desc&limit=${N}`
        );
        const inList = (arr) => encodeURIComponent(
          arr.map((v) => '"' + String(v).replace(/"/g, '') + '"').join(',')
        );
        const ids = (links || []).map((l) => l.kakao_id).filter(Boolean);
        const sids = (links || []).map((l) => l.session_id).filter(Boolean);
        const [syncRows, orderRows] = await Promise.all([
          ids.length ? rest(`user_sync?kakao_id=in.(${inList(ids)})&select=kakao_id,data,rev,updated_at`) : [],
          sids.length ? rest(`orders?session_id=in.(${inList(sids)})&select=session_id,order_id,product_id,amount,status,created_at,paid_at&order=created_at.desc`) : [],
        ]);
        const syncBy = {}; (syncRows || []).forEach((x) => { syncBy[x.kakao_id] = x; });
        const ordBy = {}; (orderRows || []).forEach((o) => {
          (ordBy[o.session_id] = ordBy[o.session_id] || []).push(o);
        });
        const cnt = (v) => (Array.isArray(v) ? v.length : 0);

        return json(res, 200, { kind, rows: (links || []).map((l) => {
          const sy = syncBy[l.kakao_id] || null;
          const d = (sy && sy.data) || {};
          const os = ordBy[l.session_id] || [];
          const paid = os.filter((o) => o.status === 'paid');
          return {
            id: l.kakao_id,
            sessionId: l.session_id || '',
            at: l.created_at,
            updatedAt: l.updated_at || null,
            synced: !!sy,
            rev: sy ? sy.rev : null,
            syncedAt: sy ? sy.updated_at : null,
            profiles: (Array.isArray(d.profiles) ? d.profiles : []).map(describeProfile).filter(Boolean),
            history: cnt(d.fortuneHistory) + cnt(d.compatHistory)
                   + cnt(d.sajuHistory) + cnt(d.mbtiReportHistory),
            groups: cnt(d.savedGroups),
            paidCount: paid.length,
            revenue: paid.reduce((a, o) => a + (o.amount || 0), 0),
            orders: os.map((o) => {
              const pr = productOf(o.product_id);
              return { id: o.order_id, name: pr ? pr.name : o.product_id, amount: o.amount,
                       status: o.status, at: o.paid_at || o.created_at };
            }),
          };
        }) });
      }

      if (kind === 'sync') {
        /* data 통째는 무겁다(프로필·기록 전부). 무엇이 몇 개 들었는지만 세어 보낸다. */
        const rows = await rest(
          `user_sync?select=kakao_id,rev,data,created_at,updated_at&order=updated_at.desc&limit=60`
        );
        return json(res, 200, { kind, rows: (rows || []).map((s) => {
          const d = s.data || {};
          const cnt = (v) => (Array.isArray(v) ? v.length : 0);
          /* ★ 기록 칸 이름은 api/sync.js 의 ALLOWED 와 한 쌍이다. 거기에 기록을 하나 더
             늘리면 여기도 늘려야 한다 — 안 늘리면 관리자 화면이 실제보다 적게 센다.
             checks/stats_rows_pair.cjs 가 두 목록을 대조한다. */
          const history = cnt(d.fortuneHistory) + cnt(d.compatHistory)
                        + cnt(d.sajuHistory) + cnt(d.mbtiReportHistory);
          return {
            id: s.kakao_id, rev: s.rev,
            profiles: cnt(d.profiles),
            history,
            groups: cnt(d.savedGroups),
            bytes: JSON.stringify(d).length,
            at: s.created_at, updatedAt: s.updated_at || null,
          };
        }) });
      }

      return json(res, 400, { error: 'bad_request', reason: '모르는 갈래예요.' });
    }

    /* ── 전체 현황 ──────────────────────────────────────────────── */
    /* ★ 2026-08-24 대표님 지시("운영자화면에 붙일 건 다 붙이고") — 카카오 로그인·이어보기·문의도 함께 센다.
       이 셋은 이미 표에 쌓여 있는데 현황판에 안 나와서, 대표님이 상태를 알려면 저에게 물어봐야 했다.
       ★ 실패해도 현황판 전체를 죽이지 않는다 — 새로 붙인 칸 때문에 원래 보던 숫자가 사라지면 안 된다. */
    const soft = (q) => rest(q).catch((e) => { console.warn('현황판 일부 조회 실패:', e && e.message); return []; });
    const [orders, rooms, groups, aiUse, aiCache, kakao, sync, feedback] = await Promise.all([
      rest('orders?select=order_id,product_id,amount,status,created_at,paid_at&order=created_at.desc&limit=2000'),
      rest('rooms?select=room_id,created_at,joined_at&order=created_at.desc&limit=2000'),
      rest('groups?select=group_id,members,created_at&order=created_at.desc&limit=2000'),
      rest('ai_usage?select=cache_key,created_at&order=created_at.desc&limit=2000'),
      rest('ai_cache?select=cache_key,product_id,created_at&order=created_at.desc&limit=2000'),
      soft('kakao_links?select=kakao_id,created_at&order=created_at.desc&limit=2000'),
      soft('user_sync?select=kakao_id,rev,updated_at&order=updated_at.desc&limit=2000'),
      soft('feedback?select=id,kind,status,created_at,replied_at&order=created_at.desc&limit=2000'),
    ]);

    const d1 = daysAgo(1), d7 = daysAgo(7), d30 = daysAgo(30);

    /* 궁합 링크 — 만든 수와 '상대가 실제로 들어온 수'. 이 둘의 비가 곧 링크의 성적표다. */
    function roomStat(since) {
      const made = within(rooms, 'created_at', since);
      const joined = made.filter((r) => r.joined_at);
      return { made: made.length, joined: joined.length,
               rate: made.length ? Math.round((joined.length / made.length) * 100) : 0 };
    }
    /* 그룹 — 몇 개가 만들어졌고, 한 그룹에 몇 명이 모이나. */
    function groupStat(since) {
      const made = within(groups, 'created_at', since);
      const sizes = made.map((g) => String(g.members || '').split(';').filter(Boolean).length);
      const total = sizes.reduce((a, b) => a + b, 0);
      return { made: made.length, people: total,
               avg: sizes.length ? Math.round((total / sizes.length) * 10) / 10 : 0,
               max: sizes.length ? Math.max(...sizes) : 0 };
    }
    function paidStat(since) {
      const made = within(orders, 'created_at', since);
      const paid = made.filter((o) => o.status === 'paid');
      const byProduct = {};
      paid.forEach((o) => {
        const p = productOf(o.product_id);
        const k = p ? p.name : o.product_id;
        byProduct[k] = byProduct[k] || { count: 0, amount: 0 };
        byProduct[k].count += 1;
        byProduct[k].amount += o.amount || 0;
      });
      return {
        created: made.length,
        paid: paid.length,
        failed: made.filter((o) => o.status === 'failed').length,
        revenue: paid.reduce((a, o) => a + (o.amount || 0), 0),
        byProduct,
      };
    }
    function aiStat(since) {
      const gen = within(aiUse, 'created_at', since).length;
      return { generated: gen, costKrw: gen * AI_COST_KRW };
    }

    /* 캐시가 실제로 일을 하고 있는지 — 만든 글 수보다 사용 기록이 많으면 재사용된 것이다. */
    const reuse = Math.max(0, (aiUse || []).length - (aiCache || []).length);

    return json(res, 200, {
      now: new Date().toISOString(),
      rooms: { d1: roomStat(d1), d7: roomStat(d7), d30: roomStat(d30), all: rooms.length },
      groups: { d1: groupStat(d1), d7: groupStat(d7), d30: groupStat(d30), all: groups.length },
      orders: { d1: paidStat(d1), d7: paidStat(d7), d30: paidStat(d30), all: orders.length },
      ai: { d1: aiStat(d1), d7: aiStat(d7), d30: aiStat(d30),
            cached: (aiCache || []).length, reuse, costPerKrw: AI_COST_KRW },
      /* 카카오 로그인 — 몇 분이 로그인해 두셨나. 결제가 로그인 뒤에 오므로 이 숫자가 곧 결제 가능 인원이다. */
      kakao: {
        linked: (kakao || []).length,
        d1: within(kakao || [], 'created_at', d1).length,
        d7: within(kakao || [], 'created_at', d7).length,
      },
      /* 이어보기 — 서버에 프로필·기록 사본을 둔 분의 수. */
      sync: {
        saved: (sync || []).length,
        d7: within(sync || [], 'updated_at', d7).length,
      },
      /* 문의 — 상태별로 몇 건인가. 아직 답 안 한 것이 몇 건인지가 제일 중요하다. */
      feedback: (function () {
        const rows = feedback || [];
        const by = { received: 0, working: 0, answered: 0, closed: 0 };
        rows.forEach((f) => { const k = by[f.status] != null ? f.status : 'received'; by[k] += 1; });
        return {
          all: rows.length,
          d1: within(rows, 'created_at', d1).length,
          d7: within(rows, 'created_at', d7).length,
          byStatus: by,
          waiting: by.received + by.working,
        };
      })(),
      /* ★ 목록을 12건에서 40건으로 늘렸다. 승인 전에서 멈춘 주문을 눈으로 훑으려면
         12건으로는 하루치도 안 담긴다. 상태를 그대로 내려보내므로 화면에서 갈라 볼 수 있다. */
      recent: (orders || []).slice(0, 40).map((o) => {
        const p = productOf(o.product_id);
        return { receiptId: o.order_id, name: p ? p.name : o.product_id,
                 amount: o.amount, status: o.status, at: o.paid_at || o.created_at };
      }),
    });
  } catch (err) {
    const msg = String((err && err.message) || '');
    console.error('stats 실패', msg.slice(0, 200));
    if (/Could not find the table/i.test(msg)) {
      return json(res, 503, { error: 'not_ready', reason: '데이터베이스 표가 아직 없습니다 — schema.sql을 실행해 주세요.' });
    }
    return json(res, 500, { error: 'server_error', reason: '지금은 불러올 수 없어요.' });
  }
}
