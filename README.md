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
