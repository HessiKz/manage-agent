"""کارکرد کلی summary row display rules (not raw sheet sums)."""

from src.karkard.processor import _finalize_sheet_totals


def test_summary_caps_overtime_between_30_and_40_hours():
    out = _finalize_sheet_totals(
        {"overtime": 43, "kasr": 5, "tatil": 4, "night": 0, "friday": 0}
    )
    assert out["summary_overtime"] == 30.0
    assert out["real_overtime"] == 38.0


def test_summary_full_absence_shows_30h_overtime_not_kasr():
    out = _finalize_sheet_totals(
        {"overtime": 0, "kasr": 184, "tatil": 0, "night": 0, "friday": 0}
    )
    assert out["summary_overtime"] == 30.0
    assert out["summary_kasr_cl"] == 0.0


def test_summary_kasr_only_when_net_ot_zero_and_kasr_modest():
    out = _finalize_sheet_totals(
        {"overtime": 9.5, "kasr": 15.75, "tatil": 0, "night": 0, "friday": 0}
    )
    assert out["summary_overtime"] == 0.0
    assert round(out["summary_kasr_cl"], 2) == 6.25


def test_summary_night_zero_when_monthly_ot_over_120():
    out = _finalize_sheet_totals(
        {"overtime": 130, "kasr": 0, "tatil": 10, "night": 13, "friday": 0}
    )
    assert out["summary_night"] == 0.0
    assert out["night"] == 13
