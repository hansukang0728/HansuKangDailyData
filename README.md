# naver_land

네이버 부동산(fin.land.naver.com) 관심단지 매물을 주기적으로 수집해서
엑셀 리포트와 HTML 현황판으로 정리하는 개인용 도구.

## 구성

- `crawl_complex.py` — Playwright로 단지별 매매 매물을 수집하고 엑셀 리포트 생성
- `watchlist.py` — 관심단지 등록/삭제/조회 (`watchlist.json` 관리)
- `build_dashboard.py` — 수집된 스냅샷으로 HTML 매물 현황판(`dashboard_template.html`) 생성
- `.claude/skills/crawl-naver-land/SKILL.md` — 사용법과 그동안 겪은 문제/해결 기록
- `data/{complexNumber}/` — 실행마다 쌓이는 원본 매물 스냅샷(JSON)
- `output/` — 단지별 엑셀 리포트 및 통합 파일

## 빠른 사용법

```powershell
# 관심단지 등록
.\.venv\Scripts\python.exe watchlist.py add --complex-number 101273 --complex-name 자연앤힐스테이트 --region 수원광교 --trade-types A1

# 관심단지 전체 매물 수집 (엑셀 리포트 생성)
.\.venv\Scripts\python.exe crawl_complex.py --all

# HTML 현황판 생성 (크롤링 없이 data/ 스냅샷만 사용)
.\.venv\Scripts\python.exe build_dashboard.py
```

자세한 내용은 `.claude/skills/crawl-naver-land/SKILL.md` 참고.
