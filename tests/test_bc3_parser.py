from pathlib import Path
from src.bc3_exporter import resolve_default_bc3_path
from src.bc3_parser import parse_bc3_bytes, parse_bc3_file

BC3_PATH = resolve_default_bc3_path(Path(__file__).resolve().parent.parent)


def test_parse_arqmed_reference_counts_and_totals() -> None:
    data = parse_bc3_file(BC3_PATH)
    meta = data["metadata"]
    root_row = next(r for r in data["budget_matrix"] if r["node_role"] == "ROOT")
    assert meta["root_code"] == root_row["code"]
    assert meta["root_code"] in data["concepts"]
    assert meta["root_total"] > 0
    assert abs(meta["root_total"] - root_row["total_budget_amount"]) < 0.05
    assert meta["max_chapter_depth"] >= 1
    assert meta["counts"]["concepts"] == len(data["concepts"])
    assert meta["counts"]["measurements"] == len(data["measurements"])
    assert meta["counts"]["matrix_rows"] == len(data["budget_matrix"])


def test_dynamic_chapter_levels_and_roles() -> None:
    data = parse_bc3_file(BC3_PATH)
    matrix = data["budget_matrix"]
    roles = {r["node_role"] for r in matrix}
    assert {"ROOT", "CAPITULO", "PARTIDA"}.issubset(roles)
    partidas = [r for r in matrix if r["node_role"] == "PARTIDA"]
    assert len(partidas) > 0
    deep_partida = max(partidas, key=lambda r: r["depth"])
    assert deep_partida["level_1_code"] is not None
    path_parts = [p.strip() for p in deep_partida["path_codes"].split(">")]
    for lvl in range(1, data["metadata"]["max_chapter_depth"] + 1):
        lvl_code = deep_partida.get(f"level_{lvl}_code")
        if lvl_code is not None:
            assert lvl_code in path_parts


def test_measurement_lines_and_edge_cases() -> None:
    data = parse_bc3_file(BC3_PATH)
    measurements_with_dims = [
        m
        for m in data["measurements"]
        if any(l["subtotal"] is not None and l["units"] is not None for l in m["lines"])
    ]
    assert len(measurements_with_dims) > 0
    m_item = measurements_with_dims[0]
    dim_line = next(l for l in m_item["lines"] if l["subtotal"] is not None and l["units"] is not None)
    dims = [
        d
        for d in (dim_line["units"], dim_line["length"], dim_line["width"], dim_line["height"])
        if d is not None
    ]
    expected_prod = 1.0
    for d in dims:
        expected_prod *= d
    assert abs(dim_line["subtotal"] - expected_prod) < 1e-4

    header_lines = [
        l
        for m in data["measurements"]
        for l in m["lines"]
        if l["subtotal"] is None and l["comment"]
    ]
    if header_lines:
        assert header_lines[0]["subtotal"] is None


def test_synonyms_commas_and_cycle_guard() -> None:
    synthetic = (
        "~V|TEST|FIEBDC-3/2020|TEST||UTF-8|Presupuesto|2|\n"
        "~C|OBRA##||Obra Test|100,50||0|\n"
        "~C|CAP_A#|m2|Capitulo con nombre raro|100,50||0|\n"
        "~C|P1\\P1_ALIAS|m2|Partida con alias|10,05||0|\n"
        "~D|OBRA##|CAP_A#\\\\1\\|\n"
        "~D|CAP_A#|P1_ALIAS\\\\10\\|\n"
        "~M|CAP_A#\\P1_ALIAS|1\\1\\|10|\\Linea unica\\10\\\\\\|\n"
    ).encode("utf-8")
    res = parse_bc3_bytes(synthetic, "synthetic.bc3")
    partida = next(r for r in res["budget_matrix"] if r["node_role"] == "PARTIDA")
    assert partida["code"] == "P1"
    assert abs(partida["local_amount"] - 100.50) < 0.01
    assert partida["measurement_lines_count"] == 1
