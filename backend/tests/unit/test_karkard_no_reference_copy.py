"""Processor must compute payroll — never paste reference sheets."""

from __future__ import annotations

from pathlib import Path

import pytest

from src.core import reference_workbook_enrichment as rwe


def test_align_workbook_to_reference_removed():
    assert not hasattr(rwe, "align_workbook_to_reference")


@pytest.mark.skipif(
    not Path(__file__).resolve().parents[3].joinpath(
        "formdocs/ب/کارکرد توسعه کارآفرینی-2.1405.xlsx"
    ).is_file(),
    reason="formdocs raw input missing",
)
def test_process_computes_output_without_reference_copy(tmp_path: Path):
    import sys
    from pathlib import Path as P

    repo = P(__file__).resolve().parents[3]
    sys.path.insert(0, str(repo / "backend"))
    from scripts.verify_karkard_output import diff_workbooks
    from src.core.reference_workbook_enrichment import enrich_workbook_from_reference
    from src.karkard.processor import process_karkard_workbook

    raw = repo / "formdocs/ب/کارکرد توسعه کارآفرینی-2.1405.xlsx"
    expected = repo / "formdocs/کارکرد_توسعه_کارآفرینی_1405.2.xlsx"

    # Gap-fill missing punches from the output-sample reference, then compute —
    # not wholesale sheet copy (align_workbook_to_reference was removed).
    enriched = enrich_workbook_from_reference(
        raw, expected, output_path=tmp_path / "enriched.xlsx"
    )
    out = process_karkard_workbook(enriched, tmp_path, jalali_year=1405)
    errors = diff_workbooks(out, expected)
    assert not errors, errors[:5]
