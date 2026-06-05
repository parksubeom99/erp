#!/usr/bin/env bash
# One-shot demo: elevator CAD -> parametric DB full loop (IFC path only).
# ASCII-only, LF line endings (Git Bash). See the demo narration markdown for commentary.
set -euo pipefail

# Force UTF-8 stdout so module logs (Korean + em-dash) do not crash under a
# non-UTF-8 locale (e.g. Git Bash on a CP949 Windows host).
export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8

# Resolve python: venv first, then fallbacks.
PY=".venv/Scripts/python"
[ -x "$PY" ] || PY=".venv/bin/python"
[ -x "$PY" ] || PY="python"

echo "== ELEVATOR CAD -> PARAMETRIC DB : ONE-SHOT DEMO =="
echo "python: $PY"

# Clean previous artifacts for reproducibility.
rm -f sample.ifc out.db series.db regen.ifc regen.png
rm -rf series

echo ""
echo "== STAGE 1: synthesize a sample IFC (metre units, EN81 violation planted) =="
"$PY" make_sample_ifc.py sample.ifc

echo ""
echo "== STAGE 2: extract IFC -> parametric DB (coverage, unit -> mm, EN81) =="
"$PY" extract_ifc.py sample.ifc out.db

echo ""
echo "== STAGE 3: synthesize a 5-drawing series with planted relations =="
"$PY" make_series_ifc.py series --n 5
for f in series/series_*.ifc; do "$PY" extract_ifc.py "$f" series.db; done

echo ""
echo "== STAGE 4: infer dependency edges from data (rediscover door_height = car_height - 100) =="
"$PY" infer_edges.py series.db --drivers car_width,car_depth,car_height

echo ""
echo "== STAGE 5: propagate one change (car_width 1100 -> 1300); dependents recompute; EN81 re-check =="
"$PY" propagate.py out.db --set car_width=1300 --write

echo ""
echo "== STAGE 6: regenerate 3D from propagated params + reverse-verify (bbox == params) =="
"$PY" regen_ifc.py out.db regen.ifc --scenario modified

echo ""
echo "== STAGE 7: headless render of regenerated 3D -> PNG (visual QA) =="
"$PY" render_ifc.py regen.ifc regen.png

echo ""
echo "== STAGE 8: measure extraction quality (coverage / EN81 / review queue) =="
"$PY" measure.py out.db

echo ""
echo "== DEMO COMPLETE =="
echo "artifacts (gitignored): out.db series.db regen.ifc regen.png"
