"""
test_pipeline.py - Pin the core IFC loop's measured numbers (handoff appendix).

Every assertion calls a module function directly and checks its structured
return value; stdout is never parsed (the modules print non-ASCII logs, so
parsing would be both fragile and ASCII-unsafe). Fixtures synthesize IFC into a
tmp dir with the existing generators, so there are no committed binary fixtures.
ASCII-only by repo convention.
"""
from __future__ import annotations

import sqlite3

import pytest

import catalog
import extract_ifc
import infer_edges
import make_sample_ifc
import make_series_ifc
import paramdb
import propagate
import regen_ifc


@pytest.fixture
def sample_db(tmp_path):
    """Extract the metre-unit sample (EN81 violation planted) into a fresh db."""
    ifc = tmp_path / "sample.ifc"
    make_sample_ifc.build(ifc)
    db = tmp_path / "out.db"
    counts = extract_ifc.extract(ifc, db)
    return db, counts


@pytest.fixture
def series_db(tmp_path):
    """Extract a 5-drawing series with planted relations into a fresh db."""
    outdir = tmp_path / "series"
    make_series_ifc.build_series(outdir, 5)
    db = tmp_path / "series.db"
    for f in sorted(outdir.glob("series_*.ifc")):
        extract_ifc.extract(f, db)
    return db


# --- extract -------------------------------------------------------------

def test_extract_coverage_and_review(sample_db):
    _, c = sample_db
    assert c["param_total"] == 10
    assert c["param_mapped"] == 9          # standard mapping 9/10 -> coverage 90%
    assert c["review"] == 2                # FireRating unmapped + shaft type conf 0.6 < 0.7
    assert c["validation_issue"] == 1      # door_width 1200 > car_width 1100


# --- propagate -----------------------------------------------------------

def test_propagate_dependents_and_en81(sample_db):
    db, _ = sample_db
    conn = sqlite3.connect(str(db))
    model = propagate.ParametricModel(conn, 1)
    baseline = model.solve()
    modified = model.solve(overrides={"car_width": 1300.0})
    conn.close()

    assert baseline["shaft_width"]["value"] == 1600
    assert modified["shaft_width"]["value"] == 1800
    assert baseline["shaft_area"]["value"] == 2880000
    assert modified["shaft_area"]["value"] == 3240000

    def vals_of(solved):
        out = dict(model.independent)
        out.update({k: d["value"] for k, d in solved.items() if d.get("value") is not None})
        return out

    assert len(paramdb.check_en81(vals_of(baseline))) == 1    # baseline 1 violation
    assert len(paramdb.check_en81(vals_of(modified))) == 0    # resolved after change


# --- infer_edges ---------------------------------------------------------

def test_infer_rediscovers_door_height(series_db):
    r = infer_edges.infer(series_db, 0.99, False, ["car_height"])
    assert len(r["proposals"]) == 1
    target, _expr, pred, r2 = r["proposals"][0]
    assert target == "door_height"          # door_height = car_height - 100
    assert pred == "car_height"
    assert r2 == 1.0                        # perfect linear fit
    weak_targets = {w.split()[0] for w in r["weak"]}
    assert "car_depth" in weak_targets      # below 0.99 threshold
    assert "car_width" in weak_targets


# --- regen_ifc -----------------------------------------------------------

def test_regen_reverse_verify_passes(sample_db, tmp_path):
    db, _ = sample_db
    out_ifc = tmp_path / "regen.ifc"
    # The sample db has no solved_parameter, so read_params falls back to the
    # measured values (car_width 1100 ...), matching the appendix's 7 axes.
    rc = regen_ifc.regen(db, out_ifc, "modified", 1)
    assert rc == 0                          # all axes within tolerance

    conn = sqlite3.connect(str(db))
    params, source = regen_ifc.read_params(conn, 1, "modified")
    conn.close()
    assert source == "parameter(measured)"
    assert params["car_width"] == 1100
    assert params["shaft_width"] == 1600

    results = regen_ifc.reverse_verify(out_ifc, params)
    assert len(results) == 7                # car 3 + shaft 2 + door 2
    assert all(ok for *_rest, ok in results)


# --- catalog bootstrap ---------------------------------------------------

def test_catalog_register_then_match(tmp_path):
    ifc = tmp_path / "sample.ifc"
    make_sample_ifc.build(ifc)
    db = tmp_path / "catalog.db"

    extract_ifc.extract(ifc, db)            # drawing 1
    reg = catalog.register(db, 1)
    assert len(reg["registered"]) == 3      # car, door, shaft
    assert len(reg["skipped"]) == 0

    reg2 = catalog.register(db, 1)          # re-register -> all skipped (dedup)
    assert len(reg2["registered"]) == 0
    assert len(reg2["skipped"]) == 3

    extract_ifc.extract(ifc, db)            # drawing 2 (same kind)
    m = catalog.match(db, 2)
    assert len(m["matched"]) == 3           # deterministic match
    assert len(m["unmatched"]) == 0
    assert m["classifier_calls"] == 0       # AI dependence: zero
