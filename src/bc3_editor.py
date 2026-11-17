from __future__ import annotations

import copy
from typing import Any


def _collect_dirty_parents(
    by_id: dict[int, dict[str, Any]],
    modified_row_ids: set[int] | None,
) -> set[int]:
    dirty_parents: set[int] = set()
    if modified_row_ids is None:
        return dirty_parents
    for mid in modified_row_ids:
        curr = by_id.get(mid)
        while curr and curr["parent_row_id"]:
            p_id = curr["parent_row_id"]
            dirty_parents.add(p_id)
            curr = by_id.get(p_id)
    return dirty_parents


def _compute_bottom_up(
    row: dict[str, Any],
    children_map: dict[int, list[dict[str, Any]]],
    concepts: dict[str, dict[str, Any]],
    modified_row_ids: set[int] | None,
    dirty_parents: set[int],
) -> None:
    ch_list = children_map.get(row["row_id"], [])
    for ch in ch_list:
        _compute_bottom_up(ch, children_map, concepts, modified_row_ids, dirty_parents)

    row["local_qty"] = round(float(row["factor"]) * float(row["yield_qty"]), 6)
    if ch_list and (modified_row_ids is None or row["row_id"] in dirty_parents):
        unit_p = round(sum(float(c["local_amount"]) for c in ch_list), 2)
        row["unit_price"] = unit_p
        if row["code"] in concepts:
            concepts[row["code"]]["price"] = unit_p
    row["local_amount"] = round(float(row["local_qty"]) * float(row["unit_price"]), 2)


def _compute_top_down(
    row: dict[str, Any],
    cum_qty_factor: float,
    root_total: float,
    children_map: dict[int, list[dict[str, Any]]],
) -> dict[str, float]:
    role = row["node_role"]
    if role == "ROOT":
        row["total_budget_qty"] = 1.0
        row["total_budget_amount"] = round(row["unit_price"], 2)
    elif role == "CAPITULO":
        row["total_budget_qty"] = round(row["local_qty"] * cum_qty_factor, 6)
        row["total_budget_amount"] = round(row["local_amount"] * cum_qty_factor, 2)
    else:
        row["total_budget_qty"] = round(row["local_qty"] * cum_qty_factor, 6)
        row["total_budget_amount"] = round(row["total_budget_qty"] * row["unit_price"], 2)

    row["budget_share_pct"] = (
        round((row["total_budget_amount"] / root_total) * 100.0, 4) if root_total > 0 else 0.0
    )

    ch_list = children_map.get(row["row_id"], [])
    breakdown = {"MATERIAL": 0.0, "MANO_OBRA": 0.0, "MAQUINARIA": 0.0, "OTROS": 0.0}
    if not ch_list:
        if role == "MATERIAL":
            breakdown["MATERIAL"] = row["total_budget_amount"]
        elif role == "MANO_OBRA":
            breakdown["MANO_OBRA"] = row["total_budget_amount"]
        elif role == "MAQUINARIA":
            breakdown["MAQUINARIA"] = row["total_budget_amount"]
        elif role not in ("ROOT", "CAPITULO"):
            breakdown["OTROS"] = row["total_budget_amount"]
    else:
        next_cum = 1.0 if role == "ROOT" else row["total_budget_qty"]
        for ch in ch_list:
            ch_b = _compute_top_down(ch, next_cum, root_total, children_map)
            for k in breakdown:
                breakdown[k] += ch_b[k]

    row["breakdown_material"] = round(breakdown["MATERIAL"], 2)
    row["breakdown_mano_obra"] = round(breakdown["MANO_OBRA"], 2)
    row["breakdown_maquinaria"] = round(breakdown["MAQUINARIA"], 2)
    row["breakdown_otros"] = round(breakdown["OTROS"], 2)
    return breakdown


def recalculate_budget_tree(
    data: dict[str, Any],
    modified_row_ids: set[int] | None = None,
) -> dict[str, Any]:
    matrix = data["budget_matrix"]
    concepts = data["concepts"]
    if not matrix:
        return data

    by_id: dict[int, dict[str, Any]] = {r["row_id"]: r for r in matrix}
    children_map: dict[int, list[dict[str, Any]]] = {}
    for r in matrix:
        pid = r["parent_row_id"] or 0
        children_map.setdefault(pid, []).append(r)

    dirty_parents = _collect_dirty_parents(by_id, modified_row_ids)
    root_row = children_map[0][0]

    _compute_bottom_up(root_row, children_map, concepts, modified_row_ids, dirty_parents)
    root_total = root_row["local_amount"]
    data["metadata"]["root_total"] = root_total

    _compute_top_down(root_row, 1.0, root_total, children_map)
    return data


def preview_concept_edit(
    data: dict[str, Any],
    code: str,
    new_price: float | None = None,
    new_summary: str | None = None,
    new_unit: str | None = None,
) -> dict[str, Any]:
    occurrences = []
    for r in data["budget_matrix"]:
        if r["code"] == code:
            old_price = float(r["unit_price"])
            target_price = float(new_price) if new_price is not None else old_price
            old_local_amt = float(r["local_amount"])
            new_local_amt = round(float(r["local_qty"]) * target_price, 2)
            old_budget_amt = float(r["total_budget_amount"])
            new_budget_amt = round(float(r["total_budget_qty"]) * target_price, 2)
            delta_budget = round(new_budget_amt - old_budget_amt, 2)
            occurrences.append(
                {
                    "row_id": r["row_id"],
                    "parent_row_id": r["parent_row_id"],
                    "node_role": r["node_role"],
                    "path_codes": r["path_codes"],
                    "path_titles": r["path_titles"],
                    "partida_code": r["partida_code"],
                    "partida_title": r["partida_title"],
                    "old_price": old_price,
                    "new_price": target_price,
                    "local_qty": r["local_qty"],
                    "total_budget_qty": r["total_budget_qty"],
                    "old_local_amount": old_local_amt,
                    "new_local_amount": new_local_amt,
                    "old_budget_amount": old_budget_amt,
                    "new_budget_amount": new_budget_amt,
                    "delta_budget_amount": delta_budget,
                }
            )

    total_delta = round(sum(o["delta_budget_amount"] for o in occurrences), 2)
    return {
        "code": code,
        "occurrences_count": len(occurrences),
        "occurrences": occurrences,
        "current_root_total": data["metadata"]["root_total"],
        "projected_root_total_all_ok": round(data["metadata"]["root_total"] + total_delta, 2),
        "delta_if_all_approved": total_delta,
    }


def _build_fallback_concept(code: str, sample_row: dict[str, Any]) -> dict[str, Any]:
    return {
        "code": code,
        "aliases": [code],
        "unit": sample_row["unit"],
        "summary": sample_row["summary"],
        "price": sample_row["unit_price"],
        "date": "",
        "type_code": sample_row.get("type_code", "0"),
        "description": sample_row.get("description", ""),
        "tech_params": {},
    }


def _generate_variant_code(code: str, concepts: dict[str, dict[str, Any]]) -> str:
    suffix = 1
    while f"{code}_V{suffix}" in concepts:
        suffix += 1
    return f"{code}_V{suffix}"


def apply_selective_concept_edit(
    data: dict[str, Any],
    code: str,
    approved_row_ids: set[int],
    new_price: float | None = None,
    new_summary: str | None = None,
    new_unit: str | None = None,
) -> dict[str, Any]:
    work = copy.deepcopy(data)
    matching_rows = [r for r in work["budget_matrix"] if r["code"] == code]
    if not matching_rows or not approved_row_ids:
        return work

    all_matching_ids = {r["row_id"] for r in matching_rows}
    approve_all = all_matching_ids.issubset(approved_row_ids)

    concepts = work["concepts"]
    orig_concept = concepts.get(code, _build_fallback_concept(code, matching_rows[0]))

    if approve_all:
        target_code = code
        if new_price is not None:
            orig_concept["price"] = float(new_price)
        if new_summary is not None:
            orig_concept["summary"] = new_summary
        if new_unit is not None:
            orig_concept["unit"] = new_unit
        concepts[target_code] = orig_concept
    else:
        target_code = _generate_variant_code(code, concepts)
        variant = copy.deepcopy(orig_concept)
        variant["code"] = target_code
        variant["aliases"] = [target_code]
        if new_price is not None:
            variant["price"] = float(new_price)
        if new_summary is not None:
            variant["summary"] = new_summary
        if new_unit is not None:
            variant["unit"] = new_unit
        concepts[target_code] = variant

    for r in matching_rows:
        if r["row_id"] in approved_row_ids:
            r["code"] = target_code
            if new_price is not None:
                r["unit_price"] = float(new_price)
            if new_summary is not None:
                r["summary"] = new_summary
            if new_unit is not None:
                r["unit"] = new_unit

    return recalculate_budget_tree(work, modified_row_ids=set(approved_row_ids))


def _normalize_measurement_lines(
    new_lines: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], float]:
    clean_lines: list[dict[str, Any]] = []
    total_meas = 0.0
    for idx, line in enumerate(new_lines, start=1):
        l_type = str(line.get("line_type") or "").strip()
        comment = str(line.get("comment") or "").strip()
        u = line.get("units")
        l = line.get("length")
        w = line.get("width")
        h = line.get("height")
        dims = [float(d) for d in (u, l, w, h) if d is not None and str(d).strip() != ""]
        if l_type in ("1", "2"):
            subtotal = None
        elif dims:
            prod = 1.0
            for d in dims:
                prod *= d
            subtotal = round(prod, 6)
            total_meas += subtotal
        else:
            subtotal = None

        clean_lines.append(
            {
                "line_index": idx,
                "line_type": l_type,
                "comment": comment,
                "units": float(u) if u is not None and str(u).strip() != "" else None,
                "length": float(l) if l is not None and str(l).strip() != "" else None,
                "width": float(w) if w is not None and str(w).strip() != "" else None,
                "height": float(h) if h is not None and str(h).strip() != "" else None,
                "subtotal": subtotal,
            }
        )

    return clean_lines, round(total_meas, 4)


def update_measurement_lines(
    data: dict[str, Any],
    row_id: int,
    new_lines: list[dict[str, Any]],
) -> dict[str, Any]:
    work = copy.deepcopy(data)
    target_row = next((r for r in work["budget_matrix"] if r["row_id"] == row_id), None)
    if target_row is None:
        return work

    clean_lines, total_meas = _normalize_measurement_lines(new_lines)
    m_id = target_row.get("measurement_id")
    if m_id:
        m_obj = next((m for m in work["measurements"] if m["measurement_id"] == m_id), None)
        if m_obj:
            m_obj["lines"] = clean_lines
            m_obj["lines_count"] = len(clean_lines)
            m_obj["total_measured"] = total_meas
    else:
        new_mid = len(work["measurements"]) + 1
        work["measurements"].append(
            {
                "measurement_id": new_mid,
                "matrix_row_id": row_id,
                "parent_code": target_row["parent_code"] or "",
                "child_code": target_row["code"],
                "position": "1\\",
                "total_measured": total_meas,
                "label": "",
                "lines_count": len(clean_lines),
                "lines": clean_lines,
            }
        )
        target_row["measurement_id"] = new_mid

    target_row["measurement_total"] = total_meas
    target_row["measurement_lines_count"] = len(clean_lines)
    target_row["yield_qty"] = total_meas
    return recalculate_budget_tree(work, modified_row_ids={row_id})


def export_bc3_string(data: dict[str, Any]) -> str:
    meta = data["metadata"]
    lines: list[str] = [
        f"~V|{meta.get('property', 'ARQMED')}|{meta.get('fiebdc_version', 'FIEBDC-3/2016')}|{meta.get('generator', 'ARQMED STUDIO')}||UTF-8|{meta.get('title', 'Presupuesto')}|2|",
        f"~K|2\\2\\2\\3\\2\\2\\2\\2\\{meta.get('currency', 'EUR')}\\0\\|0\\0\\0\\\\10||",
    ]

    concepts_out: dict[str, dict[str, Any]] = copy.deepcopy(data.get("concepts", {}))
    for r in data["budget_matrix"]:
        c = r["code"]
        if c not in concepts_out:
            concepts_out[c] = {
                "code": c,
                "unit": r["unit"] or "",
                "summary": r["summary"] or c,
                "price": r["unit_price"],
                "date": "",
                "type_code": r.get("type_code", "0"),
                "description": r.get("description", ""),
            }
        else:
            concepts_out[c]["price"] = r["unit_price"]
            concepts_out[c]["summary"] = r["summary"]
            concepts_out[c]["unit"] = r["unit"]
            if r.get("description"):
                concepts_out[c]["description"] = r["description"]

    for c_code, c_info in concepts_out.items():
        u = c_info.get("unit", "")
        s = (c_info.get("summary", "") or "").replace("|", "/")
        p = c_info.get("price", 0.0)
        d = c_info.get("date", "")
        t = c_info.get("type_code", "0")
        lines.append(f"~C|{c_code}|{u}|{s}|{p}|{d}|{t}|")
        desc = (c_info.get("description", "") or "").strip()
        if desc:
            lines.append(f"~T|{c_code}|{desc}|")

    children_by_parent_row: dict[int, list[dict[str, Any]]] = {}
    for r in data["budget_matrix"]:
        if r["parent_row_id"]:
            children_by_parent_row.setdefault(r["parent_row_id"], []).append(r)

    emitted_d_parents: set[str] = set()
    for r in data["budget_matrix"]:
        ch_rows = children_by_parent_row.get(r["row_id"], [])
        if ch_rows and r["code"] not in emitted_d_parents:
            emitted_d_parents.add(r["code"])
            sub_chunks = []
            for ch in ch_rows:
                f_str = "" if abs(float(ch["factor"]) - 1.0) < 1e-6 else str(ch["factor"])
                y_str = str(ch["yield_qty"])
                sub_chunks.append(f"{ch['code']}\\{f_str}\\{y_str}\\")
            lines.append(f"~D|{r['code']}|{''.join(sub_chunks)}|")

    for m in data.get("measurements", []):
        rel = f"{m['parent_code']}\\{m['child_code']}" if m.get("parent_code") else m["child_code"]
        pos = m.get("position", "1\\")
        tot = m.get("total_measured", 0)
        m_sub = []
        for l in m.get("lines", []):
            lt = l.get("line_type") or ""
            cm = (l.get("comment") or "").replace("\\", "/")
            u = "" if l.get("units") is None else str(l["units"])
            ln = "" if l.get("length") is None else str(l["length"])
            wd = "" if l.get("width") is None else str(l["width"])
            ht = "" if l.get("height") is None else str(l["height"])
            m_sub.append(f"{lt}\\{cm}\\{u}\\{ln}\\{wd}\\{ht}\\")
        lines.append(f"~M|{rel}|{pos}|{tot}|{''.join(m_sub)}|")

    return "\r\n".join(lines) + "\r\n"
