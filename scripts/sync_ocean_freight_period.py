#!/usr/bin/env python3
"""Sync the FCL rate period when data/ocean-freight.xlsx is uploaded.

The published period is the month in Korea when this script runs. In GitHub Actions
that is the month the replacement Excel file is pushed, so no separate month edit is
required. The workbook's own modified timestamp is kept as audit metadata only.
"""
from __future__ import annotations

import hashlib
import json
import zipfile
from datetime import datetime
from pathlib import Path
from xml.etree import ElementTree as ET
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
XLSX_PATH = ROOT / "data" / "ocean-freight.xlsx"
META_PATH = ROOT / "data" / "ocean-freight-meta.json"
KST = ZoneInfo("Asia/Seoul")


def workbook_modified(path: Path) -> datetime | None:
    try:
        with zipfile.ZipFile(path) as zf:
            raw = zf.read("docProps/core.xml")
        root = ET.fromstring(raw)
        node = root.find("{http://purl.org/dc/terms/}modified")
        if node is None or not (node.text or "").strip():
            return None
        text = node.text.strip().replace("Z", "+00:00")
        value = datetime.fromisoformat(text)
        if value.tzinfo is None:
            value = value.replace(tzinfo=KST)
        return value.astimezone(KST)
    except Exception:
        return None


def main() -> None:
    if not XLSX_PATH.exists():
        raise SystemExit(f"Missing {XLSX_PATH}")

    uploaded_at = datetime.now(KST)
    period = uploaded_at.strftime("%Y-%m")
    year, month = map(int, period.split("-"))
    modified = workbook_modified(XLSX_PATH)
    sha256 = hashlib.sha256(XLSX_PATH.read_bytes()).hexdigest()

    payload = {
        "period": period,
        "periodLabel": f"{year}년 {month}월",
        "compact": f"{year}.{month:02d}",
        "basis": "FCL 해상 기본운임",
        "periodBasis": "ocean-freight.xlsx 업로드월(KST)",
        "sourceFile": "data/ocean-freight.xlsx",
        "syncedAt": uploaded_at.isoformat(timespec="seconds"),
        "sourceModifiedAt": modified.isoformat(timespec="seconds") if modified else None,
        "sourceSha256": sha256,
    }
    META_PATH.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"FCL period synced: {payload['periodLabel']} ({sha256[:12]})")


if __name__ == "__main__":
    main()
