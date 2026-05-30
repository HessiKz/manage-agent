"""
Process raw attendance Excel (کارکرد) per HR rules in formdocs/ب/دستور محاسبه کارکرد.

Implements the core column transforms, sorting, overtime/kasr/tatil logic, and optional summary sheet.
"""

from __future__ import annotations

import re
from datetime import timedelta
from pathlib import Path
from typing import Any

import jdatetime
from openpyxl import Workbook, load_workbook
from openpyxl.worksheet.worksheet import Worksheet

COMPANY_DEFAULT = "شرکت توسعه کارآفرینی سوره"
HOUR_FORMAT = "[h]:mm:ss"

WEEKDAY_NAMES = [
    "دوشنبه",
    "سه\u200cشنبه",
    "چهارشنبه",
    "پنجشنبه",
    "جمعه",
    "شنبه",
    "یکشنبه",
]

HEADER_ROW_MARKERS = ("تاریخ", "کارکرد")
SUMMARY_SHEET_PREFIX = "کارکرد کلی"


def _parse_jalali(s: str) -> jdatetime.date | None:
    s = (s or "").strip()
    m = re.match(r"(\d{4})[/-](\d{1,2})[/-](\d{1,2})", s)
    if not m:
        return None
    y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
    try:
        return jdatetime.date(y, mo, d)
    except ValueError:
        return None


def _weekday_index(jd: jdatetime.date) -> int:
    """Monday=0 … Sunday=6 (same as jdatetime.date.weekday())."""
    return jd.weekday()


def _required_hours(weekday: int) -> float:
    """Required work hours for a calendar day (Thu/Fri handled separately)."""
    if weekday == 3:  # پنجشنبه — weekly off
        return 0.0
    if weekday == 4:  # جمعه — computed in جمعه کاری column
        return 0.0
    if weekday == 2:  # چهارشنبه
        return 8.0
    if weekday in (5, 6, 0, 1):  # شنبه–سه‌شنبه
        return 9.0
    return 0.0


def _parse_time_cell(val: Any) -> float | None:
    """Parse cell to hours as float."""
    if val is None or val == "" or val == "----":
        return None
    if isinstance(val, timedelta):
        return val.total_seconds() / 3600
    if isinstance(val, (int, float)):
        if val < 1:
            return val * 24
        return float(val)
    s = str(val).strip()
    if not s or s == "----":
        return None
    parts = s.split(":")
    try:
        if len(parts) == 3:
            h, m, sec = int(parts[0]), int(parts[1]), int(parts[2])
            return h + m / 60 + sec / 3600
        if len(parts) == 2:
            h, m = int(parts[0]), int(parts[1])
            return h + m / 60
    except ValueError:
        pass
    return None


def _hours_to_timedelta(h: float) -> timedelta:
    return timedelta(seconds=max(0, round(h * 3600)))


PERSIAN_MONTHS = [
    "فروردین",
    "اردیبهشت",
    "خرداد",
    "تیر",
    "مرداد",
    "شهریور",
    "مهر",
    "آبان",
    "آذر",
    "دی",
    "بهمن",
    "اسفند",
]


def _infer_work_month(dates: list[jdatetime.date]) -> tuple[str, int]:
    """Payroll month label: period 26→25 maps to month of day 25 end."""
    if not dates:
        return "نامشخص", 1405
    latest = max(dates)
    month_name = PERSIAN_MONTHS[latest.month - 1]
    return month_name, latest.year


def _find_header_row(ws: Worksheet) -> int | None:
    for r in range(1, min(6, ws.max_row + 1)):
        row_vals = [str(c.value or "") for c in ws[r]]
        if "تاریخ" in row_vals and any("کارکرد" in v for v in row_vals):
            return r
    return None


def _col_map(ws: Worksheet, header_row: int) -> dict[str, int]:
    mapping: dict[str, int] = {}
    for idx, cell in enumerate(ws[header_row], start=1):
        key = str(cell.value or "").strip()
        if key:
            mapping[key] = idx
    return mapping


def _ensure_column(ws: Worksheet, header_row: int, title: str, after: str | None = None) -> int:
    cols = _col_map(ws, header_row)
    if title in cols:
        return cols[title]
    if after and after in cols:
        pos = cols[after] + 1
    else:
        pos = ws.max_column + 1
    ws.insert_cols(pos)
    ws.cell(header_row, pos, title)
    return pos


def _get_row_val(ws: Worksheet, row: int, col: int | None) -> Any:
    if col is None:
        return None
    return ws.cell(row, col).value


def _set_row_timedelta(ws: Worksheet, row: int, col: int, hours: float) -> None:
    cell = ws.cell(row, col, _hours_to_timedelta(hours))
    cell.number_format = HOUR_FORMAT


def _process_data_sheet(
    ws: Worksheet,
    *,
    employee_name: str,
    company: str,
    jalali_year: int,
) -> dict[str, float]:
    header_row = _find_header_row(ws)
    if not header_row:
        return {}

    cols = _col_map(ws, header_row)
    if "روز" not in cols:
        ws.insert_cols(1)
        ws.cell(header_row, 1, "روز")
        cols = _col_map(ws, header_row)

    date_col = cols.get("تاریخ")
    if not date_col:
        return {}

    work_col = cols.get("کارکرد")
    req_col = cols.get("کارکرد موظفی") or cols.get("کارکرد موظف")
    leave_col = cols.get("مرخصی") or cols.get("مرخصی ساعتی")
    leave_type_col = cols.get("نوع مرخصی")
    hourly_leave_col = cols.get("مرخصی ساعتی")
    daily_leave_col = cols.get("مرخصی استحقاقی")
    sick_col = cols.get("مرخصی استعلاجی")

    after_req = _ensure_column(ws, header_row, "کارکرد موظف پس از کسر مرخصی", "کارکرد موظفی")
    cols = _col_map(ws, header_row)

    ot_key = "اضافه کار"
    if "اضافه کار کل" in cols:
        ws.cell(header_row, cols["اضافه کار کل"], ot_key)
        cols[ot_key] = cols.pop("اضافه کار کل", cols.get("اضافه کار کل"))
    elif "اضافه کار " in cols:
        ot_key = "اضافه کار "
    ot_col = cols.get(ot_key) or cols.get("اضافه کار") or _ensure_column(
        ws, header_row, "اضافه کار", "کارکرد موظف پس از کسر مرخصی"
    )

    kasr_col = cols.get("کسرکار") or cols.get("تاخیر")
    if kasr_col and "تاخیر" in cols:
        ws.cell(header_row, kasr_col, "کسرکار")
    elif not kasr_col:
        kasr_col = _ensure_column(ws, header_row, "کسرکار", ot_key)

    tatil_col = cols.get("تعطیلکاری") or cols.get("تعطیل کاری")
    if not tatil_col:
        tatil_col = _ensure_column(ws, header_row, "تعطیلکاری", ot_key)

    fri_col = cols.get("جمعه کاری")
    cols = _col_map(ws, header_row)

    data_rows: list[tuple[int, jdatetime.date]] = []
    for r in range(header_row + 1, ws.max_row + 1):
        raw_date = _get_row_val(ws, r, date_col)
        if raw_date is None:
            continue
        jd = _parse_jalali(str(raw_date))
        if jd:
            data_rows.append((r, jd))

    data_rows.sort(key=lambda x: x[1])

    totals = {
        "overtime": 0.0,
        "kasr": 0.0,
        "tatil": 0.0,
        "friday": 0.0,
        "night": 0.0,
        "daily_leave": 0.0,
        "hourly_leave": 0.0,
        "sick": 0.0,
        "work_days": 0,
    }

    for r, jd in data_rows:
        wd = _weekday_index(jd)
        ws.cell(r, cols["روز"], WEEKDAY_NAMES[wd])

        required = _required_hours(wd)
        if req_col:
            _set_row_timedelta(ws, r, req_col, required)

        work_h = _parse_time_cell(_get_row_val(ws, r, work_col)) or 0.0
        leave_h = _parse_time_cell(_get_row_val(ws, r, leave_col)) or 0.0
        leave_type = str(_get_row_val(ws, r, leave_type_col) or "").strip()

        daily_leave = _get_row_val(ws, r, daily_leave_col)
        sick_leave = _get_row_val(ws, r, sick_col)
        is_daily = leave_type in ("روزانه", "استعلاجی") or (
            daily_leave and str(daily_leave) not in ("", "0", "----")
        ) or (sick_leave and str(sick_leave) not in ("", "0", "----"))

        if leave_type_col:
            if "ساعتی" in leave_type or (leave_h > 0 and not is_daily):
                ws.cell(r, leave_type_col, "ساعتی")
            elif "استعلاجی" in leave_type or (sick_leave and str(sick_leave) not in ("", "0")):
                ws.cell(r, leave_type_col, "استعلاجی")
            elif is_daily:
                ws.cell(r, leave_type_col, "روزانه")
            elif leave_h <= 0:
                ws.cell(r, leave_type_col, "0")

        if is_daily:
            after_leave = 0.0
        else:
            after_leave = max(0.0, required - leave_h)

        _set_row_timedelta(ws, r, after_req, after_leave)

        is_friday = wd == 4
        is_thursday = wd == 3

        overtime = 0.0
        kasr = 0.0
        tatil = 0.0
        friday_work = 0.0

        if is_friday:
            friday_work = work_h
            if fri_col:
                _set_row_timedelta(ws, r, fri_col, friday_work)
            _set_row_timedelta(ws, r, ot_col, 0)
            _set_row_timedelta(ws, r, kasr_col, 0)
            _set_row_timedelta(ws, r, tatil_col, 0)
        elif is_thursday:
            tatil = work_h
            _set_row_timedelta(ws, r, tatil_col, tatil)
            _set_row_timedelta(ws, r, ot_col, 0)
            _set_row_timedelta(ws, r, kasr_col, 0)
        else:
            if work_h > after_leave and after_leave > 0:
                overtime = work_h - after_leave
            elif work_h < after_leave:
                kasr = after_leave - work_h
            _set_row_timedelta(ws, r, ot_col, overtime)
            _set_row_timedelta(ws, r, kasr_col, kasr)
            _set_row_timedelta(ws, r, tatil_col, 0)

        if work_h > 0 and not is_friday:
            totals["work_days"] += 1

        totals["overtime"] += overtime
        totals["kasr"] += kasr
        totals["tatil"] += tatil
        totals["friday"] += friday_work

        night_col = cols.get("شب کاری")
        if night_col:
            nh = _parse_time_cell(_get_row_val(ws, r, night_col)) or 0.0
            totals["night"] += nh

        if hourly_leave_col:
            hl = _parse_time_cell(_get_row_val(ws, r, hourly_leave_col)) or 0.0
            totals["hourly_leave"] += hl
        elif leave_h > 0 and not is_daily:
            totals["hourly_leave"] += leave_h

        if daily_leave_col:
            try:
                totals["daily_leave"] += int(daily_leave or 0)
            except (TypeError, ValueError):
                pass
        if sick_col:
            try:
                totals["sick"] += int(sick_leave or 0)
            except (TypeError, ValueError):
                pass

    month_name, year = _infer_work_month([d for _, d in data_rows])
    title_row = header_row - 1 if header_row > 1 else 1
    ws.cell(
        title_row,
        1,
        f"{company} — کارکرد {month_name} {year} — {employee_name}",
    )

    real_ot = max(0.0, totals["overtime"] - totals["kasr"]) if totals["kasr"] < totals["overtime"] else 0.0
    real_tatil = totals["tatil"]
    if totals["kasr"] >= totals["overtime"]:
        remainder = totals["kasr"] - totals["overtime"]
        real_tatil = max(0.0, totals["tatil"] - remainder)
        if remainder > totals["tatil"]:
            totals["hourly_leave"] += remainder - totals["tatil"]

    totals["real_overtime"] = real_ot
    totals["real_tatil"] = real_tatil
    totals["employee"] = employee_name
    totals["year"] = year
    return totals


def _build_summary_sheet(wb: Workbook, summaries: list[dict[str, float]], jalali_year: int) -> None:
    if SUMMARY_SHEET_PREFIX in wb.sheetnames:
        del wb[SUMMARY_SHEET_PREFIX]
    ws = wb.create_sheet(SUMMARY_SHEET_PREFIX, 0)
    ws.cell(1, 1, f"{COMPANY_DEFAULT} — کارکرد کلی {jalali_year}")
    headers = [
        "ردیف",
        "نام و نام خانوادگی",
        "کارکرد روزانه",
        "اضافه کاری",
        "تعطیلکاری",
        "جمعه کاری",
        "شبکاری",
        "مرخصی روزانه",
        "مرخصی ساعتی",
        "مرخصی استعلاجی",
    ]
    for c, h in enumerate(headers, start=1):
        ws.cell(2, c, h)
    for i, s in enumerate(summaries, start=1):
        row = i + 2
        ws.cell(row, 1, i)
        ws.cell(row, 2, s.get("employee", ""))
        ws.cell(row, 3, s.get("work_days", 0))
        ws.cell(row, 4, _hours_to_timedelta(s.get("real_overtime", 0)))
        ws.cell(row, 4).number_format = HOUR_FORMAT
        ws.cell(row, 5, _hours_to_timedelta(s.get("real_tatil", 0)))
        ws.cell(row, 5).number_format = HOUR_FORMAT
        ws.cell(row, 6, _hours_to_timedelta(s.get("friday", 0)))
        ws.cell(row, 6).number_format = HOUR_FORMAT
        ws.cell(row, 7, _hours_to_timedelta(s.get("night", 0)))
        ws.cell(row, 7).number_format = HOUR_FORMAT
        ws.cell(row, 8, s.get("daily_leave", 0))
        ws.cell(row, 9, _hours_to_timedelta(s.get("hourly_leave", 0)))
        ws.cell(row, 9).number_format = HOUR_FORMAT
        ws.cell(row, 10, s.get("sick", 0))


def process_karkard_workbook(
    input_path: str | Path,
    output_dir: str | Path,
    *,
    company_name: str = COMPANY_DEFAULT,
    jalali_year: int = 1405,
) -> Path:
    """Transform raw attendance workbook; return path to output .xlsx."""
    input_path = Path(input_path)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    wb = load_workbook(input_path, data_only=True)
    summaries: list[dict[str, float]] = []
    sheets_to_process = [
        name
        for name in wb.sheetnames
        if not name.startswith(SUMMARY_SHEET_PREFIX) and _find_header_row(wb[name]) is not None
    ]

    for name in sheets_to_process:
        ws = wb[name]
        summary = _process_data_sheet(
            ws,
            employee_name=name.strip(),
            company=company_name,
            jalali_year=jalali_year,
        )
        if summary:
            summaries.append(summary)

    if len(summaries) > 1:
        _build_summary_sheet(wb, summaries, jalali_year)

    out_name = f"karkard-{input_path.stem}-processed.xlsx"
    out_path = output_dir / out_name
    wb.save(out_path)
    return out_path
