"""SkillMatcher scoring tests (Phase 2 §1.2).

Pure-function tests of the scoring logic (no DB required): phase +0.4,
pathname +0.2, intent +0.2, run_state +0.2; success_rate multiplier
clamp [0.8, 1.2]; autonomy below min_disqualify; thresholds 0.75/0.50.
"""

from __future__ import annotations

from src.services.skill_matcher import _score_skill


def _skill(trigger: dict, stats: dict | None = None) -> type:
    return type("S", (), {"trigger": trigger, "stats": stats or {}})


def test_full_match_scores_one():
    s = _skill({
        "phase_any": ["wizard"],
        "pathname_prefix": "/agents/create",
        "intent_regex": "continue",
        "run_state": {"phase": "wizard"},
    })
    score, reasons, qualified = _score_skill(
        s, run_state={"phase": "wizard"},
        message="continue testing", pathname="/agents/create",
        autonomy_level=2,
    )
    assert qualified
    # 4 signals = 1.0 base × 1.2 neutral multiplier = 1.2
    assert score == 1.2
    assert len(reasons) >= 4


def test_phase_only_below_suggest_threshold():
    s = _skill({"phase_any": ["wizard"]})
    score, _, qualified = _score_skill(
        s, run_state={"phase": "wizard"},
        message="x", pathname=None, autonomy_level=2,
    )
    assert qualified
    assert score == 0.48  # phase 0.4 × 1.2 neutral


def test_success_rate_multiplier_clamped():
    # 0.0 success rate → 0.8 multiplier (clamped)
    s = _skill(
        {"phase_any": ["wizard"], "pathname_prefix": "/a", "intent_regex": "c", "run_state": {"phase": "wizard"}},
        stats={"success_count": 0, "failure_count": 10},
    )
    score, reasons, qualified = _score_skill(
        s, run_state={"phase": "wizard"}, message="c", pathname="/a", autonomy_level=2,
    )
    # base 1.0 × 0.8 = 0.8 ≥ 0.75 execute threshold applies at match() level
    assert qualified
    assert score == 0.8


def test_autonomy_below_min_disqualified():
    s = _skill({"phase_any": ["wizard"], "min_autonomy_level": 2})
    score, _, qualified = _score_skill(
        s, run_state={"phase": "wizard"},
        message="x", pathname=None, autonomy_level=1,
    )
    assert not qualified
    assert score == 0.0


def test_intent_regex_failure_lowered():
    s = _skill({
        "phase_any": ["wizard"],
        "pathname_prefix": "/a",
        "intent_regex": "nonexistent_pattern_12345",
        "run_state": {"phase": "wizard"},
    })
    score, _, _ = _score_skill(
        s, run_state={"phase": "wizard"},
        message="continue", pathname="/a", autonomy_level=2,
    )
    # phase 0.4 + pathname 0.2 + run_state 0.2 = 0.8 × 1.2 neutral = 0.96
    assert score == 0.96


def test_no_triggers_zero_score():
    s = _skill({})
    score, _, qualified = _score_skill(
        s, run_state={}, message="x", pathname=None, autonomy_level=2,
    )
    assert qualified
    assert score == 0.0
