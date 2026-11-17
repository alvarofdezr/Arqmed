import sqlite3
from pathlib import Path
from src.bc3_exporter import export_all, resolve_default_bc3_path
from src.bc3_parser import parse_bc3_file

BASE_DIR = Path(__file__).resolve().parent.parent
BC3_PATH = resolve_default_bc3_path(BASE_DIR)


def test_export_all_creates_sqlite_json_csv(tmp_path: Path) -> None:
    data = parse_bc3_file(BC3_PATH)
    paths = export_all(data, tmp_path)
    assert paths["sqlite"].exists()
    assert paths["json"].exists()
    assert paths["js_bundle"].exists()
    assert paths["matrix_csv"].exists()
    assert paths["measurements_csv"].exists()

    expected_matrix_count = len(data["budget_matrix"])
    expected_partidas_count = sum(1 for r in data["budget_matrix"] if r["node_role"] == "PARTIDA")
    expected_lines_count = sum(m["lines_count"] for m in data["measurements"])

    conn = sqlite3.connect(paths["sqlite"])
    cur = conn.cursor()
    matrix_count = cur.execute("SELECT COUNT(*) FROM budget_matrix").fetchone()[0]
    partidas_count = cur.execute("SELECT COUNT(*) FROM budget_matrix WHERE node_role = 'PARTIDA'").fetchone()[0]
    m_lines_count = cur.execute("SELECT COUNT(*) FROM measurement_lines").fetchone()[0]
    conn.close()

    assert matrix_count == expected_matrix_count
    assert partidas_count == expected_partidas_count
    assert m_lines_count == expected_lines_count


def test_dashboard_files_and_preloaded_bundle_exist() -> None:
    assert (BASE_DIR / "dashboard" / "index.html").exists()
    assert (BASE_DIR / "dashboard" / "styles.css").exists()
    assert (BASE_DIR / "dashboard" / "app.js").exists()
    assert (BASE_DIR / "dashboard" / "menubar.js").exists()
    assert (BASE_DIR / "output" / "presupuesto_data.js").exists()
    assert (BASE_DIR / "dashboard" / "presupuesto_data.js").exists()
