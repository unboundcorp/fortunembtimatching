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
     created_at timestamptz not null default now()
   );
   ────────────────────────────────────────────────────────────────────── */
import { readBody, json, methodGuard } from './_lib/http.js';
import { ensureSession } from './_lib/session.js';
import { testAccessOf } from './_lib/store.js';
import { COMPANY } from './_lib/company.js';

/* 글자수 상한. 넉넉하되 무한은 아니다 — 저장소를 지키는 선이다. */
const MAX_BODY = 2000;
const MAX_CONTACT = 120;
const MAX_SCREEN = 40;

/* 무엇을 물어보는 것인지. 화면의 세 갈래와 같은 값이다.
   ★ 앱이 보낸 값을 그대로 믿지 않고 이 목록에 있는 것만 받는다. */
const KINDS = { howto: '어떻게 하는지 모르겠어요', broken: '안 되는 게 있어요', wish: '이런 게 있으면 좋겠어요' };

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
async function sendToSheet({ body, contact, kind, screen, createdAt, sessionId }) {
  const url = process.env.SHEET_WEBHOOK_URL;
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        at: createdAt,
        kind: KINDS[kind] || '적지 않음',
        screen: screen || '적지 않음',
        body,
        contact: contact || '',
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

export default async function handler(req, res) {
  if (!methodGuard(req, res, 'POST')) return;

  let sessionId;
  try {
    sessionId = ensureSession(req, res);
  } catch (err) {
    console.error('세션 발급 실패', err && err.message);
    return json(res, 500, { error: 'server_error', reason: '서버 설정이 아직 끝나지 않았어요.' });
  }

  const body = readBody(req);
  const action = String(body.action || 'send');

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

  /* ── 접수 ───────────────────────────────────────────────────────── */
  const text = String(body.body || '').trim();
  /* 연락처는 형식을 따지지 않는다 — 전화번호도 카톡 아이디도 메일도 받는다.
     형식을 강요하면 "그럼 안 적고 만다"가 되고, 그러면 답을 드릴 길이 없어진다. */
  const contact = String(body.contact || '').trim().slice(0, MAX_CONTACT);
  const screen = String(body.screen || '').trim().slice(0, MAX_SCREEN);
  const kind = KINDS[body.kind] ? String(body.kind) : null;

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

    /* ★ 저장이 먼저다. 여기까지 됐으면 의견은 살아남는다. */
    const saved = await rest('feedback', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        session_id: sessionId,
        kind,
        screen: screen || null,
        body: text,
        contact: contact || null,
      }),
    });
    const row = saved && saved[0] ? saved[0] : null;

    /* 시트로 보낸다. 실패해도 손님에게는 접수 성공이라 답한다(실제로 접수됐다). */
    const sheetErr = await sendToSheet({
      body: text,
      contact: contact || null,
      kind,
      screen,
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

    return json(res, 200, { ok: true });
  } catch (err) {
    console.error('개선 의견 접수 실패', err && err.message);
    return json(res, 500, {
      error: 'server_error',
      reason: '지금은 보낼 수 없어요. 잠시 뒤 다시 시도해 주세요.',
    });
  }
}
