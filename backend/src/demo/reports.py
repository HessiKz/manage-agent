"""Generate downloadable demo documents (payslips, payroll & invoice reports).

Persian text is reshaped + bidi-reordered so PDFs render correctly (connected
letters, right-to-left). Each document carries real demo data, never a blank page.
"""

from __future__ import annotations

import re
from pathlib import Path

from src.demo.datasets import DEMO_INVOICES, DEMO_PAYROLL
from src.demo.payroll_calc import compute_payslip
from src.demo.pdf_fa import fmt_rial, resolve_fonts, shape

REPORTS_DIR = Path("var/demo_reports")

# Brand-ish palette (RGB)
_INK = (38, 32, 28)
_MUTED = (120, 110, 102)
_LINE = (210, 202, 196)
_HEAD_BG = (244, 238, 232)
_ACCENT = (150, 90, 40)
_NET_BG = (235, 245, 236)


def _safe_name(report_type: str, period: str | None, suffix: str = "") -> str:
    raw = f"{report_type}-{period or 'today'}{suffix}"
    safe = re.sub(r"[^\w\-]+", "_", raw, flags=re.UNICODE).strip("_")
    return f"{safe or 'report'}.pdf"


# ── document kind detection ──────────────────────────────────────────────────

def classify_document(report_type: str) -> str:
    t = (report_type or "").lower()
    if "payslip" in t or "فیش" in report_type or "fish" in t:
        return "payslip"
    if "invoice" in t or "فاکتور" in report_type or "صورتحساب" in report_type:
        return "invoice"
    if "payroll" in t or "حقوق" in report_type or "salary" in t:
        return "payroll"
    return "payroll"


# ── PDF builder ──────────────────────────────────────────────────────────────

class _FaPdf:
    """Thin wrapper over fpdf2 with Persian shaping + RTL cells."""

    def __init__(self) -> None:
        from fpdf import FPDF

        self.pdf = FPDF(format="A4")
        self.pdf.set_auto_page_break(auto=True, margin=15)
        self.pdf.set_margins(15, 15, 15)
        fonts = resolve_fonts()
        self._font = "Fa"
        if fonts:
            regular, bold = fonts
            self.pdf.add_font("Fa", "", regular)
            self.pdf.add_font("Fa", "B", bold)
        else:  # pragma: no cover
            self._font = "Helvetica"
        self.pdf.add_page()

    @property
    def w(self) -> float:
        return self.pdf.w - self.pdf.l_margin - self.pdf.r_margin

    def font(self, size: int = 11, bold: bool = False) -> None:
        style = "B" if (bold and self._font == "Fa") else ""
        self.pdf.set_font(self._font, style, size)

    def rtl_line(self, text: str, size: int = 11, bold: bool = False,
                 color: tuple = _INK, gap: float = 7) -> None:
        self.font(size, bold)
        self.pdf.set_text_color(*color)
        self.pdf.cell(self.w, gap, shape(text), align="R", new_x="LMARGIN", new_y="NEXT")

    def center_line(self, text: str, size: int = 14, bold: bool = True,
                    color: tuple = _INK, gap: float = 9) -> None:
        self.font(size, bold)
        self.pdf.set_text_color(*color)
        self.pdf.cell(self.w, gap, shape(text), align="C", new_x="LMARGIN", new_y="NEXT")

    def hr(self, color: tuple = _LINE) -> None:
        self.pdf.set_draw_color(*color)
        y = self.pdf.get_y() + 1
        self.pdf.line(self.pdf.l_margin, y, self.pdf.l_margin + self.w, y)
        self.pdf.ln(3)

    def kv_row(self, label: str, value: str, size: int = 10) -> None:
        """Right-aligned label : value pair (label on the right)."""
        self.font(size, False)
        self.pdf.set_text_color(*_MUTED)
        half = self.w / 2
        # value cell (left), label cell (right) — RTL reading order
        self.pdf.cell(half, 7, shape(value), align="L")
        self.pdf.set_text_color(*_INK)
        self.font(size, True)
        self.pdf.cell(half, 7, shape(label), align="R", new_x="LMARGIN", new_y="NEXT")

    def amount_row(self, label: str, value: str, bold: bool = False,
                   bg: tuple | None = None, size: int = 10) -> None:
        half = self.w / 2
        fill = bg is not None
        if fill:
            self.pdf.set_fill_color(*bg)
        self.font(size, bold)
        self.pdf.set_text_color(*_INK)
        self.pdf.cell(half, 8, shape(value), align="L", border="B", fill=fill)
        self.pdf.cell(half, 8, shape(label), align="R", border="B", fill=fill,
                      new_x="LMARGIN", new_y="NEXT")

    def section_title(self, text: str) -> None:
        self.pdf.ln(2)
        self.pdf.set_fill_color(*_HEAD_BG)
        self.font(11, True)
        self.pdf.set_text_color(*_ACCENT)
        self.pdf.cell(self.w, 8, shape(text), align="R", fill=True,
                      new_x="LMARGIN", new_y="NEXT")
        self.pdf.ln(1)

    def table_header(self, cols: list[tuple[str, float]]) -> None:
        self.pdf.set_fill_color(*_HEAD_BG)
        self.font(9, True)
        self.pdf.set_text_color(*_ACCENT)
        for label, width in cols:  # cols given right→left
            self.pdf.cell(self.w * width, 8, shape(label), align="C", border=1, fill=True)
        self.pdf.ln()

    def table_row(self, cells: list[tuple[str, float]], size: int = 9) -> None:
        self.font(size, False)
        self.pdf.set_text_color(*_INK)
        for value, width in cells:
            self.pdf.cell(self.w * width, 7, shape(value), align="C", border=1)
        self.pdf.ln()

    def ln(self, h: float = 4) -> None:
        self.pdf.ln(h)

    def output(self) -> bytes:
        out = self.pdf.output()
        return bytes(out) if isinstance(out, (bytes, bytearray)) else out.encode("latin-1", "replace")


# ── payslip (فیش حقوقی) ──────────────────────────────────────────────────────

COMPANY_NAME = "شرکت توسعه کارآفرینی سوره"


def _render_payslip(doc: _FaPdf, emp: dict, period: str) -> None:
    p = compute_payslip(emp)

    doc.center_line(COMPANY_NAME, size=13, bold=True, color=_ACCENT, gap=8)
    doc.center_line("فیش حقوقی", size=16, bold=True, gap=10)
    doc.center_line(f"دوره پرداخت: {period}", size=10, bold=False, color=_MUTED, gap=7)
    doc.ln(2)
    doc.hr()

    doc.section_title("مشخصات کارمند")
    doc.kv_row("نام و نام خانوادگی", emp["employee"])
    doc.kv_row("کد پرسنلی", str(emp.get("employee_id", "—")))
    doc.kv_row("واحد سازمانی", emp["department"])
    doc.kv_row("روزهای کارکرد", "۳۰ روز")
    doc.kv_row("ساعت اضافه‌کار", f"{emp['overtime_h']} ساعت")

    doc.section_title("مزایا و دریافتی‌ها")
    doc.amount_row("حقوق پایه", fmt_rial(p["base"]))
    doc.amount_row("حق مسکن", fmt_rial(p["housing"]))
    doc.amount_row("بن کارگری (خواروبار)", fmt_rial(p["food"]))
    doc.amount_row("حق اولاد", fmt_rial(p["child"]))
    doc.amount_row("اضافه‌کاری", fmt_rial(p["overtime_pay"]))
    doc.amount_row("جمع کل دریافتی (ناخالص)", fmt_rial(p["gross"]), bold=True, bg=_HEAD_BG)

    doc.section_title("کسورات")
    doc.amount_row("بیمه تأمین اجتماعی (۷٪)", fmt_rial(p["insurance"]))
    doc.amount_row("مالیات بر حقوق", fmt_rial(p["tax"]))
    doc.amount_row("جمع کل کسورات", fmt_rial(p["deductions_total"]), bold=True, bg=_HEAD_BG)

    doc.ln(2)
    doc.amount_row("خالص پرداختی", fmt_rial(p["net"]), bold=True, bg=_NET_BG, size=12)

    doc.ln(8)
    doc.rtl_line("این سند به‌صورت خودکار توسط دستیار حقوق و دستمزد تولید شده است.",
                 size=8, color=_MUTED)


def build_payslips(period: str, employees: list[dict] | None = None) -> tuple[bytes, list[dict]]:
    rows = employees or DEMO_PAYROLL
    doc = _FaPdf()
    computed = []
    for i, emp in enumerate(rows):
        if i > 0:
            doc.pdf.add_page()
        _render_payslip(doc, emp, period)
        computed.append({**emp, **compute_payslip(emp)})
    return doc.output(), computed


# ── payroll summary ──────────────────────────────────────────────────────────

def build_payroll_summary(period: str) -> tuple[bytes, dict]:
    doc = _FaPdf()
    doc.center_line(COMPANY_NAME, size=13, bold=True, color=_ACCENT, gap=8)
    doc.center_line("گزارش حقوق و دستمزد", size=16, bold=True, gap=10)
    doc.center_line(f"دوره: {period}", size=10, bold=False, color=_MUTED, gap=7)
    doc.ln(2)
    doc.hr()

    cols = [("خالص", 0.22), ("کسورات", 0.22), ("ناخالص", 0.22), ("واحد", 0.16), ("کارمند", 0.18)]
    doc.table_header(cols)

    total_gross = total_ded = total_net = 0
    for emp in DEMO_PAYROLL:
        p = compute_payslip(emp)
        total_gross += p["gross"]
        total_ded += p["deductions_total"]
        total_net += p["net"]
        doc.table_row([
            (f"{p['net']:,}", 0.22),
            (f"{p['deductions_total']:,}", 0.22),
            (f"{p['gross']:,}", 0.22),
            (emp["department"], 0.16),
            (emp["employee"], 0.18),
        ])

    doc.ln(4)
    doc.amount_row("جمع ناخالص کل", fmt_rial(total_gross), bold=True, bg=_HEAD_BG)
    doc.amount_row("جمع کسورات کل", fmt_rial(total_ded), bold=True, bg=_HEAD_BG)
    doc.amount_row("جمع خالص پرداختی", fmt_rial(total_net), bold=True, bg=_NET_BG, size=12)

    return doc.output(), {
        "employees": len(DEMO_PAYROLL),
        "total_gross": total_gross,
        "total_deductions": total_ded,
        "total_net": total_net,
    }


# ── invoice report ────────────────────────────────────────────────────────────

def build_invoice_report(report_type: str, period: str) -> tuple[bytes, dict]:
    doc = _FaPdf()
    doc.center_line(COMPANY_NAME, size=13, bold=True, color=_ACCENT, gap=8)
    doc.center_line("گزارش فاکتورها", size=16, bold=True, gap=10)
    doc.center_line(f"دوره: {period}", size=10, bold=False, color=_MUTED, gap=7)
    doc.ln(2)
    doc.hr()

    cols = [("وضعیت", 0.2), ("دسته", 0.15), ("مبلغ (ریال)", 0.3), ("مشتری", 0.2), ("شناسه", 0.15)]
    doc.table_header(cols)

    status_fa = {"paid": "پرداخت‌شده", "pending": "در انتظار", "overdue": "معوق"}
    total = 0
    for inv in DEMO_INVOICES:
        total += inv["amount"]
        doc.table_row([
            (status_fa.get(inv["status"], inv["status"]), 0.2),
            (inv["batch"], 0.15),
            (f"{inv['amount']:,}", 0.3),
            (inv["customer"], 0.2),
            (inv["id"], 0.15),
        ])

    doc.ln(4)
    doc.amount_row("جمع کل مبالغ", fmt_rial(total), bold=True, bg=_HEAD_BG, size=12)
    return doc.output(), {"invoices": len(DEMO_INVOICES), "total_amount": total}


# ── public entry point ────────────────────────────────────────────────────────

def ensure_report_file(report_type: str, period: str | None = None) -> str:
    """Create the right document on disk; return filename (not full path)."""
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    period_val = period or "1404/12"
    kind = classify_document(report_type)

    if kind == "payslip":
        filename = _safe_name("payslip", period_val)
        pdf_bytes, _ = build_payslips(period_val)
    elif kind == "invoice":
        filename = _safe_name(report_type, period_val)
        pdf_bytes, _ = build_invoice_report(report_type, period_val)
    else:
        filename = _safe_name("payroll", period_val)
        pdf_bytes, _ = build_payroll_summary(period_val)

    (REPORTS_DIR / filename).write_bytes(pdf_bytes)
    return filename
