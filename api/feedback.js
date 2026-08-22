/* =====================================================================
   개선 의견 — 페이지 안에서 바로 쓰고 보내는 창구
   ---------------------------------------------------------------------
   왜 만들었나 (2026-08-14, 대표님 지시):
     예전에는 화면 아래 [개선 의견]이 mailto: 링크였다. 누르면 브라우저가 기본 메일 앱을
     연다 — 맥에서는 '메일'이 뜨고, 윈도에서는 아무 일도 안 일어나는 경우가 많다.
     메일 앱을 안 쓰는 사람은 거기서 그냥 포기한다. 실제로 대표님이 맥북에서 겪으셨다.

   ★ 저장이 먼저, 메일은 그 다음이다.
     메일 발송은 남의 서비스에 기대는 일이라 언제든 실패할 수 있다. 그때 요청 전체를
     실패로 돌리면 손님이 쓴 글이 사라진다. 그래서 Supabase에 넣는 것을 먼저 끝내고,
     메일은 '되면 좋은 것'으로 뒤에 붙인다. 메일이 실패해도 손님에게는 성공이라 답한다 —
     실제로 의견은 접수됐기 때문이다. 대신 실패 사실은 표에 남겨 나중에 알 수 있게 한다.

   ★ 지금 메일 발송은 꺼져 있다 (대표님 결정, 2026-08-14 — Supabase 저장만 쓴다).
     RESEND_API_KEY 환경변수가 없으면 발송 단계를 통째로 건너뛴다. 나중에 마음이 바뀌면
     Vercel에 키를 한 줄 넣는 것만으로 켜진다 — 이 파일은 고칠 것이 없다.
     ※ 발송은 npm 패키지 없이 fetch로 REST를 부른다(이 프로젝트의 외부 의존성 0 원칙).
     ※ 도메인을 아직 안 붙였으면 Resend는 'onboarding@resend.dev'에서
       '가입할 때 쓴 그 주소'로만 보내준다. 도메인을 붙이면 RESEND_FROM으로 바꾸면 된다.

   ── 필요한 테이블 (schema.sql에 같은 내용이 있다) ─────────────────────
   create table if not exists feedback (
     id bigserial primary key, session_id text not null, kind text, screen text,
     body text not null, contact text, mailed boolean not null default false,
     mail_error text, sheeted boolean, sheet_error text,
     status text not null default 'received', reply text, replied_at timestamptz,
     kakao_id text, order_id text,
     created_at timestamptz not null default now()
   );
   ────────────────────────────────────────────────────────────────────── */
import { readBody, json, methodGuard } from './_lib/http.js';
import { ensureSession } from './_lib/session.js';
import { testAccessOf, kakaoLinkOfSession } from './_lib/store.js';
import { COMPANY } from './_lib/company.js';

/* 글자수 상한. 넉넉하되 무한은 아니다 — 저장소를 지키는 선이다. */
const MAX_BODY = 2000;
const MAX_CONTACT = 120;
const MAX_SCREEN = 40;
const MAX_ORDER = 80;

/* 무엇을 물어보는 것인지. 화면의 세 갈래와 같은 값이다.
   ★ 앱이 보낸 값을 그대로 믿지 않고 이 목록에 있는 것만 받는다. */
const KINDS = {
  howto:  '어떻게 하는지 모르겠어요',
  broken: '안 되는 게 있어요',
  wish:   '이런 게 있으면 좋겠어요',
  /* ★ 2026-08-22 — 고객지원 화면을 만들면서 늘렸다.
     돈이 걸린 두 갈래를 따로 세워야 급한 것부터 먼저 볼 수 있다. 섞여 있으면
     "이런 게 있으면 좋겠어요" 스무 건 사이에 환불 요청이 파묻힌다. */
  paid:   '결제했는데 결과가 안 보여요',
  refund: '환불 신청',
};

/* 처리 상태 — 시트에서 대표님이 적으시는 값이기도 하다.
   ★ 목록 밖의 값이 들어오면 통째로 거절하지 않고 'received'로 떨어뜨린다.
     시트에 오타가 났다고 손님 화면이 비면 안 되기 때문이다. */
const STATUS = {
  received: '접수됨',
  working:  '확인 중',
  answered: '답변 완료',
  closed:   '처리 완료',
};
const MAX_REPLY = 4000;

/* 도배 막기. 한 사람(세션)이 한 시간에 다섯 건까지.
   ★ 진짜 의견을 여러 번 쓰는 분을 막을 생각은 없다 — 다섯 건이면 충분히 넉넉하고,
     자동으로 쏟아붓는 것만 걸린다. */
const RATE_WINDOW_MIN = 60;
const RATE_MAX = 5;

function conf() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 환경변수가 없습니다.');
  return { url: url.replace(/\/+$/, ''), key };
}

async function rest(path, init = {}) {
  const { url, key } = conf();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const text = (await res.text().catch(() => '')).slice(0, 200);
    throw new Error(`저장소 오류 (HTTP ${res.status}) ${text}`);
  }
  const text = await res.text();
  if (!text) return [];
  try { return JSON.parse(text); } catch { return []; }
}

/* 메일 본문에 그대로 넣을 값의 HTML 특수문자를 막는다.
   손님이 쓴 글이 우리 메일함에서 태그로 해석되지 않게 한다. */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* =====================================================================
   구글 스프레드시트로 한 줄씩 보낸다 (2026-08-22 대표님 지시)
   ---------------------------------------------------------------------
   메일 대신 시트에 모아 보시겠다고 해서 붙였다. 받는 곳은 대표님 시트에 딸린
   Apps Script 웹앱이고, 그 주소는 SHEET_WEBHOOK_URL 환경변수에 있다.
   ★ 주소가 없으면 통째로 건너뛴다. 메일과 같은 방식이다 — 안 켠 것은 실패가 아니다.
   ★ 실패해도 접수는 이미 끝나 있다. 원본은 언제나 feedback 표에 있고 시트는 사본이다.
     그래서 절대 던지지 않는다.
   ★ Apps Script는 응답을 리다이렉트로 준다. redirect:'follow'가 없으면 302에서 멈춘다. */
async function sendToSheet({ id, body, contact, kind, screen, createdAt, sessionId, orderId }) {
  const url = process.env.SHEET_WEBHOOK_URL;
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        /* ★ 접수번호를 함께 보낸다. 이게 없으면 시트에 적으신 답을 어느 문의에
           붙여야 하는지 되짚을 길이 없다 — 손님 화면의 [내 문의 내역]이 이 번호로 이어진다. */
        id: id || '',
        at: createdAt,
        kind: KINDS[kind] || '적지 않음',
        screen: screen || '적지 않음',
        body,
        contact: contact || '',
        orderId: orderId || '',
        /* 세션은 앞 8자만. 같은 사람이 여러 번 보냈는지 알아보는 용도다.
           통째로 적으면 그 값으로 이용권까지 짚을 수 있어 시트에 남길 이유가 없다. */
        session: sessionId ? String(sessionId).slice(0, 8) : '',
      }),
    });
    if (!res.ok) return `HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`;
    const t = (await res.text().catch(() => '')).slice(0, 200);
    /* Apps Script는 스크립트가 죽어도 200을 주는 일이 있다. 본문으로 다시 확인한다. */
    if (t.indexOf('"ok":true') < 0) return `응답이 이상함: ${t}`;
    return null;
  } catch (err) {
    return String((err && err.message) || err).slice(0, 200);
  }
}

/* 메일 한 통. 성공하면 null, 실패하면 사람이 읽을 이유를 돌려준다.
   ★ 절대 던지지 않는다 — 이 함수의 실패가 접수를 무르게 하면 안 된다. */
async function sendMail({ body, contact, kind, screen, createdAt }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;   /* 발송을 안 켠 상태. 실패가 아니므로 오류로 적지 않는다. */

  const to = process.env.FEEDBACK_TO_EMAIL || COMPANY.supportEmail;
  const from = process.env.RESEND_FROM || `${COMPANY.serviceName} <onboarding@resend.dev>`;
  const kindLabel = KINDS[kind] || '적지 않음';

  const html = [
    `<p><strong>받은 시각</strong> ${esc(createdAt)}</p>`,
    `<p><strong>무엇을</strong> ${esc(kindLabel)}</p>`,
    `<p><strong>어느 화면</strong> ${esc(screen || '적지 않음')}</p>`,
    `<p><strong>연락처</strong> ${contact ? esc(contact) : '적지 않음'}</p>`,
    '<hr>',
    `<pre style="white-space:pre-wrap;font-family:inherit;font-size:15px;line-height:1.7;">${esc(body)}</pre>`,
  ].join('\n');

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `[${COMPANY.serviceName}] ${kindLabel}${screen ? ` · ${screen}` : ''}`,
        html,
      }),
    });
    if (!res.ok) {
      const t = (await res.text().catch(() => '')).slice(0, 200);
      return `HTTP ${res.status} ${t}`;
    }
    return null;
  } catch (err) {
    return String((err && err.message) || err).slice(0, 200);
  }
}

/* =====================================================================
   시트에서 되돌아오는 답변 (2026-08-22)
   ---------------------------------------------------------------------
   대표님은 구글 시트에서 문의를 읽으신다. 답도 거기에 적으시는 게 가장 자연스럽다.
   그래서 시트의 '상태'·'답변' 칸을 고치시면 시트에 붙은 Apps Script가 이 창구로
   되쏴 준다. 그 값을 feedback 표에 넣으면 손님의 [내 문의 내역]에 그대로 뜬다.

   ★ 이 창구는 손님이 부르는 곳이 아니다. 아무나 부르면 남의 문의에 아무 답이나
     달 수 있으므로 SHEET_ANSWER_KEY를 아는 쪽만 받는다. 키는 Vercel 환경변수와
     Apps Script 속성에만 있고, 이 파일이나 화면 코드에는 값이 없다.
   ★ 키를 안 넣어두면 이 기능은 통째로 꺼진 것으로 본다(404). 설정을 덜 한 상태가
     '아무나 통과'로 이어지면 안 된다.
===================================================================== */
async function saveAnswer(res, body) {
  const id = Number(body.id);
  if (!id || !Number.isFinite(id)) {
    return json(res, 400, { error: 'bad_request', reason: 'id가 필요해요.' });
  }
  const reply = String(body.reply == null ? '' : body.reply).trim().slice(0, MAX_REPLY);
  const status = STATUS[body.status] ? String(body.status)
    : (reply ? 'answered' : 'received');

  const patch = { status, reply: reply || null };
  /* 답이 처음 달린 시각만 남긴다. 오타를 고치실 때마다 시각이 밀리면
     손님 화면의 "언제 답을 받았나"가 계속 바뀐다. */
  patch.replied_at = reply ? new Date().toISOString() : null;

  try {
    const rows = await rest(`feedback?id=eq.${id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    });
    if (!rows || !rows.length) {
      return json(res, 404, { error: 'not_found', reason: '그 번호의 문의가 없어요.' });
    }
    return json(res, 200, { ok: true, id, status });
  } catch (err) {
    console.error('답변 반영 실패', err && err.message);
    return json(res, 500, { error: 'server_error', reason: '지금은 반영할 수 없어요.' });
  }
}

async function handleAnswer(req, res, body) {
  const key = process.env.SHEET_ANSWER_KEY;
  const given = req.headers['x-answer-key'];
  if (!key || !given || String(given) !== String(key)) {
    return json(res, 404, { error: 'not_found', reason: '없는 주소예요.' });
  }
  return saveAnswer(res, body);
}

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;

  /* ★ 답변 반영은 손님 세션과 무관하다. 세션 쿠키를 발급하기 전에 갈라낸다 —
     시트가 부를 때마다 쓸데없는 세션이 하나씩 생기지 않게 한다. */
  {
    const early = readBody(req);
    if (String(early.action || '') === 'answer') return handleAnswer(req, res, early);
  }

  let sessionId;
  try {
    sessionId = ensureSession(req, res);
  } catch (err) {
    console.error('세션 발급 실패', err && err.message);
    return json(res, 500, { error: 'server_error', reason: '서버 설정이 아직 끝나지 않았어요.' });
  }

  const body = readBody(req);
  const action = String(body.action || 'send');

  /* =====================================================================
     ── 내 문의 내역 ─────────────────────────────────────────────────
     접수한 것이 어떻게 되고 있는지 손님이 스스로 확인하는 창구다.
     ★ 이게 없으면 "접수했는데 아무 소식이 없다"는 문의가 원래 문의 위에 또 쌓인다.
       상태만 보여도 다시 묻는 일이 줄어든다.
     ★ 남의 글이 섞이지 않게 세션(쿠키)으로만 찾는다. 카카오로 이어보기를 켜신
       분은 기기가 바뀌어도 보이도록 카카오 회원번호로도 함께 찾는다.
     ★ 연락처는 돌려주지 않는다. 손님이 자기가 적은 값을 다시 볼 이유가 없고,
       내려보내는 값은 적을수록 좋다.
  ===================================================================== */
  if (action === 'mine') {
    try {
      let kakaoId = null;
      try { kakaoId = await kakaoLinkOfSession(sessionId); } catch (e) { kakaoId = null; }
      const cols = 'id,created_at,kind,screen,body,status,reply,replied_at,order_id';
      const sess = `session_id=eq.${encodeURIComponent(sessionId)}`;
      const q = kakaoId
        ? `feedback?or=(${sess},kakao_id.eq.${encodeURIComponent(kakaoId)})&select=${cols}&order=created_at.desc&limit=50`
        : `feedback?${sess}&select=${cols}&order=created_at.desc&limit=50`;
      const rows = await rest(q);
      return json(res, 200, {
        items: (rows || []).map((r) => ({
          id: r.id,
          at: r.created_at,
          kind: r.kind || null,
          kindLabel: KINDS[r.kind] || '그 밖의 의견',
          screen: r.screen || '',
          body: r.body || '',
          orderId: r.order_id || '',
          status: STATUS[r.status] ? r.status : 'received',
          statusLabel: STATUS[r.status] || STATUS.received,
          reply: r.reply || '',
          repliedAt: r.replied_at || null,
        })),
      });
    } catch (err) {
      console.error('내 문의 내역 조회 실패', err && err.message);
      return json(res, 500, { error: 'server_error', reason: '지금은 불러올 수 없어요.' });
    }
  }

  /* ── 목록 보기 — 관리자만 ────────────────────────────────────────
     stats.js와 같은 관문을 쓴다(테스트 허가를 받은 세션만).
     허가가 없으면 '없는 주소'처럼 404로 답한다 — 이런 창구가 있다는 사실도 알리지 않는다. */
  if (action === 'list') {
    try {
      const grant = await testAccessOf(sessionId);
      if (!grant) return json(res, 404, { error: 'not_found', reason: '없는 주소예요.' });
      const rows = await rest('feedback?select=*&order=created_at.desc&limit=100');
      return json(res, 200, { items: rows || [] });
    } catch (err) {
      console.error('개선 의견 조회 실패', err && err.message);
      return json(res, 500, { error: 'server_error', reason: '지금은 불러올 수 없어요.' });
    }
  }

  /* =====================================================================
     ── 답변 달기 — 운영자만 (2026-08-22)
     ---------------------------------------------------------------------
     원래는 구글 시트에 답을 적고 Apps Script가 되쏘는 길만 있었다. 그런데 그 길은
     대표님이 시트 스크립트를 갈아끼우고, 비밀값을 만들고, 트리거까지 거셔야 열린다.
     ★ 그래서 앱 안에서 바로 답을 다는 길을 하나 더 낸다. 폰에서 시트를 편집하는 것보다
       훨씬 편하고, 설정할 것이 하나도 없다.
     ★ 관문은 목록 보기(list)와 똑같다 — 테스트 허가를 받은 세션만. 허가가 없으면
       '없는 주소'처럼 404로 답한다. 이런 창구가 있다는 사실 자체를 알리지 않는다.
     ★ 시트 쪽 길(action:'answer')은 그대로 살려 둔다. 둘은 같은 saveAnswer를 부르므로
       어느 쪽으로 답해도 결과가 같다.
  ===================================================================== */
  if (action === 'reply') {
    try {
      const grant = await testAccessOf(sessionId);
      if (!grant) return json(res, 404, { error: 'not_found', reason: '없는 주소예요.' });
      return saveAnswer(res, body);
    } catch (err) {
      console.error('답변 저장 실패', err && err.message);
      return json(res, 500, { error: 'server_error', reason: '지금은 저장할 수 없어요.' });
    }
  }

  /* ── 접수 ───────────────────────────────────────────────────────── */
  const text = String(body.body || '').trim();
  /* 연락처는 형식을 따지지 않는다 — 전화번호도 카톡 아이디도 메일도 받는다.
     형식을 강요하면 "그럼 안 적고 만다"가 되고, 그러면 답을 드릴 길이 없어진다. */
  const contact = String(body.contact || '').trim().slice(0, MAX_CONTACT);
  const screen = String(body.screen || '').trim().slice(0, MAX_SCREEN);
  const kind = KINDS[body.kind] ? String(body.kind) : null;
  /* 결제·환불 문의에서만 받는 값이다. 형식은 따지지 않는다 —
     손님이 영수증 번호 대신 "카톡으로 받은 그 번호"를 붙여넣으셔도 우리가 찾으면 된다. */
  const orderId = String(body.orderId || '').trim().slice(0, MAX_ORDER);

  if (!text) {
    return json(res, 400, { error: 'bad_request', reason: '무슨 일이 있었는지 한 줄만 적어주세요.' });
  }
  if (text.length > MAX_BODY) {
    return json(res, 400, { error: 'too_long', reason: `내용은 ${MAX_BODY}자까지 보낼 수 있어요.` });
  }

  try {
    /* 도배 막기 — 저장하기 전에 본다. */
    const since = new Date(Date.now() - RATE_WINDOW_MIN * 60 * 1000).toISOString();
    const recent = await rest(
      `feedback?session_id=eq.${encodeURIComponent(sessionId)}&created_at=gte.${since}&select=id`
    );
    if ((recent || []).length >= RATE_MAX) {
      return json(res, 429, {
        error: 'too_many',
        reason: '의견을 여러 건 보내주셨어요. 한 시간 뒤에 다시 보내주시면 모두 확인하겠습니다.',
      });
    }

    /* 카카오로 이어보기를 켜신 분은 기기를 바꿔도 자기 문의를 볼 수 있어야 한다.
       못 읽어도 접수는 그대로 진행한다 — 이것 때문에 글이 날아가면 안 된다. */
    let kakaoId = null;
    try { kakaoId = await kakaoLinkOfSession(sessionId); } catch (e) { kakaoId = null; }

    /* ★ 저장이 먼저다. 여기까지 됐으면 의견은 살아남는다. */
    const saved = await rest('feedback', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        session_id: sessionId,
        kakao_id: kakaoId,
        kind,
        screen: screen || null,
        body: text,
        contact: contact || null,
        order_id: orderId || null,
      }),
    });
    const row = saved && saved[0] ? saved[0] : null;

    /* 시트로 보낸다. 실패해도 손님에게는 접수 성공이라 답한다(실제로 접수됐다). */
    const sheetErr = await sendToSheet({
      id: row && row.id,
      body: text,
      contact: contact || null,
      kind,
      screen,
      orderId: orderId || null,
      createdAt: (row && row.created_at) || new Date().toISOString(),
      sessionId,
    });
    if (row && process.env.SHEET_WEBHOOK_URL) {
      try {
        await rest(`feedback?id=eq.${row.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ sheeted: !sheetErr, sheet_error: sheetErr || null }),
        });
      } catch (e) { console.error('시트 적재 표시 실패', e && e.message); }
    }
    if (sheetErr) console.error('개선 의견 시트 적재 실패', sheetErr);

    /* 메일은 그 다음. 실패해도 손님에게는 접수 성공이라 답한다(실제로 접수됐다). */
    const mailErr = await sendMail({
      body: text,
      contact: contact || null,
      kind,
      screen,
      createdAt: (row && row.created_at) || new Date().toISOString(),
    });
    if (row && process.env.RESEND_API_KEY) {
      try {
        await rest(`feedback?id=eq.${row.id}`, {
          method: 'PATCH',
          headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ mailed: !mailErr, mail_error: mailErr || null }),
        });
      } catch (e) {
        /* 표시를 못 남긴 것뿐이다. 접수 자체는 이미 끝났으므로 손님에게 알릴 일이 아니다. */
        console.error('개선 의견 발송 표시 실패', e && e.message);
      }
    }
    if (mailErr) console.error('개선 의견 메일 발송 실패', mailErr);

    /* 접수번호를 돌려준다 — 화면이 "몇 번으로 접수됐어요"를 그 자리에서 보여준다.
       번호가 있으면 손님이 다시 물으실 때 "3번 문의요"라고 말할 수 있다. */
    return json(res, 200, { ok: true, id: row && row.id ? row.id : null });
  } catch (err) {
    console.error('개선 의견 접수 실패', err && err.message);
    return json(res, 500, {
      error: 'server_error',
      reason: '지금은 보낼 수 없어요. 잠시 뒤 다시 시도해 주세요.',
    });
  }
}
