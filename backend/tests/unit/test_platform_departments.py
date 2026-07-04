"""Department normalization for platform support tools."""

from src.agents_lib.platform_constants import (
    department_label_fa,
    normalize_department,
)


def test_normalize_department_persian_and_slugs():
    assert normalize_department("ops") == "ops"
    assert normalize_department("عملیات") == "ops"
    assert normalize_department("Operations") == "ops"
    assert normalize_department("مالی") == "finance"
    assert normalize_department("منابع انسانی") == "hr"
    assert normalize_department("unknown-dept") is None


def test_department_label_fa():
    assert department_label_fa("ops") == "عملیات"
    assert department_label_fa("finance") == "مالی"
