#!/usr/bin/env python3
"""E2E: two karkard_process runs must return different output filenames."""

from __future__ import annotations

import sys
import uuid
from pathlib import Path

from openpyxl import Workbook

# Mounted source must win over site-packages copy from image build.
sys.path.insert(0, "/app")

from src.agents_lib.custom_tools import karkard_process
from src.core.agent_workspace_files import finalize_agent_output_text


def main() -> int:
    agent_id = uuid.uuid4()
    agent_dir = Path("var/agent_files") / str(agent_id)
    agent_dir.mkdir(parents=True, exist_ok=True)
    raw = agent_dir / f"{uuid.uuid4().hex}_کارکرد-raw.xlsx"

    wb = Workbook()
    ws = wb.active
    ws.append(["تاریخ", "کارکرد", "اضافه کار کل", "تاخیر و تعجیل"])
    ws.append(["1405/01/01", "08:00:00", "00:00:00", "00:00:00"])
    wb.save(raw)

    results = []
    for i in range(2):
        out = karkard_process.invoke(
            {
                "storage_path": str(raw),
                "agent_id": str(agent_id),
                "jalali_year": 1405,
                "company_name": "شرکت توسعه کارآفرینی سوره",
            }
        )
        results.append(out)
        print(f"run {i + 1}: {out['output_file']}")
        print(f"  url: {out['download_path']}")

    if results[0]["output_file"] == results[1]["output_file"]:
        print("FAIL: duplicate output filenames")
        return 1

    url1 = results[0]["download_path"]
    url2 = results[1]["download_path"]
    text1 = finalize_agent_output_text(f"دانلود: {url1}", agent_id)
    text2 = finalize_agent_output_text(f"دانلود: {url2}", agent_id)

    if url1 not in text1 or url2 not in text2:
        print("FAIL: finalize_agent_output_text rewrote valid URLs")
        print("text1:", text1)
        print("text2:", text2)
        return 1

    if "output-sample" in results[0]["output_file"]:
        print("FAIL: processed output-sample")
        return 1

    print("OK: fresh unique outputs, URLs preserved")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
