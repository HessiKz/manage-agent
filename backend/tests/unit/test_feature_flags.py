"""Phase 1 rollout flags (plan M4.1)."""

from src.config import settings


def test_flags_exist_with_safe_defaults():
    # M1/M2 shipped code stays on by default; M3 autonomy is off until enabled.
    assert settings.run_state_v1 is True
    assert settings.precision_routing_v1 is True
    assert settings.graduated_autonomy_v1 is False
    assert settings.graduated_autonomy_v1_l3_flag is False
