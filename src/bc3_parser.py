from __future__ import annotations

import re
from pathlib import Path
from typing import Any


def _parse_float(val: str | None, default: float = 0.0) -> float:
    if val is None:
        return default
    cleaned = val.strip().replace(",", ".")
    if not cleaned:
        return default
    try:
        return float(cleaned)
    except ValueError:
        return default


def _parse_optional_float(val: str | None) -> float | None:
    if val is None:
        return None
    cleaned = val.strip().replace(",", ".")
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def decode_bc3_bytes(raw: bytes) -> tuple[str, str]:
    head_ascii = raw[:512].decode("ascii", errors="ignore").upper()
    if "UTF-8" in head_ascii or "UTF8" in head_ascii:
        try:
            return raw.decode("utf-8-sig"), "utf-8"
        except UnicodeDecodeError:
            pass
    if "850" in head_ascii:
        return raw.decode("cp850", errors="replace"), "cp850"
    if "ANSI" in head_ascii or "1252" in head_ascii:
        return raw.decode("cp1252", errors="replace"), "cp1252"

    try:
        return raw.decode("utf-8-sig"), "utf-8"
    except UnicodeDecodeError:
        return raw.decode("cp1252", errors="replace"), "cp1252"


def _resolve_code(code: str, alias_map: dict[str, str]) -> str:
    cleaned = code.strip()
    return alias_map.get(cleaned, cleaned)


def _parse_version_record(parts: list[str], v_meta: dict[str, Any]) -> None:
    v_meta["property"] = parts[1].strip() if len(parts) > 1 else ""
    v_meta["fiebdc_version"] = parts[2].strip() if len(parts) > 2 else ""
    v_meta["generator"] = parts[3].strip() if len(parts) > 3 else ""
    v_meta["encoding_header"] = parts[5].strip() if len(parts) > 5 else ""
    v_meta["title"] = parts[6].strip() if len(parts) > 6 else ""


def _parse_coefficients_record(parts: list[str], v_meta: dict[str, Any]) -> None:
    if len(parts) > 1 and "\\" in parts[1]:
        k_sub = [s.strip() for s in parts[1].split("\\") if s.strip()]
        for token in reversed(k_sub):
            if not token.replace(".", "").isdigit():
                v_meta["currency"] = token
                break


def _parse_concept_record(
    parts: list[str],
    concepts: dict[str, dict[str, Any]],
    alias_map: dict[str, str],
) -> None:
    raw_code_field = parts[1].strip() if len(parts) > 1 else ""
    if not raw_code_field:
        return
    code_aliases = [c.strip() for c in raw_code_field.split("\\") if c.strip()]
    if not code_aliases:
        return
    canonical = code_aliases[0]
    for alias in code_aliases:
        alias_map[alias] = canonical

    unit = parts[2].strip() if len(parts) > 2 else ""
    summary = parts[3].strip().replace("\r", " ").replace("\n", " ") if len(parts) > 3 else ""
    price_field = parts[4].strip() if len(parts) > 4 else "0"
    price_tokens = [p for p in price_field.split("\\") if p.strip()]
    price = _parse_float(price_tokens[0] if price_tokens else "0", 0.0)
    date_field = parts[5].strip() if len(parts) > 5 else ""
    type_field = parts[6].strip() if len(parts) > 6 else "0"

    concepts[canonical] = {
        "code": canonical,
        "aliases": code_aliases,
        "unit": unit,
        "summary": summary,
        "price": price,
        "date": date_field,
        "type_code": type_field or "0",
        "description": "",
        "tech_params": {},
    }


def _attach_descriptions(
    raw_t_records: list[tuple[str, str]],
    concepts: dict[str, dict[str, Any]],
    alias_map: dict[str, str],
) -> None:
    for raw_c, desc in raw_t_records:
        code = _resolve_code(raw_c, alias_map)
        clean_desc = desc.replace("\r\n", "\n").strip()
        if code in concepts:
            concepts[code]["description"] = clean_desc
        else:
            concepts[code] = {
                "code": code,
                "aliases": [code],
                "unit": "",
                "summary": code,
                "price": 0.0,
                "date": "",
                "type_code": "0",
                "description": clean_desc,
                "tech_params": {},
            }


def _parse_technical_params(
    raw_x_records: list[list[str]],
    concepts: dict[str, dict[str, Any]],
    alias_map: dict[str, str],
) -> dict[str, dict[str, str]]:
    tech_param_defs: dict[str, dict[str, str]] = {}
    for parts in raw_x_records:
        concept_raw = parts[1].strip() if len(parts) > 1 else ""
        blob = parts[2].replace("\r", "").replace("\n", "") if len(parts) > 2 else ""
        tokens = blob.split("\\")
        if not concept_raw:
            for i in range(0, len(tokens) - 2, 3):
                k = tokens[i].strip()
                if k:
                    tech_param_defs[k] = {
                        "code": k,
                        "name": tokens[i + 1].strip() if i + 1 < len(tokens) else k,
                        "unit": tokens[i + 2].strip() if i + 2 < len(tokens) else "",
                    }
        else:
            code = _resolve_code(concept_raw, alias_map)
            if code in concepts:
                for i in range(0, len(tokens) - 1, 2):
                    k = tokens[i].strip()
                    v = tokens[i + 1].strip() if i + 1 < len(tokens) else ""
                    if k:
                        concepts[code]["tech_params"][k] = v
    return tech_param_defs


def _parse_decompositions(
    raw_d_records: list[tuple[str, str]],
    concepts: dict[str, dict[str, Any]],
    alias_map: dict[str, str],
) -> tuple[dict[str, list[dict[str, Any]]], set[str]]:
    decompositions: dict[str, list[dict[str, Any]]] = {}
    all_children_codes: set[str] = set()

    for parent_raw, children_blob in raw_d_records:
        parent_code = _resolve_code(parent_raw.split("\\")[0], alias_map)
        clean_blob = children_blob.replace("\r", "").replace("\n", "")
        sub_tokens = clean_blob.split("\\")
        child_list = decompositions.setdefault(parent_code, [])
        for i in range(0, len(sub_tokens) - 1, 3):
            raw_child = sub_tokens[i].strip()
            if not raw_child:
                continue
            child_code = _resolve_code(raw_child, alias_map)
            factor_str = sub_tokens[i + 1] if i + 1 < len(sub_tokens) else ""
            yield_str = sub_tokens[i + 2] if i + 2 < len(sub_tokens) else ""
            factor = _parse_float(factor_str, 1.0)
            yield_qty = _parse_float(yield_str, 1.0)
            local_qty = factor * yield_qty
            child_list.append(
                {
                    "child_code": child_code,
                    "factor": factor,
                    "yield_qty": yield_qty,
                    "local_qty": local_qty,
                }
            )
            all_children_codes.add(child_code)
            if child_code not in concepts:
                concepts[child_code] = {
                    "code": child_code,
                    "aliases": [child_code],
                    "unit": "",
                    "summary": child_code,
                    "price": 0.0,
                    "date": "",
                    "type_code": "0",
                    "description": "",
                    "tech_params": {},
                }

    return decompositions, all_children_codes


def _parse_measurement_line(chunk: list[str], line_index: int) -> dict[str, Any] | None:
    if len(chunk) < 6 and not any(s.strip() for s in chunk):
        return None
    padded = list(chunk)
    while len(padded) < 6:
        padded.append("")
    l_type, comment, u_str, l_str, w_str, h_str = [s.strip() for s in padded[:6]]
    if not any([l_type, comment, u_str, l_str, w_str, h_str]):
        return None

    u_val = _parse_optional_float(u_str)
    l_val = _parse_optional_float(l_str)
    w_val = _parse_optional_float(w_str)
    h_val = _parse_optional_float(h_str)

    dims = [d for d in (u_val, l_val, w_val, h_val) if d is not None]
    if l_type in ("1", "2"):
        subtotal = None
    elif dims:
        prod = 1.0
        for d in dims:
            prod *= d
        subtotal = round(prod, 6)
    else:
        subtotal = None

    return {
        "line_index": line_index,
        "line_type": l_type,
        "comment": comment,
        "units": u_val,
        "length": l_val,
        "width": w_val,
        "height": h_val,
        "subtotal": subtotal,
    }


def _parse_measurements(
    raw_m_records: list[list[str]],
    alias_map: dict[str, str],
) -> tuple[
    list[dict[str, Any]],
    dict[tuple[str, str], dict[str, Any]],
    dict[str, list[dict[str, Any]]],
]:
    measurements: list[dict[str, Any]] = []
    measurements_by_pair: dict[tuple[str, str], dict[str, Any]] = {}
    measurements_by_child: dict[str, list[dict[str, Any]]] = {}

    for m_idx, parts in enumerate(raw_m_records, start=1):
        rel_field = parts[1].strip() if len(parts) > 1 else ""
        if "\\" in rel_field:
            p_raw, c_raw = rel_field.split("\\", 1)
            parent_code = _resolve_code(p_raw, alias_map)
            child_code = _resolve_code(c_raw, alias_map)
        else:
            parent_code = ""
            child_code = _resolve_code(rel_field, alias_map)

        position_str = parts[2].strip() if len(parts) > 2 else ""
        total_measured = _parse_float(parts[3] if len(parts) > 3 else "0", 0.0)
        lines_blob = parts[4].replace("\r", "").replace("\n", "") if len(parts) > 4 else ""
        label_str = parts[5].strip() if len(parts) > 5 else ""

        sub = lines_blob.split("\\")
        parsed_lines: list[dict[str, Any]] = []
        line_num = 0
        for i in range(0, len(sub) - 1, 6):
            parsed = _parse_measurement_line(sub[i : i + 6], line_num + 1)
            if parsed is not None:
                line_num += 1
                parsed_lines.append(parsed)

        m_entry = {
            "measurement_id": m_idx,
            "parent_code": parent_code,
            "child_code": child_code,
            "position": position_str,
            "total_measured": total_measured,
            "label": label_str,
            "lines_count": len(parsed_lines),
            "lines": parsed_lines,
        }
        measurements.append(m_entry)
        if parent_code:
            measurements_by_pair[(parent_code, child_code)] = m_entry
        measurements_by_child.setdefault(child_code, []).append(m_entry)

    return measurements, measurements_by_pair, measurements_by_child


def _identify_root_code(
    concepts: dict[str, dict[str, Any]],
    decompositions: dict[str, list[dict[str, Any]]],
    all_children_codes: set[str],
) -> str:
    roots = [c for c in concepts if c.endswith("##")]
    if not roots:
        roots = [c for c in decompositions if c not in all_children_codes]
    if not roots and concepts:
        roots = [next(iter(concepts))]
    return roots[0] if roots else "ROOT##"


def _is_chapter_node(
    code: str,
    parent_role: str | None,
    concepts: dict[str, dict[str, Any]],
    decompositions: dict[str, list[dict[str, Any]]],
) -> bool:
    if code.endswith("##"):
        return False
    if code.endswith("#"):
        return True
    if parent_role in ("ROOT", "CAPITULO") and code in decompositions:
        c_info = concepts.get(code, {})
        if not c_info.get("unit") and any(ch["child_code"].endswith("#") for ch in decompositions[code]):
            return True
    return False


def _classify_role(
    code: str,
    parent_role: str | None,
    root_code: str,
    concepts: dict[str, dict[str, Any]],
    decompositions: dict[str, list[dict[str, Any]]],
) -> str:
    if code == root_code or code.endswith("##"):
        return "ROOT"
    if _is_chapter_node(code, parent_role, concepts, decompositions):
        return "CAPITULO"
    if parent_role in ("ROOT", "CAPITULO"):
        return "PARTIDA"
    if code in decompositions:
        return "AUXILIAR"
    if "%" in code:
        return "PORCENTAJE"
    t_code = concepts.get(code, {}).get("type_code", "0")
    if t_code == "1":
        return "MANO_OBRA"
    if t_code == "2":
        return "MAQUINARIA"
    if t_code == "3":
        return "MATERIAL"
    return "RECURSO_OTRO"


def _compute_max_chapter_depth(
    root_code: str,
    concepts: dict[str, dict[str, Any]],
    decompositions: dict[str, list[dict[str, Any]]],
) -> int:
    max_depth = 0

    def scan(code: str, parent_role: str | None, chap_depth: int, visited: frozenset[str]) -> None:
        nonlocal max_depth
        role = _classify_role(code, parent_role, root_code, concepts, decompositions)
        cur_chap_depth = chap_depth + 1 if role == "CAPITULO" else chap_depth
        if cur_chap_depth > max_depth:
            max_depth = cur_chap_depth
        for edge in decompositions.get(code, []):
            ch = edge["child_code"]
            if ch not in visited:
                scan(ch, role, cur_chap_depth, visited | {ch})

    scan(root_code, None, 0, frozenset([root_code]))
    return max_depth


def _build_budget_matrix(
    root_code: str,
    root_concept: dict[str, Any],
    root_total: float,
    max_chapter_depth: int,
    concepts: dict[str, dict[str, Any]],
    decompositions: dict[str, list[dict[str, Any]]],
    measurements_by_pair: dict[tuple[str, str], dict[str, Any]],
    measurements_by_child: dict[str, list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    budget_matrix: list[dict[str, Any]] = []
    row_counter = 0

    def walk(
        code: str,
        parent_row_id: int | None,
        parent_code: str,
        parent_role: str | None,
        depth: int,
        factor: float,
        yield_qty: float,
        cumulative_qty_factor: float,
        path_codes: list[str],
        path_titles: list[str],
        chapter_chain: list[tuple[str, str]],
        current_partida: tuple[str, str] | None,
        visited: frozenset[str],
    ) -> dict[str, float]:
        nonlocal row_counter
        row_counter += 1
        my_row_id = row_counter

        c_info = concepts.get(
            code,
            {
                "code": code,
                "unit": "",
                "summary": code,
                "price": 0.0,
                "description": "",
                "type_code": "0",
            },
        )
        role = _classify_role(code, parent_role, root_code, concepts, decompositions)
        title = c_info["summary"]
        unit_price = c_info["price"]
        local_qty = factor * yield_qty
        local_amount = round(local_qty * unit_price, 4)

        if role == "ROOT":
            total_budget_qty = 1.0
            total_budget_amount = round(unit_price, 2)
        elif role == "CAPITULO":
            total_budget_qty = local_qty * cumulative_qty_factor
            total_budget_amount = round(local_amount * cumulative_qty_factor, 2)
        else:
            total_budget_qty = round(local_qty * cumulative_qty_factor, 6)
            total_budget_amount = round(total_budget_qty * unit_price, 2)

        share_pct = round((total_budget_amount / root_total) * 100.0, 4) if root_total > 0 else 0.0

        my_chapters = chapter_chain + [(code, title)] if role == "CAPITULO" else chapter_chain
        my_partida = (code, title) if role == "PARTIDA" else current_partida

        m_obj = measurements_by_pair.get((parent_code, code))
        if m_obj is None and role == "PARTIDA":
            candidates = measurements_by_child.get(code, [])
            if len(candidates) == 1 and not candidates[0]["parent_code"]:
                m_obj = candidates[0]

        row_dict: dict[str, Any] = {
            "row_id": my_row_id,
            "parent_row_id": parent_row_id,
            "depth": depth,
            "node_role": role,
            "chapter_depth": len(my_chapters) if role == "CAPITULO" else None,
            "path_codes": " > ".join(path_codes),
            "path_titles": " > ".join(path_titles),
        }

        for lvl in range(1, max_chapter_depth + 1):
            if lvl <= len(my_chapters):
                row_dict[f"level_{lvl}_code"] = my_chapters[lvl - 1][0]
                row_dict[f"level_{lvl}_title"] = my_chapters[lvl - 1][1]
            else:
                row_dict[f"level_{lvl}_code"] = None
                row_dict[f"level_{lvl}_title"] = None

        row_dict.update(
            {
                "partida_code": my_partida[0] if my_partida else None,
                "partida_title": my_partida[1] if my_partida else None,
                "parent_code": parent_code or None,
                "code": code,
                "unit": c_info["unit"],
                "summary": title,
                "description": c_info["description"],
                "type_code": c_info["type_code"],
                "unit_price": unit_price,
                "factor": factor,
                "yield_qty": yield_qty,
                "local_qty": local_qty,
                "local_amount": round(local_amount, 2),
                "total_budget_qty": total_budget_qty,
                "total_budget_amount": total_budget_amount,
                "budget_share_pct": share_pct,
                "measurement_id": m_obj["measurement_id"] if m_obj else None,
                "measurement_total": m_obj["total_measured"] if m_obj else None,
                "measurement_lines_count": m_obj["lines_count"] if m_obj else 0,
            }
        )

        budget_matrix.append(row_dict)

        if m_obj is not None:
            m_obj["matrix_row_id"] = my_row_id
            m_obj["path_codes"] = row_dict["path_codes"]
            m_obj["path_titles"] = row_dict["path_titles"]

        children_edges = decompositions.get(code, [])
        breakdown = {
            "MATERIAL": 0.0,
            "MANO_OBRA": 0.0,
            "MAQUINARIA": 0.0,
            "OTROS": 0.0,
        }

        if not children_edges:
            if role == "MATERIAL":
                breakdown["MATERIAL"] = total_budget_amount
            elif role == "MANO_OBRA":
                breakdown["MANO_OBRA"] = total_budget_amount
            elif role == "MAQUINARIA":
                breakdown["MAQUINARIA"] = total_budget_amount
            elif role not in ("ROOT", "CAPITULO"):
                breakdown["OTROS"] = total_budget_amount
        else:
            next_cum_qty = 1.0 if role == "ROOT" else total_budget_qty
            for edge in children_edges:
                ch_code = edge["child_code"]
                if ch_code in visited:
                    continue
                ch_title = concepts.get(ch_code, {}).get("summary", ch_code)
                ch_break = walk(
                    code=ch_code,
                    parent_row_id=my_row_id,
                    parent_code=code,
                    parent_role=role,
                    depth=depth + 1,
                    factor=edge["factor"],
                    yield_qty=edge["yield_qty"],
                    cumulative_qty_factor=next_cum_qty,
                    path_codes=path_codes + [ch_code],
                    path_titles=path_titles + [ch_title],
                    chapter_chain=my_chapters,
                    current_partida=my_partida,
                    visited=visited | {ch_code},
                )
                for k in breakdown:
                    breakdown[k] += ch_break[k]

        row_dict["breakdown_material"] = round(breakdown["MATERIAL"], 2)
        row_dict["breakdown_mano_obra"] = round(breakdown["MANO_OBRA"], 2)
        row_dict["breakdown_maquinaria"] = round(breakdown["MAQUINARIA"], 2)
        row_dict["breakdown_otros"] = round(breakdown["OTROS"], 2)

        return breakdown

    walk(
        code=root_code,
        parent_row_id=None,
        parent_code="",
        parent_role=None,
        depth=0,
        factor=1.0,
        yield_qty=1.0,
        cumulative_qty_factor=1.0,
        path_codes=[root_code],
        path_titles=[root_concept["summary"]],
        chapter_chain=[],
        current_partida=None,
        visited=frozenset([root_code]),
    )
    return budget_matrix


def parse_bc3_file(path: str | Path) -> dict[str, Any]:
    file_path = Path(path)
    raw = file_path.read_bytes()
    return parse_bc3_bytes(raw, source_name=file_path.name)


def parse_bc3_bytes(raw: bytes, source_name: str = "uploaded.bc3") -> dict[str, Any]:
    text, detected_encoding = decode_bc3_bytes(raw)
    raw_records = re.split(r"(?=~[A-Z0-9_]+\|)", text)

    v_meta: dict[str, Any] = {
        "source_file": source_name,
        "property": "",
        "fiebdc_version": "",
        "generator": "",
        "encoding": detected_encoding,
        "title": "",
        "currency": "EUR",
    }

    concepts: dict[str, dict[str, Any]] = {}
    alias_map: dict[str, str] = {}
    raw_d_records: list[tuple[str, str]] = []
    raw_t_records: list[tuple[str, str]] = []
    raw_m_records: list[list[str]] = []
    raw_x_records: list[list[str]] = []

    for rec in raw_records:
        if not rec.startswith("~"):
            continue
        parts = rec.split("|")
        tag = parts[0].strip()

        if tag == "~V":
            _parse_version_record(parts, v_meta)
        elif tag == "~K":
            _parse_coefficients_record(parts, v_meta)
        elif tag == "~C":
            _parse_concept_record(parts, concepts, alias_map)
        elif tag == "~D":
            parent_raw = parts[1].strip() if len(parts) > 1 else ""
            children_blob = parts[2] if len(parts) > 2 else ""
            if parent_raw and children_blob:
                raw_d_records.append((parent_raw, children_blob))
        elif tag == "~T":
            c_code = parts[1].strip() if len(parts) > 1 else ""
            desc = parts[2].strip() if len(parts) > 2 else ""
            if c_code:
                raw_t_records.append((c_code, desc))
        elif tag == "~M":
            raw_m_records.append(parts)
        elif tag == "~X":
            raw_x_records.append(parts)

    _attach_descriptions(raw_t_records, concepts, alias_map)
    tech_param_defs = _parse_technical_params(raw_x_records, concepts, alias_map)
    decompositions, all_children_codes = _parse_decompositions(raw_d_records, concepts, alias_map)
    measurements, measurements_by_pair, measurements_by_child = _parse_measurements(
        raw_m_records, alias_map
    )

    root_code = _identify_root_code(concepts, decompositions, all_children_codes)
    root_concept = concepts.get(
        root_code,
        {"code": root_code, "summary": v_meta["title"] or "PRESUPUESTO", "price": 0.0, "unit": ""},
    )
    root_total = root_concept["price"]
    max_chapter_depth = _compute_max_chapter_depth(root_code, concepts, decompositions)

    budget_matrix = _build_budget_matrix(
        root_code=root_code,
        root_concept=root_concept,
        root_total=root_total,
        max_chapter_depth=max_chapter_depth,
        concepts=concepts,
        decompositions=decompositions,
        measurements_by_pair=measurements_by_pair,
        measurements_by_child=measurements_by_child,
    )

    role_counts: dict[str, int] = {}
    for r in budget_matrix:
        role_counts[r["node_role"]] = role_counts.get(r["node_role"], 0) + 1

    metadata = {
        **v_meta,
        "root_code": root_code,
        "root_title": root_concept["summary"],
        "root_total": root_total,
        "max_chapter_depth": max_chapter_depth,
        "tech_param_defs": tech_param_defs,
        "counts": {
            "concepts": len(concepts),
            "decompositions": len(decompositions),
            "descriptions": sum(1 for c in concepts.values() if c["description"]),
            "measurements": len(measurements),
            "measurement_lines": sum(m["lines_count"] for m in measurements),
            "matrix_rows": len(budget_matrix),
            "roles": role_counts,
        },
    }

    return {
        "metadata": metadata,
        "concepts": concepts,
        "decompositions": decompositions,
        "measurements": measurements,
        "budget_matrix": budget_matrix,
    }
