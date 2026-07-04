"""Persian/RTL-aware PDF rendering helpers (reshaping + bidi + fonts)."""

from __future__ import annotations

from pathlib import Path

try:  # optional, but installed in this project
    import arabic_reshaper
    from bidi.algorithm import get_display

    _HAS_SHAPING = True
except ImportError:  # pragma: no cover
    _HAS_SHAPING = False

# Bundled fonts ship in the Docker image (offline VPS has no system font packages).
_BUNDLED_DIR = Path(__file__).resolve().parent.parent.parent / "assets" / "fonts"

# DejaVu covers Latin + digits + Arabic presentation forms for mixed Persian reports.
_FONT_CANDIDATES = (
    (str(_BUNDLED_DIR / "DejaVuSans.ttf"), str(_BUNDLED_DIR / "DejaVuSans-Bold.ttf")),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
     "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ("/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf",
     "/usr/share/fonts/truetype/noto/NotoNaskhArabic-Bold.ttf"),
)


def shape(text: str) -> str:
    """Reshape + bidi so Persian renders connected and right-to-left."""
    if not text:
        return ""
    if not _HAS_SHAPING:
        return text
    try:
        reshaped = arabic_reshaper.reshape(str(text))
        return get_display(reshaped)
    except Exception:  # pragma: no cover - never block a render
        return str(text)


def resolve_fonts() -> tuple[str, str] | None:
    """Return (regular, bold) font paths if a usable face exists."""
    for regular, bold in _FONT_CANDIDATES:
        if Path(regular).is_file():
            bold_path = bold if Path(bold).is_file() else regular
            return regular, bold_path
    return None


def fmt_rial(amount: int | float) -> str:
    """Group thousands and append ریال (kept LTR-safe for the shaper)."""
    return f"{int(round(amount)):,} ریال"
