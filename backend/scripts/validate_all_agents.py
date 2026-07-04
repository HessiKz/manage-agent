"""Audit tool/config sanity across every agent — the 'hundreds of agents' test.

Run: python -m scripts.validate_all_agents
Exits non-zero if any non-fixable issue is found.
"""

from __future__ import annotations

import asyncio
import json
import sys

from src.database.session import async_session_maker
from src.services.agent_batch_validation import audit_agents


async def _run() -> dict:
    async with async_session_maker() as db:
        return await audit_agents(db)


def main() -> None:
    report = asyncio.run(_run())
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print(
        f"\nagents={report['agents_total']} "
        f"with_issues={report['agents_with_issues']} "
        f"fixable={report['issues_fixable']} unfixable={report['issues_unfixable']}"
    )
    sys.exit(0 if report["ok"] else 1)


if __name__ == "__main__":
    main()
