from collections import Counter
from pathlib import Path
from src.bc3_editor import (
    apply_selective_concept_edit,
    export_bc3_string,
    preview_concept_edit,
    update_measurement_lines,
)
from src.bc3_exporter import resolve_default_bc3_path
from src.bc3_parser import parse_bc3_bytes, parse_bc3_file

BC3_PATH = resolve_default_bc3_path(Path(__file__).resolve().parent.parent)


def test_preview_and_selective_edit_on_shared_steel_resource() -> None:
    data = parse_bc3_file(BC3_PATH)
    original_total = data["metadata"]["root_total"]

    leaf_rows = [
        r
        for r in data["budget_matrix"]
        if r["node_role"] in ("MATERIAL", "MANO_OBRA", "MAQUINARIA")
        and float(r["unit_price"]) > 0
        and float(r["total_budget_qty"]) > 0
    ]
    counts = Counter(r["code"] for r in leaf_rows)
    shared_code = next(code for code, cnt in counts.most_common() if cnt >= 2)
    orig_price = float(next(r["unit_price"] for r in leaf_rows if r["code"] == shared_code))
    target_price = round(orig_price * 1.25 + 0.50, 2)

    preview = preview_concept_edit(data, shared_code, new_price=target_price)
    occurrences = preview["occurrences"]
    assert len(occurrences) >= 2

    first_occ = occurrences[0]
    expected_delta = first_occ["delta_budget_amount"]
    assert expected_delta > 0

    updated = apply_selective_concept_edit(
        data,
        code=shared_code,
        approved_row_ids={first_occ["row_id"]},
        new_price=target_price,
    )

    new_total = updated["metadata"]["root_total"]
    assert abs((new_total - original_total) - expected_delta) < 0.1

    matrix_by_id = {r["row_id"]: r for r in updated["budget_matrix"]}
    assert abs(matrix_by_id[first_occ["row_id"]]["unit_price"] - target_price) < 1e-4
    second_occ = occurrences[1]
    assert abs(matrix_by_id[second_occ["row_id"]]["unit_price"] - orig_price) < 1e-4


def test_edit_measurement_lines_recalculates_partida_and_root() -> None:
    data = parse_bc3_file(BC3_PATH)
    partida_row = next(
        r
        for r in data["budget_matrix"]
        if r["node_role"] == "PARTIDA" and float(r["unit_price"]) > 0
    )
    old_total = data["metadata"]["root_total"]
    old_partida_amt = partida_row["total_budget_amount"]

    new_lines = [
        {
            "line_index": 1,
            "line_type": "",
            "comment": "Zona ampliada norte",
            "units": 2.0,
            "length": 50.0,
            "width": 20.0,
            "height": None,
            "subtotal": 2000.0,
        }
    ]
    updated = update_measurement_lines(data, partida_row["row_id"], new_lines)
    new_partida_row = next(r for r in updated["budget_matrix"] if r["row_id"] == partida_row["row_id"])
    assert abs(new_partida_row["local_qty"] - 2000.0) < 1e-4
    expected_new_amt = round(2000.0 * new_partida_row["unit_price"], 2)
    assert abs(new_partida_row["total_budget_amount"] - expected_new_amt) < 0.05
    assert abs(updated["metadata"]["root_total"] - (old_total - old_partida_amt + expected_new_amt)) < 0.2


def test_export_bc3_string_roundtrip() -> None:
    data = parse_bc3_file(BC3_PATH)
    partida_row = next(
        r
        for r in data["budget_matrix"]
        if r["node_role"] == "PARTIDA" and float(r["unit_price"]) > 0
    )
    updated = update_measurement_lines(
        data,
        partida_row["row_id"],
        [
            {
                "line_index": 1,
                "line_type": "",
                "comment": "Medicion editada",
                "units": 1000.0,
                "length": None,
                "width": None,
                "height": None,
                "subtotal": 1000.0,
            }
        ],
    )
    bc3_text = export_bc3_string(updated)
    reparsed = parse_bc3_bytes(bc3_text.encode("utf-8"), "roundtrip.bc3")
    assert abs(reparsed["metadata"]["root_total"] - updated["metadata"]["root_total"]) < 0.1
