from __future__ import annotations
import csv
from pathlib import Path

def main(input_path: Path, output_dir: Path, *, agent_id: str, args: dict) -> Path:
    with Path(input_path).open(newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    out_rows = [["sku", "units", "unit_price", "line_total"]]
    units_sum = 0.0
    total_sum = 0.0
    for r in rows[1:]:
        if not r:
            continue
        units = float(r[1])
        price = float(r[2])
        lt = units * price
        out_rows.append([r[0], units, price, lt])
        units_sum += units
        total_sum += lt
    out_rows.append(["TOTAL", units_sum, "", total_sum])
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / f"output_{input_path.stem}.csv"
    with out_path.open("w", newline="", encoding="utf-8") as f:
        csv.writer(f).writerows(out_rows)
    return out_path
