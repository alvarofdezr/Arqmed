from __future__ import annotations

import csv
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from src.bc3_parser import parse_bc3_file


def _create_metadata_table(cur: sqlite3.Cursor, meta: dict[str, Any]) -> None:
    cur.execute(
        """
        CREATE TABLE project_metadata (
            key TEXT PRIMARY KEY,
            value TEXT
        )
        """
    )
    for k, v in meta.items():
        val_str = json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else str(v)
        cur.execute("INSERT INTO project_metadata (key, value) VALUES (?, ?)", (k, val_str))


def _create_concepts_table(cur: sqlite3.Cursor, concepts: dict[str, dict[str, Any]]) -> None:
    cur.execute(
        """
        CREATE TABLE concepts (
            code TEXT PRIMARY KEY,
            unit TEXT,
            summary TEXT,
            price REAL,
            date TEXT,
            type_code TEXT,
            description TEXT,
            aliases_json TEXT,
            tech_params_json TEXT
        )
        """
    )
    cur.executemany(
        """
        INSERT INTO concepts (code, unit, summary, price, date, type_code, description, aliases_json, tech_params_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            (
                c["code"],
                c["unit"],
                c["summary"],
                c["price"],
                c["date"],
                c["type_code"],
                c["description"],
                json.dumps(c["aliases"], ensure_ascii=False),
                json.dumps(c["tech_params"], ensure_ascii=False),
            )
            for c in concepts.values()
        ],
    )


def _create_matrix_table(
    cur: sqlite3.Cursor,
    matrix: list[dict[str, Any]],
    max_lvl: int,
) -> None:
    lvl_cols_ddl = ",\n            ".join(
        f"level_{i}_code TEXT,\n            level_{i}_title TEXT" for i in range(1, max_lvl + 1)
    )
    if lvl_cols_ddl:
        lvl_cols_ddl += ","

    cur.execute(
        f"""
        CREATE TABLE budget_matrix (
            row_id INTEGER PRIMARY KEY,
            parent_row_id INTEGER,
            depth INTEGER,
            node_role TEXT,
            chapter_depth INTEGER,
            path_codes TEXT,
            path_titles TEXT,
            {lvl_cols_ddl}
            partida_code TEXT,
            partida_title TEXT,
            parent_code TEXT,
            code TEXT,
            unit TEXT,
            summary TEXT,
            description TEXT,
            type_code TEXT,
            unit_price REAL,
            factor REAL,
            yield_qty REAL,
            local_qty REAL,
            local_amount REAL,
            total_budget_qty REAL,
            total_budget_amount REAL,
            budget_share_pct REAL,
            measurement_id INTEGER,
            measurement_total REAL,
            measurement_lines_count INTEGER,
            breakdown_material REAL,
            breakdown_mano_obra REAL,
            breakdown_maquinaria REAL,
            breakdown_otros REAL
        )
        """
    )

    if matrix:
        cols = list(matrix[0].keys())
        placeholders = ", ".join("?" for _ in cols)
        col_names = ", ".join(cols)
        cur.executemany(
            f"INSERT INTO budget_matrix ({col_names}) VALUES ({placeholders})",
            [tuple(r[c] for c in cols) for r in matrix],
        )


def _create_measurements_tables(
    cur: sqlite3.Cursor,
    measurements: list[dict[str, Any]],
) -> None:
    cur.execute(
        """
        CREATE TABLE measurements (
            measurement_id INTEGER PRIMARY KEY,
            matrix_row_id INTEGER,
            parent_code TEXT,
            child_code TEXT,
            position TEXT,
            total_measured REAL,
            label TEXT,
            lines_count INTEGER,
            path_codes TEXT,
            path_titles TEXT
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE measurement_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            measurement_id INTEGER,
            parent_code TEXT,
            child_code TEXT,
            line_index INTEGER,
            line_type TEXT,
            comment TEXT,
            units REAL,
            length REAL,
            width REAL,
            height REAL,
            subtotal REAL
        )
        """
    )

    m_rows = []
    ml_rows = []
    for m in measurements:
        m_rows.append(
            (
                m["measurement_id"],
                m.get("matrix_row_id"),
                m["parent_code"],
                m["child_code"],
                m["position"],
                m["total_measured"],
                m["label"],
                m["lines_count"],
                m.get("path_codes", ""),
                m.get("path_titles", ""),
            )
        )
        for line in m["lines"]:
            ml_rows.append(
                (
                    m["measurement_id"],
                    m["parent_code"],
                    m["child_code"],
                    line["line_index"],
                    line["line_type"],
                    line["comment"],
                    line["units"],
                    line["length"],
                    line["width"],
                    line["height"],
                    line["subtotal"],
                )
            )

    cur.executemany(
        "INSERT INTO measurements VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        m_rows,
    )
    cur.executemany(
        """
        INSERT INTO measurement_lines
        (measurement_id, parent_code, child_code, line_index, line_type, comment, units, length, width, height, subtotal)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        ml_rows,
    )


def _create_indexes(cur: sqlite3.Cursor, max_lvl: int) -> None:
    cur.execute("CREATE INDEX idx_matrix_role ON budget_matrix(node_role)")
    cur.execute("CREATE INDEX idx_matrix_code ON budget_matrix(code)")
    cur.execute("CREATE INDEX idx_matrix_parent_row ON budget_matrix(parent_row_id)")
    for i in range(1, max_lvl + 1):
        cur.execute(f"CREATE INDEX idx_matrix_lvl_{i} ON budget_matrix(level_{i}_code)")
    cur.execute("CREATE INDEX idx_ml_meas_id ON measurement_lines(measurement_id)")


def export_sqlite(data: dict[str, Any], db_path: Path) -> None:
    if db_path.exists():
        db_path.unlink()

    meta = data["metadata"]
    max_lvl = meta["max_chapter_depth"]

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    _create_metadata_table(cur, meta)
    _create_concepts_table(cur, data["concepts"])
    _create_matrix_table(cur, data["budget_matrix"], max_lvl)
    _create_measurements_tables(cur, data["measurements"])
    _create_indexes(cur, max_lvl)

    conn.commit()
    conn.close()


def _export_matrix_csv(matrix: list[dict[str, Any]], csv_path: Path) -> None:
    if not matrix:
        return
    fieldnames = list(matrix[0].keys())
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, delimiter=";")
        writer.writeheader()
        writer.writerows(matrix)


def _export_measurements_csv(measurements: list[dict[str, Any]], csv_path: Path) -> None:
    m_fields = [
        "measurement_id",
        "matrix_row_id",
        "parent_code",
        "child_code",
        "path_codes",
        "path_titles",
        "total_measured",
        "line_index",
        "line_type",
        "comment",
        "units",
        "length",
        "width",
        "height",
        "subtotal",
    ]
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=m_fields, delimiter=";")
        writer.writeheader()
        for m in measurements:
            for line in m["lines"]:
                writer.writerow(
                    {
                        "measurement_id": m["measurement_id"],
                        "matrix_row_id": m.get("matrix_row_id"),
                        "parent_code": m["parent_code"],
                        "child_code": m["child_code"],
                        "path_codes": m.get("path_codes", ""),
                        "path_titles": m.get("path_titles", ""),
                        "total_measured": m["total_measured"],
                        "line_index": line["line_index"],
                        "line_type": line["line_type"],
                        "comment": line["comment"],
                        "units": line["units"],
                        "length": line["length"],
                        "width": line["width"],
                        "height": line["height"],
                        "subtotal": line["subtotal"],
                    }
                )


def export_all(data: dict[str, Any], output_dir: str | Path) -> dict[str, Path]:
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    sqlite_path = out / "presupuesto.db"
    json_path = out / "presupuesto_completo.json"
    js_bundle_path = out / "presupuesto_data.js"
    matrix_csv_path = out / "matriz_presupuesto.csv"
    measurements_csv_path = out / "mediciones_detalle.csv"

    export_sqlite(data, sqlite_path)

    json_str = json.dumps(data, ensure_ascii=False, indent=2)
    json_path.write_text(json_str, encoding="utf-8")

    compact_json = json.dumps(data, ensure_ascii=False)
    js_bundle_path.write_text(
        f"window.__INITIAL_BC3_DATA__ = {compact_json};\n",
        encoding="utf-8",
    )

    _export_matrix_csv(data["budget_matrix"], matrix_csv_path)
    _export_measurements_csv(data["measurements"], measurements_csv_path)

    return {
        "sqlite": sqlite_path,
        "json": json_path,
        "js_bundle": js_bundle_path,
        "matrix_csv": matrix_csv_path,
        "measurements_csv": measurements_csv_path,
    }


def resolve_default_bc3_path(base_dir: Path) -> Path:
    data_dir = base_dir / "data"
    if data_dir.is_dir():
        candidates = sorted(data_dir.glob("*.bc3"))
        if candidates:
            return candidates[0]
    root_candidates = sorted(base_dir.glob("*.bc3"))
    if root_candidates:
        return root_candidates[0]
    raise FileNotFoundError(f"No .bc3 file found in '{data_dir}' or '{base_dir}'")


def main() -> None:
    base_dir = Path(__file__).resolve().parent.parent
    src_bc3 = Path(sys.argv[1]) if len(sys.argv) > 1 else resolve_default_bc3_path(base_dir)
    dest_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else base_dir / "output"
    parsed = parse_bc3_file(src_bc3)
    exported = export_all(parsed, dest_dir)
    print(f"Exported BC3 '{src_bc3.name}' to '{dest_dir}':")
    for k, p in exported.items():
        print(f"  - {k}: {p} ({p.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
