"""Serve generated demo report files."""

from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from src.demo.reports import REPORTS_DIR
from src.karkard.output import KARKARD_OUTPUT_DIR

router = APIRouter()


@router.get("/demo-files/reports/{filename}")
async def download_demo_report(filename: str):
    safe = Path(filename).name
    path = REPORTS_DIR / safe
    if not path.is_file():
        txt = REPORTS_DIR / f"{Path(safe).stem}.txt"
        if txt.is_file():
            return FileResponse(txt, media_type="text/plain", filename=txt.name)
        raise HTTPException(status_code=404, detail="Report not found")
    return FileResponse(path, media_type="application/pdf", filename=safe)


def _resolve_karkard_file(safe: str) -> Path | None:
    primary = KARKARD_OUTPUT_DIR / safe
    if primary.is_file():
        return primary
    agent_root = Path("var/agent_files")
    if not agent_root.is_dir():
        return None
    matches = [p for p in agent_root.rglob(safe) if p.is_file()]
    if matches:
        return max(matches, key=lambda p: p.stat().st_mtime)
    return None


@router.get("/demo-files/karkard/{filename}")
async def download_karkard_output(filename: str):
    safe = Path(filename).name
    path = _resolve_karkard_file(safe)
    if not path:
        raise HTTPException(status_code=404, detail="Karkard output not found")
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=safe,
    )
