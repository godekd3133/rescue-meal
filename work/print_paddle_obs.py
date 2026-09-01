from __future__ import annotations

from pathlib import Path
import sys

import httpx


path = Path(sys.argv[1])
with path.open("rb") as image:
    response = httpx.post("http://127.0.0.1:8002/ocr", files={"file": (path.name, image, "image/png")}, timeout=120)
response.raise_for_status()
payload = response.json()
rows = sorted(payload.get("observations", []), key=lambda item: (-float(item["bbox"][1]) if item.get("bbox") else 0, float(item["bbox"][0]) if item.get("bbox") else 0))
for index, item in enumerate(rows):
    print(f"{index:02d} conf={float(item['confidence']):.2f} bbox={item.get('bbox')} {item['text']!r}")
