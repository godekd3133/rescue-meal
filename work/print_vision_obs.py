from __future__ import annotations

import json
import subprocess
import sys


raw = subprocess.check_output(["work/macos_vision_ocr", sys.argv[1]], text=True)
payload = json.loads(raw)
rows = sorted(payload["observations"], key=lambda item: (-item["y"], item["x"]))
for index, row in enumerate(rows):
    print(f"{index:02d} y={row['y']:.3f} x={row['x']:.3f} {row['text']!r}")
