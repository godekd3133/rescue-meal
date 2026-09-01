from __future__ import annotations

from pathlib import Path
import sys

import httpx


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


def ocr(client: httpx.Client, path: Path) -> dict:
    with path.open("rb") as image:
        response = client.post("http://127.0.0.1:8002/ocr", files={"file": (path.name, image, "image/png")})
    response.raise_for_status()
    return response.json()


def make_observations(payload: dict) -> list[OcrObservation]:
    return [
        OcrObservation(
            text=item["text"],
            confidence=float(item["confidence"]),
            bbox=tuple(float(value) for value in item["bbox"]) if item.get("bbox") else None,
        )
        for item in payload.get("observations", [])
        if item.get("text")
    ]


def main() -> None:
    result = {"engine": "paddleocr-remote", "receipts": [], "labels": []}
    with httpx.Client(timeout=120.0) as client:
        for path in RECEIPTS:
            payload = ocr(client, path)
            parsed = parse_receipt_observations(make_observations(payload))
            result["receipts"].append({
                "file": path.name,
                "status": payload.get("status"),
                "observation_count": len(payload.get("observations", [])),
                "kind": parsed.kind,
                "purchased_at": parsed.purchased_at.isoformat() if parsed.purchased_at else None,
                "product_count": len([line for line in parsed.lines if line.line_type == "product"]),
                "discount_count": len([line for line in parsed.lines if line.line_type == "discount"]),
                "product_names": [line.raw_name for line in parsed.lines if line.line_type == "product"][:8],
                "warnings": parsed.warnings,
            })
        for path in LABELS:
            payload = ocr(client, path)
            obs = make_observations(payload)
            ordered = sorted(obs, key=lambda item: -(item.bbox[1] if item.bbox else 0))
            parsed = parse_label_text("\n".join(item.text for item in ordered))
            result["labels"].append({
                "file": path.name,
                "status": payload.get("status"),
                "observation_count": len(payload.get("observations", [])),
                "product_name": parsed.product_name,
                "barcode": parsed.barcode,
                "date_candidates": [{"kind": item.kind, "value": item.value.isoformat()} for item in parsed.date_candidates],
                "consumption_date_candidate": parsed.consumption_date_candidate.value.isoformat() if parsed.consumption_date_candidate else None,
                "requires_review": parsed.requires_review,
                "warnings": parsed.warnings,
            })
    import json

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
