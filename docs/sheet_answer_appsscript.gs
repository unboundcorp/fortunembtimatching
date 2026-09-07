/**
 * 인연점 — 시트에 적은 답변을 서비스로 되쏘는 스크립트
 * =====================================================================
 * 왜 필요한가
 *   문의가 들어오면 시트에 한 줄씩 쌓입니다(그건 이미 됩니다).
 *   그런데 대표님이 시트에 답을 적어도 **손님 화면에는 아무것도 안 뜹니다** —
 *   되쏘는 부분이 없기 때문입니다. 이 스크립트가 그 자리를 채웁니다.
 *   (2026-09-08 실측: 시트에 답을 적어도 /api/feedback 호출이 0건이었습니다.)
 *
 * 붙이는 법
 *   1) 시트에서 [확장 프로그램] → [Apps Script] 를 엽니다.
 *   2) 이 파일 내용을 붙여 넣고 저장합니다.
 *   3) [프로젝트 설정] → [스크립트 속성]에 두 개를 넣습니다.
 *        ANSWER_URL = https://www.inyeonjeom.kr/api/feedback
 *        ANSWER_KEY = (Vercel 의 SHEET_ANSWER_KEY 와 **똑같은 값**)
 *      ★ 키를 코드 안에 적지 마십시오. 스크립트를 공유하면 그대로 새어 나갑니다.
 *   4) [트리거] → [트리거 추가]
 *        함수: onEditInstalled · 이벤트: 스프레드시트에서 · 수정 시
 *      ★ 반드시 **설치형 트리거**여야 합니다. 이름만 onEdit 인 '단순 트리거'는
 *        보안 제한 때문에 UrlFetchApp(바깥으로 보내기)을 못 씁니다. 이걸 모르면
 *        "코드는 맞는데 아무 일도 안 일어난다"에서 한참 헤맵니다.
 *   5) 처음 한 번 권한 승인 창이 뜹니다. 허용해 주십시오.
 *
 * 시트 첫 줄(제목 행)에 이 네 칸의 이름이 있어야 합니다 — 순서는 상관없습니다.
 *   접수번호 · 답변 · 상태            (접수번호는 id / no / 번호 도 인식합니다)
 * 없으면 '답변'과 '상태' 칸을 새로 만들어 주십시오.
 *
 * 상태 칸에 적을 수 있는 말 (서비스가 아는 네 가지)
 *   접수됨 · 확인 중 · 답변 완료 · 처리 완료
 *   ★ 비워 두면 답을 적었을 때 자동으로 '답변 완료'가 됩니다.
 */

/* 서비스가 아는 상태 — 한글로 적으신 것을 서버 값으로 바꾼다 */
var STATUS_MAP = {
  '접수됨': 'received',
  '확인 중': 'working', '확인중': 'working',
  '답변 완료': 'answered', '답변완료': 'answered',
  '처리 완료': 'closed', '처리완료': 'closed'
};

/* 제목 행에서 칸 번호를 찾는다. 이름이 조금 달라도 찾도록 여러 이름을 본다. */
function findCols_(header) {
  var col = { id: -1, reply: -1, status: -1 };
  for (var i = 0; i < header.length; i++) {
    var h = String(header[i]).replace(/\s/g, '');
    if (col.id < 0 && (h === '접수번호' || h === 'id' || h === 'ID' || h === '번호' || h === 'no')) col.id = i;
    if (col.reply < 0 && (h === '답변' || h === 'reply' || h === '답변내용')) col.reply = i;
    if (col.status < 0 && (h === '상태' || h === 'status' || h === '처리상태')) col.status = i;
  }
  return col;
}

function onEditInstalled(e) {
  try {
    if (!e || !e.range) return;
    var sheet = e.range.getSheet();
    var row = e.range.getRow();
    if (row < 2) return;                       /* 제목 행은 건드리지 않는다 */

    var lastCol = sheet.getLastColumn();
    var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var col = findCols_(header);
    if (col.id < 0 || col.reply < 0) return;   /* 필요한 칸이 없으면 조용히 넘어간다 */

    /* 답변·상태 칸을 고쳤을 때만 보낸다. 본문을 읽다가 실수로 눌러도 안 나가게. */
    var edited = e.range.getColumn() - 1;
    if (edited !== col.reply && edited !== col.status) return;

    var values = sheet.getRange(row, 1, 1, lastCol).getValues()[0];
    var id = Number(values[col.id]);
    if (!id) return;

    var reply = String(values[col.reply] == null ? '' : values[col.reply]).trim();
    if (!reply) return;                        /* 답이 비어 있으면 보내지 않는다 */

    var statusKo = col.status >= 0 ? String(values[col.status] || '').trim() : '';
    var status = STATUS_MAP[statusKo.replace(/\s/g, '')] || 'answered';

    var props = PropertiesService.getScriptProperties();
    var url = props.getProperty('ANSWER_URL');
    var key = props.getProperty('ANSWER_KEY');
    if (!url || !key) {
      SpreadsheetApp.getActive().toast('스크립트 속성에 ANSWER_URL / ANSWER_KEY 를 넣어 주세요.', '인연점', 8);
      return;
    }

    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-answer-key': key },
      payload: JSON.stringify({ action: 'answer', id: id, reply: reply, status: status }),
      muteHttpExceptions: true,                /* 실패해도 던지지 않고 코드를 본다 */
      followRedirects: true
    });

    var code = res.getResponseCode();
    var text = String(res.getContentText()).slice(0, 200);
    /* 무엇이 됐는지 시트에서 바로 보이게 남긴다 — 안 남기면 또 "안 되는데 왜인지 모른다"가 된다 */
    if (code === 200) {
      SpreadsheetApp.getActive().toast(id + '번 답변을 서비스에 반영했어요.', '인연점', 5);
    } else if (code === 404) {
      SpreadsheetApp.getActive().toast(
        id + '번 반영 실패 (404) — 열쇠가 다르거나, 그 번호의 문의가 서버에 없어요.', '인연점', 10);
    } else {
      SpreadsheetApp.getActive().toast(id + '번 반영 실패 (' + code + ') ' + text, '인연점', 10);
    }
  } catch (err) {
    SpreadsheetApp.getActive().toast('되쏘기 중 오류: ' + err, '인연점', 10);
  }
}

/**
 * 손으로 한 번 시험해 보는 함수.
 * 편집기에서 이 함수를 골라 [실행]하면 11번 문의에 시험 답을 답니다.
 * (트리거를 만들기 전에 열쇠와 주소가 맞는지부터 확인할 때 씁니다.)
 */
function testAnswer() {
  var props = PropertiesService.getScriptProperties();
  var res = UrlFetchApp.fetch(props.getProperty('ANSWER_URL'), {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-answer-key': props.getProperty('ANSWER_KEY') },
    payload: JSON.stringify({ action: 'answer', id: 11, reply: '시험 답변입니다.', status: 'answered' }),
    muteHttpExceptions: true
  });
  Logger.log(res.getResponseCode() + ' ' + res.getContentText());
}
