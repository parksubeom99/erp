#!/usr/bin/env python3
"""
catalog.py - Catalog bootstrap (Step 7): register extracted component patterns,
then deterministically re-match them on later drawings.

Honest framing: the IFC path is already deterministic (RuleBased typing lives in
extract_ifc; the Vision classifier in classifier.py stays a stub). This module
does not switch off a running AI call. It proves the mechanism "classify and
register once -> match later by component_type", which is what removes the need
for AI on subsequent drawings.

Core reuse (no duplicate definitions, per scope rule): component_type and the
canonical parameter names are read straight from the DB, where extract_ifc wrote
them earlier using paramdb. No standard dictionary or parameter name is redefined
here.

Usage:
    python catalog.py register <db> [--drawing N]
    python catalog.py match    <db> [--drawing N]
"""
from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path


def drawing_meta(conn: sqlite3.Connection, drawing_id: int) -> tuple[str | None, str | None]:
    """Return (manufacturer, series) for a drawing (both may be NULL)."""
    row = conn.execute(
        "SELECT manufacturer, series FROM source_drawing WHERE id = ?",
        (drawing_id,),
    ).fetchone()
    if row is None:
        return None, None
    return row[0], row[1]


def build_templates(conn: sqlite3.Connection, drawing_id: int) -> dict[tuple, dict[str, float]]:
    """Group a drawing's components into {(component_type, manufacturer, series):
    {canonical_name: value}}. Canonical names come from the parameter table as
    written by extract_ifc/paramdb (read-only here)."""
    manufacturer, series = drawing_meta(conn, drawing_id)
    templates: dict[tuple, dict[str, float]] = {}
    for comp_id, ctype in conn.execute(
        "SELECT id, component_type FROM component WHERE drawing_id = ?",
        (drawing_id,),
    ).fetchall():
        key = (ctype, manufacturer, series)
        tmpl = templates.setdefault(key, {})
        for canonical, value in conn.execute(
            "SELECT canonical_name, value FROM parameter "
            "WHERE component_id = ? AND canonical_name IS NOT NULL AND value IS NOT NULL",
            (comp_id,),
        ):
            tmpl.setdefault(canonical, value)
    return templates


def existing_keys(conn: sqlite3.Connection) -> dict[tuple, int]:
    """Map (component_type, manufacturer, series) -> catalog_item.id."""
    return {
        (ctype, mfr, series): cid
        for cid, ctype, mfr, series in conn.execute(
            "SELECT id, component_type, manufacturer, series FROM catalog_item"
        )
    }


def register(db_path: Path, drawing_id: int) -> dict:
    """Register a drawing's component patterns into catalog_item. Dedup by
    (component_type, manufacturer, series); existing keys are skipped."""
    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA foreign_keys = ON")
    templates = build_templates(conn, drawing_id)
    known = existing_keys(conn)
    registered, skipped = [], []
    for key, tmpl in sorted(templates.items()):
        ctype, mfr, series = key
        if key in known:
            skipped.append(key)
            continue
        conn.execute(
            "INSERT INTO catalog_item (component_type, manufacturer, series, param_template) "
            "VALUES (?,?,?,?)",
            (ctype, mfr, series, json.dumps(tmpl, sort_keys=True)),
        )
        registered.append(key)
    conn.commit()
    conn.close()
    return {"registered": registered, "skipped": skipped, "templates": templates}


def match(db_path: Path, drawing_id: int) -> dict:
    """Deterministically match a drawing against the catalog by component_type
    key. No classifier is invoked (classifier_calls is always 0). Matched items
    reuse the registered param_template and skip type review."""
    conn = sqlite3.connect(str(db_path))
    templates = build_templates(conn, drawing_id)
    known = {
        (ctype, mfr, series): (cid, tmpl)
        for cid, ctype, mfr, series, tmpl in conn.execute(
            "SELECT id, component_type, manufacturer, series, param_template FROM catalog_item"
        )
    }
    conn.close()
    matched, unmatched = [], []
    for key, _tmpl in sorted(templates.items()):
        if key in known:
            cid, cat_tmpl = known[key]
            reused = sorted(json.loads(cat_tmpl)) if cat_tmpl else []
            matched.append((key, cid, reused))
        else:
            unmatched.append(key)
    return {"matched": matched, "unmatched": unmatched, "classifier_calls": 0}


def _fmt_key(key: tuple) -> str:
    ctype, mfr, series = key
    if mfr or series:
        return "%s (%s/%s)" % (ctype, mfr or "-", series or "-")
    return ctype


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Catalog bootstrap: register/match component patterns (deterministic)")
    sub = parser.add_subparsers(dest="cmd", required=True)
    pr = sub.add_parser("register", help="register a drawing's components into catalog_item")
    pr.add_argument("db")
    pr.add_argument("--drawing", type=int, default=1)
    pm = sub.add_parser("match", help="deterministically match a drawing against the catalog")
    pm.add_argument("db")
    pm.add_argument("--drawing", type=int, default=1)
    args = parser.parse_args(argv)

    if not Path(args.db).exists():
        print("[error] DB not found: %s" % args.db, file=sys.stderr)
        return 1

    if args.cmd == "register":
        r = register(Path(args.db), args.drawing)
        print("[register] drawing %d -> catalog_item" % args.drawing)
        print("  registered %d, skipped(existing) %d"
              % (len(r["registered"]), len(r["skipped"])))
        for key in r["registered"]:
            tmpl = r["templates"][key]
            print("    + %-12s params=%d %s" % (_fmt_key(key), len(tmpl), sorted(tmpl)))
        for key in r["skipped"]:
            print("    = %-12s (already in catalog)" % _fmt_key(key))
        return 0

    # match
    r = match(Path(args.db), args.drawing)
    print("[match] drawing %d vs catalog (deterministic, by component_type)" % args.drawing)
    print("  matched %d, unmatched %d, classifier(vision) calls %d"
          % (len(r["matched"]), len(r["unmatched"]), r["classifier_calls"]))
    for key, cid, reused in r["matched"]:
        print("    ok  %-12s -> catalog_item#%d  reuse=%s (review skipped)"
              % (_fmt_key(key), cid, reused))
    for key in r["unmatched"]:
        print("    new %-12s (no catalog entry; would need classify+register)" % _fmt_key(key))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
