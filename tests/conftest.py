"""Make the repo root importable so tests can import the pipeline modules
(extract_ifc, paramdb, ...) which live at the project root."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
