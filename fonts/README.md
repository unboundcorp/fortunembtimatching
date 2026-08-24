# 글꼴 — 왜 우리 서버에 두는가

개인정보처리방침 제5조에 이렇게 적혀 있다.

> 외부에서 불러오는 이미지·글꼴·스크립트가 없습니다.

글꼴을 구글 등 남의 서버에서 부르면 이 문장이 거짓이 되고, 손님의 IP가 그 회사로 나간다.
그건 처리위탁이자 국외 이전이라 처리방침에 또 적어야 한다. 그래서 파일을 여기 두고
우리 서버에서만 내려준다. (2026-08-24, 대표님 지시 "(가) 그리고 저작권 문제없게 해")

## 담긴 것

| 폴더 | 글꼴 | 쓰임 | 파일 |
|---|---|---|---|
| `pretendard/` | Pretendard Variable 1.3.9 | 본문·버튼·라벨 | 92개 |
| `noto-serif-kr/` | Noto Serif KR 600 | 제목·간지 글자 | 124개 |
| `ibm-plex-mono/` | IBM Plex Mono 400/500 | 수치·라벨 | 4개 |

파일이 많은 이유는 **동적 서브셋**이기 때문이다. 글꼴 하나를 통째로 받으면 한글은 수 MB다.
글자 범위(unicode-range)별로 잘라 두면 브라우저가 그 화면에 실제로 쓰인 글자가 든 조각만
내려받는다. 한 화면에 보통 5~10개, 수십 KB면 끝난다. 전부 합쳐 6.6MB이지만 한 사람이
그걸 다 받는 일은 없다.

Noto Serif KR은 굵기를 600 하나만 담았다. 500까지 담으면 파일이 248개가 된다.
제목의 위계는 굵기가 아니라 크기로 만든다(리디자인 지시서 5-6항과 같은 방향).

IBM Plex Mono는 라틴 글자와 숫자만 쓰므로 latin·latin-ext만 담았다.

## 저작권

셋 다 SIL Open Font License 1.1이다. 상업적 이용·재배포·수정이 모두 허용되고,
지켜야 할 것은 저작권 표시와 라이선스 전문을 함께 배포하는 것이다. 각 폴더의
`LICENSE.txt`가 그것이다.

- Pretendard — Copyright (c) 2021 Kil Hyung-jin. Reserved Font Name "Pretendard"
- Noto Serif KR — Copyright The Noto Project Authors
- IBM Plex Mono — Copyright © 2017 IBM Corp. Reserved Font Name "Plex"

★ Pretendard와 Plex는 **이름이 예약된(Reserved Font Name)** 글꼴이다. 파일을 우리가
직접 고치거나 다시 서브셋을 뜨면 이름을 바꿔야 한다. 그래서 손대지 않고 배포처가 만든
서브셋 파일을 그대로 가져왔다. 나중에 용량을 줄이려고 직접 서브셋을 뜨는 일이 생기면
이 조건을 먼저 확인할 것.

## 받아온 곳

- Pretendard: https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/woff2-dynamic-subset/
- Noto Serif KR: https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@600 (구글이 만든 서브셋 woff2)
- IBM Plex Mono: https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500

## 고칠 일이 생기면

`src.css`는 배포처가 준 @font-face 원본이고, 실제로 앱이 쓰는 것은 fortune.html 안에
합쳐 넣은 사본이다. 파일을 다시 받으면 fortune.html 쪽도 함께 갱신해야 한다.
