"""네이버 부동산 관심단지 등록/삭제/조회.

crawl_complex.py가 --all 또는 --name 옵션으로 사용할 목록을 관리한다.
"""
import argparse
import json
from pathlib import Path

WATCHLIST_PATH = Path(__file__).parent / "watchlist.json"


def load_watchlist() -> list:
    if not WATCHLIST_PATH.exists():
        return []
    return json.loads(WATCHLIST_PATH.read_text(encoding="utf-8"))


def save_watchlist(items: list) -> None:
    WATCHLIST_PATH.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def add(complex_number: str, complex_name: str, region: str, trade_types: list) -> None:
    items = load_watchlist()
    if any(c["complexNumber"] == complex_number for c in items):
        print(f"이미 등록된 단지입니다: {complex_name}({complex_number})")
        return
    items.append({
        "complexNumber": complex_number,
        "complexName": complex_name,
        "region": region,
        "tradeTypes": trade_types,
    })
    save_watchlist(items)
    print(f"등록 완료: [{region}] {complex_name}({complex_number}) [{','.join(trade_types)}]")


def remove(identifier: str) -> None:
    items = load_watchlist()
    new_items = [c for c in items if c["complexNumber"] != identifier and c["complexName"] != identifier]
    if len(new_items) == len(items):
        print(f"'{identifier}'을(를) 찾을 수 없습니다.")
        return
    save_watchlist(new_items)
    print(f"삭제 완료: {identifier}")


def list_items() -> None:
    items = load_watchlist()
    if not items:
        print("관심단지가 비어 있습니다. watchlist.py add 로 등록하세요.")
        return
    for c in items:
        trades = ",".join(c.get("tradeTypes", ["A1"]))
        region = c.get("region", "미분류")
        print(f"- [{region}] {c['complexName']} ({c['complexNumber']}) [{trades}]")


def main():
    parser = argparse.ArgumentParser(description="네이버 부동산 관심단지 관리")
    sub = parser.add_subparsers(dest="command", required=True)

    p_add = sub.add_parser("add", help="관심단지 등록")
    p_add.add_argument("--complex-number", required=True)
    p_add.add_argument("--complex-name", required=True)
    p_add.add_argument("--region", required=True, help="예: 수원광교")
    p_add.add_argument("--trade-types", nargs="+", default=["A1"])

    p_remove = sub.add_parser("remove", help="관심단지 삭제 (이름 또는 번호)")
    p_remove.add_argument("identifier")

    sub.add_parser("list", help="관심단지 목록 조회")

    args = parser.parse_args()
    if args.command == "add":
        add(args.complex_number, args.complex_name, args.region, args.trade_types)
    elif args.command == "remove":
        remove(args.identifier)
    elif args.command == "list":
        list_items()


if __name__ == "__main__":
    main()
