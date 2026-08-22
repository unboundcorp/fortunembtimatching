/**
 * 인연점 — 고객문의 시트 스크립트 (2026-08-22)
 * =====================================================================
 * 하는 일 두 가지
 *   ① 앱에서 접수된 문의를 이 시트에 한 줄씩 쌓는다.
 *   ② 시트의 [상태]나 [답변] 칸을 고치면, 그 내용을 앱으로 되쏜다.
 *      → 손님이 앱의 [문의하기] → [내 문의 내역]에서 그 답을 그대로 본다.
 *
 * ★ 칸의 자리(A열, B열…)를 외우지 않는다. 1행의 제목으로 찾는다.
 *   그래야 나중에 칸을 옮기거나 하나 끼워 넣어도 안 깨진다.
 * =====================================================================
 *
 * ── 설치 순서 ─────────────────────────────────────────────────────
 * 1) 시트 → 확장 프로그램 → Apps Script → 이 파일 내용을 통째로 붙여넣고 저장
 *
 * 2) 왼쪽 톱니바퀴(프로젝트 설정) → 스크립트 속성 → 속성 추가
 *      이름 : ANSWER_KEY
 *      값   : 아무도 모르는 긴 문자열 (영문+숫자 20자 이상. 직접 정하세요)
 *    같은 값을 Vercel 환경변수 SHEET_ANSWER_KEY 에도 넣습니다. 두 값이 같아야 합니다.
 *
 * 3) 배포 → 새 배포 → 유형 [웹 앱]
 *      실행 계정 : 나
 *      액세스 권한 : 모든 사용자          ← 이게 '나'로 되어 있으면 접수가 안 됩니다
 *    배포 후 나오는 주소를 Vercel 환경변수 SHEET_WEBHOOK_URL 에 넣습니다.
 *    (이미 넣어두셨다면 다시 배포해도 주소가 그대로라 손댈 것이 없습니다)
 *
 * 4) 시계 아이콘(트리거) → 트리거 추가
 *      실행할 함수 : onSheetEdit
 *      이벤트 소스 : 스프레드시트에서
 *      이벤트 유형 : 수정 시
 *    ★ 이 트리거가 없으면 답변을 적어도 앱으로 넘어가지 않습니다.
 *      (시트가 저절로 부르는 onEdit 은 바깥으로 인터넷 요청을 못 보냅니다)
 *
 * 5) 한 번 실행해서 권한을 허용합니다: 함수 목록에서 setupSheet 골라 [실행]
 * =====================================================================
 */

/* 앱 주소. 도메인을 옮기시면 여기만 고치면 됩니다. */
var APP_BASE = 'https://www.inyeonjeom.kr';

/* 칸 제목. 순서는 처음 만들 때만 쓰이고, 그 뒤로는 제목으로 찾습니다. */
var HEADERS = ['접수번호', '접수시각', '유형', '어느 화면', '내용', '카카오톡 아이디', '주문번호', '세션', '상태', '답변'];

/* 시트에 적는 말 ↔ 앱이 쓰는 값. 시트에는 사람이 읽는 말만 보입니다. */
var STATUS_TO_CODE = { '접수됨': 'received', '확인 중': 'working', '답변 완료': 'answered', '처리 완료': 'closed' };
var STATUS_LIST = ['접수됨', '확인 중', '답변 완료', '처리 완료'];

function sheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
}

/* 1행에 제목이 다 있는지 보고, 없는 것만 오른쪽 끝에 붙인다.
   ★ 이미 쌓여 있는 줄을 밀지 않는다 — 새 칸은 항상 뒤에 생긴다. */
function ensureHeaders_(sh) {
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var row = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (v) { return String(v || '').trim(); });
  var have = {};
  row.forEach(function (v, i) { if (v) have[v] = i + 1; });

  var missing = HEADERS.filter(function (h) { return !have[h]; });
  if (missing.length) {
    var start = row.filter(String).length + 1;
    sh.getRange(1, start, 1, missing.length).setValues([missing]);
    missing.forEach(function (h, i) { have[h] = start + i; });
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return have;
}

/* 상태 칸에 고를 수 있는 목록을 붙인다. 손으로 적으면 오타가 나고, 오타가 나면 앱에서 안 보인다. */
function setupSheet() {
  var sh = sheet_();
  var col = ensureHeaders_(sh);
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(STATUS_LIST, true).setAllowInvalid(true).build();
  sh.getRange(2, col['상태'], Math.max(sh.getMaxRows() - 1, 1), 1).setDataValidation(rule);
  sh.setColumnWidth(col['내용'], 380);
  sh.setColumnWidth(col['답변'], 380);
  SpreadsheetApp.getUi().alert('준비가 끝났습니다. 이제 앱에서 접수된 문의가 여기에 쌓입니다.');
}

/* ── ① 앱 → 시트 : 문의가 들어온다 ───────────────────────────────── */
function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    var sh = sheet_();
    var col = ensureHeaders_(sh);

    var r = sh.getLastRow() + 1;
    var put = function (name, value) {
      if (col[name]) sh.getRange(r, col[name]).setValue(value == null ? '' : value);
    };
    put('접수번호', d.id || '');
    put('접수시각', d.at ? new Date(d.at) : new Date());
    put('유형', d.kind || '');
    put('어느 화면', d.screen || '');
    put('내용', d.body || '');
    put('카카오톡 아이디', d.contact || '');
    put('주문번호', d.orderId || '');
    put('세션', d.session || '');
    put('상태', '접수됨');
    put('답변', '');

    return ok_({ ok: true, row: r });
  } catch (err) {
    return ok_({ ok: false, error: String(err) });
  }
}

/* ── ② 시트 → 앱 : 답변을 적으면 되쏜다 ──────────────────────────── */
function onSheetEdit(e) {
  try {
    if (!e || !e.range) return;
    var sh = e.range.getSheet();
    if (sh.getIndex() !== 1) return;              /* 첫 번째 시트만 본다 */
    var row = e.range.getRow();
    if (row < 2) return;                          /* 제목 줄은 무시 */

    var col = ensureHeaders_(sh);
    var edited = e.range.getColumn();
    /* 상태나 답변을 고친 경우에만 보낸다. 내용을 고쳤다고 손님에게 알릴 일은 아니다. */
    if (edited !== col['상태'] && edited !== col['답변']) return;

    pushRow_(sh, row, col);
  } catch (err) {
    console.error('되쏘기 실패: ' + err);
  }
}

/* 고른 줄을 손으로 보내는 길. 트리거가 안 걸렸을 때의 대비책이다. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('인연점')
    .addItem('선택한 줄 답변 보내기', 'pushSelectedRow')
    .addItem('시트 준비하기', 'setupSheet')
    .addToUi();
}
function pushSelectedRow() {
  var sh = sheet_();
  var col = ensureHeaders_(sh);
  var row = sh.getActiveRange().getRow();
  if (row < 2) { SpreadsheetApp.getUi().alert('문의가 적힌 줄을 골라주세요.'); return; }
  var r = pushRow_(sh, row, col);
  SpreadsheetApp.getUi().alert(r.ok ? '보냈습니다. 손님 화면에 바로 보입니다.' : ('실패: ' + r.msg));
}

function pushRow_(sh, row, col) {
  var key = PropertiesService.getScriptProperties().getProperty('ANSWER_KEY');
  if (!key) return { ok: false, msg: '스크립트 속성 ANSWER_KEY 가 없습니다.' };

  var id = col['접수번호'] ? sh.getRange(row, col['접수번호']).getValue() : '';
  if (!id) return { ok: false, msg: '이 줄에 접수번호가 없습니다(스크립트를 바꾸기 전에 들어온 문의입니다).' };

  var reply = col['답변'] ? String(sh.getRange(row, col['답변']).getValue() || '') : '';
  var label = col['상태'] ? String(sh.getRange(row, col['상태']).getValue() || '') : '';
  var code = STATUS_TO_CODE[label.trim()] || (reply ? 'answered' : 'received');

  var res = UrlFetchApp.fetch(APP_BASE + '/api/feedback', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-answer-key': key },
    payload: JSON.stringify({ action: 'answer', id: Number(id), status: code, reply: reply }),
    muteHttpExceptions: true,
  });
  var body = res.getContentText();
  if (res.getResponseCode() !== 200) return { ok: false, msg: res.getResponseCode() + ' ' + body.slice(0, 200) };

  /* 답을 적었는데 상태가 그대로면 '답변 완료'로 올려 준다. 두 번 손대지 않게. */
  if (reply && col['상태'] && label.trim() !== '답변 완료' && label.trim() !== '처리 완료') {
    sh.getRange(row, col['상태']).setValue('답변 완료');
  }
  return { ok: true, msg: body };
}

function ok_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
