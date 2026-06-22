#!/usr/bin/env python3
import argparse
import csv
import os
import sqlite3
from pathlib import Path

DEFAULT_TABLES = ["runs", "event_log", "relationship_snapshots"]
MAX_BYTES_DEFAULT = 50 * 1024 * 1024

def get_tables(conn, requested):
    if requested:
        return requested
    rows = conn.execute("""
        SELECT name
        FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
    """).fetchall()
    return [r[0] for r in rows]

def safe_size(path):
    return path.stat().st_size if path.exists() else 0

def export_table_chunked(conn, table, out_dir, max_bytes):
    cur = conn.cursor()
    cur.execute(f"SELECT * FROM {table}")
    cols = [d[0] for d in cur.description]

    part = 1
    row_count = 0
    file_row_count = 0
    out_path = out_dir / f"{table}_part{part:03d}.csv"
    f = out_path.open("w", newline="", encoding="utf-8")
    writer = csv.writer(f)
    writer.writerow(cols)

    try:
        while True:
            row = cur.fetchone()
            if row is None:
                break

            writer.writerow(row)
            row_count += 1
            file_row_count += 1

            if file_row_count % 1000 == 0:
                f.flush()
                if safe_size(out_path) >= max_bytes:
                    f.close()
                    part += 1
                    file_row_count = 0
                    out_path = out_dir / f"{table}_part{part:03d}.csv"
                    f = out_path.open("w", newline="", encoding="utf-8")
                    writer = csv.writer(f)
                    writer.writerow(cols)
    finally:
        f.close()

    return row_count, part

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--db",
        default="./headless-runs/sims-headless.sqlite",
        help="Path al file SQLite"
    )
    ap.add_argument(
        "--out",
        default="./headless-runs/csv-export",
        help="Cartella output CSV"
    )
    ap.add_argument(
        "--max-mb",
        type=float,
        default=49.0,
        help="Dimensione massima per file CSV in MB (default 49)"
    )
    ap.add_argument(
        "--tables",
        nargs="*",
        default=None,
        help="Tabelle da esportare, es: runs event_log relationship_snapshots"
    )
    args = ap.parse_args()

    db_path = Path(args.db)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    max_bytes = int(args.max_mb * 1024 * 1024)

    conn = sqlite3.connect(db_path)
    try:
        tables = get_tables(conn, args.tables)
        if not tables:
            print("Nessuna tabella trovata.")
            return

        print(f"DB: {db_path}")
        print(f"Output: {out_dir}")
        print(f"Max per file: {args.max_mb} MB")
        print("Tabelle:", ", ".join(tables))

        for table in tables:
            rows, parts = export_table_chunked(conn, table, out_dir, max_bytes)
            print(f"- {table}: {rows} righe, {parts} file")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
