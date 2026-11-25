"""Inline the source files into one self-contained index.html.

Usage:  python3 build.py
Edit files in src/, then run this to regenerate index.html in the repo root.
"""
from pathlib import Path

root = Path(__file__).parent
src = root / "src"
html = (src / "index.src.html").read_text(encoding="utf-8")
for marker, name in [("/*LBM*/", "lbm.js"), ("/*PHYS*/", "physics.js"), ("/*R3D*/", "render3d.js"), ("/*APP*/", "app.js")]:
    html = html.replace(marker, (src / name).read_text(encoding="utf-8"))
(root / "index.html").write_text(html, encoding="utf-8")
print(f"Wrote index.html ({len(html):,} bytes)")
