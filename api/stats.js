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
import { testAccessOf } from './_lib/store.js';
import { productOf, aiQuotaOf } from './_lib/products.js';
import { buildEntitlements } from './_lib/entitlements.js';

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
    const grant = await testAccessOf(sessionId);
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

    /* ── 전체 현황 ──────────────────────────────────────────────── */
    const [orders, rooms, groups, aiUse, aiCache] = await Promise.all([
      rest('orders?select=order_id,product_id,amount,status,created_at,paid_at&order=created_at.desc&limit=2000'),
      rest('rooms?select=room_id,created_at,joined_at&order=created_at.desc&limit=2000'),
      rest('groups?select=group_id,members,created_at&order=created_at.desc&limit=2000'),
      rest('ai_usage?select=cache_key,created_at&order=created_at.desc&limit=2000'),
      rest('ai_cache?select=cache_key,product_id,created_at&order=created_at.desc&limit=2000'),
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
      recent: (orders || []).slice(0, 12).map((o) => {
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
