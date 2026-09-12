from __future__ import annotations

import argparse
import os
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.preflight import production_preflight


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate Rescue Meal production configuration without printing secrets.")
    parser.add_argument("--mode", choices=("production",), default="production")
    parser.add_argument("--strict", action="store_true", help="Treat optional integration warnings as errors.")
    args = parser.parse_args(argv)

    issues = production_preflight(os.environ, strict=args.strict)
    for issue in issues:
        print(f"[{issue.severity.upper()}] {issue.code} ({issue.setting}): {issue.message}")
    if any(issue.severity == "error" for issue in issues):
        print("Production preflight failed. No secret values were printed.")
        return 1
    print("Production preflight passed. Connectivity and provider delivery require separate smoke tests.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
