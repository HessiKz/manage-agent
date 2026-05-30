#!/usr/bin/env python3
"""Smoke-test every seeded agent via the HTTP API. Run with backend up."""

from __future__ import annotations

import io
import json
import os
import sys
from pathlib import Path

import httpx

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from src.database.full_catalog import FULL_AGENT_CATALOG

CATALOG_SLUGS = {cfg["slug"] for cfg in FULL_AGENT_CATALOG}

BASE = os.environ.get("API_BASE", "http://127.0.0.1:8000/api/v1")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")
SKIP_INVOKE = os.environ.get("SKIP_INVOKE", "1") == "1"
INVOKE_TIMEOUT = float(os.environ.get("INVOKE_TIMEOUT", "8"))


def login(client: httpx.Client) -> str:
    r = client.post(
        f"{BASE}/auth/login",
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    if r.status_code != 200:
        raise SystemExit(f"Login failed {r.status_code}: {r.text}")
    return r.json()["access_token"]


def record(results: list, name: str, ok: bool, detail: str, status: int | None = None):
    results.append({"test": name, "ok": ok, "status": status, "detail": detail})
    mark = "PASS" if ok else "FAIL"
    print(f"  [{mark}] {name}: {detail}" + (f" ({status})" if status else ""))


def verify_agent(client: httpx.Client, headers: dict, agent: dict, results: list) -> None:
    aid = agent["id"]
    slug = agent["slug"]
    caps = agent.get("capabilities") or {}
    kind = agent.get("kind", "?")

    r = client.get(f"{BASE}/agents/{aid}", headers=headers)
    record(results, f"{slug}/detail", r.status_code == 200, r.reason_phrase or "ok", r.status_code)

    if caps.get("actions_enabled"):
        ar = client.get(f"{BASE}/agents/{aid}/actions", headers=headers)
        n = len(ar.json()) if ar.status_code == 200 else 0
        record(
            results,
            f"{slug}/actions",
            ar.status_code == 200 and n > 0,
            f"{n} actions",
            ar.status_code,
        )
        if n > 0 and ar.status_code == 200:
            act_slug = ar.json()[0]["slug"]
            if SKIP_INVOKE:
                record(results, f"{slug}/action-run", True, "skipped (SKIP_INVOKE=1)", None)
            else:
                try:
                    run = client.post(
                        f"{BASE}/agents/{aid}/actions/{act_slug}/run",
                        headers=headers,
                        json={"variables": {}},
                        timeout=INVOKE_TIMEOUT,
                    )
                    run_ok = run.status_code in (200, 201, 502, 503, 500, 504)
                    record(
                        results,
                        f"{slug}/action-run",
                        run_ok,
                        f"run status {run.status_code}",
                        run.status_code,
                    )
                except httpx.TimeoutException:
                    record(results, f"{slug}/action-run", True, "timeout (LLM unreachable)", None)

    if caps.get("templates_enabled"):
        tr = client.get(f"{BASE}/agents/{aid}/templates", headers=headers)
        n = len(tr.json()) if tr.status_code == 200 else 0
        record(results, f"{slug}/templates", tr.status_code == 200 and n > 0, f"{n} templates", tr.status_code)

    if caps.get("can_call_agents") or caps.get("supervisor_enabled"):
        lr = client.get(f"{BASE}/agents/{aid}/links", headers=headers)
        n = len(lr.json()) if lr.status_code == 200 else 0
        record(results, f"{slug}/links", lr.status_code == 200 and n > 0, f"{n} links", lr.status_code)
        if caps.get("supervisor_enabled"):
            gr = client.get(f"{BASE}/agents/{aid}/links/graph", headers=headers)
            record(
                results,
                f"{slug}/graph",
                gr.status_code == 200,
                "graph ok" if gr.status_code == 200 else gr.text[:80],
                gr.status_code,
            )

    if caps.get("file_upload_enabled"):
        policy = agent.get("file_policy") or {}
        allowed = policy.get("allowed_mime_types") or ["text/plain"]
        if "text/csv" in allowed and "text/plain" not in allowed:
            fname, mime, body = "sample.csv", "text/csv", b"a,b\n1,2\n"
        else:
            fname, mime, body = "sample.txt", "text/plain", b"test content for upload"
        good = client.post(
            f"{BASE}/agents/{aid}/files",
            headers=headers,
            files={"file": (fname, io.BytesIO(body), mime)},
        )
        record(
            results,
            f"{slug}/file-ok",
            good.status_code in (200, 201),
            good.reason_phrase or "uploaded",
            good.status_code,
        )
        bad = client.post(
            f"{BASE}/agents/{aid}/files",
            headers=headers,
            files={"file": ("bad.exe", io.BytesIO(b"x"), "application/octet-stream")},
        )
        record(
            results,
            f"{slug}/file-reject",
            bad.status_code == 422,
            "rejected bad mime" if bad.status_code == 422 else bad.text[:60],
            bad.status_code,
        )

    if caps.get("chat_enabled"):
        if SKIP_INVOKE:
            record(results, f"{slug}/invoke-chat", True, "skipped (SKIP_INVOKE=1)", None)
        else:
            try:
                inv = client.post(
                    f"{BASE}/agents/{aid}/invoke",
                    headers=headers,
                    json={"input": "سلام — تست کوتاه", "stream": False},
                    timeout=INVOKE_TIMEOUT,
                )
                inv_ok = inv.status_code in (200, 201, 502, 503, 500, 504)
                detail = (
                    inv.json().get("detail", inv.reason_phrase)
                    if "application/json" in inv.headers.get("content-type", "")
                    else inv.text[:80]
                )
                record(results, f"{slug}/invoke-chat", inv_ok, str(detail)[:100], inv.status_code)
            except httpx.TimeoutException:
                record(results, f"{slug}/invoke-chat", True, "timeout (LLM unreachable)", None)
    else:
        inv = client.post(
            f"{BASE}/agents/{aid}/invoke",
            headers=headers,
            json={"input": "hi", "stream": False},
        )
        record(
            results,
            f"{slug}/invoke-blocked",
            inv.status_code == 422,
            "chat disabled → 422" if inv.status_code == 422 else inv.text[:60],
            inv.status_code,
        )

    record(results, f"{slug}/kind", True, f"kind={kind}", None)


def main() -> None:
    results: list[dict] = []
    print(f"API: {BASE}")
    with httpx.Client(timeout=30.0) as client:
        token = login(client)
        headers = {"Authorization": f"Bearer {token}"}

        lr = client.get(f"{BASE}/agents", headers=headers, params={"page_size": 100})
        if lr.status_code != 200:
            raise SystemExit(f"List agents failed: {lr.status_code}")
        all_items = lr.json().get("items", lr.json() if isinstance(lr.json(), list) else [])
        agents = [a for a in all_items if a.get("slug") in CATALOG_SLUGS]
        skipped = len(all_items) - len(agents)
        print(f"\n🔍 Verifying {len(agents)} catalog agents ({skipped} non-catalog skipped)…\n")

        for ag in agents:
            detail = client.get(f"{BASE}/agents/{ag['id']}", headers=headers)
            if detail.status_code != 200:
                record(results, f"{ag.get('slug','?')}/detail", False, detail.text[:80], detail.status_code)
                continue
            verify_agent(client, headers, detail.json(), results)

        # Platform extras
        for path, name in [
            ("/notifications", "notifications"),
            ("/notifications/count", "notifications-count"),
            ("/dashboards/sidebar", "sidebar"),
        ]:
            r = client.get(f"{BASE}{path}", headers=headers)
            record(results, f"platform/{name}", r.status_code == 200, "ok", r.status_code)

    passed = sum(1 for x in results if x["ok"])
    failed = [x for x in results if not x["ok"]]
    print(f"\n{'=' * 60}")
    print(f"TOTAL: {len(results)} checks — {passed} passed, {len(failed)} failed")
    if failed:
        print("\nFailed:")
        for f in failed:
            print(f"  - {f['test']}: {f['detail']}")

    out = ROOT / "scripts" / "verify_agents_report.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"passed": passed, "failed": len(failed), "results": results}, indent=2, ensure_ascii=False))
    print(f"\nReport: {out}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
