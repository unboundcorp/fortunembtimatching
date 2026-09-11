#!/usr/bin/env node
/* =====================================================================
   카카오 로그인이 앱으로 새지 않는가 (빠른 층)
   ---------------------------------------------------------------------
   2026-09-11 대표님 영상 제보 — 크롬에서 로그인하면 **카카오톡 앱**이 열리고,
   인증이 끝나도 앱이 브라우저로 돌려보내지 않아 **카카오톡 채팅 목록에 남습니다.**
   손님은 앱 전환기로 직접 브라우저를 찾아 돌아와야 했습니다.

   ★ 우리가 할 수 있는 것은 **애초에 앱으로 안 보내는 것**입니다(`prompt=select_account`).
   ★ 카카오톡 인앱 브라우저에는 붙이면 안 됩니다 — 거기서는 이미 잘 되고 있습니다.
   ★ `through_account` 는 2026-08-29에 돌아오지 못하게 만든 값입니다. 되살아나면 실패입니다.
===================================================================== */
const fs = require('fs');
const path = require('path');
const L = require('../_lib.cjs');

const ROOT = path.join(__dirname, '..', '..');
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const kakaoApi = fs.readFileSync(path.join(ROOT, 'api', 'kakao.js'), 'utf8');
const kakaoLib = fs.readFileSync(path.join(ROOT, 'api', '_lib', 'kakao.js'), 'utf8');

(async () => {
  const R = L.reporter('카카오 로그인 경로');
  const m = await import('file://' + path.join(ROOT, 'api', '_lib', 'kakao.js'));
  const ua = (s) => ({ headers: { 'user-agent': s } });

  R.head('① 보통 브라우저는 브라우저 안에서 끝낸다');
  [['크롬(iOS)', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) CriOS/120.0 Mobile Safari/604.1'],
   ['사파리',    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Mobile Safari/604.1'],
   ['삼성인터넷', 'Mozilla/5.0 (Linux; Android 14) SamsungBrowser/23.0 Chrome/115 Mobile'],
   ['PC 크롬',   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0 Safari/537.36'],
  ].forEach(function (p) {
    R.note(m.loginPrompt(ua(p[1])) === 'select_account', p[0] + ' → 계정 고르기로 보낸다',
           String(m.loginPrompt(ua(p[1]))));
  });

  R.head('② 카카오톡 인앱 브라우저에는 아무것도 안 붙인다');
  [['카톡 iOS',     'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) KAKAOTALK 10.5.0'],
   ['카톡 안드로이드', 'Mozilla/5.0 (Linux; Android 14; SM-S911N) ... KAKAOTALK/10.5.0'],
   ['소문자 표기',    'mozilla/5.0 (iphone) kakaotalk 10.5.0'],
  ].forEach(function (p) {
    R.note(m.loginPrompt(ua(p[1])) === null, p[0] + ' → 그대로 둔다 (이미 잘 됩니다)',
           String(m.loginPrompt(ua(p[1]))));
    R.note(m.inKakaoTalkBrowser(ua(p[1])) === true, p[0] + ' 를 인앱으로 알아본다');
  });
  R.note(m.loginPrompt({ headers: {} }) === 'select_account',
         'UA 가 없어도 터지지 않는다 (인앱이 아닌 쪽으로 본다)');

  R.head('③ 창구가 그 값을 실제로 싣는다');
  const api = strip(kakaoApi);
  R.note(/const prompt = loginPrompt\(req\)/.test(api), '요청을 만들 때 loginPrompt 를 부른다');
  R.note(/q\.set\('prompt', prompt\)/.test(api), '값이 있을 때만 prompt 를 붙인다');
  R.note(/if \(prompt\)/.test(api), '값이 없으면 안 붙인다 (인앱 브라우저)');

  R.head('④ 되살아나면 안 되는 것');
  R.note(!/through_account/.test(api), "요청에 through_account 가 없다 (2026-08-29 사고)");
  R.note(/through_account/.test(kakaoLib) || /through_account/.test(kakaoApi),
         '왜 쓰면 안 되는지는 주석으로 남아 있다');
  R.note(!/prompt['"]?\s*:\s*['"]login/.test(api) && !/'prompt', 'login'/.test(api),
         "prompt=login 을 쓰지 않는다 (매번 비밀번호를 다시 받게 된다)");

  R.head('⑤ 돌아올 주소는 그대로다');
  R.note(/\/api\/kakaocb/.test(kakaoLib), '돌아올 주소가 우리 창구다');
  R.note(!/prompt/.test(strip(fs.readFileSync(path.join(ROOT, 'api', 'kakaocb.js'), 'utf8'))),
         '돌아오는 문은 이 값을 안 본다 (건드리지 않았다)');

  R.head('⑥ 돌아오면 손님께 알린다');
  /* ★ 주석을 먼저 걷어낸다. 안 걷으면 **내가 쓴 설명 주석이 내 검사에 걸립니다** —
     이 프로젝트에서 네 번째 겪은 함정이라 여기 적어 둡니다. */
  const app = strip(fs.readFileSync(path.join(ROOT, 'fortune.html'), 'utf8'));
  const hits = (app.match(/카카오 로그인 되었어요/g) || []).length;
  R.note(hits > 0, "돌아오면 '카카오 로그인 되었어요' 를 띄운다 (대표님이 정하신 문구)");
  R.note(hits === 2, '두 갈래(결제 가져옴 · 그냥 로그인) 모두 그렇게 적는다', hits + '곳');
  R.note(!/showToast\('로그인했어요/.test(app), "옛 문구('로그인했어요…')가 남아 있지 않다");

  R.done();
})();
