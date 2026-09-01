from __future__ import annotations

import json
import subprocess
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "api"))

from app.pipeline.label_parser import parse_label_text  # noqa: E402
from app.pipeline.ocr import OcrObservation  # noqa: E402
from app.pipeline.receipt_parser import parse_receipt_observations  # noqa: E402


RECEIPTS = [
    Path("/var/folders/wz/t7tvb0nx4gq2my6v96ngwktm0000gn/T/codex-clipboard-b7eec546-e4de-4a7f-8695-46056c184594.png"),
    Path("/var/folders/wz/t7tvb0nx4gq2my6v96ngwktm0000gn/T/codex-clipboard-534ea0a6-2f7c-4835-b8cc-f094eb69d8eb.png"),
    Path("/var/folders/wz/t7tvb0nx4gq2my6v96ngwktm0000gn/T/codex-clipboard-40087add-ddaa-4edd-800d-9f0c6d6ba64d.png"),
]
LABELS = [
    Path("/var/folders/wz/t7tvb0nx4gq2my6v96ngwktm0000gn/T/codex-clipboard-3228ee49-d233-4dd0-8423-f487e9c98fe3.png"),
    Path("/var/folders/wz/t7tvb0nx4gq2my6v96ngwktm0000gn/T/codex-clipboard-ba98c9d3-41cd-439f-b941-afa12981bba2.png"),
]


def run_ocr(path: Path) -> dict:
    raw = subprocess.check_output([str(ROOT / "work" / "macos_vision_ocr"), str(path)], text=True)
    return json.loads(raw)


def observations(raw: dict) -> list[OcrObservation]:
    return [
        OcrObservation(
            text=item["text"],
            confidence=float(item["confidence"]),
            bbox=(float(item["x"]), float(item["y"]), float(item["width"]), float(item["height"])),
        )
        for item in raw["observations"]
    ]


def main() -> None:
    receipt_summary = []
    for path in RECEIPTS:
        raw = run_ocr(path)
        parsed = parse_receipt_observations(observations(raw))
        receipt_summary.append(
            {
                "file": path.name,
                "status": raw["status"],
                "observation_count": len(raw["observations"]),
                "kind": parsed.kind,
                "purchased_at": parsed.purchased_at.isoformat() if parsed.purchased_at else None,
                "line_types": [line.line_type for line in parsed.lines],
                "product_names": [line.raw_name for line in parsed.lines if line.line_type == "product"][:8],
                "warnings": parsed.warnings,
            }
        )

    label_summary = []
    for path in LABELS:
        raw = run_ocr(path)
        ordered = sorted(raw["observations"], key=lambda item: -float(item["y"]))
        parsed = parse_label_text("\n".join(item["text"] for item in ordered))
        label_summary.append(
            {
                "file": path.name,
                "status": raw["status"],
                "observation_count": len(raw["observations"]),
                "product_name": parsed.product_name,
                "barcode": parsed.barcode,
                "date_candidates": [
                    {"kind": item.kind, "value": item.value.isoformat(), "confidence": item.confidence}
                    for item in parsed.date_candidates
                ],
                "consumption_date_candidate": parsed.consumption_date_candidate.value.isoformat() if parsed.consumption_date_candidate else None,
                "requires_review": parsed.requires_review,
                "warnings": parsed.warnings,
            }
        )

    print(json.dumps({"receipts": receipt_summary, "labels": label_summary}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
