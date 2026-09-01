#!/usr/bin/env python3
"""Fetch COOKRCP01 rows as JSON review drafts.

The command intentionally writes only to stdout. It never updates the
planner fixture or the user's inventory; an operator can inspect the output,
apply canonical ingredient mappings, and promote an approved revision in a
separate change.
"""

from __future__ import annotations

import argparse
from dataclasses import asdict
import json
from pathlib import Path
import sys


SERVICE_ROOT = Path(__file__).resolve().parents[1]
if str(SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(SERVICE_ROOT))

from app.recipe_importer import CookRcpConfig, CookRcpImportError, CookRcpClient  # noqa: E402


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="COOKRCP01 레시피를 검토용 JSON draft로 가져옵니다.")
    parser.add_argument("--start", type=int, default=1, dest="start_idx", help="첫 번째 row 번호")
    parser.add_argument("--end", type=int, default=20, dest="end_idx", help="마지막 row 번호, 최대 100건 범위")
    parser.add_argument("--menu-name", help="RCP_NM 메뉴명 필터")
    parser.add_argument("--ingredient", dest="ingredient_text", help="RCP_PARTS_DTLS 재료명 필터")
    parser.add_argument("--changed-after", help="CHNG_DT 변경일 필터")
    parser.add_argument("--category", help="RCP_PAT2 카테고리 필터")
    return parser


def main() -> int:
    args = _parser().parse_args()
    config = CookRcpConfig.from_env()
    if config is None:
        print("FOODSAFETY_COOKRCP_API_KEY가 설정되지 않았습니다.", file=sys.stderr)
        return 2

    client = CookRcpClient(config)
    try:
        result = client.fetch(
            start_idx=args.start_idx,
            end_idx=args.end_idx,
            menu_name=args.menu_name,
            ingredient_text=args.ingredient_text,
            changed_after=args.changed_after,
            category=args.category,
        )
    except (CookRcpImportError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 1
    finally:
        client.close()

    payload = asdict(result)
    payload["accepted_count"] = len(result.drafts)
    payload["rejected_count"] = len(result.rejected_rows)
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

