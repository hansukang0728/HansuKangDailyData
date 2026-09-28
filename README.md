# naver_land

네이버 부동산(fin.land.naver.com) 관심단지 매물을 주기적으로 수집해서
엑셀 리포트와 HTML 현황판으로 정리하는 개인용 도구.

## 구성

- `crawl_complex.py` — Playwright로 단지별 매매 매물(네이버 호가)을 수집하고 엑셀 리포트 생성
- `molit_trade.py` — 국토교통부 공공데이터포털 API로 아파트 매매 실거래가 조회·엑셀 취합
- `watchlist.py` — 관심단지 등록/삭제/조회 (`watchlist.json` 관리, 두 도구가 공유)
- `build_dashboard.py` — 수집된 스냅샷으로 HTML 매물 현황판(`docs/dashboard.html`) 생성
- `.claude/skills/crawl-naver-land/SKILL.md` — 네이버 호가 크롤링 사용법·문제 기록
- `.claude/skills/molit-apt-trade/SKILL.md` — 국토부 실거래가 조회 사용법·문제 기록
- `data/{complexNumber}/` — 네이버 크롤 원본 매물 스냅샷(JSON)
- `data/molit/{법정동코드}/` — 국토부 API 원본 실거래 응답(JSON)
- `output/` — 단지별 엑셀 리포트 및 통합 파일
- `docs/dashboard.html` — GitHub Pages로 게시하는 매물 현황판 (호가)

## 빠른 사용법

```bash
# 관심단지 등록
python3 watchlist.py add --complex-number 101273 --complex-name 자연앤힐스테이트 --region 수원광교 --trade-types A1

# 관심단지 전체 매물 수집 (엑셀 리포트 생성, 네이버 호가)
python3 crawl_complex.py --all

# HTML 현황판 생성 (크롤링 없이 data/ 스냅샷만 사용)
python3 build_dashboard.py

# 관심단지 실거래가 조회 (국토부 API, MOLIT_API_KEY 환경변수 필요)
python3 molit_trade.py --months 3
```

네이버 호가는 `.claude/skills/crawl-naver-land/SKILL.md`, 국토부 실거래가는
`.claude/skills/molit-apt-trade/SKILL.md` 참고.

## 과천 전월세 앱 (`app/`)

안드로이드 폰·태블릿용 Expo(React Native) 앱. 새로고침을 누르면 앱 안의 보이지 않는
WebView가 네이버 지도 페이지를 열고, 그 페이지 안에서 매물 API를 호출해 전세·월세 매물을
가져온다 (`crawl_complex.py`와 같은 방식이라 서버가 필요 없음).

- 대상: `app/src/complexes.ts`의 과천 4개 단지, 전세(B1)·월세(B2). 새로고침 한 번에 단지를
  차례로 조회하고(단지 사이 2.5초 대기), 실패한 단지는 이전 결과를 유지
- 조회 기록(집 단위)·필터·즐겨찾기는 폰에 저장 (`app/src/storage.ts`)
- `app/src/tracking.ts`: 매물번호가 아니라 집 단위로 추적. 매물번호 겹침 → 동·층·면적·타입·방향
  일치 순으로 같은 집을 찾고, 신규·가격변동(24시간 표시)·종료를 판단. 같은 가격 재등록은 표시 안 함
- 종료 매물은 "지우기"로 목록에서 숨기되 기록은 남겨 재등록 시 알아봄
- 화면 너비 900 이상(태블릿)이면 왼쪽 목록 + 오른쪽 상세
- 필터: 단지, 전용 59–84㎡, 타입, 보증금(3~12억)·월세 상한, 집주인만 (`app/src/filters.ts`)
- `app/src/NaverBridge.tsx`: WebView 수집기, `app/src/listing.ts`: 응답 해석·정렬
- "원본 데이터" 화면에서 네이버 응답 원본을 보고 공유할 수 있음 (필드 확인용)
- APK 빌드: `app/**`가 바뀌어 푸시되면 `.github/workflows/android-apk.yml`이 빌드해서
  GitHub Releases에 "앱 빌드 #N"으로 올린다
