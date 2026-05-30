"""HR savings benchmark calculations."""

from src.demo.agent_hr_benchmarks import compute_hr_savings, domain_label_for_profile


def test_payroll_domain_label():
    assert "حقوق" in domain_label_for_profile("payroll")


def test_savings_with_live_stats():
    out = compute_hr_savings(
        "payroll",
        {
            "total": 10,
            "cost_usd": 0.05,
            "tokens_input": 5000,
            "tokens_output": 2000,
            "total_duration_ms": 120_000,
        },
    )
    assert out["uses_live_activity"] is True
    assert out["money_saved_irr"] > 0
    assert out["time_saved_hours"] > 0
    assert out["role_title"] == "کارشناس حقوق و دستمزد"


def test_savings_demo_when_no_runs():
    out = compute_hr_savings("invoice", {"total": 0, "cost_usd": 0})
    assert out["uses_live_activity"] is False
    assert out["run_count"] > 0
