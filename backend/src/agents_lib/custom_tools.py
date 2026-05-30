"""
Business-domain tools.

Each tool is a small, pure function that the LLM can call. Real
implementations will hit DBs/APIs; these are stubs to learn the pattern.
"""

from datetime import date
from pathlib import Path

from langchain_core.tools import tool

from src.agents_lib.tool_registry import ToolRegistry


@tool
def budget_lookup(agent_slug: str) -> dict:
    """Return the current month's budget, spent, and remaining for an agent."""
    # TODO: query Budget + ActivityLog tables
    return {
        "agent": agent_slug,
        "budget_usd": 1000.0,
        "spent_usd": 312.45,
        "remaining_usd": 687.55,
        "period": "monthly",
    }


@tool
def hr_lookup(employee_id: str = "E-1001") -> dict:
    """Look up an employee's HR record (department, hours, status)."""
    from src.demo.datasets import DEMO_PAYROLL

    match = next((r for r in DEMO_PAYROLL if r.get("employee_id") == employee_id), None)
    if not match:
        match = DEMO_PAYROLL[0]
    ot_pay = int(match["base"] * 0.0014 * match["overtime_h"])
    return {
        "id": match.get("employee_id", employee_id),
        "name": match["employee"],
        "department": match["department"],
        "base_salary": match["base"],
        "overtime_hours_this_month": match["overtime_h"],
        "overtime_pay_estimate": ot_pay,
        "gross_estimate": match["base"] + ot_pay,
        "all_staff_count": len(DEMO_PAYROLL),
    }


@tool
def report_generate(report_type: str, period: str | None = None) -> dict:
    """Generate a real PDF document and return its download path.

    `report_type` decides the document:
    - "payslip" / "فیش حقوقی" → per-employee Iranian payslips (earnings, deductions, net pay)
    - "payroll" / "حقوق" → payroll summary table for all staff
    - "invoice" / "فاکتور" → invoice status report
    """
    from src.demo.datasets import DEMO_PAYROLL
    from src.demo.reports import (
        build_invoice_report,
        build_payroll_summary,
        build_payslips,
        classify_document,
        ensure_report_file,
    )

    period_val = period or "1404/12"
    kind = classify_document(report_type)
    filename = ensure_report_file(report_type, period_val)
    download_path = f"/api/v1/demo-files/reports/{filename}"

    if kind == "payslip":
        _, computed = build_payslips(period_val)
        summary = (
            f"فیش حقوقی برای {len(computed)} پرسنل دوره {period_val} صادر شد. "
            f"خالص پرداختی نمونه ({computed[0]['employee']}): {computed[0]['net']:,} ریال."
        )
        return {
            "document": "payslip",
            "period": period_val,
            "download_path": download_path,
            "summary": summary,
            "employees": [
                {
                    "name": c["employee"],
                    "employee_id": c.get("employee_id"),
                    "gross": c["gross"],
                    "deductions": c["deductions_total"],
                    "net": c["net"],
                }
                for c in computed
            ],
        }

    if kind == "invoice":
        _, meta = build_invoice_report(report_type, period_val)
        return {
            "document": "invoice_report",
            "period": period_val,
            "download_path": download_path,
            "summary": (
                f"گزارش {meta['invoices']} فاکتور دوره {period_val} تولید شد. "
                f"جمع مبالغ: {meta['total_amount']:,} ریال."
            ),
            **meta,
        }

    _, meta = build_payroll_summary(period_val)
    return {
        "document": "payroll_summary",
        "period": period_val,
        "download_path": download_path,
        "summary": (
            f"گزارش حقوق {period_val} برای {meta['employees']} پرسنل آماده شد. "
            f"جمع خالص پرداختی: {meta['total_net']:,} ریال."
        ),
        "row_count": len(DEMO_PAYROLL),
        **meta,
    }


@tool
def resume_screen(role: str, min_score: int = 6) -> dict:
    """Screen demo resumes for a target role and return ranked candidates.

    Scoring rubric (0..12):
    - Languages/tech stack
    - Frameworks
    - Real projects
    - Git/GitHub
    - Team collaboration
    - Core SWE concepts (approximated by advanced backend/system skills)
    """
    from src.demo.datasets import DEMO_RESUMES

    role_l = (role or "").lower()
    role_keywords = {
        "software": {"python", "java", "javascript", "typescript", "go", "git"},
        "مهندس": {"python", "java", "javascript", "typescript", "git"},
        "backend": {"python", "java", "django", "spring", "flask", "api"},
        "frontend": {"javascript", "typescript", "react", "next.js"},
    }
    wanted = set()
    for k, vals in role_keywords.items():
        if k in role_l:
            wanted |= vals
    if not wanted:
        wanted = {"python", "java", "javascript", "typescript", "git"}

    scored = []
    for cv in DEMO_RESUMES:
        skills = {s.lower() for s in cv.get("skills", [])}
        score = 0
        notes: list[str] = []

        # 1) languages / tech
        lang_hit = len(skills & {"python", "java", "javascript", "typescript", "go"})
        score += 2 if lang_hit >= 2 else (1 if lang_hit == 1 else 0)
        if lang_hit == 0:
            notes.append("زبان برنامه‌نویسی کلیدی ندارد")

        # 2) frameworks
        fw_hit = len(skills & {"django", "flask", "spring boot", "react", "next.js"})
        score += 2 if fw_hit >= 1 else 0
        if fw_hit == 0:
            notes.append("فریم‌ورک تخصصی ذکر نشده")

        # 3) projects
        projects = int(cv.get("projects", 0))
        score += 2 if projects >= 3 else (1 if projects >= 1 else 0)
        if projects == 0:
            notes.append("پروژه قابل ارائه ندارد")

        # 4) Git/GitHub
        has_git = ("git" in skills) or bool(cv.get("github"))
        score += 2 if has_git else 0
        if not has_git:
            notes.append("Git/GitHub ندارد")

        # 5) teamwork
        teamwork = bool(cv.get("teamwork"))
        score += 2 if teamwork else 0
        if not teamwork:
            notes.append("تجربه تیمی روشن نیست")

        # 6) core SWE concepts
        core_hit = len(skills & {"system design", "postgresql", "mysql", "redis", "rest api", "docker"})
        score += 2 if core_hit >= 2 else (1 if core_hit == 1 else 0)
        if core_hit == 0:
            notes.append("شواهد مفاهیم پایه مهندسی نرم‌افزار کم است")

        role_fit_bonus = 1 if len(skills & wanted) >= 2 else 0
        final_score = min(12, score + role_fit_bonus)

        if final_score >= 9:
            verdict = "قوی"
        elif final_score >= min_score:
            verdict = "متوسط"
        else:
            verdict = "ضعیف"

        scored.append(
            {
                "id": cv["id"],
                "name": cv["name"],
                "score": final_score,
                "category": verdict,
                "years": cv.get("years", 0),
                "top_skills": cv.get("skills", [])[:5],
                "notes": notes[:3],
                "summary": cv.get("summary", ""),
            }
        )

    scored.sort(key=lambda x: x["score"], reverse=True)
    shortlisted = [x for x in scored if x["score"] >= min_score]

    return {
        "role": role,
        "threshold": min_score,
        "total_resumes": len(DEMO_RESUMES),
        "shortlisted_count": len(shortlisted),
        "shortlisted": shortlisted,
        "all_results": scored,
        "next_step": (
            "کاندیدهای «قوی» برای مصاحبه فنی مستقیم و «متوسط» برای اسکرینینگ فنی کوتاه دعوت شوند."
        ),
    }


@tool
def karkard_process(
    storage_path: str,
    agent_id: str = "",
    company_name: str = "شرکت توسعه کارآفرینی سوره",
    jalali_year: int = 1405,
) -> dict:
    """Process uploaded raw کارکرد Excel per HR rules; returns download path.

    storage_path must be the full path from workspace (e.g. var/agent_files/.../uuid_demo-karkard-raw.xlsx),
    not only the display filename.
    """
    from src.karkard.output import KARKARD_OUTPUT_DIR
    from src.karkard.paths import find_processed_output, resolve_storage_path
    from src.karkard.processor import process_karkard_workbook

    path = resolve_storage_path(storage_path, agent_id=agent_id or None)
    existing = find_processed_output(path)
    if existing:
        return {
            "input": str(path),
            "output_file": existing.name,
            "download_path": f"/api/v1/demo-files/karkard/{existing.name}",
            "summary": (
                f"فایل پردازش‌شده «{existing.name}» از قبل موجود است. "
                "لینک دانلود همان خروجی نهایی HR است."
            ),
            "sheets_processed": True,
            "already_processed": True,
        }

    out_dir = KARKARD_OUTPUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    out = process_karkard_workbook(
        path,
        out_dir,
        company_name=company_name,
        jalali_year=jalali_year,
    )
    return {
        "input": str(path),
        "output_file": out.name,
        "download_path": f"/api/v1/demo-files/karkard/{out.name}",
        "summary": (
            f"فایل کارکرد «{path.name}» پردازش شد. "
            f"ستون‌های موظف، اضافه‌کار، کسرکار و تعطیل‌کاری طبق دستورالعمل HR به‌روز شد."
        ),
        "sheets_processed": True,
    }


@tool
def crm_lookup(customer_id: str) -> dict:
    """Look up a customer record in the CRM."""
    return {
        "id": customer_id,
        "name": "شرکت نمونه",
        "tier": "gold",
        "open_tickets": 2,
    }


# Register them — note: `@tool` returns a StructuredTool instance, so we
# register imperatively (cleaner than re-wrapping with @register_tool).
ToolRegistry.register("budget_lookup", budget_lookup)
ToolRegistry.register("hr_lookup", hr_lookup)
ToolRegistry.register("report_generate", report_generate)
ToolRegistry.register("resume_screen", resume_screen)
ToolRegistry.register("crm_lookup", crm_lookup)
ToolRegistry.register("karkard_process", karkard_process)
