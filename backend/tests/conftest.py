"""Pytest fixtures."""

import sys
from pathlib import Path

import pytest

# Ensure `src` package is importable when running tests locally
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


@pytest.fixture
def anyio_backend():
    return "asyncio"
