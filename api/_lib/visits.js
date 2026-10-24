/* =====================================================================
   이용 기록 — 재방문 · 탭 조회 · 유입 (2026-10-24 대표님 "엉 붙일 수 있는 건 다 붙여")
   ---------------------------------------------------------------------
   이벤트 텍소노미 표에서 '못 잼'이던 셋을 우리 DB 한 표(visit_log)로 잽니다.
     · 재방문율 · 재방문 주기  — 하루 한 줄 'open'
     · 탭(화면)별 조회         — 하루·화면마다 한 줄 'tab:<ROUTE>'
     · 유입                    — 그날 무엇을 들고 왔나 'in:pair' · 'in:group' · 'in:ad'
   ★ 같은 날 같은 것은 한 줄입니다(unique). 그래서 '조회 수'가 아니라 '그날 그 화면을 연 사람 수'입니다.
   ★ 담는 것은 날짜 · 세션 · 카카오 회원번호 · 위 글자뿐입니다. 이름·생년월일·사주는 넣지 마십시오.

   표 (대표님이 SQL Editor 에서 만드심 — MCP 로 DDL 하지 않음)
     create table if not exists visit_log (
       id bigserial primary key,
       day date not null,
       session_id text not null,
       kakao_id text,
       what text not null,
       created_at timestamptz not null default now(),
       unique (day, session_id, what)
     );
     create index if not exists visit_log_day_idx on visit_log (day);
     alter table visit_log enable row level security;
===================================================================== */

/* 받는 글자 — 이것 말고는 버린다 (손님 브라우저가 보내는 값이라 아무거나 받지 않는다) */
export const VISIT_WHAT = /^(open|tab:[A-Za-z0-9]{1,24}|in:(pair|group|ad))$/;
export const VISIT_MAX_ITEMS = 20;

export const kstDay = (ms) => new Date((ms == null ? Date.now() : ms) + 9 * 3600 * 1000).toISOString().slice(0, 10);
const dayNum = (d) => Math.round(Date.parse(d + 'T00:00:00Z') / 86400000);

export function cleanItems(items) {
  const out = [];
  (Array.isArray(items) ? items : []).forEach((x) => {
    const s = String(x || '');
    if (VISIT_WHAT.test(s) && out.indexOf(s) < 0 && out.length < VISIT_MAX_ITEMS) out.push(s);
  });
  return out;
}

/* 고른 기간의 요약. 순수 함수 — 검사기가 그대로 불러 값을 대조합니다.
   rows   : visit_log 줄 [{day, session_id, kakao_id, what}] (기간과 상관없이 **전부** — '처음 온 날'을 알아야 함)
   links  : kakao_links [{kakao_id, session_id}]
   orders : 결제된 주문 [{session_id, paid_at|created_at, amount, status}]
   ★ 사람 = 카카오 회원번호. 로그인 전 줄(세션만)은 같은 세션이 나중에 회원번호를 얻었으면 그 사람에게 붙입니다.
     끝까지 회원번호가 없으면 세션 하나를 한 사람으로 봅니다('로그인 전에 나감'). */
export function summarizeVisits(rows, links, orders, since, until) {
  const s2k = {};
  (links || []).forEach((l) => { if (l && l.session_id && l.kakao_id) s2k[l.session_id] = String(l.kakao_id); });
  (rows || []).forEach((r) => { if (r.kakao_id && r.session_id) s2k[r.session_id] = String(r.kakao_id); });
  const who = (sid, kid) => (kid ? 'k:' + kid : (s2k[sid] ? 'k:' + s2k[sid] : 's:' + sid));

  const P = {};   /* 사람 → {days:Set, first, ins:{}, tabs:{day:Set}, sessions:Set, member} */
  (rows || []).forEach((r) => {
    if (!r || !r.day || !r.what) return;
    const k = who(r.session_id, r.kakao_id);
    const p = P[k] || (P[k] = { days: new Set(), ins: {}, tabs: [], sessions: new Set(), member: k.indexOf('k:') === 0 });
    p.days.add(r.day);
    p.sessions.add(r.session_id);
    if (r.what.indexOf('in:') === 0) { (p.ins[r.day] = p.ins[r.day] || []).push(r.what.slice(3)); }
    if (r.what.indexOf('tab:') === 0) p.tabs.push([r.day, r.what.slice(4)]);
  });
  /* 결제 — 그 사람의 세션 어느 것에든 붙은 결제 */
  const s2p = {};
  Object.keys(P).forEach((k) => { P[k].sessions.forEach((sid) => { s2p[sid] = k; }); });
  /* 같은 회원의 다른 세션(기기를 바꿨거나 기록이 생기기 전)도 결제를 찾도록 */
  Object.keys(s2k).forEach((sid) => { const k = 'k:' + s2k[sid]; if (P[k] && !s2p[sid]) s2p[sid] = k; });
  const paid = {};
  (orders || []).forEach((o) => {
    if (!o || o.status !== 'paid') return;
    const k = s2p[o.session_id]; if (!k) return;
    (paid[k] = paid[k] || []).push(o);
  });

  const inWin = (d) => d >= since && d <= until;
  const out = {
    since, until,
    firstLogged: null,
    visitors: 0, members: 0,
    newcomers: 0, returned: 0, returnRate: null, avgDaysToReturn: null, avgGap: null, multiDay: 0,
    tabs: [], sources: [], daily: [],
  };
  let gapSum = 0, gapN = 0, retSum = 0, retN = 0;
  const tabMap = {}, srcMap = {}, dayMap = {};
  Object.keys(P).forEach((k) => {
    const p = P[k];
    const days = Array.from(p.days).sort();
    if (!out.firstLogged || days[0] < out.firstLogged) out.firstLogged = days[0];
    const winDays = days.filter(inWin);
    if (!winDays.length) return;
    out.visitors++;
    if (p.member) out.members++;
    if (winDays.length >= 2) {
      out.multiDay++;
      for (let i = 1; i < winDays.length; i++) { gapSum += dayNum(winDays[i]) - dayNum(winDays[i - 1]); gapN++; }
    }
    const first = days[0];
    const isNew = inWin(first);
    if (isNew) {
      out.newcomers++;
      if (days.length >= 2) { out.returned++; retSum += dayNum(days[1]) - dayNum(first); retN++; }
    }
    winDays.forEach((d) => {
      const m = dayMap[d] || (dayMap[d] = { d, visitors: 0, fresh: 0, back: 0 });
      m.visitors++;
      if (d === first) m.fresh++; else m.back++;
    });
    p.tabs.forEach(([d, t]) => {
      if (!inWin(d)) return;
      const m = tabMap[t] || (tabMap[t] = { tab: t, people: new Set(), days: 0 });
      m.people.add(k); m.days++;
    });
    /* 유입 — 이 기간에 처음 온 분이 그 첫날 들고 온 것 (없으면 'direct') */
    if (isNew) {
      const src = (p.ins[first] && p.ins[first][0]) || 'direct';
      const m = srcMap[src] || (srcMap[src] = { src, people: 0, members: 0, buyers: 0, revenue: 0 });
      m.people++;
      if (p.member) m.members++;
      const po = paid[k] || [];
      if (po.length) { m.buyers++; m.revenue += po.reduce((a, o) => a + (Number(o.amount) || 0), 0); }
    }
  });
  out.returnRate = out.newcomers ? Math.round(out.returned / out.newcomers * 1000) / 10 : null;
  out.avgDaysToReturn = retN ? Math.round(retSum / retN * 10) / 10 : null;
  out.avgGap = gapN ? Math.round(gapSum / gapN * 10) / 10 : null;
  out.tabs = Object.keys(tabMap).map((t) => ({ tab: t, people: tabMap[t].people.size, days: tabMap[t].days }))
    .sort((a, b) => b.people - a.people || (a.tab < b.tab ? -1 : 1));
  const SRC_ORDER = ['pair', 'group', 'ad', 'direct'];
  out.sources = Object.keys(srcMap).map((s) => srcMap[s])
    .sort((a, b) => SRC_ORDER.indexOf(a.src) - SRC_ORDER.indexOf(b.src));
  out.daily = Object.keys(dayMap).sort().map((d) => dayMap[d]);
  return out;
}
