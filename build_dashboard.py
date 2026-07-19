"""관심단지 매물 현황판(HTML)을 하나의 파일로 만든다.

크롤링 없이 data/{complexNumber}/ 스냅샷만 읽어서 만든다 (crawl_complex.py를
먼저 돌려서 스냅샷을 쌓아둔 상태여야 함). 관심매물(★, localStorage)이 재생성
후에도 유지되도록 고정 경로에 매번 덮어쓴다.

저장 위치는 구글 드라이브 동기화 폴더(G:\\내 드라이브\\AI\\부동산)로 지정해서,
파일이 저장되는 즉시 구글 드라이브가 자동으로 클라우드에 업로드하게 한다
(태블릿 등 다른 기기에서 보기 위함). 이 드라이브 문자(G:)는 사용자 PC의
구글 드라이브 데스크톱 앱 마운트 경로라 다른 PC에서는 다를 수 있다.
"""
import json
from datetime import datetime
from pathlib import Path

from crawl_complex import BASE_DIR, DATA_DIR, assemble_rows
from watchlist import load_watchlist

DRIVE_OUTPUT_DIR = Path(r"G:\내 드라이브\AI\부동산")
OUTPUT_PATH = DRIVE_OUTPUT_DIR / "dashboard.html"
TEMPLATE_PATH = BASE_DIR / "dashboard_template.html"


def load_complex_data(complex_number: str, complex_name: str, region: str):
    complex_dir = DATA_DIR / complex_number
    if not complex_dir.exists():
        return None
    files = sorted(complex_dir.glob("*.json"))
    if not files:
        return None

    current = json.loads(files[-1].read_text(encoding="utf-8"))
    previous = json.loads(files[-2].read_text(encoding="utf-8")) if len(files) > 1 else None
    rows, _ = assemble_rows(current, previous)
    rows_sorted = sorted(rows, key=lambda r: (r["status"] == "삭제", r["dealPrice"]))
    for i, r in enumerate(rows_sorted, start=1):
        r["no"] = i

    first = rows_sorted[0] if rows_sorted else None
    generated_at = datetime.fromtimestamp(files[-1].stat().st_mtime).strftime("%Y-%m-%d %H:%M")

    return {
        "complexNumber": complex_number,
        "complexName": complex_name,
        "region": region,
        "buildYear": first["buildYear"] if first else "-",
        "elapsedYear": first["elapsedYear"] if first else "-",
        "generatedAt": generated_at,
        "rows": rows_sorted,
    }


def main():
    watchlist = load_watchlist()
    if not watchlist:
        print("관심단지가 비어 있습니다. watchlist.py add 로 먼저 등록하세요.")
        return

    all_data = {}
    for c in watchlist:
        data = load_complex_data(c["complexNumber"], c["complexName"], c.get("region", "기타"))
        if data is None:
            print(f"스킵: {c['complexName']} - 수집된 스냅샷 없음 (crawl_complex.py 먼저 실행)")
            continue
        all_data[c["complexNumber"]] = data
        print(f"포함: {c['complexName']} ({len(data['rows'])}건)")

    if not all_data:
        print("표시할 데이터가 없습니다.")
        return

    template = TEMPLATE_PATH.read_text(encoding="utf-8")
    output = template.replace("__DATA_JSON__", json.dumps(all_data, ensure_ascii=False))
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(output, encoding="utf-8")
    print(f"\n완료: {OUTPUT_PATH} ({len(all_data)}개 단지)")


if __name__ == "__main__":
    main()
