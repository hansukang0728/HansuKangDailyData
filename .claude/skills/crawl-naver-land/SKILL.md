---
name: crawl-naver-land
description: 네이버 부동산(fin.land.naver.com) 특정 아파트 단지의 매매/전세 매물 목록을 수집해 엑셀 또는 HTML 현황판으로 정리한다. "네이버 부동산 크롤링", "매물 목록 뽑아줘", "단지 시세 확인", "매물 현황판" 같은 요청에 사용.
---

# 네이버 부동산 단지별 매물 크롤링

`crawl_complex.py`를 실행해 특정 아파트 단지의 매물을 수집하고, 이전 실행과 비교한
엑셀 리포트를 만든다. 실행 전에 이 문서를 끝까지 읽을 것 — 특히 "겪었던 문제" 섹션.

## 관심단지 관리 (watchlist.json)

```powershell
# 등록 (--region 필수, 예: 수원광교)
.\.venv\Scripts\python.exe watchlist.py add --complex-number 101273 --complex-name 자연앤힐스테이트 --region 수원광교 --trade-types A1

# 삭제 (이름 또는 번호 아무거나)
.\.venv\Scripts\python.exe watchlist.py remove 자연앤힐스테이트

# 목록 조회
.\.venv\Scripts\python.exe watchlist.py list
```

## 매물 수집 실행

```powershell
# 관심단지 전체 한 번에 (브라우저 하나로 순차 수집, 단지 사이 3초 딜레이)
.\.venv\Scripts\python.exe crawl_complex.py --all

# 관심단지 중 이름으로 하나만
.\.venv\Scripts\python.exe crawl_complex.py --name 자연앤힐스테이트

# 관심단지에 등록 안 된 단지도 번호만 알면 1회성으로 바로 수집 가능
.\.venv\Scripts\python.exe crawl_complex.py --complex-number 101273 --complex-name 자연앤힐스테이트 --trade-types A1
```

- `--trade-types`: `A1`=매매, `B1`=전세, `B2`=월세 (복수 지정 가능: `--trade-types A1 B1`)
- 결과: `output/{지역명}_{단지번호}_{단지명}/{단지명}_{시각}.xlsx` (단지별 폴더, 그 안에
  타임스탬프 파일들이 쌓임), `data/{complexNumber}/{시각}.json` (원본 스냅샷)
  - `--complex-number`로 단독 실행할 땐 `--region` 안 주면 폴더명이 `기타_...`가 됨
- **대상이 2개 이상**(`--all` 또는 관심단지가 여러 개인 경우)이면 위 개별 파일들에
  더해 `output/전체_{시각}.xlsx`도 생성 — 단지별로 시트(탭)를 나눠 하나로 묶은 파일
  (이건 폴더 안 나누고 output/ 바로 아래). 단일 단지 수집일 땐 통합 파일 안 만듦.

## 알려진 단지 번호 (complexNumber)

관심단지 목록의 진실은 `watchlist.json`에 있음 (아래는 참고용 스냅샷, 최신 상태는 `watchlist.py list`로 확인).

| 단지명 | 위치 | complexNumber |
|---|---|---|
| 자연앤힐스테이트 | 수원 영통구 이의동 | 101273 |
| 중흥S클래스 | 수원 영통구 원천동 | 111038 |
| 힐스테이트광교 | 수원 영통구 하동 | 109525 |
| 광교래미안 | 수원 광교 | 100607 |
| e편한세상광교 | 수원 광교 | 102091 |
| 자연앤자이3단지 | 수원 광교 | 101360 |
| 자연앤자이2단지 | 수원 광교 | 101361 |
| 자연앤자이1단지 | 수원 광교 | 101362 |
| 광교아이파크 | 수원 광교 | 110746 |
| 광교써밋플레이스 | 수원 광교 | 104222 |
| 광교센트럴뷰 | 수원 광교 | 138183 |

새 단지는 아래 "새 단지 번호 찾는 법"으로 알아낸 뒤 `watchlist.py add`로 등록.

## 겪었던 문제 (재발 방지용)

1. **`requests` 라이브러리로 직접 호출하면 계속 429가 뜬다.** 브라우저 쿠키를 그대로
   복사해 넣어도 막힘 — TLS/HTTP2 핑거프린팅으로 봇을 구분하는 것으로 보임.
   → 반드시 Playwright로 실제 Chromium을 띄워서 페이지 안(`page.evaluate`)에서
   `fetch()`를 실행하는 방식을 써야 통과된다. (스크립트에 이미 구현됨)

2. **`fin.land.naver.com/complexes/{번호}` 페이지에서 직접 fetch를 실행하면 CORS
   에러가 난다.** 이 페이지는 내부적으로 `financial.pstatic.net` 오리진에서
   렌더링되기 때문. → 반드시 **지도 페이지**(`fin.land.naver.com/map?...`)를 먼저
   방문한 뒤 그 컨텍스트에서 fetch를 실행해야 한다. (스크립트의 `MAP_URL` 참고)

3. **짧은 시간에 반복 요청하면 IP 단위로 일시 차단된다.** 브라우저로 접속해도
   "일시적으로 불러올 수 없습니다"가 뜨는 지경까지 갔었음. 차단되면 브라우저 F12를
   열어도 재현되니 (개발자도구 자체가 탐지될 수도 있음) 대응은 오직 **기다리기**뿐.
   → 실행은 한 번에 하나씩, 재시도 루프를 걸지 말 것. 실패하면 즉시 사용자에게
   보고하고 다음 시도까지 충분히(최소 몇 분~수십 분) 시간을 둘 것.

4. **매물 상세 API에는 부동산 중개사무소 전화번호가 없다.** `brokerInfo`에는
   `brokerageName`, `brokerName`만 있음. 전화번호가 필요하면 개별 매물 상세 페이지
   API를 새로 캡처해야 함 (아직 안 함).

## 새 단지 번호(complexNumber) 찾는 법

검색 API를 아직 찾지 못했다 (`new.land.naver.com/api/search`는 계속 429).

**F12 없이, URL만으로 확인 (권장)**: `fin.land.naver.com`에서 단지명을 검색해서
상세 페이지로 이동하면 주소창이 `https://fin.land.naver.com/complexes/12345`
형태로 바뀐다. 이 `/complexes/` 뒤 숫자가 complexNumber. (F12를 열면 사이트가
차단되는 현상이 있었으므로 — "겪었던 문제 3번" 참고 — 이 방법을 우선 쓸 것.)

그 값을 `watchlist.py add --complex-number ... --complex-name ...`로 등록
(이 문서의 "알려진 단지 번호" 표도 참고용으로 같이 업데이트).

URL만으로 안 되는 예외 상황이면 F12 Network 탭에서 `front-api`가 들어간 요청
(`buildingList`, `article/count` 등 대부분에 `complexNumber=` 파라미터가 있음)을
봐도 되지만, 차단 위험이 있으니 최후의 수단으로만 쓸 것.

## 데이터 필드 참고

`representativeArticleInfo`에서 뽑는 필드 (자세한 원본 구조는
`data/{complexNumber}/*.json`의 아무 파일이나 열어보면 확인 가능):

- 매물번호(`articleNumber`), 동(`dongName`), 층(`floorInfo`/`targetFloor`)
- 공급/전용면적(`spaceInfo`), 타입(`spaceInfo.nameType`, 같은 면적 내 평면 변형 — L/K/N 등
  한 글자 코드. 더 친절한 이름(예: "84A타입")은 아직 못 구함, 필요하면 `complex/pyeongList`
  API를 새로 캡처해야 함)
- 방향(`direction`, 코드값 그대로 — 정확한 한글 매핑 미확인)
- 매매가(`priceInfo.dealPrice`, 원 단위)
- 준공일/경과연수(`buildingInfo`) — 단지 전체가 동일한 값이라 매물별 컬럼이 아니라
  엑셀 상단 단지 정보 줄(A2)에 한 번만 표시
- 중개사무소명(`brokerInfo.brokerageName`) — 대표 매물의 중개사 1곳
- 특이사항(`articleDetail.articleFeatureDescription`, 없을 수 있음)
- **복수 부동산**: 같은 물리적 매물을 여러 중개사가 각자 다른 매물번호로 올리는 경우가
  흔함 (`item.duplicatedArticleInfo`, 25곳까지도 봄). `representativeArticleInfo`만 쓰면
  이 정보가 사라지고, 특히 "대표 매물"이 실행마다 다른 중개사 것으로 바뀔 수 있어서
  신규/삭제 오탐(같은 집인데 매물번호만 바뀜)의 원인이 됨. 그래서 `fetch_articles()`에서
  `duplicatedArticleInfo.realtorCount`와 각 중개사명을 `_realtorCount`/`_brokerList`로
  같이 수집해서 `simplify()`가 `realtorCount`, `brokerList`(축약명 리스트)로 저장함.
  `shorten_broker_name()`이 "공인중개사사무소/부동산중개법인주식회사/부동산/공인" 같은
  상투어를 제거해서 이름을 줄임 (예: "금호부동산중개법인주식회사" → "금호").

관리비(`managementFeeAmount`), 전화번호는 사용자 요청/API 미제공으로 제외했음.

## 엑셀 리포트 구조

단지 하나짜리 시트 레이아웃은 `write_complex_sheet()`에 있고, 개별 파일(`build_excel`)과
통합 파일(`build_combined_excel`, 단지별로 시트만 나눠서 같은 레이아웃 재사용)이 이 함수를
공유한다. 변동사항을 별도 탭으로 안 만들고 각 행에 합침 (사용자 요청).

- A1: 단지명 (제목, 인쇄용)
- A2: 준공년도 · 경과연수 · 총 매물 수 (단지 공통 정보, 매물별 반복 안 함)
- 4행: 헤더, 5행부터 데이터. 매물 1건당 **3줄 1블록**으로 인쇄용 레이아웃 (사용자 요청,
  `ROWS_PER_LISTING = 3`):
  - 좌측 5컬럼(번호·상태·매물번호·동·층)은 세 줄 전체에 걸쳐 세로 병합
  - 우측 9컬럼(공급면적·전용면적·타입·방향·매매가·가격변동·중개사무소·**부동산수**·매물확인일)은
    첫 줄에
  - 특이사항은 둘째 줄에, **부동산 목록**(축약명, 쉼표 구분, 9pt 이탤릭)은 셋째 줄에 —
    둘 다 우측 컬럼 전체를 가로 병합
  - 전체 셀 테두리 적용 (`CELL_BORDER`)
  - 정렬: `삭제` 상태가 아닌 매물은 매매가 오름차순으로 먼저, `삭제`된 매물은 상태와
    무관하게 전부 맨 아래로 몰아서 그 안에서 가격순 (사용자 요청) —
    `sorted(rows, key=lambda r: (r["status"] == "삭제", r["dealPrice"]))`
  - **번호** 컬럼은 이 정렬 후의 순번(1부터)
- **상태** 컬럼: `최초수집`(비교 대상 없는 첫 실행) / `신규`(이전 스냅샷에 없던 매물) /
  `변경없음` / `가격올림` / `가격내림`(이전 스냅샷 대비 `dealPrice` 비교) /
  `삭제`(이전엔 있었는데 이번엔 없음 — 마지막 확인 시점 데이터로 표시, 가격순 정렬에도
  같이 섞여 들어감)
- **가격변동** 컬럼: 가격올림/가격내림일 때만 `+1억`, `-5,000만` 형태로 표시, 그 외 공란
- 저층(5층 이하 또는 "저") 매물은 **층** 셀이 빨간 굵게
- **매매가** 셀은 파란 굵게 (`blue_bold`)
- 매매가 원 단위 컬럼은 없앰 (사용자 요청, 포맷된 "매매가" 컬럼만 남김 — 정렬은 내부
  `dealPrice` 값으로 함)
- `ws.max_row`가 `header_row + len(rows)*ROWS_PER_LISTING`(현재 3)이 된다는 점 주의 —
  데이터 행 수를 셀 때 3으로 나눠야 실제 매물 수.

`assemble_rows()`가 `data/{complexNumber}/`의 직전 스냅샷과 `articleNumber` 집합·가격을
비교해서 상태를 매긴다.

## 통합 파일 규칙

수집 대상이 2개 이상이면 (`--all` 등) 단지별 개별 파일에 더해
`output/전체_{시각}.xlsx`를 추가로 생성한다 — 단지마다 시트(탭)를 나눠 하나로 묶은 것.
`main()`에서 `crawl_one()`의 반환값에 담긴 `rows`를 모아 `build_combined_excel()`에
넘기는 구조. 대상이 하나뿐이면(`--name`, `--complex-number`) 통합 파일은 안 만든다.

## HTML 매물 현황판 (dataviz 스킬 기반)

```powershell
# crawl_complex.py로 스냅샷을 쌓아둔 뒤 (크롤링 없이, data/ 폴더만 읽음)
.\.venv\Scripts\python.exe build_dashboard.py
```

- 결과: `G:\내 드라이브\AI\부동산\dashboard.html` **고정 경로** (타임스탬프 없음).
  구글 드라이브 데스크톱 앱(스트리밍 모드, G: 드라이브로 마운트됨)의 동기화 폴더에
  바로 저장해서, 저장하는 즉시 클라우드에 올라가고 태블릿 등 다른 기기에서
  볼 수 있게 했음 (`build_dashboard.py`의 `DRIVE_OUTPUT_DIR`). OAuth/API 방식은
  설정이 복잡해서 안 씀 — 사용자가 이미 구글 드라이브 데스크톱 앱을 설치해뒀길래
  그냥 그 동기화 폴더에 직접 쓰는 걸로 단순화함. 이 드라이브 문자는 사용자
  PC 한정이라 다른 PC에서 돌리면 경로가 다를 수 있음. 관심단지 전체를
  한 파일에 담고 상단 드롭다운으로 단지를 전환한다.
- **왜 고정 경로인가**: ★ 관심매물은 브라우저 localStorage에 저장되는데, 이건
  파일 경로(origin)에 묶인다. 매번 새 타임스탬프 파일을 만들면 관심매물이 안
  이어지므로, 이 파일만은 실행할 때마다 덮어쓴다 (엑셀과 다른 정책).
- `dashboard_template.html`이 템플릿, `build_dashboard.py`가 `data/{complexNumber}/`의
  최신 스냅샷 2개(현재/직전)를 읽어 `assemble_rows()`로 상태를 매기고, 템플릿의
  `__DATA_JSON__` 자리에 `{complexNumber: {...}, ...}` 형태로 JSON을 주입한다.
- 기능: 통계 타일(총매물/신규/가격변동/삭제), 상태·필터 칩(전체/신규/가격변동/삭제/
  ★관심매물), 리스트·카드 뷰 토글, 행 클릭 시 특이사항+부동산 전체 목록 펼침,
  다크모드, 전용면적 5단계 구간(~80/80~85/85~100/100~120/120~)을 좌측 색상바 +
  텍스트 배지로 표시(리스트·카드 동일).
- 색상은 dataviz 스킬의 팔레트(`references/palette.md`) 기준으로 정했고
  `scripts/validate_palette.js`로 상태 배지 색(신규/가격올림/가격내림) 검증 통과함.
  네이버 그린(`#03c75a`)을 칩 선택 상태 등 브랜드 포인트로만 씀 (데이터 인코딩 색과는
  분리 — 상태 배지 색은 안 건드림).
- 관심매물(★)은 `localStorage` 키 `naverLandFavorites`에 매물번호 배열로 저장.
  단지 간에도 공유되는 단일 집합(매물번호가 전역적으로 고유하므로 문제없음).

## 미해결 — 사용자가 추가 요청한 것

- **단지 상세정보 확장**: 실제 웹페이지의 "매물" 탭 옆에 "단지정보" 탭이 있고, 거기서
  총세대수/난방방식/건설사 등 단지 공통 정보를 더 가져올 수 있어 보임. 아직 그 탭의
  API를 캡처하지 못했다 — 시도할 때는 사용자에게 F12로 그 탭 클릭 시 발생하는
  `front-api` 요청을 Copy as cURL 해달라고 요청할 것 (지도 페이지 우회 없이 바로 되는지도
  확인 필요, `/complexes/{번호}` 페이지의 다른 탭이라 CORS 이슈가 있을 수 있음).
