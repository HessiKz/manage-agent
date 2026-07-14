"""_parse_code extracts def-main even when LLM prefixes prose or adds trailing chat."""

from src.services.agent_script_service import _parse_code


def test_plain_codeblock_passes_through():
    raw = "import csv\n\n\ndef main(input_path, output_dir, *, agent_id, args):\n    return input_path\n"
    assert _parse_code(raw) == raw.strip()


def test_strips_markdown_fences():
    raw = "```python\nimport csv\n\n\ndef main(input_path, output_dir, *, agent_id, args):\n    return input_path\n```"
    assert _parse_code(raw).startswith("import csv")
    assert _parse_code(raw).endswith("return input_path")


def test_extracts_code_from_after_prose():
    raw = (
        "Looking at the error, I produced 33 rows but 41 expected. "
        "The issue: I only output rows that have valid dates.\n\n"
        "```python\nimport csv\n\n\ndef main(input_path, output_dir, *, agent_id, args):\n    return input_path\n```"
    )
    out = _parse_code(raw)
    assert out.startswith("import csv")
    assert "def main(" in out
    assert "Looking at the error" not in out


def test_strips_leading_prose_without_fences():
    raw = (
        "Looking at the error, I produced 33 rows but 41 expected.\n"
        "import csv\n\n\ndef main(input_path, output_dir, *, agent_id, args):\n    return input_path\n"
    )
    out = _parse_code(raw)
    assert out.startswith("import csv")
    assert "Looking at the error" not in out


def test_trailing_prose_after_fenced_block_dropped():
    raw = (
        "```python\nimport csv\n\n\ndef main(input_path, output_dir, *, agent_id, args):\n    return input_path\n```\n"
        "I also changed the header to match the sample."
    )
    out = _parse_code(raw)
    assert out.endswith("return input_path")
    assert "header to match" not in out


def test_prose_only_without_code_returns_input():
    raw = "Looking at the error, I produced 33 rows but 41 expected."
    out = _parse_code(raw)
    assert "Looking at the error" in out
"""_parse_code extracts def-main even when LLM prefixes prose or adds trailing chat."""

from src.services.agent_script_service import _parse_code


def test_plain_codeblock_passes_through():
    raw = "import csv\n\n\ndef main(input_path, output_dir, *, agent_id, args):\n    return input_path\n"
    assert _parse_code(raw) == raw.strip()


def test_strips_markdown_fences():
    raw = "```python\nimport csv\n\n\ndef main(input_path, output_dir, *, agent_id, args):\n    return input_path\n```"
    assert _parse_code(raw).startswith("import csv")
    assert _parse_code(raw).endswith("return input_path")


def test_extracts_code_from_after_prose():
    raw = (
        "Looking at the error, I produced 33 rows but 41 expected. "
        "The issue: I only output rows that have valid dates.\n\n"
        "```python\nimport csv\n\n\ndef main(input_path, output_dir, *, agent_id, args):\n    return input_path\n```"
    )
    out = _parse_code(raw)
    assert out.startswith("import csv")
    assert "def main(" in out
    assert "Looking at the error" not in out


def test_strips_leading_prose_without_fences():
    raw = (
        "Looking at the error, I produced 33 rows but 41 expected.\n"
        "import csv\n\n\ndef main(input_path, output_dir, *, agent_id, args):\n    return input_path\n"
    )
    out = _parse_code(raw)
    assert out.startswith("import csv")
    assert "Looking at the error" not in out


def test_trailing_prose_after_fenced_block_dropped():
    raw = (
        "```python\nimport csv\n\n\ndef main(input_path, output_dir, *, agent_id, args):\n    return input_path\n```\n"
        "I also changed the header to match the sample."
    )
    out = _parse_code(raw)
    assert out.endswith("return input_path")
    assert "header to match" not in out


def test_prose_only_without_code_returns_input():
    raw = "Looking at the error, I produced 33 rows but 41 expected."
    out = _parse_code(raw)
    assert "Looking at the error" in out
