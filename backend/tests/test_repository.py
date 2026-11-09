# Copyright 2026 Soham Raut
# SPDX-License-Identifier: Apache-2.0

"""Guards the project's credit: the licence, the NOTICE and the author header in every source file."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKIP = {"venv", ".venv", "node_modules", "__pycache__", "site-packages", "dist"}


def test_licence_and_notice_credit_the_author():
    assert "Apache License" in (ROOT / "LICENSE").read_text() and "Version 2.0" in (ROOT / "LICENSE").read_text()
    assert "Soham Raut" in (ROOT / "NOTICE").read_text()


def test_every_source_file_carries_the_licence_header():
    files = [*(ROOT / "backend").rglob("*.py"), *(ROOT / "frontend" / "src").rglob("*.js*"), *(ROOT / "frontend" / "scripts").rglob("*.mjs")]
    missing = []
    for path in files:
        if SKIP & set(path.parts):
            continue
        text = path.read_text(encoding="utf-8")
        if text.strip() and "SPDX-License-Identifier: Apache-2.0" not in text:
            missing.append(str(path.relative_to(ROOT)))
    assert not missing, "Add the two-line licence header (see CONTRIBUTING.md) to: " + ", ".join(missing)
