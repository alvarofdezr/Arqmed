(() => {
  "use strict";

  let currentData = null;
  let rowMap = new Map();
  let childrenMap = new Map();
  let measurementById = new Map();
  let expandedRowIds = new Set();
  let selectedRowId = 1;
  let treeSearchTerm = "";
  let visibleTreeRowIds = [];

  let undoStack = [];
  let redoStack = [];
  const stateChangeListeners = [];
  let draftMeasurementRowId = null;
  let draftMeasurementLines = null;
  let isMeasurementDirty = false;

  let hideHashInCodes = true;
  let treeRowDensity = "md";
  const visibleTreeRoles = new Set(["CAPITULO", "PARTIDA", "MANO_OBRA", "MATERIAL", "OTHER"]);

  const DEFAULT_TREE_COLUMNS = [
    { id: "code", label: "Código Jerárquico", shortLabel: "Código", width: 235, visible: true, num: false },
    { id: "role", label: "Naturaleza / Nivel", shortLabel: "Naturaleza", width: 118, visible: true, num: false },
    { id: "unit", label: "Ud", shortLabel: "Ud", width: 55, visible: true, num: false },
    { id: "summary", label: "Resumen del Concepto", shortLabel: "Resumen", width: 360, visible: true, num: false, flex: true },
    { id: "qty", label: "Cantidad", shortLabel: "Cantidad", width: 105, visible: true, num: true },
    { id: "price", label: "Coste", shortLabel: "Coste", width: 105, visible: true, num: true },
    { id: "amount", label: "Importe", shortLabel: "Importe", width: 122, visible: true, num: true },
    { id: "share", label: "Peso Obra", shortLabel: "Peso Obra", width: 120, visible: true, num: true },
    { id: "actions", label: "Editar / Mover", shortLabel: "Acciones", width: 132, visible: true, num: true },
  ];
  let treeColumns = JSON.parse(JSON.stringify(DEFAULT_TREE_COLUMNS));
  let draggedColId = null;

  function formatCodeDisplay(code) {
    if (!code) return "";
    const str = String(code);
    if (!hideHashInCodes) return str;
    const stripped = str.replace(/#+$/, "");
    return stripped || str;
  }

  let modalState = {
    mode: "EDIT_CONCEPT",
    focusRowId: null,
    code: "",
    occurrences: [],
    approvedSet: new Set(),
    draftNewLines: null,
    draftPliegoText: "",
  };

  const fmtMoney = new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const fmtNum = new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  function formatEuro(v) {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return "—";
    return fmtMoney.format(Number(v));
  }

  function formatSignedEuro(v) {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return "0,00 €";
    const n = Number(v);
    const sign = n > 0.004 ? "+" : "";
    return `${sign}${fmtMoney.format(n)} €`;
  }

  function formatQty(v) {
    if (v === null || v === undefined || Number.isNaN(Number(v))) return "";
    return fmtNum.format(Number(v));
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const SVG_ICONS = {
    ROOT: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></svg>`,
    CAPITULO: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
    PARTIDA: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6"/><path d="M9 16h6"/></svg>`,
    MATERIAL: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="9.33" x2="22" y2="9.33"/><line x1="2" y1="14.66" x2="22" y2="14.66"/><line x1="12" y1="4" x2="12" y2="9.33"/><line x1="7" y1="9.33" x2="7" y2="14.66"/><line x1="17" y1="9.33" x2="17" y2="14.66"/><line x1="12" y1="14.66" x2="12" y2="20"/></svg>`,
    MANO_OBRA: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/><path d="M10 10V5a2 2 0 0 1 4 0v5"/><path d="M4 15v-3a8 8 0 0 1 16 0v3"/></svg>`,
    MAQUINARIA: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="7" cy="17" r="3"/><circle cx="17" cy="17" r="3"/><path d="M5 14V7h7l3 5h4v5"/><path d="M10 17h4"/></svg>`,
    AUXILIAR: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.77 1.02 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    PORCENTAJE: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>`,
    CHEVRON: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>`,
    EDIT: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
    PLUS: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    TRASH: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
    ARROW_UP: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>`,
    ARROW_DOWN: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>`,
  };

  function getRoleBadgeHtml(row) {
    const role = row.node_role;
    if (role === "ROOT") {
      return `<span class="role-badge badge-ROOT">${SVG_ICONS.ROOT}<span>OBRA RAÍZ</span></span>`;
    }
    if (role === "CAPITULO") {
      const lvl = row.chapter_depth || 1;
      const cls = `badge-CAP-${Math.min(lvl, 5)}`;
      return `<span class="role-badge ${cls}">${SVG_ICONS.CAPITULO}<span>CAP N${lvl}</span></span>`;
    }
    if (role === "PARTIDA") {
      return `<span class="role-badge badge-PARTIDA">${SVG_ICONS.PARTIDA}<span>PARTIDA</span></span>`;
    }
    if (role === "MATERIAL") {
      return `<span class="role-badge badge-MATERIAL">${SVG_ICONS.MATERIAL}<span>MATERIAL</span></span>`;
    }
    if (role === "MANO_OBRA") {
      return `<span class="role-badge badge-MANO_OBRA">${SVG_ICONS.MANO_OBRA}<span>M. OBRA</span></span>`;
    }
    if (role === "MAQUINARIA") {
      return `<span class="role-badge badge-MAQUINARIA">${SVG_ICONS.MAQUINARIA}<span>MAQUIN.</span></span>`;
    }
    if (role === "AUXILIAR") {
      return `<span class="role-badge badge-AUXILIAR">${SVG_ICONS.AUXILIAR}<span>AUXILIAR</span></span>`;
    }
    if (role === "PORCENTAJE") {
      return `<span class="role-badge badge-PORCENTAJE">${SVG_ICONS.PORCENTAJE}<span>COSTES</span></span>`;
    }
    return `<span class="role-badge badge-PORCENTAJE">${SVG_ICONS.PORCENTAJE}<span>RECURSO</span></span>`;
  }

  function notifyStateChange() {
    for (const cb of stateChangeListeners) {
      try {
        cb();
      } catch (_e) {
      }
    }
  }

  function captureSnapshot() {
    return JSON.stringify({
      metadata: currentData.metadata,
      concepts: currentData.concepts,
      measurements: currentData.measurements,
      budget_matrix: currentData.budget_matrix,
    });
  }

  function restoreSnapshot(snapshotStr) {
    const restored = JSON.parse(snapshotStr);
    currentData.metadata = restored.metadata;
    currentData.concepts = restored.concepts;
    currentData.measurements = restored.measurements;
    currentData.budget_matrix = restored.budget_matrix;
  }

  function pushUndoSnapshot(actionLabel) {
    if (!currentData) return;
    undoStack.push({ label: actionLabel, snapshot: captureSnapshot() });
    if (undoStack.length > 25) undoStack.shift();
    redoStack = [];
    updateUndoButton();
  }

  function updateUndoButton() {
    const btn = document.getElementById("btnUndo");
    if (btn) {
      btn.disabled = undoStack.length === 0;
      btn.style.opacity = undoStack.length === 0 ? "0.45" : "1";
      const lastLabel = undoStack.length ? `Último: ${undoStack[undoStack.length - 1].label}` : "Sin cambios";
      btn.title = `Deshacer (${lastLabel}) · Ctrl+Z`;
      btn.innerHTML = `<span>↩ Deshacer (${undoStack.length})</span>`;
    }
    notifyStateChange();
  }

  function performUndo() {
    if (!undoStack.length || !currentData) return;
    const prev = undoStack.pop();
    redoStack.push({ label: prev.label, snapshot: captureSnapshot() });
    if (redoStack.length > 25) redoStack.shift();
    restoreSnapshot(prev.snapshot);
    updateUndoButton();
    rebuildIndexesAndRefreshUI(selectedRowId);
  }

  function performRedo() {
    if (!redoStack.length || !currentData) return;
    const next = redoStack.pop();
    undoStack.push({ label: next.label, snapshot: captureSnapshot() });
    if (undoStack.length > 25) undoStack.shift();
    restoreSnapshot(next.snapshot);
    updateUndoButton();
    rebuildIndexesAndRefreshUI(selectedRowId);
  }

  function recalculateBudgetTree(modifiedRowIds = null) {
    const matrix = currentData.budget_matrix;
    const concepts = currentData.concepts || {};
    if (!matrix || !matrix.length) return;

    const byId = new Map();
    const chMap = new Map();
    for (const r of matrix) {
      byId.set(r.row_id, r);
      const pid = r.parent_row_id || 0;
      if (!chMap.has(pid)) chMap.set(pid, []);
      chMap.get(pid).push(r);
    }

    const dirtyParents = new Set();
    if (modifiedRowIds && modifiedRowIds.size > 0) {
      for (const mid of modifiedRowIds) {
        let curr = byId.get(Number(mid));
        while (curr && curr.parent_row_id) {
          dirtyParents.add(curr.parent_row_id);
          curr = byId.get(curr.parent_row_id);
        }
      }
    }

    const rootRow = (chMap.get(0) || [])[0] || matrix[0];

    const computeBottomUp = (row) => {
      const chList = chMap.get(row.row_id) || [];
      for (const ch of chList) {
        computeBottomUp(ch);
      }
      row.local_qty = Number((Number(row.factor) * Number(row.yield_qty)).toFixed(6));
      if (chList.length > 0 && (!modifiedRowIds || dirtyParents.has(row.row_id))) {
        const sumChildren = chList.reduce((acc, c) => acc + Number(c.local_amount), 0);
        row.unit_price = Number(sumChildren.toFixed(2));
        if (concepts[row.code]) {
          concepts[row.code].price = row.unit_price;
        }
      }
      row.local_amount = Number((row.local_qty * Number(row.unit_price)).toFixed(2));
    };

    computeBottomUp(rootRow);
    const rootTotal = rootRow.local_amount;
    currentData.metadata.root_total = rootTotal;

    const computeTopDown = (row, cumQtyFactor) => {
      const role = row.node_role;
      if (role === "ROOT") {
        row.total_budget_qty = 1;
        row.total_budget_amount = Number(row.unit_price.toFixed(2));
      } else if (role === "CAPITULO") {
        row.total_budget_qty = Number((row.local_qty * cumQtyFactor).toFixed(6));
        row.total_budget_amount = Number((row.local_amount * cumQtyFactor).toFixed(2));
      } else {
        row.total_budget_qty = Number((row.local_qty * cumQtyFactor).toFixed(6));
        row.total_budget_amount = Number((row.total_budget_qty * row.unit_price).toFixed(2));
      }
      row.budget_share_pct = rootTotal > 0 ? Number(((row.total_budget_amount / rootTotal) * 100).toFixed(4)) : 0;

      const chList = chMap.get(row.row_id) || [];
      const breakdown = { MATERIAL: 0, MANO_OBRA: 0, MAQUINARIA: 0, OTROS: 0 };
      if (!chList.length) {
        if (role === "MATERIAL") breakdown.MATERIAL = row.total_budget_amount;
        else if (role === "MANO_OBRA") breakdown.MANO_OBRA = row.total_budget_amount;
        else if (role === "MAQUINARIA") breakdown.MAQUINARIA = row.total_budget_amount;
        else if (role !== "ROOT" && role !== "CAPITULO") breakdown.OTROS = row.total_budget_amount;
      } else {
        const nextCum = role === "ROOT" ? 1 : row.total_budget_qty;
        for (const ch of chList) {
          const chB = computeTopDown(ch, nextCum);
          breakdown.MATERIAL += chB.MATERIAL;
          breakdown.MANO_OBRA += chB.MANO_OBRA;
          breakdown.MAQUINARIA += chB.MAQUINARIA;
          breakdown.OTROS += chB.OTROS;
        }
      }
      row.breakdown_material = Number(breakdown.MATERIAL.toFixed(2));
      row.breakdown_mano_obra = Number(breakdown.MANO_OBRA.toFixed(2));
      row.breakdown_maquinaria = Number(breakdown.MAQUINARIA.toFixed(2));
      row.breakdown_otros = Number(breakdown.OTROS.toFixed(2));
      return breakdown;
    };

    computeTopDown(rootRow, 1);
  }

  function parseBc3ArrayBuffer(buffer, fileName) {
    const bytes = new Uint8Array(buffer);
    let headAscii = "";
    try {
      headAscii = new TextDecoder("ascii").decode(bytes.slice(0, 512)).toUpperCase();
    } catch (_e) {
      headAscii = "";
    }
    let encoding = "windows-1252";
    if (headAscii.includes("UTF-8") || headAscii.includes("UTF8")) {
      encoding = "utf-8";
    } else if (headAscii.includes("850")) {
      encoding = "ibm866";
    }
    let text = "";
    try {
      text = new TextDecoder(encoding).decode(bytes);
    } catch (_e) {
      try {
        text = new TextDecoder("windows-1252").decode(bytes);
      } catch (_e2) {
        text = new TextDecoder("utf-8").decode(bytes);
      }
    }
    const records = text.split(/(?=~[A-Z0-9_]+\|)/);

    const parseFloatSafe = (val, defVal = 0) => {
      if (!val) return defVal;
      const clean = String(val).trim().replace(",", ".");
      if (!clean) return defVal;
      const n = Number(clean);
      return Number.isFinite(n) ? n : defVal;
    };

    const parseOptFloat = (val) => {
      if (!val) return null;
      const clean = String(val).trim().replace(",", ".");
      if (!clean) return null;
      const n = Number(clean);
      return Number.isFinite(n) ? n : null;
    };

    const vMeta = {
      source_file: fileName,
      property: "",
      fiebdc_version: "",
      generator: "",
      encoding: encoding,
      title: "",
      currency: "EUR",
    };

    const concepts = {};
    const aliasMap = {};
    const rawD = [];
    const rawT = [];
    const rawM = [];

    for (const rec of records) {
      if (!rec.startsWith("~")) continue;
      const parts = rec.split("|");
      const tag = parts[0].trim();

      if (tag === "~V") {
        vMeta.property = (parts[1] || "").trim();
        vMeta.fiebdc_version = (parts[2] || "").trim();
        vMeta.generator = (parts[3] || "").trim();
        vMeta.title = (parts[6] || "").trim();
      } else if (tag === "~C") {
        const rawCode = (parts[1] || "").trim();
        if (!rawCode) continue;
        const aliases = rawCode.split("\\").map((s) => s.trim()).filter(Boolean);
        if (!aliases.length) continue;
        const canonical = aliases[0];
        for (const a of aliases) aliasMap[a] = canonical;
        const unit = (parts[2] || "").trim();
        const summary = (parts[3] || "").trim().replace(/\r|\n/g, " ");
        const priceTokens = (parts[4] || "0").split("\\").map((s) => s.trim()).filter(Boolean);
        const price = parseFloatSafe(priceTokens[0] || "0", 0);
        const date = (parts[5] || "").trim();
        const typeCode = (parts[6] || "0").trim() || "0";
        concepts[canonical] = {
          code: canonical,
          aliases,
          unit,
          summary,
          price,
          date,
          type_code: typeCode,
          description: "",
          tech_params: {},
        };
      } else if (tag === "~D") {
        const p = (parts[1] || "").trim();
        const blob = parts[2] || "";
        if (p && blob) rawD.push([p, blob]);
      } else if (tag === "~T") {
        const c = (parts[1] || "").trim();
        const d = (parts[2] || "").trim();
        if (c) rawT.push([c, d]);
      } else if (tag === "~M") {
        rawM.push(parts);
      }
    }

    const resolveCode = (c) => {
      const cl = (c || "").trim();
      return aliasMap[cl] || cl;
    };

    for (const [rawC, desc] of rawT) {
      const code = resolveCode(rawC);
      if (concepts[code]) {
        concepts[code].description = desc.replace(/\r\n/g, "\n").trim();
      }
    }

    const decompositions = {};
    const allChildren = new Set();
    for (const [pRaw, blob] of rawD) {
      const pCode = resolveCode(pRaw.split("\\")[0]);
      const tokens = blob.replace(/\r|\n/g, "").split("\\");
      if (!decompositions[pCode]) decompositions[pCode] = [];
      for (let i = 0; i < tokens.length - 1; i += 3) {
        const rawChild = (tokens[i] || "").trim();
        if (!rawChild) continue;
        const childCode = resolveCode(rawChild);
        const factor = parseFloatSafe(tokens[i + 1], 1.0);
        const yieldQty = parseFloatSafe(tokens[i + 2], 1.0);
        decompositions[pCode].push({
          child_code: childCode,
          factor,
          yield_qty: yieldQty,
          local_qty: factor * yieldQty,
        });
        allChildren.add(childCode);
        if (!concepts[childCode]) {
          concepts[childCode] = {
            code: childCode,
            aliases: [childCode],
            unit: "",
            summary: childCode,
            price: 0,
            date: "",
            type_code: "0",
            description: "",
            tech_params: {},
          };
        }
      }
    }

    const measurements = [];
    const measByPair = new Map();
    const measByChild = new Map();

    rawM.forEach((parts, idx) => {
      const rel = (parts[1] || "").trim();
      let parentCode = "";
      let childCode = "";
      if (rel.includes("\\")) {
        const sp = rel.split("\\");
        parentCode = resolveCode(sp[0]);
        childCode = resolveCode(sp.slice(1).join("\\"));
      } else {
        childCode = resolveCode(rel);
      }
      const pos = (parts[2] || "").trim();
      const totalMeas = parseFloatSafe(parts[3], 0);
      const blob = (parts[4] || "").replace(/\r|\n/g, "");
      const sub = blob.split("\\");
      const lines = [];
      let lineIdx = 0;
      for (let i = 0; i < sub.length - 1; i += 6) {
        const lType = (sub[i] || "").trim();
        const comment = (sub[i + 1] || "").trim();
        const uStr = (sub[i + 2] || "").trim();
        const lStr = (sub[i + 3] || "").trim();
        const wStr = (sub[i + 4] || "").trim();
        const hStr = (sub[i + 5] || "").trim();
        if (!lType && !comment && !uStr && !lStr && !wStr && !hStr) continue;
        lineIdx++;
        const u = parseOptFloat(uStr);
        const l = parseOptFloat(lStr);
        const w = parseOptFloat(wStr);
        const h = parseOptFloat(hStr);
        const dims = [u, l, w, h].filter((d) => d !== null);
        let subtotal = null;
        if (lType !== "1" && lType !== "2" && dims.length > 0) {
          subtotal = Number(dims.reduce((acc, v) => acc * v, 1).toFixed(6));
        }
        lines.push({
          line_index: lineIdx,
          line_type: lType,
          comment,
          units: u,
          length: l,
          width: w,
          height: h,
          subtotal,
        });
      }
      const mObj = {
        measurement_id: idx + 1,
        parent_code: parentCode,
        child_code: childCode,
        position: pos,
        total_measured: totalMeas,
        lines_count: lines.length,
        lines,
      };
      measurements.push(mObj);
      if (parentCode) measByPair.set(`${parentCode}|${childCode}`, mObj);
      if (!measByChild.has(childCode)) measByChild.set(childCode, []);
      measByChild.get(childCode).push(mObj);
    });

    let roots = Object.keys(concepts).filter((c) => c.endsWith("##"));
    if (!roots.length) {
      roots = Object.keys(decompositions).filter((c) => !allChildren.has(c));
    }
    const rootCode = roots[0] || Object.keys(concepts)[0] || "ROOT##";
    const rootConcept = concepts[rootCode] || { code: rootCode, summary: fileName, price: 0, unit: "" };
    const rootTotal = rootConcept.price || 0;

    const isChapter = (code, parentRole) => {
      if (code.endsWith("##")) return false;
      if (code.endsWith("#")) return true;
      if ((parentRole === "ROOT" || parentRole === "CAPITULO") && decompositions[code]) {
        const cInfo = concepts[code] || {};
        if (!cInfo.unit && decompositions[code].some((ch) => ch.child_code.endsWith("#"))) return true;
      }
      return false;
    };

    const classifyRole = (code, parentRole) => {
      if (code === rootCode || code.endsWith("##")) return "ROOT";
      if (isChapter(code, parentRole)) return "CAPITULO";
      if (parentRole === "ROOT" || parentRole === "CAPITULO") return "PARTIDA";
      if (decompositions[code]) return "AUXILIAR";
      if (code.includes("%")) return "PORCENTAJE";
      const t = (concepts[code] || {}).type_code || "0";
      if (t === "1") return "MANO_OBRA";
      if (t === "2") return "MAQUINARIA";
      if (t === "3") return "MATERIAL";
      return "RECURSO_OTRO";
    };

    let maxChapDepth = 0;
    const scanDepth = (code, parentRole, chapDepth, visited) => {
      const role = classifyRole(code, parentRole);
      const curChap = role === "CAPITULO" ? chapDepth + 1 : chapDepth;
      if (curChap > maxChapDepth) maxChapDepth = curChap;
      for (const edge of decompositions[code] || []) {
        if (!visited.has(edge.child_code)) {
          const nextV = new Set(visited);
          nextV.add(edge.child_code);
          scanDepth(edge.child_code, role, curChap, nextV);
        }
      }
    };
    scanDepth(rootCode, null, 0, new Set([rootCode]));

    const budgetMatrix = [];
    let rowCounter = 0;

    const walk = (
      code,
      parentRowId,
      parentCode,
      parentRole,
      depth,
      factor,
      yieldQty,
      cumQtyFactor,
      pathCodes,
      pathTitles,
      chapChain,
      curPartida,
      visited
    ) => {
      rowCounter++;
      const myRowId = rowCounter;
      const cInfo = concepts[code] || { code, unit: "", summary: code, price: 0, description: "", type_code: "0" };
      const role = classifyRole(code, parentRole);
      const title = cInfo.summary || code;
      const unitPrice = cInfo.price || 0;
      const localQty = factor * yieldQty;
      const localAmount = Number((localQty * unitPrice).toFixed(2));

      let totalBudgetQty = 1;
      let totalBudgetAmount = unitPrice;
      if (role === "CAPITULO") {
        totalBudgetQty = localQty * cumQtyFactor;
        totalBudgetAmount = Number((localAmount * cumQtyFactor).toFixed(2));
      } else if (role !== "ROOT") {
        totalBudgetQty = Number((localQty * cumQtyFactor).toFixed(6));
        totalBudgetAmount = Number((totalBudgetQty * unitPrice).toFixed(2));
      }
      const sharePct = rootTotal > 0 ? Number(((totalBudgetAmount / rootTotal) * 100).toFixed(4)) : 0;
      const myChapters = role === "CAPITULO" ? [...chapChain, [code, title]] : chapChain;
      const myPartida = role === "PARTIDA" ? [code, title] : curPartida;

      let mObj = measByPair.get(`${parentCode}|${code}`);
      if (!mObj && role === "PARTIDA") {
        const cands = measByChild.get(code) || [];
        if (cands.length === 1) mObj = cands[0];
      }

      const row = {
        row_id: myRowId,
        parent_row_id: parentRowId,
        depth,
        node_role: role,
        chapter_depth: role === "CAPITULO" ? myChapters.length : null,
        path_codes: pathCodes.join(" > "),
        path_titles: pathTitles.join(" > "),
      };
      for (let lvl = 1; lvl <= maxChapDepth; lvl++) {
        row[`level_${lvl}_code`] = lvl <= myChapters.length ? myChapters[lvl - 1][0] : null;
        row[`level_${lvl}_title`] = lvl <= myChapters.length ? myChapters[lvl - 1][1] : null;
      }
      Object.assign(row, {
        partida_code: myPartida ? myPartida[0] : null,
        partida_title: myPartida ? myPartida[1] : null,
        parent_code: parentCode || null,
        code,
        unit: cInfo.unit,
        summary: title,
        description: cInfo.description,
        type_code: cInfo.type_code,
        unit_price: unitPrice,
        factor,
        yield_qty: yieldQty,
        local_qty: localQty,
        local_amount: localAmount,
        total_budget_qty: totalBudgetQty,
        total_budget_amount: totalBudgetAmount,
        budget_share_pct: sharePct,
        measurement_id: mObj ? mObj.measurement_id : null,
        measurement_total: mObj ? mObj.total_measured : null,
        measurement_lines_count: mObj ? mObj.lines_count : 0,
      });
      budgetMatrix.push(row);

      const childrenEdges = decompositions[code] || [];
      const breakdown = { MATERIAL: 0, MANO_OBRA: 0, MAQUINARIA: 0, OTROS: 0 };
      if (!childrenEdges.length) {
        if (role === "MATERIAL") breakdown.MATERIAL = totalBudgetAmount;
        else if (role === "MANO_OBRA") breakdown.MANO_OBRA = totalBudgetAmount;
        else if (role === "MAQUINARIA") breakdown.MAQUINARIA = totalBudgetAmount;
        else if (role !== "ROOT" && role !== "CAPITULO") breakdown.OTROS = totalBudgetAmount;
      } else {
        const nextCum = role === "ROOT" ? 1 : totalBudgetQty;
        for (const edge of childrenEdges) {
          const chCode = edge.child_code;
          if (visited.has(chCode)) continue;
          const chTitle = (concepts[chCode] || {}).summary || chCode;
          const nextV = new Set(visited);
          nextV.add(chCode);
          const chBreak = walk(
            chCode,
            myRowId,
            code,
            role,
            depth + 1,
            edge.factor,
            edge.yield_qty,
            nextCum,
            [...pathCodes, chCode],
            [...pathTitles, chTitle],
            myChapters,
            myPartida,
            nextV
          );
          breakdown.MATERIAL += chBreak.MATERIAL;
          breakdown.MANO_OBRA += chBreak.MANO_OBRA;
          breakdown.MAQUINARIA += chBreak.MAQUINARIA;
          breakdown.OTROS += chBreak.OTROS;
        }
      }
      row.breakdown_material = Number(breakdown.MATERIAL.toFixed(2));
      row.breakdown_mano_obra = Number(breakdown.MANO_OBRA.toFixed(2));
      row.breakdown_maquinaria = Number(breakdown.MAQUINARIA.toFixed(2));
      row.breakdown_otros = Number(breakdown.OTROS.toFixed(2));
      return breakdown;
    };

    walk(
      rootCode,
      null,
      "",
      null,
      0,
      1,
      1,
      1,
      [rootCode],
      [rootConcept.summary || rootCode],
      [],
      null,
      new Set([rootCode])
    );

    const roleCounts = {};
    for (const r of budgetMatrix) {
      roleCounts[r.node_role] = (roleCounts[r.node_role] || 0) + 1;
    }

    return {
      metadata: {
        ...vMeta,
        root_code: rootCode,
        root_title: rootConcept.summary,
        root_total: rootTotal,
        max_chapter_depth: maxChapDepth,
        counts: {
          concepts: Object.keys(concepts).length,
          decompositions: Object.keys(decompositions).length,
          measurements: measurements.length,
          matrix_rows: budgetMatrix.length,
          roles: roleCounts,
        },
      },
      concepts,
      decompositions,
      measurements,
      budget_matrix: budgetMatrix,
    };
  }

  const DB_NAME = "ARQMED_BC3_STUDIO_DB";
  const DB_VERSION = 1;
  const STORE_PROJECTS = "bc3_projects";
  const UI_PREFS_KEY = "ARQMED_BC3_UI_PREFS_V2";
  const DEFAULT_PROJECT_ID = "proj_default_arqmed";

  let activeProjectId = DEFAULT_PROJECT_ID;
  let savedProjectsMeta = [];
  let isInitialBoot = true;
  let memoryFallbackStore = new Map();

  function openLocalDB() {
    return new Promise((resolve) => {
      if (!window.indexedDB) {
        resolve(null);
        return;
      }
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
            db.createObjectStore(STORE_PROJECTS, { keyPath: "id" });
          }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = () => resolve(null);
      } catch (_err) {
        resolve(null);
      }
    });
  }

  async function dbGetAllProjects() {
    const db = await openLocalDB();
    if (!db) {
      return Array.from(memoryFallbackStore.values());
    }
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_PROJECTS, "readonly");
      const store = tx.objectStore(STORE_PROJECTS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }

  async function dbGetProject(id) {
    const db = await openLocalDB();
    if (!db) {
      return memoryFallbackStore.get(id) || null;
    }
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_PROJECTS, "readonly");
      const store = tx.objectStore(STORE_PROJECTS);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  async function dbPutProject(record) {
    memoryFallbackStore.set(record.id, record);
    const db = await openLocalDB();
    if (!db) return true;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_PROJECTS, "readwrite");
      const store = tx.objectStore(STORE_PROJECTS);
      store.put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  async function dbDeleteProject(id) {
    memoryFallbackStore.delete(id);
    const db = await openLocalDB();
    if (!db) return true;
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_PROJECTS, "readwrite");
      const store = tx.objectStore(STORE_PROJECTS);
      store.delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  function saveUiPrefsToLocal() {
    try {
      const prefs = {
        activeProjectId,
        theme: document.documentElement.dataset.theme || "light",
        visibleDockPanes: Array.from(visibleDockPanes),
        treeColumns,
        treeRowDensity,
        hideHashInCodes,
        visibleTreeRoles: Array.from(visibleTreeRoles),
        sideDockCollapsed: !!document.getElementById("sidePanelDock")?.classList.contains("collapsed"),
      };
      localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
    } catch (_e) {
    }
  }

  function loadUiPrefsFromLocal() {
    try {
      const raw = localStorage.getItem(UI_PREFS_KEY);
      if (!raw) return;
      const prefs = JSON.parse(raw);
      if (prefs.activeProjectId) activeProjectId = prefs.activeProjectId;
      if (prefs.theme) document.documentElement.dataset.theme = prefs.theme;
      if (Array.isArray(prefs.visibleDockPanes)) {
        visibleDockPanes.clear();
        prefs.visibleDockPanes.forEach((id) => visibleDockPanes.add(id));
      }
      if (Array.isArray(prefs.treeColumns) && prefs.treeColumns.length) {
        treeColumns = prefs.treeColumns;
      }
      if (prefs.treeRowDensity) {
        treeRowDensity = prefs.treeRowDensity;
        document.querySelectorAll("[data-row-density]").forEach((b) => {
          b.classList.toggle("active", b.dataset.rowDensity === treeRowDensity);
        });
      }
      if (typeof prefs.hideHashInCodes === "boolean") {
        hideHashInCodes = prefs.hideHashInCodes;
        const chk = document.getElementById("chkHideHashSymbol");
        if (chk) chk.checked = hideHashInCodes;
      }
      if (Array.isArray(prefs.visibleTreeRoles) && prefs.visibleTreeRoles.length) {
        visibleTreeRoles.clear();
        prefs.visibleTreeRoles.forEach((r) => visibleTreeRoles.add(r));
        document.querySelectorAll("[data-vis-role]").forEach((chip) => {
          chip.classList.toggle("active", visibleTreeRoles.has(chip.dataset.visRole));
        });
      }
      if (typeof prefs.sideDockCollapsed === "boolean") {
        const dock = document.getElementById("sidePanelDock");
        const toggleBtn = document.getElementById("btnToggleSideDock");
        if (dock) dock.classList.toggle("collapsed", prefs.sideDockCollapsed);
        if (toggleBtn) toggleBtn.textContent = prefs.sideDockCollapsed ? "▶" : "◀";
      }
    } catch (_e) {
    }
  }

  function buildProjectRecord(id, data, customName = null) {
    const meta = data.metadata || {};
    const name = customName || meta.source_file || "Presupuesto.bc3";
    const title = meta.root_title || meta.title || name;
    return {
      id,
      name,
      title,
      updatedAt: new Date().toISOString(),
      totalBudget: Number(meta.root_total || 0),
      currency: meta.currency || "EUR",
      rowCount: (data.budget_matrix || []).length,
      data: JSON.parse(JSON.stringify(data)),
    };
  }

  function setLocalSaveStatus(stateText, isSaving = false) {
    const badge = document.getElementById("localSaveBadge");
    if (!badge) return;
    badge.textContent = stateText;
    badge.classList.toggle("saving", isSaving);
  }

  async function saveActiveProjectToLocal() {
    if (!currentData || isInitialBoot) return;
    setLocalSaveStatus("⟳ Guardando...", true);
    const existing = savedProjectsMeta.find((p) => p.id === activeProjectId);
    const customName = existing ? existing.name : currentData.metadata.source_file;
    const record = buildProjectRecord(activeProjectId, currentData, customName);
    await dbPutProject(record);
    saveUiPrefsToLocal();
    await refreshProjectsLibraryUI();
    const timeStr = new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    setLocalSaveStatus(`✓ Guardado Local (${timeStr})`, false);
  }

  async function refreshProjectsLibraryUI() {
    const all = await dbGetAllProjects();
    all.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
    savedProjectsMeta = all.map((p) => ({
      id: p.id,
      name: p.name,
      title: p.title,
      updatedAt: p.updatedAt,
      totalBudget: p.totalBudget,
      currency: p.currency,
      rowCount: p.rowCount,
    }));

    const optionsHtml = savedProjectsMeta
      .map(
        (p) =>
          `<option value="${escapeHtml(p.id)}" ${p.id === activeProjectId ? "selected" : ""}>📁 ${escapeHtml(p.name)} (${formatEuro(p.totalBudget)} €)</option>`
      )
      .join("");

    const topSel = document.getElementById("projectSwitcherSelect");
    if (topSel) topSel.innerHTML = optionsHtml;
    const sideSel = document.getElementById("sideProjectSelect");
    if (sideSel) sideSel.innerHTML = optionsHtml;

    const btnOpenModal = document.getElementById("btnOpenProjectsModal");
    if (btnOpenModal) {
      btnOpenModal.innerHTML = `<span>📁 Mis .BC3 (${savedProjectsMeta.length})</span>`;
    }

    const statsEl = document.getElementById("localStorageStatsText");
    if (statsEl) {
      statsEl.textContent = `${savedProjectsMeta.length} presupuesto(s) guardado(s) localmente en este dispositivo.`;
    }

    const cardsEl = document.getElementById("projectsCardsContainer");
    if (!cardsEl) return;
    cardsEl.innerHTML = savedProjectsMeta
      .map((p) => {
        const isActive = p.id === activeProjectId;
        const dt = p.updatedAt ? new Date(p.updatedAt).toLocaleString("es-ES") : "—";
        return `
          <div class="project-card ${isActive ? "active-project" : ""}">
            <div class="project-card-info">
              <div class="project-card-title">
                <span>${escapeHtml(p.name)}</span>
                ${isActive ? `<span class="local-save-pill">EN USO AHORA</span>` : ""}
              </div>
              <div style="font-size:12px;color:var(--text-secondary);">${escapeHtml(p.title)}</div>
              <div class="project-card-meta">
                <strong style="color:var(--accent);">${formatEuro(p.totalBudget)} ${escapeHtml(p.currency || "€")}</strong>
                <span>·</span>
                <span>${fmtNum.format(p.rowCount || 0)} nodos</span>
                <span>·</span>
                <span>Actualizado: ${escapeHtml(dt)}</span>
              </div>
            </div>
            <div class="project-card-actions">
              ${!isActive
            ? `<button type="button" class="btn-confirm-ok" data-proj-activate="${escapeHtml(p.id)}" style="padding:5px 10px;font-size:11.5px;">✓ Usar este .BC3</button>`
            : `<button type="button" class="lvl-pill active" disabled style="cursor:default;">✓ Activo</button>`
          }
              <button type="button" class="lvl-pill" data-proj-rename="${escapeHtml(p.id)}" title="Cambiar nombre del proyecto">✏️ Renombrar</button>
              <button type="button" class="lvl-pill" data-proj-duplicate="${escapeHtml(p.id)}" title="Crear una copia independiente de este presupuesto">⎘ Duplicar</button>
              <button type="button" class="lvl-pill" data-proj-export="${escapeHtml(p.id)}" title="Descargar archivo .BC3">💾 .BC3</button>
              ${savedProjectsMeta.length > 1
            ? `<button type="button" class="lvl-pill" data-proj-delete="${escapeHtml(p.id)}" style="border-color:rgba(239,68,68,0.4);color:#fca5a5;" title="Eliminar de la memoria local">🗑</button>`
            : ""
          }
            </div>
          </div>
        `;
      })
      .join("");
  }

  async function renameProjectById(pid) {
    const rec = await dbGetProject(pid);
    if (!rec) return;
    const newName = window.prompt("Nuevo nombre para este archivo .BC3:", rec.name);
    if (!newName || !newName.trim()) return;
    rec.name = newName.trim();
    rec.updatedAt = new Date().toISOString();
    if (rec.data && rec.data.metadata) {
      rec.data.metadata.source_file = rec.name;
    }
    await dbPutProject(rec);
    if (pid === activeProjectId && currentData) {
      currentData.metadata.source_file = rec.name;
      renderHeaderAndLevelButtons();
    }
    await refreshProjectsLibraryUI();
  }

  async function switchActiveProject(projectId) {
    const rec = await dbGetProject(projectId);
    if (!rec || !rec.data) return;
    activeProjectId = rec.id;
    rec.data.metadata.source_file = rec.name;
    saveUiPrefsToLocal();
    isInitialBoot = true;
    loadDataset(rec.data);
    isInitialBoot = false;
    await refreshProjectsLibraryUI();
    setLocalSaveStatus("✓ Cargado Local", false);
  }

  function loadDataset(data) {
    currentData = data;
    undoStack = [];
    redoStack = [];
    updateUndoButton();
    expandedRowIds.clear();

    for (const row of data.budget_matrix || []) {
      if (row.node_role === "ROOT" || (row.node_role === "CAPITULO" && row.chapter_depth <= 1)) {
        expandedRowIds.add(row.row_id);
      }
    }

    rebuildIndexesAndRefreshUI(1);
  }

  function rebuildIndexesAndRefreshUI(keepRowId = 1) {
    rowMap.clear();
    childrenMap.clear();
    measurementById.clear();

    const roleCounts = {};
    for (const m of currentData.measurements || []) {
      measurementById.set(m.measurement_id, m);
    }

    for (const row of currentData.budget_matrix || []) {
      rowMap.set(row.row_id, row);
      const pId = row.parent_row_id || 0;
      if (!childrenMap.has(pId)) childrenMap.set(pId, []);
      childrenMap.get(pId).push(row);
      roleCounts[row.node_role] = (roleCounts[row.node_role] || 0) + 1;
    }

    currentData.metadata.counts.matrix_rows = currentData.budget_matrix.length;
    currentData.metadata.counts.roles = roleCounts;

    selectedRowId = rowMap.has(Number(keepRowId)) ? Number(keepRowId) : 1;
    renderHeaderAndLevelButtons();
    renderArqmedTree();
    selectRow(selectedRowId, false);
    initMatrixExplorer();
    renderAnalyticsDashboard();
    if (!isInitialBoot) {
      saveActiveProjectToLocal();
    }
  }

  function renderHeaderAndLevelButtons() {
    const meta = currentData.metadata;
    document.getElementById("projectTitle").textContent = `${formatCodeDisplay(meta.root_code)} — ${meta.root_title}`;
    document.getElementById("projectSubtitle").innerHTML = `
      <span>Archivo: <strong>${escapeHtml(meta.source_file)}</strong></span>
      <span>·</span>
      <span>${escapeHtml(meta.fiebdc_version || "FIEBDC-3")}</span>
    `;

    const kpiEl = document.getElementById("kpiTotal"); if (kpiEl) kpiEl.textContent = `${formatEuro(meta.root_total)} ${meta.currency || "€"}`;

    const container = document.getElementById("levelButtonsContainer");
    if (container) {
      container.innerHTML = "";
      for (let lvl = 1; lvl <= meta.max_chapter_depth; lvl++) {
        const btn = document.createElement("button");
        btn.className = "lvl-pill";
        btn.textContent = `Cap N${lvl}`;
        btn.title = `Desplegar capítulos hasta el Nivel ${lvl}`;
        btn.addEventListener("click", () => expandToChapterLevel(lvl));
        container.appendChild(btn);
      }
    }
  }

  function expandToChapterLevel(maxLevel) {
    expandedRowIds.clear();
    for (const row of currentData.budget_matrix) {
      if (row.node_role === "ROOT") {
        expandedRowIds.add(row.row_id);
      } else if (row.node_role === "CAPITULO" && row.chapter_depth < maxLevel) {
        expandedRowIds.add(row.row_id);
      }
    }
    renderArqmedTree();
  }

  function expandPartidas() {
    if (!currentData) return;
    expandedRowIds.clear();
    for (const r of currentData.budget_matrix) {
      if (r.node_role === "ROOT" || r.node_role === "CAPITULO") {
        expandedRowIds.add(r.row_id);
      }
    }
    renderArqmedTree();
  }

  function expandAll() {
    if (!currentData) return;
    for (const r of currentData.budget_matrix) {
      expandedRowIds.add(r.row_id);
    }
    renderArqmedTree();
  }

  function isRowRoleVisibleInTree(row) {
    if (row.node_role === "ROOT") return true;
    if (row.node_role === "CAPITULO") return visibleTreeRoles.has("CAPITULO");
    if (row.node_role === "PARTIDA") return visibleTreeRoles.has("PARTIDA");
    if (row.node_role === "MANO_OBRA") return visibleTreeRoles.has("MANO_OBRA");
    if (row.node_role === "MATERIAL") return visibleTreeRoles.has("MATERIAL");
    return visibleTreeRoles.has("OTHER");
  }

  function getVisibleTreeRows() {
    const q = treeSearchTerm.trim().toLowerCase();
    if (q) {
      const matchedAndAncestors = new Set();
      let matchCount = 0;
      for (const row of currentData.budget_matrix) {
        if (!isRowRoleVisibleInTree(row)) continue;
        if (
          row.code.toLowerCase().includes(q) ||
          (row.summary && row.summary.toLowerCase().includes(q))
        ) {
          matchCount++;
          let curr = row;
          while (curr) {
            matchedAndAncestors.add(curr.row_id);
            curr = curr.parent_row_id ? rowMap.get(curr.parent_row_id) : null;
          }
        }
      }
      document.getElementById("searchShortcutBadge").textContent = `${matchCount} res.`;
      return currentData.budget_matrix.filter(
        (r) => matchedAndAncestors.has(r.row_id) && isRowRoleVisibleInTree(r)
      );
    }

    document.getElementById("searchShortcutBadge").textContent = "Ctrl+K";
    const visible = [];
    const visit = (parentId) => {
      const children = childrenMap.get(parentId) || [];
      for (const ch of children) {
        if (isRowRoleVisibleInTree(ch)) {
          visible.push(ch);
        }
        if (expandedRowIds.has(ch.row_id)) {
          visit(ch.row_id);
        }
      }
    };
    visit(0);
    return visible;
  }

  function renderTreeColumnsSidebar() {
    const listEl = document.getElementById("sideTreeColumnsList");
    if (!listEl) return;
    listEl.innerHTML = treeColumns
      .map((col, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === treeColumns.length - 1;
        return `
          <div class="side-col-item ${col.visible ? "" : "col-hidden"}">
            <label class="side-col-left" title="Mostrar u ocultar columna ${escapeHtml(col.label)}">
              <input type="checkbox" data-col-vis="${col.id}" ${col.visible ? "checked" : ""} />
              <span class="side-col-name">${escapeHtml(col.shortLabel)}</span>
            </label>
            <div class="side-col-controls">
              <button type="button" class="col-mini-btn" data-col-move="${col.id}" data-dir="-1" ${isFirst ? "disabled" : ""} title="Mover columna a la izquierda / arriba">◀</button>
              <button type="button" class="col-mini-btn" data-col-move="${col.id}" data-dir="1" ${isLast ? "disabled" : ""} title="Mover columna a la derecha / abajo">▶</button>
              <button type="button" class="col-mini-btn" data-col-resize="${col.id}" data-delta="-22" title="Hacer columna más pequeña">−</button>
              <button type="button" class="col-mini-btn" data-col-resize="${col.id}" data-delta="22" title="Hacer columna más grande">+</button>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderTreeHead() {
    const thead = document.getElementById("arqmedTreeHead");
    const table = document.getElementById("arqmedTreeTable");
    if (!thead || !table) return;

    table.classList.remove("tree-density-sm", "tree-density-md", "tree-density-lg", "tree-density-xl");
    table.classList.add(`tree-density-${treeRowDensity}`);

    const activeCols = treeColumns.filter((c) => c.visible);
    thead.innerHTML = `
      <tr>
        ${activeCols
        .map((col) => {
          const widthStyle = col.flex
            ? `min-width:${col.width}px;width:${col.width}px;`
            : `width:${col.width}px;min-width:${Math.max(40, col.width - 20)}px;`;
          return `
              <th class="th-customizable ${col.num ? "num" : ""}" style="${widthStyle}" draggable="true" data-th-col="${col.id}" title="Arrastra para intercambiar esta columna o tira del borde derecho para redimensionar">
                <span>${escapeHtml(col.label)}</span>
                <span class="col-resize-handle" data-col-drag-resize="${col.id}"></span>
              </th>
            `;
        })
        .join("")}
      </tr>
    `;
  }

  function moveTreeRow(rowId, direction) {
    const targetRow = rowMap.get(Number(rowId));
    if (!targetRow || targetRow.node_role === "ROOT") return;

    const siblings = childrenMap.get(targetRow.parent_row_id || 0) || [];
    const sibIdx = siblings.findIndex((s) => s.row_id === targetRow.row_id);
    if (sibIdx === -1) return;

    const swapSibIdx = sibIdx + direction;
    if (swapSibIdx < 0 || swapSibIdx >= siblings.length) return;
    const otherRow = siblings[swapSibIdx];

    const collectSubtreeIds = (rootId) => {
      const set = new Set([rootId]);
      const stack = [rootId];
      while (stack.length) {
        const cur = stack.pop();
        for (const ch of childrenMap.get(cur) || []) {
          set.add(ch.row_id);
          stack.push(ch.row_id);
        }
      }
      return set;
    };

    const targetSet = collectSubtreeIds(targetRow.row_id);
    const otherSet = collectSubtreeIds(otherRow.row_id);

    const matrix = currentData.budget_matrix;
    const targetBlock = matrix.filter((r) => targetSet.has(r.row_id));
    const otherBlock = matrix.filter((r) => otherSet.has(r.row_id));

    const firstIdx = matrix.findIndex((r) => targetSet.has(r.row_id) || otherSet.has(r.row_id));
    if (firstIdx === -1) return;

    pushUndoSnapshot(`Mover fila ${formatCodeDisplay(targetRow.code)}`);

    const remaining = matrix.filter((r) => !targetSet.has(r.row_id) && !otherSet.has(r.row_id));
    const replacement = direction < 0 ? [...targetBlock, ...otherBlock] : [...otherBlock, ...targetBlock];
    remaining.splice(firstIdx, 0, ...replacement);
    currentData.budget_matrix = remaining;

    rebuildIndexesAndRefreshUI(targetRow.row_id);
  }

  function renderArqmedTree() {
    renderTreeHead();
    renderTreeColumnsSidebar();

    const tbody = document.getElementById("arqmedTreeBody");
    const rows = getVisibleTreeRows();
    visibleTreeRowIds = rows.map((r) => r.row_id);
    const activeCols = treeColumns.filter((c) => c.visible);

    const htmlChunks = rows.map((row) => {
      const hasChildren = (childrenMap.get(row.row_id) || []).length > 0;
      const isExpanded = treeSearchTerm.trim() !== "" || expandedRowIds.has(row.row_id);
      const indentPx = row.depth * 18;

      let rowClass = "";
      if (row.node_role === "ROOT") rowClass = "row-root";
      else if (row.node_role === "CAPITULO") rowClass = `row-cap-${Math.min(row.chapter_depth || 1, 5)}`;
      if (row.row_id === selectedRowId) rowClass += " selected";

      const twistyHtml = hasChildren
        ? `<button type="button" class="twisty-btn ${isExpanded ? "expanded" : ""}" data-toggle-row="${row.row_id}" aria-label="${isExpanded ? "Colapsar" : "Expandir"}">${SVG_ICONS.CHEVRON}</button>`
        : `<span class="twisty-leaf">·</span>`;

      const qtyDisplay = row.node_role === "ROOT" ? formatQty(1) : formatQty(row.local_qty);
      const pct = Math.min(100, Math.max(0, row.budget_share_pct || 0));

      const cellsHtml = activeCols
        .map((col) => {
          switch (col.id) {
            case "code":
              return `
                <td>
                  <div class="tree-cell" style="padding-left:${indentPx}px">
                    ${twistyHtml}
                    <span style="font-family:var(--font-mono);font-weight:600;" title="Código BC3: ${escapeHtml(row.code)}">${escapeHtml(formatCodeDisplay(row.code))}</span>
                  </div>
                </td>
              `;
            case "role":
              return `<td>${getRoleBadgeHtml(row)}</td>`;
            case "unit":
              return `
                <td style="color:var(--text-secondary);font-family:var(--font-mono);">
                  <span class="editable-cell" data-edit-row="${row.row_id}" title="Editar unidad">${escapeHtml(row.unit || "—")}</span>
                </td>
              `;
            case "summary":
              return `
                <td>
                  <span class="editable-cell" data-edit-row="${row.row_id}" title="Clic para editar este concepto con previsualización OK/NO">${escapeHtml(row.summary)}</span>
                </td>
              `;
            case "qty":
              return `
                <td class="num">
                  <span class="editable-cell" data-edit-row="${row.row_id}" title="Editar cantidad / rendimiento">${qtyDisplay}</span>
                </td>
              `;
            case "price":
              return `
                <td class="num">
                  <span class="editable-cell" data-edit-row="${row.row_id}" title="Editar precio unitario (€)">${formatEuro(row.unit_price)}</span>
                </td>
              `;
            case "amount":
              return `<td class="num" style="font-weight:700;">${formatEuro(row.local_amount)}</td>`;
            case "share":
              return `
                <td class="num">
                  <div class="share-cell">
                    <div class="share-track"><div class="share-fill" style="width:${pct}%"></div></div>
                    <span>${pct.toFixed(2)}%</span>
                  </div>
                </td>
              `;
            case "actions":
              return `
                <td class="num">
                  <div class="row-actions">
                    ${row.node_role !== "ROOT"
                  ? `<button type="button" class="icon-btn" data-move-row="${row.row_id}" data-dir="-1" title="Subir fila (intercambiar con anterior)">${SVG_ICONS.ARROW_UP}</button>
                         <button type="button" class="icon-btn" data-move-row="${row.row_id}" data-dir="1" title="Bajar fila (intercambiar con siguiente)">${SVG_ICONS.ARROW_DOWN}</button>`
                  : ""
                }
                    <button type="button" class="icon-btn" data-edit-row="${row.row_id}" title="Editar y previsualizar impacto (OK/NO)">${SVG_ICONS.EDIT}</button>
                    <button type="button" class="icon-btn" data-add-child="${row.row_id}" title="Añadir capítulo, partida o recurso hijo">${SVG_ICONS.PLUS}</button>
                    ${row.node_role !== "ROOT"
                  ? `<button type="button" class="icon-btn danger" data-delete-row="${row.row_id}" title="Eliminar fila con confirmación OK/NO">${SVG_ICONS.TRASH}</button>`
                  : ""
                }
                  </div>
                </td>
              `;
            default:
              return `<td></td>`;
          }
        })
        .join("");

      return `<tr class="${rowClass}" data-row-id="${row.row_id}">${cellsHtml}</tr>`;
    });

    tbody.innerHTML = htmlChunks.join("");
  }

  function selectRow(rowId, scrollTree = false) {
    const row = rowMap.get(Number(rowId));
    if (!row) return;
    selectedRowId = row.row_id;
    notifyStateChange();

    document.querySelectorAll("#arqmedTreeBody tr.selected").forEach((tr) => tr.classList.remove("selected"));
    const activeTr = document.querySelector(`#arqmedTreeBody tr[data-row-id="${selectedRowId}"]`);
    if (activeTr) {
      activeTr.classList.add("selected");
      if (scrollTree) activeTr.scrollIntoView({ block: "nearest" });
    }

    const ancestorChain = [];
    let curr = row;
    while (curr) {
      ancestorChain.unshift(curr);
      curr = curr.parent_row_id ? rowMap.get(curr.parent_row_id) : null;
    }

    const breadcrumbEl = document.getElementById("activeBreadcrumb");
    breadcrumbEl.innerHTML = ancestorChain
      .map(
        (node) =>
          `<button type="button" class="crumb-node" data-crumb-row="${node.row_id}" title="${escapeHtml(node.summary)}">${escapeHtml(formatCodeDisplay(node.code))}</button>`
      )
      .join(`<span class="crumb-sep">›</span>`);

    renderDecompositionPane(row);
    initDraftMeasurementsForRow(row);
    renderRightDetailPane(row);
  }

  function renderDecompositionPane(row) {
    const directChildren = childrenMap.get(row.row_id) || [];
    document.getElementById("decompHeaderTitle").textContent = `Descomposición`;
    document.getElementById("decompCountBadge").textContent = `${directChildren.length} hijos`;

    const tbody = document.getElementById("decompTableBody");
    if (!directChildren.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align:center;padding:24px 16px;color:var(--text-secondary);">
            Concepto elemental (${escapeHtml(formatCodeDisplay(row.code))} — ${escapeHtml(row.node_role)}). Puedes pulsar <strong>✏️ Editar</strong> en el árbol o <strong>+ Añadir Recurso</strong> arriba para descomponerlo.
          </td>
        </tr>
      `;
    } else {
      tbody.innerHTML = directChildren
        .map(
          (ch) => `
          <tr data-decomp-row="${ch.row_id}">
            <td style="font-family:var(--font-mono);font-weight:600;color:var(--accent);" title="Código BC3: ${escapeHtml(ch.code)}">${escapeHtml(formatCodeDisplay(ch.code))}</td>
            <td>${getRoleBadgeHtml(ch)}</td>
            <td style="font-family:var(--font-mono);color:var(--text-secondary);">
              <span class="editable-cell" data-edit-row="${ch.row_id}">${escapeHtml(ch.unit || "—")}</span>
            </td>
            <td>
              <span class="editable-cell" data-edit-row="${ch.row_id}">${escapeHtml(ch.summary)}</span>
            </td>
            <td class="num">
              <span class="editable-cell" data-edit-row="${ch.row_id}">${formatQty(ch.factor)}</span>
            </td>
            <td class="num">
              <span class="editable-cell" data-edit-row="${ch.row_id}">${formatQty(ch.yield_qty)}</span>
            </td>
            <td class="num">
              <span class="editable-cell" data-edit-row="${ch.row_id}">${formatEuro(ch.unit_price)}</span>
            </td>
            <td class="num" style="font-weight:700;">${formatEuro(ch.local_amount)}</td>
            <td class="num">
              <div class="row-actions">
                <button type="button" class="icon-btn" data-edit-row="${ch.row_id}" title="Editar con vista previa de impacto (OK/NO)">${SVG_ICONS.EDIT}</button>
                <button type="button" class="icon-btn danger" data-delete-row="${ch.row_id}" title="Eliminar este hijo">${SVG_ICONS.TRASH}</button>
              </div>
            </td>
          </tr>
        `
        )
        .join("");
    }

    const mat = row.breakdown_material || 0;
    const mo = row.breakdown_mano_obra || 0;
    const maq = row.breakdown_maquinaria || 0;
    const otr = row.breakdown_otros || 0;
    const sumBreak = mat + mo + maq + otr || 1;

    const pMat = ((mat / sumBreak) * 100).toFixed(2);
    const pMo = ((mo / sumBreak) * 100).toFixed(2);
    const pMaq = ((maq / sumBreak) * 100).toFixed(2);
    const pOtr = ((otr / sumBreak) * 100).toFixed(2);

    document.getElementById("natureBreakdownStrip").innerHTML = `
      <div class="nature-bar">
        <div style="width:${pMat}%;background:var(--role-material);" title="Materiales: ${formatEuro(mat)} € (${pMat}%)"></div>
        <div style="width:${pMo}%;background:var(--role-mano-obra);" title="Mano de Obra: ${formatEuro(mo)} € (${pMo}%)"></div>
        <div style="width:${pMaq}%;background:var(--role-maquinaria);" title="Maquinaria: ${formatEuro(maq)} € (${pMaq}%)"></div>
        <div style="width:${pOtr}%;background:var(--role-auxiliar);" title="Otros: ${formatEuro(otr)} € (${pOtr}%)"></div>
      </div>
      <div class="nature-legend">
        <span class="legend-item" style="color:var(--role-material);">
          ${SVG_ICONS.MATERIAL}
          <span><strong>Materiales:</strong> ${formatEuro(mat)} € (${pMat}%)</span>
        </span>
        <span class="legend-item" style="color:var(--role-mano-obra);">
          ${SVG_ICONS.MANO_OBRA}
          <span><strong>Mano de Obra:</strong> ${formatEuro(mo)} € (${pMo}%)</span>
        </span>
        <span class="legend-item" style="color:var(--role-maquinaria);">
          ${SVG_ICONS.MAQUINARIA}
          <span><strong>Maquinaria:</strong> ${formatEuro(maq)} € (${pMaq}%)</span>
        </span>
      </div>
    `;
  }

  function getMeasurementTargetRow(row) {
    let mRow = row;
    if (mRow.node_role !== "PARTIDA" && mRow.parent_row_id) {
      const pCand = rowMap.get(mRow.parent_row_id);
      if (pCand && (pCand.node_role === "PARTIDA" || pCand.measurement_id)) {
        mRow = pCand;
      }
    }
    return mRow;
  }

  function initDraftMeasurementsForRow(row) {
    const mRow = getMeasurementTargetRow(row);
    draftMeasurementRowId = mRow.row_id;
    const mObj = mRow.measurement_id ? measurementById.get(mRow.measurement_id) : null;
    draftMeasurementLines = mObj ? JSON.parse(JSON.stringify(mObj.lines)) : [];
    isMeasurementDirty = false;
    document.getElementById("measDirtyBanner").classList.remove("visible");
  }

  function recomputeDraftMeasurementTotals() {
    let sum = 0;
    draftMeasurementLines.forEach((l, idx) => {
      l.line_index = idx + 1;
      const dims = [l.units, l.length, l.width, l.height].filter(
        (d) => d !== null && d !== undefined && String(d).trim() !== "" && !Number.isNaN(Number(d))
      );
      if (l.line_type === "1" || l.line_type === "2") {
        l.subtotal = null;
      } else if (dims.length > 0) {
        const prod = dims.reduce((acc, v) => acc * Number(v), 1);
        l.subtotal = Number(prod.toFixed(6));
        sum += l.subtotal;
      } else {
        l.subtotal = null;
      }
    });
    return Number(sum.toFixed(4));
  }

  function renderMeasurementsEditor() {
    const mRow = rowMap.get(draftMeasurementRowId);
    const measBadge = document.getElementById("measSummaryBadge");
    const measBody = document.getElementById("measurementsTableBody");
    if (!mRow) return;

    const draftTotal = recomputeDraftMeasurementTotals();
    const currentStored = mRow.measurement_total !== null ? mRow.measurement_total : mRow.local_qty;

    measBadge.textContent = `Total: ${formatQty(draftTotal)}${mRow.unit ? " " + mRow.unit : ""}`;

    if (!draftMeasurementLines.length) {
      measBody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center;padding:24px 16px;color:var(--text-secondary);">
            Esta fila (${escapeHtml(mRow.code)}) no tiene líneas de medición detalladas. Pulsa <strong>+ Línea de Medición</strong> arriba para crear su desglose dimensional.
          </td>
        </tr>
      `;
      return;
    }

    measBody.innerHTML = draftMeasurementLines
      .map((l, idx) => {
        const isHeader = l.subtotal === null && l.comment;
        const rowStyle = isHeader ? "background:rgba(56,189,248,0.08);" : "";
        const fmtVal = (v) => (v !== null && v !== undefined && v !== "" && !Number.isNaN(Number(v)) ? Number(v).toFixed(2) : "");
        return `
          <tr style="${rowStyle}" data-meas-idx="${idx}">
            <td class="num" style="color:var(--text-tertiary);">${idx + 1}</td>
            <td>
              <input type="text" class="meas-input text-left" data-mfield="comment" data-midx="${idx}" value="${escapeHtml(l.comment || "")}" placeholder="Comentario o zona..." />
            </td>
            <td class="num">
              <input type="text" inputmode="decimal" class="meas-input" data-mfield="units" data-midx="${idx}" value="${fmtVal(l.units)}" />
            </td>
            <td class="num">
              <input type="text" inputmode="decimal" class="meas-input" data-mfield="length" data-midx="${idx}" value="${fmtVal(l.length)}" />
            </td>
            <td class="num">
              <input type="text" inputmode="decimal" class="meas-input" data-mfield="width" data-midx="${idx}" value="${fmtVal(l.width)}" />
            </td>
            <td class="num">
              <input type="text" inputmode="decimal" class="meas-input" data-mfield="height" data-midx="${idx}" value="${fmtVal(l.height)}" />
            </td>
            <td class="num" style="font-weight:700;" id="measSubtotal_${idx}">
              ${l.subtotal !== null ? formatQty(l.subtotal) : `<span style="color:var(--accent);font-size:10.5px;">ZONA</span>`}
            </td>
            <td class="num">
              <button type="button" class="icon-btn danger" data-del-meas="${idx}" title="Eliminar línea de medición">✕</button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function renderRightDetailPane(row) {
    renderMeasurementsEditor();

    const pliegoEl = document.getElementById("pliegoContent");
    const descText = row.description || "";
    pliegoEl.innerHTML = `
      <div class="pliego-meta-banner">
        <div>
          <span style="font-family:var(--font-mono);font-weight:700;color:var(--accent);">${escapeHtml(row.code)}</span>
          <span style="margin:0 6px;color:var(--text-tertiary);">·</span>
          <strong>${escapeHtml(row.summary)}</strong>
        </div>
        <button type="button" id="btnSavePliegoPreview" class="btn-confirm-ok" style="padding:4px 10px;font-size:11.5px;">
          ✓ Previsualizar y Guardar Pliego (OK/NO)
        </button>
      </div>
      <textarea id="pliegoTextarea" class="form-input" style="width:100%;flex:1;min-height:220px;height:100%;line-height:1.6;resize:vertical;box-sizing:border-box;" placeholder="Escribe o edita aquí la descripción técnica completa (~T) de este concepto...">${escapeHtml(descText)}</textarea>
    `;

    document.getElementById("btnSavePliegoPreview").addEventListener("click", () => {
      const newText = document.getElementById("pliegoTextarea").value;
      openImpactModalForPliego(row.row_id, newText);
    });
  }

  function openImpactModalForConcept(rowId) {
    const focusRow = rowMap.get(Number(rowId));
    if (!focusRow) return;

    modalState.mode = "EDIT_CONCEPT";
    modalState.focusRowId = focusRow.row_id;
    modalState.code = focusRow.code;

    const allMatches = currentData.budget_matrix.filter((r) => r.code === focusRow.code);
    modalState.occurrences = allMatches;
    modalState.approvedSet = new Set(allMatches.map((r) => r.row_id));

    document.getElementById("impactModalTitleText").textContent = `Editar Concepto ${focusRow.code} — Previsualización de Impacto (OK / NO)`;
    document.getElementById("impactEditFieldsWrap").style.display = "grid";
    document.getElementById("impactBulkButtons").style.display = "flex";

    const codeIn = document.getElementById("editFieldCode");
    const unitIn = document.getElementById("editFieldUnit");
    const sumIn = document.getElementById("editFieldSummary");
    const yieldIn = document.getElementById("editFieldYield");
    const priceIn = document.getElementById("editFieldPrice");

    codeIn.readOnly = true;
    codeIn.value = focusRow.code;
    unitIn.value = focusRow.unit || "";
    sumIn.value = focusRow.summary || "";
    yieldIn.value = focusRow.local_qty;
    priceIn.value = focusRow.unit_price;

    document.getElementById("impactScopeSubtitle").innerHTML =
      allMatches.length > 1
        ? `⚠️ El concepto <strong>${escapeHtml(focusRow.code)}</strong> interviene en <strong>${allMatches.length} ubicaciones</strong> del presupuesto. Elige <strong>OK</strong> o <strong>NO</strong> en cada una antes de recalcular:`
        : `El concepto <strong>${escapeHtml(focusRow.code)}</strong> aparece en <strong>1 ubicación</strong>. Confirma con <strong>OK</strong> para recalcular en cascada:`;

    refreshImpactModalTable();
    document.getElementById("impactModalBackdrop").classList.add("open");
    priceIn.focus();
    priceIn.select();
  }

  function openImpactModalForMeasurement() {
    const mRow = rowMap.get(draftMeasurementRowId);
    if (!mRow) return;

    const newMeasTotal = recomputeDraftMeasurementTotals();
    modalState.mode = "CONFIRM_MEASUREMENT";
    modalState.focusRowId = mRow.row_id;
    modalState.code = mRow.code;
    modalState.draftNewLines = JSON.parse(JSON.stringify(draftMeasurementLines));
    modalState.occurrences = [mRow];
    modalState.approvedSet = new Set([mRow.row_id]);

    document.getElementById("impactModalTitleText").textContent = `Confirmar Nueva Medición (~M) en ${mRow.code} (${draftMeasurementLines.length} líneas)`;
    document.getElementById("impactEditFieldsWrap").style.display = "grid";
    document.getElementById("impactBulkButtons").style.display = "none";

    document.getElementById("editFieldCode").value = mRow.code;
    document.getElementById("editFieldUnit").value = mRow.unit || "";
    document.getElementById("editFieldSummary").value = mRow.summary || "";
    document.getElementById("editFieldYield").value = newMeasTotal;
    document.getElementById("editFieldPrice").value = mRow.unit_price;

    document.getElementById("impactScopeSubtitle").innerHTML = `
      La medición de <strong>${escapeHtml(mRow.code)}</strong> pasará de <strong>${formatQty(mRow.local_qty)} ${escapeHtml(mRow.unit || "")}</strong> a <strong>${formatQty(newMeasTotal)} ${escapeHtml(mRow.unit || "")}</strong>. Revisa el impacto económico antes de aplicar:
    `;

    refreshImpactModalTable();
    document.getElementById("impactModalBackdrop").classList.add("open");
  }

  function openImpactModalForAddChild(parentRowId) {
    const parentRow = rowMap.get(Number(parentRowId));
    if (!parentRow) return;

    modalState.mode = "ADD_CHILD";
    modalState.focusRowId = parentRow.row_id;
    modalState.occurrences = [parentRow];
    modalState.approvedSet = new Set([parentRow.row_id]);

    const nextIdx = (childrenMap.get(parentRow.row_id) || []).length + 1;
    let defaultCode = `NUEVO_${nextIdx}`;
    let defaultUnit = "ud";
    let defaultSummary = "Nuevo concepto";
    if (parentRow.node_role === "ROOT" || parentRow.node_role === "CAPITULO") {
      defaultCode = `${parentRow.code.replace(/#+$/, "")}.${nextIdx}`;
      defaultSummary = "Nueva partida de obra";
    } else {
      defaultCode = `MAT.${nextIdx}`;
      defaultSummary = "Nuevo recurso descompuesto";
    }

    document.getElementById("impactModalTitleText").textContent = `Añadir Nuevo Hijo dentro de ${parentRow.code} (${parentRow.summary})`;
    document.getElementById("impactEditFieldsWrap").style.display = "grid";
    document.getElementById("impactBulkButtons").style.display = "none";

    const codeIn = document.getElementById("editFieldCode");
    codeIn.readOnly = false;
    codeIn.value = defaultCode;
    document.getElementById("editFieldUnit").value = defaultUnit;
    document.getElementById("editFieldSummary").value = defaultSummary;
    document.getElementById("editFieldYield").value = 1;
    document.getElementById("editFieldPrice").value = 100;

    document.getElementById("impactScopeSubtitle").innerHTML = `
      Configura el nuevo nodo hijo para <strong>${escapeHtml(parentRow.code)}</strong> (termina el código en <code>#</code> si quieres que sea un Subcapítulo). Revisa el impacto antes de confirmar con <strong>OK</strong>:
    `;

    refreshImpactModalTable();
    document.getElementById("impactModalBackdrop").classList.add("open");
  }

  function openImpactModalForDelete(rowId) {
    const targetRow = rowMap.get(Number(rowId));
    if (!targetRow || targetRow.node_role === "ROOT") return;

    modalState.mode = "DELETE_NODE";
    modalState.focusRowId = targetRow.row_id;
    modalState.code = targetRow.code;
    modalState.occurrences = [targetRow];
    modalState.approvedSet = new Set([targetRow.row_id]);

    document.getElementById("impactModalTitleText").textContent = `Confirmar Eliminación de ${targetRow.code} (${targetRow.node_role})`;
    document.getElementById("impactEditFieldsWrap").style.display = "none";
    document.getElementById("impactBulkButtons").style.display = "none";

    document.getElementById("impactScopeSubtitle").innerHTML = `
      ⚠️ Vas a eliminar <strong>${escapeHtml(targetRow.code)} — ${escapeHtml(targetRow.summary)}</strong> y sus descendientes. Confirma con <strong>OK</strong> o cancela con <strong>NO</strong>:
    `;

    refreshImpactModalTable();
    document.getElementById("impactModalBackdrop").classList.add("open");
  }

  function openImpactModalForPliego(rowId, newPliegoText) {
    const focusRow = rowMap.get(Number(rowId));
    if (!focusRow) return;

    modalState.mode = "EDIT_PLIEGO";
    modalState.focusRowId = focusRow.row_id;
    modalState.code = focusRow.code;
    modalState.draftPliegoText = newPliegoText;

    const allMatches = currentData.budget_matrix.filter((r) => r.code === focusRow.code);
    modalState.occurrences = allMatches;
    modalState.approvedSet = new Set(allMatches.map((r) => r.row_id));

    document.getElementById("impactModalTitleText").textContent = `Actualizar Pliego (~T) de ${focusRow.code}`;
    document.getElementById("impactEditFieldsWrap").style.display = "none";
    document.getElementById("impactBulkButtons").style.display = allMatches.length > 1 ? "flex" : "none";

    document.getElementById("impactScopeSubtitle").innerHTML = `
      Selecciona con <strong>OK</strong> o <strong>NO</strong> en qué apariciones de <strong>${escapeHtml(focusRow.code)}</strong> quieres guardar el nuevo texto del pliego (~T):
    `;

    refreshImpactModalTable();
    document.getElementById("impactModalBackdrop").classList.add("open");
  }

  function refreshImpactModalTable() {
    const oldRootTotal = currentData.metadata.root_total || 0;
    const newPriceVal = Number(document.getElementById("editFieldPrice").value) || 0;
    const newYieldVal = Number(document.getElementById("editFieldYield").value) || 0;
    const focusRow = rowMap.get(modalState.focusRowId);

    let totalApprovedDelta = 0;
    let approvedCount = 0;

    const rowsHtml = modalState.occurrences
      .map((occ) => {
        const isOk = modalState.approvedSet.has(occ.row_id);
        if (isOk) approvedCount++;

        const oldAmt = occ.total_budget_amount || 0;
        let newAmt = oldAmt;

        if (modalState.mode === "DELETE_NODE") {
          newAmt = isOk ? 0 : oldAmt;
        } else if (modalState.mode === "ADD_CHILD") {
          const parentCum = occ.node_role === "ROOT" ? 1 : occ.total_budget_qty || 1;
          const addedAmt = Number((newYieldVal * newPriceVal * parentCum).toFixed(2));
          newAmt = isOk ? oldAmt + addedAmt : oldAmt;
        } else if (modalState.mode === "EDIT_PLIEGO") {
          newAmt = oldAmt;
        } else {
          const parentCum =
            occ.local_qty > 0 ? occ.total_budget_qty / occ.local_qty : 1;
          const targetLocalQty =
            occ.row_id === modalState.focusRowId ? newYieldVal : occ.local_qty;
          const simBudgetQty = targetLocalQty * parentCum;
          newAmt = isOk ? Number((simBudgetQty * newPriceVal).toFixed(2)) : oldAmt;
        }

        const delta = Number((newAmt - oldAmt).toFixed(2));
        if (isOk) totalApprovedDelta += delta;

        const deltaClass = delta > 0.005 ? "delta-pos" : delta < -0.005 ? "delta-neg" : "delta-zero";
        const isCurrentFocus = occ.row_id === modalState.focusRowId;

        return `
          <tr class="${isOk ? "" : "occurrence-rejected"}" style="${isCurrentFocus ? "background:rgba(56,189,248,0.07);" : ""}">
            <td>
              <div class="ok-no-group">
                <button type="button" class="decision-btn ok-btn ${isOk ? "active" : ""}" data-occ-ok="${occ.row_id}">✓ OK</button>
                <button type="button" class="decision-btn no-btn ${!isOk ? "active" : ""}" data-occ-no="${occ.row_id}">✕ NO</button>
              </div>
            </td>
            <td>${getRoleBadgeHtml(occ)}</td>
            <td style="font-size:11.5px;">
              <div style="font-family:var(--font-mono);color:var(--accent);font-weight:600;">
                ${escapeHtml(occ.path_codes)} ${isCurrentFocus ? `<span style="background:var(--accent-solid);color:#fff;padding:1px 5px;border-radius:3px;font-size:9.5px;">FILA ACTIVA</span>` : ""}
              </div>
              <div style="color:var(--text-secondary);font-size:11px;">${escapeHtml(occ.summary)}</div>
            </td>
            <td class="num">${formatQty(occ.total_budget_qty)} ${escapeHtml(occ.unit || "")}</td>
            <td class="num">${formatEuro(oldAmt)} €</td>
            <td class="num" style="font-weight:700;">${formatEuro(newAmt)} €</td>
            <td class="num ${deltaClass}" style="font-weight:700;">${formatSignedEuro(delta)}</td>
          </tr>
        `;
      })
      .join("");

    document.getElementById("impactOccurrencesBody").innerHTML = rowsHtml;

    const projectedTotal = Number((oldRootTotal + totalApprovedDelta).toFixed(2));
    document.getElementById("simOldTotal").textContent = `${formatEuro(oldRootTotal)} €`;
    document.getElementById("simNewTotal").textContent = `${formatEuro(projectedTotal)} €`;

    const deltaEl = document.getElementById("simDeltaTotal");
    deltaEl.textContent = formatSignedEuro(totalApprovedDelta);
    deltaEl.className = `v ${totalApprovedDelta > 0.005 ? "delta-pos" : totalApprovedDelta < -0.005 ? "delta-neg" : "delta-zero"}`;

    document.getElementById("simApprovedCount").textContent = `${approvedCount} / ${modalState.occurrences.length} OK`;
  }

  function applyConfirmedModalChanges() {
    if (modalState.approvedSet.size === 0) {
      closeImpactModal();
      return;
    }

    const newCodeInput = document.getElementById("editFieldCode").value.trim();
    const newUnit = document.getElementById("editFieldUnit").value.trim();
    const newSummary = document.getElementById("editFieldSummary").value.trim();
    const newYield = Number(document.getElementById("editFieldYield").value) || 0;
    const newPrice = Number(document.getElementById("editFieldPrice").value) || 0;

    if (modalState.mode === "CONFIRM_MEASUREMENT") {
      const mRow = rowMap.get(modalState.focusRowId);
      if (!mRow) return;
      pushUndoSnapshot(`Medición ${mRow.code}`);

      const cleanLines = modalState.draftNewLines;
      let mObj = mRow.measurement_id ? measurementById.get(mRow.measurement_id) : null;
      if (mObj) {
        mObj.lines = cleanLines;
        mObj.lines_count = cleanLines.length;
        mObj.total_measured = newYield;
      } else {
        const newMid = (currentData.measurements.length || 0) + 1;
        mObj = {
          measurement_id: newMid,
          matrix_row_id: mRow.row_id,
          parent_code: mRow.parent_code || "",
          child_code: mRow.code,
          position: "1\\",
          total_measured: newYield,
          lines_count: cleanLines.length,
          lines: cleanLines,
        };
        currentData.measurements.push(mObj);
        mRow.measurement_id = newMid;
      }

      mRow.measurement_total = newYield;
      mRow.measurement_lines_count = cleanLines.length;
      mRow.yield_qty = newYield;
      mRow.unit_price = newPrice;
      mRow.unit = newUnit;
      mRow.summary = newSummary;

      recalculateBudgetTree(new Set([mRow.row_id]));
      closeImpactModal();
      rebuildIndexesAndRefreshUI(mRow.row_id);
      return;
    }

    if (modalState.mode === "EDIT_PLIEGO") {
      pushUndoSnapshot(`Pliego ${modalState.code}`);
      const allOccurrencesIds = new Set(modalState.occurrences.map((o) => o.row_id));
      const approveAll = modalState.occurrences.every((o) => modalState.approvedSet.has(o.row_id));

      for (const occ of modalState.occurrences) {
        if (modalState.approvedSet.has(occ.row_id)) {
          occ.description = modalState.draftPliegoText;
        }
      }
      if (approveAll && currentData.concepts[modalState.code]) {
        currentData.concepts[modalState.code].description = modalState.draftPliegoText;
      }
      closeImpactModal();
      rebuildIndexesAndRefreshUI(modalState.focusRowId);
      return;
    }

    if (modalState.mode === "ADD_CHILD") {
      const parentRow = rowMap.get(modalState.focusRowId);
      if (!parentRow) return;
      pushUndoSnapshot(`Añadir ${newCodeInput}`);

      const maxRowId = currentData.budget_matrix.reduce((max, r) => Math.max(max, r.row_id), 0);
      const newRowId = maxRowId + 1;
      const isChap = newCodeInput.endsWith("#");
      let newRole = "RECURSO_OTRO";
      let chapDepth = null;

      if (isChap) {
        newRole = "CAPITULO";
        chapDepth = (parentRow.chapter_depth || 0) + 1;
        if (chapDepth > currentData.metadata.max_chapter_depth) {
          currentData.metadata.max_chapter_depth = chapDepth;
        }
      } else if (parentRow.node_role === "ROOT" || parentRow.node_role === "CAPITULO") {
        newRole = "PARTIDA";
      } else if (newCodeInput.toUpperCase().startsWith("MO") || newUnit === "h") {
        newRole = "MANO_OBRA";
      } else if (newCodeInput.toUpperCase().startsWith("MAQ")) {
        newRole = "MAQUINARIA";
      } else {
        newRole = "MATERIAL";
      }

      const newRow = {
        row_id: newRowId,
        parent_row_id: parentRow.row_id,
        depth: parentRow.depth + 1,
        node_role: newRole,
        chapter_depth: chapDepth,
        path_codes: `${parentRow.path_codes} > ${newCodeInput}`,
        path_titles: `${parentRow.path_titles} > ${newSummary}`,
        partida_code: newRole === "PARTIDA" ? newCodeInput : parentRow.partida_code,
        partida_title: newRole === "PARTIDA" ? newSummary : parentRow.partida_title,
        parent_code: parentRow.code,
        code: newCodeInput,
        unit: newUnit,
        summary: newSummary,
        description: "",
        type_code: newRole === "MANO_OBRA" ? "1" : newRole === "MAQUINARIA" ? "2" : newRole === "MATERIAL" ? "3" : "0",
        unit_price: newPrice,
        factor: 1,
        yield_qty: newYield,
        local_qty: newYield,
        local_amount: Number((newYield * newPrice).toFixed(2)),
        total_budget_qty: newYield,
        total_budget_amount: Number((newYield * newPrice).toFixed(2)),
        budget_share_pct: 0,
        measurement_id: null,
        measurement_total: null,
        measurement_lines_count: 0,
      };

      for (let lvl = 1; lvl <= currentData.metadata.max_chapter_depth; lvl++) {
        newRow[`level_${lvl}_code`] = parentRow[`level_${lvl}_code`] || null;
        newRow[`level_${lvl}_title`] = parentRow[`level_${lvl}_title`] || null;
      }
      if (newRole === "CAPITULO" && chapDepth) {
        newRow[`level_${chapDepth}_code`] = newCodeInput;
        newRow[`level_${chapDepth}_title`] = newSummary;
      }

      currentData.concepts[newCodeInput] = {
        code: newCodeInput,
        aliases: [newCodeInput],
        unit: newUnit,
        summary: newSummary,
        price: newPrice,
        date: "",
        type_code: newRow.type_code,
        description: "",
        tech_params: {},
      };

      const pIdx = currentData.budget_matrix.findIndex((r) => r.row_id === parentRow.row_id);
      currentData.budget_matrix.splice(pIdx + 1, 0, newRow);
      expandedRowIds.add(parentRow.row_id);

      recalculateBudgetTree(new Set([newRowId]));
      closeImpactModal();
      rebuildIndexesAndRefreshUI(newRowId);
      return;
    }

    if (modalState.mode === "DELETE_NODE") {
      const targetRow = rowMap.get(modalState.focusRowId);
      if (!targetRow) return;
      pushUndoSnapshot(`Eliminar ${targetRow.code}`);

      const toRemove = new Set();
      const collectDescendants = (rid) => {
        toRemove.add(rid);
        for (const ch of childrenMap.get(rid) || []) {
          collectDescendants(ch.row_id);
        }
      };
      collectDescendants(targetRow.row_id);

      const parentId = targetRow.parent_row_id || 1;
      currentData.budget_matrix = currentData.budget_matrix.filter((r) => !toRemove.has(r.row_id));

      recalculateBudgetTree(new Set([parentId]));
      closeImpactModal();
      rebuildIndexesAndRefreshUI(parentId);
      return;
    }

    pushUndoSnapshot(`Editar ${modalState.code}`);
    const approveAll = modalState.occurrences.every((o) => modalState.approvedSet.has(o.row_id));
    let targetCode = modalState.code;

    if (!approveAll && modalState.occurrences.length > 1) {
      let suffix = 1;
      while (currentData.concepts[`${modalState.code}_V${suffix}`]) suffix++;
      targetCode = `${modalState.code}_V${suffix}`;
      currentData.concepts[targetCode] = {
        ...(currentData.concepts[modalState.code] || {}),
        code: targetCode,
        aliases: [targetCode],
        unit: newUnit,
        summary: newSummary,
        price: newPrice,
      };
    } else if (currentData.concepts[targetCode]) {
      currentData.concepts[targetCode].unit = newUnit;
      currentData.concepts[targetCode].summary = newSummary;
      currentData.concepts[targetCode].price = newPrice;
    }

    for (const occ of modalState.occurrences) {
      if (modalState.approvedSet.has(occ.row_id)) {
        occ.code = targetCode;
        occ.unit = newUnit;
        occ.summary = newSummary;
        occ.unit_price = newPrice;
        if (occ.row_id === modalState.focusRowId) {
          occ.yield_qty = newYield / (occ.factor || 1);
          occ.local_qty = newYield;
        }
      }
    }

    recalculateBudgetTree(modalState.approvedSet);
    closeImpactModal();
    rebuildIndexesAndRefreshUI(modalState.focusRowId);
  }

  function closeImpactModal() {
    document.getElementById("impactModalBackdrop").classList.remove("open");
  }

  function exportCurrentBc3File(targetDataset = null) {
    const dataToExport = targetDataset && targetDataset.budget_matrix ? targetDataset : currentData;
    if (!dataToExport) return;
    const meta = dataToExport.metadata;
    const outLines = [];
    outLines.push(
      `~V|${meta.property || "ARQMED"}|${meta.fiebdc_version || "FIEBDC-3/2016"}|ARQMED STUDIO v2||UTF-8|${meta.title || meta.root_title || "Presupuesto"}|2|`
    );
    outLines.push(`~K|2\\2\\2\\3\\2\\2\\2\\2\\${meta.currency || "EUR"}\\0\\|0\\0\\0\\\\10||`);

    const conceptsMap = new Map();
    for (const [k, c] of Object.entries(dataToExport.concepts || {})) {
      conceptsMap.set(k, { ...c });
    }
    for (const r of dataToExport.budget_matrix) {
      conceptsMap.set(r.code, {
        code: r.code,
        unit: r.unit || "",
        summary: r.summary || r.code,
        price: r.unit_price,
        date: (conceptsMap.get(r.code) || {}).date || "",
        type_code: r.type_code || "0",
        description: r.description || (conceptsMap.get(r.code) || {}).description || "",
      });
    }

    for (const c of conceptsMap.values()) {
      const cleanSum = String(c.summary || "").replace(/\|/g, "/");
      outLines.push(`~C|${c.code}|${c.unit || ""}|${cleanSum}|${c.price}|${c.date || ""}|${c.type_code || "0"}|`);
      if (c.description && c.description.trim()) {
        outLines.push(`~T|${c.code}|${c.description.trim()}|`);
      }
    }

    const localChMap = new Map();
    for (const r of dataToExport.budget_matrix) {
      const pid = r.parent_row_id || 0;
      if (!localChMap.has(pid)) localChMap.set(pid, []);
      localChMap.get(pid).push(r);
    }

    const emittedParents = new Set();
    for (const r of dataToExport.budget_matrix) {
      const chRows = localChMap.get(r.row_id) || [];
      if (chRows.length > 0 && !emittedParents.has(r.code)) {
        emittedParents.add(r.code);
        const chunks = chRows.map((ch) => {
          const fStr = Math.abs((ch.factor || 1) - 1) < 1e-6 ? "" : String(ch.factor);
          return `${ch.code}\\${fStr}\\${ch.yield_qty}\\`;
        });
        outLines.push(`~D|${r.code}|${chunks.join("")}|`);
      }
    }

    for (const m of dataToExport.measurements || []) {
      const rel = m.parent_code ? `${m.parent_code}\\${m.child_code}` : m.child_code;
      const mSub = (m.lines || []).map((l) => {
        const lt = l.line_type || "";
        const cm = String(l.comment || "").replace(/\\/g, "/");
        const u = l.units !== null && l.units !== undefined ? l.units : "";
        const ln = l.length !== null && l.length !== undefined ? l.length : "";
        const wd = l.width !== null && l.width !== undefined ? l.width : "";
        const ht = l.height !== null && l.height !== undefined ? l.height : "";
        return `${lt}\\${cm}\\${u}\\${ln}\\${wd}\\${ht}\\`;
      });
      outLines.push(`~M|${rel}|${m.position || "1\\"}|${m.total_measured}|${mSub.join("")}|`);
    }

    const blob = new Blob([outLines.join("\r\n") + "\r\n"], { type: "text/plain;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const baseName = (meta.source_file || "presupuesto").replace(/\.bc3(\.txt)?$/i, "");
    a.download = `${baseName}_EDITADO.bc3`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function initMatrixExplorer() {
    const meta = currentData.metadata;
    const roleSelect = document.getElementById("matrixRoleFilter");
    const roles = meta.counts.roles || {};
    roleSelect.innerHTML = `<option value="ALL">Todos los Roles (${meta.counts.matrix_rows})</option>`;
    Object.keys(roles).forEach((r) => {
      const opt = document.createElement("option");
      opt.value = r;
      opt.textContent = `${r} (${roles[r]})`;
      roleSelect.appendChild(opt);
    });

    const dynContainer = document.getElementById("dynamicLevelFilters");
    dynContainer.innerHTML = "";
    for (let lvl = 1; lvl <= meta.max_chapter_depth; lvl++) {
      const sel = document.createElement("select");
      sel.className = "filter-select matrix-lvl-select";
      sel.dataset.level = lvl;

      const uniqueMap = new Map();
      for (const r of currentData.budget_matrix) {
        const c = r[`level_${lvl}_code`];
        const t = r[`level_${lvl}_title`];
        if (c && !uniqueMap.has(c)) uniqueMap.set(c, t);
      }

      sel.innerHTML = `<option value="ALL">Nivel ${lvl}: Todos (${uniqueMap.size})</option>`;
      for (const [c, t] of uniqueMap.entries()) {
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = `${c} · ${t}`;
        sel.appendChild(opt);
      }
      sel.addEventListener("change", renderMatrixTable);
      dynContainer.appendChild(sel);
    }

    const maxLvl = meta.max_chapter_depth;
    let lvlHeaders = "";
    for (let i = 1; i <= maxLvl; i++) {
      lvlHeaders += `<th>Nivel ${i}</th>`;
    }
    document.getElementById("matrixTableHead").innerHTML = `
      <tr>
        <th style="width:55px;">#Fila</th>
        <th style="width:118px;">Naturaleza</th>
        ${lvlHeaders}
        <th>Partida</th>
        <th>Código</th>
        <th>Ud</th>
        <th>Resumen</th>
        <th class="num">Cant. Obra</th>
        <th class="num">Precio (€)</th>
        <th class="num">Imp. Obra (€)</th>
        <th class="num">Editar</th>
      </tr>
    `;

    renderMatrixTable();
  }

  function renderMatrixTable() {
    const roleVal = document.getElementById("matrixRoleFilter").value;
    const searchVal = document.getElementById("matrixSearchInput").value.trim().toLowerCase();
    const lvlSelects = Array.from(document.querySelectorAll(".matrix-lvl-select"));
    const maxLvl = currentData.metadata.max_chapter_depth;

    const filtered = currentData.budget_matrix.filter((r) => {
      if (roleVal !== "ALL" && r.node_role !== roleVal) return false;
      for (const sel of lvlSelects) {
        const lvl = sel.dataset.level;
        if (sel.value !== "ALL" && r[`level_${lvl}_code`] !== sel.value) return false;
      }
      if (searchVal) {
        const matchCode = r.code.toLowerCase().includes(searchVal);
        const matchSum = (r.summary || "").toLowerCase().includes(searchVal);
        const matchPath = (r.path_titles || "").toLowerCase().includes(searchVal);
        if (!matchCode && !matchSum && !matchPath) return false;
      }
      return true;
    });

    document.getElementById("matrixFilterStats").textContent = `${Math.min(filtered.length, 600)} de ${filtered.length} filas`;

    const slice = filtered.slice(0, 600);
    document.getElementById("matrixTableBody").innerHTML = slice
      .map((r) => {
        let lvlCells = "";
        for (let i = 1; i <= maxLvl; i++) {
          const c = r[`level_${i}_code`];
          const t = r[`level_${i}_title`];
          lvlCells += `<td title="${escapeHtml(t || "")}" style="font-family:var(--font-mono);font-size:11px;color:var(--text-secondary);">${escapeHtml(c || "—")}</td>`;
        }
        return `
          <tr data-jump-row="${r.row_id}">
            <td class="num" style="color:var(--text-tertiary);">${r.row_id}</td>
            <td>${getRoleBadgeHtml(r)}</td>
            ${lvlCells}
            <td style="font-family:var(--font-mono);font-size:11px;">${escapeHtml(r.partida_code || "—")}</td>
            <td style="font-family:var(--font-mono);font-weight:700;color:var(--accent);">${escapeHtml(r.code)}</td>
            <td style="font-family:var(--font-mono);">${escapeHtml(r.unit || "")}</td>
            <td>${escapeHtml(r.summary)}</td>
            <td class="num">${formatQty(r.total_budget_qty)}</td>
            <td class="num">${formatEuro(r.unit_price)}</td>
            <td class="num" style="font-weight:700;">${formatEuro(r.total_budget_amount)}</td>
            <td class="num">
              <button type="button" class="icon-btn" data-edit-row="${r.row_id}" title="Editar con vista previa OK/NO">${SVG_ICONS.EDIT}</button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function renderAnalyticsDashboard() {
    const rootRow = currentData.budget_matrix[0];
    const totalBudget = rootRow.total_budget_amount || 1;

    const l1Chapters = currentData.budget_matrix
      .filter((r) => r.node_role === "CAPITULO" && r.chapter_depth === 1)
      .sort((a, b) => b.total_budget_amount - a.total_budget_amount);

    const sortedPartidas = currentData.budget_matrix
      .filter((r) => r.node_role === "PARTIDA")
      .sort((a, b) => b.total_budget_amount - a.total_budget_amount);

    let cumPareto = 0;
    let pareto80Count = 0;
    for (const p of sortedPartidas) {
      cumPareto += p.total_budget_amount;
      pareto80Count++;
      if (cumPareto >= totalBudget * 0.8) break;
    }
    const paretoPctOfPartidas = sortedPartidas.length
      ? ((pareto80Count / sortedPartidas.length) * 100).toFixed(1)
      : "0";

    const top2ChaptersShare = l1Chapters
      .slice(0, 2)
      .reduce((acc, c) => acc + (c.budget_share_pct || 0), 0)
      .toFixed(1);
    const top2Names = l1Chapters
      .slice(0, 2)
      .map((c) => c.code)
      .join(" + ");

    const matPct = ((rootRow.breakdown_material / totalBudget) * 100).toFixed(1);
    const moPct = ((rootRow.breakdown_mano_obra / totalBudget) * 100).toFixed(1);

    const l1RowsHtml = l1Chapters
      .map((c) => {
        const pct = Math.min(100, c.budget_share_pct || 0);
        const cTotal = c.total_budget_amount || 1;
        const cMat = ((c.breakdown_material / cTotal) * pct).toFixed(2);
        const cMo = ((c.breakdown_mano_obra / cTotal) * pct).toFixed(2);
        const cMaq = ((c.breakdown_maquinaria / cTotal) * pct).toFixed(2);
        return `
          <div class="chapter-bar-item" data-jump-row="${c.row_id}" title="Clic para inspeccionar capítulo en Modo Arqmed">
            <div class="chapter-bar-top">
              <span><strong style="font-family:var(--font-mono);color:var(--accent);">${escapeHtml(c.code)}</strong> · ${escapeHtml(c.summary)}</span>
              <span style="font-family:var(--font-mono);font-weight:700;">${formatEuro(c.total_budget_amount)} € <span style="color:var(--text-secondary);">(${pct.toFixed(1)}%)</span></span>
            </div>
            <div class="chapter-bar-track">
              <div style="width:${cMat}%;background:var(--role-material);" title="Materiales"></div>
              <div style="width:${cMo}%;background:var(--role-mano-obra);" title="Mano de Obra"></div>
              <div style="width:${cMaq}%;background:var(--role-maquinaria);" title="Maquinaria"></div>
            </div>
          </div>
        `;
      })
      .join("");

    const chapDepthCounts = {};
    for (const r of currentData.budget_matrix) {
      if (r.node_role === "CAPITULO") {
        chapDepthCounts[r.chapter_depth] = (chapDepthCounts[r.chapter_depth] || 0) + 1;
      }
    }
    const depthRowsHtml = Object.keys(chapDepthCounts)
      .map(
        (lvl) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border-dim);">
          <span style="display:inline-flex;align-items:center;gap:6px;">
            <span class="role-badge badge-CAP-${Math.min(Number(lvl), 5)}">${SVG_ICONS.CAPITULO}<span>NIVEL ${lvl}</span></span>
            <span style="color:var(--text-secondary);">Contenedores jerárquicos de grado ${lvl}</span>
          </span>
          <strong style="font-family:var(--font-mono);">${chapDepthCounts[lvl]} capítulos</strong>
        </div>
      `
      )
      .join("");

    const top15Html = sortedPartidas
      .slice(0, 15)
      .map(
        (p, idx) => `
        <tr data-jump-row="${p.row_id}">
          <td class="num" style="color:var(--text-tertiary);">${idx + 1}</td>
          <td style="font-family:var(--font-mono);color:var(--accent);font-weight:700;">${escapeHtml(p.code)}</td>
          <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-secondary);">${escapeHtml(p.level_1_code || "")} › ${escapeHtml(p.level_2_code || "")}</td>
          <td>${escapeHtml(p.summary)}</td>
          <td class="num">${formatQty(p.total_budget_qty)} ${escapeHtml(p.unit || "")}</td>
          <td class="num">${formatEuro(p.unit_price)}</td>
          <td class="num" style="font-weight:700;">${formatEuro(p.total_budget_amount)} €</td>
          <td class="num">${p.budget_share_pct.toFixed(2)}%</td>
        </tr>
      `
      )
      .join("");

    document.getElementById("analyticsContainer").innerHTML = `
      <div class="exec-kpi-row">
        <div class="exec-kpi-box primary-kpi">
          <div class="exec-kpi-title">
            <span>PRESUPUESTO DE EJECUCIÓN</span>
            <span style="font-family:var(--font-mono);color:var(--accent);">${escapeHtml(currentData.metadata.currency || "EUR")}</span>
          </div>
          <div class="exec-kpi-value">${formatEuro(totalBudget)} €</div>
          <div class="exec-kpi-sub">${top2Names} concentran el <strong>${top2ChaptersShare}%</strong> del presupuesto</div>
        </div>

        <div class="exec-kpi-box">
          <div class="exec-kpi-title">
            <span>MATERIALES</span>
            <span style="color:var(--role-material);">${SVG_ICONS.MATERIAL}</span>
          </div>
          <div class="exec-kpi-value">${formatEuro(rootRow.breakdown_material)} €</div>
          <div class="exec-kpi-sub">Representa el <strong>${matPct}%</strong> del coste directo total</div>
        </div>

        <div class="exec-kpi-box">
          <div class="exec-kpi-title">
            <span>MANO DE OBRA</span>
            <span style="color:var(--role-mano-obra);">${SVG_ICONS.MANO_OBRA}</span>
          </div>
          <div class="exec-kpi-value">${formatEuro(rootRow.breakdown_mano_obra)} €</div>
          <div class="exec-kpi-sub">Representa el <strong>${moPct}%</strong> del coste directo total</div>
        </div>

        <div class="exec-kpi-box">
          <div class="exec-kpi-title">
            <span>CONCENTRACIÓN PARETO</span>
            <span style="color:var(--role-partida);">${SVG_ICONS.PARTIDA}</span>
          </div>
          <div class="exec-kpi-value">${pareto80Count} <span style="font-size:14px;font-weight:500;color:var(--text-secondary);">/ ${sortedPartidas.length} partidas</span></div>
          <div class="exec-kpi-sub">El <strong>${paretoPctOfPartidas}%</strong> de las partidas acumula el 80% del coste</div>
        </div>
      </div>

      <div class="exec-middle-row">
        <div class="exec-panel">
          <div class="exec-panel-header">
            <h3>Ranking de Capítulos Nivel 1 con Desglose de Naturaleza</h3>
            <span class="insight-tag">Azul: Materiales · Naranja: Mano de Obra</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;">
            ${l1RowsHtml}
          </div>
        </div>

        <div class="exec-panel">
          <div class="exec-panel-header">
            <h3>Topología Jerárquica Detectada en Matriz</h3>
            <span class="insight-tag">Agnóstico al nombre (${currentData.metadata.max_chapter_depth} niveles)</span>
          </div>
          <div>${depthRowsHtml}</div>
        </div>
      </div>

      <div class="exec-panel">
        <div class="exec-panel-header">
          <h3>Top 15 Partidas de Mayor Impacto Económico en la Obra</h3>
          <span class="insight-tag">Haz clic en cualquier fila para abrir su desglose en Editor Arqmed</span>
        </div>
        <table class="grid-table">
          <thead>
            <tr>
              <th style="width:45px;">#</th>
              <th style="width:125px;">Código</th>
              <th style="width:150px;">Ruta (N1 › N2)</th>
              <th>Resumen de la Unidad de Obra</th>
              <th class="num" style="width:115px;">Medición</th>
              <th class="num" style="width:105px;">Precio (€)</th>
              <th class="num" style="width:130px;">Importe Total</th>
              <th class="num" style="width:85px;">% Obra</th>
            </tr>
          </thead>
          <tbody>${top15Html}</tbody>
        </table>
      </div>
    `;
  }

  const ALL_DOCK_PANES = ["descomposicion", "mediciones", "pliego"];
  const visibleDockPanes = new Set(["descomposicion", "mediciones"]);

  function syncDockPanesUI() {
    const workspace = document.getElementById("arqmedWorkspace");
    for (const id of ALL_DOCK_PANES) {
      const isVisible = visibleDockPanes.has(id);
      const paneEl = document.getElementById(`dockPane-${id}`);
      if (paneEl) {
        paneEl.classList.toggle("hidden-pane", !isVisible);
      }
      const toggleBtn = document.querySelector(`[data-dock-toggle="${id}"]`);
      if (toggleBtn) {
        toggleBtn.classList.toggle("active", isVisible);
      }
      const badgeEl = document.querySelector(`[data-dock-badge="${id}"]`);
      if (badgeEl) {
        badgeEl.textContent = isVisible ? "VISIBLE" : "MINIMIZADO";
      }
    }
    if (workspace) {
      workspace.classList.toggle("all-panes-minimized", visibleDockPanes.size === 0);
    }
    saveUiPrefsToLocal();
  }

  function initSplitResizers() {
    const workspace = document.getElementById("arqmedWorkspace");
    const resizerH = document.getElementById("resizerH");
    if (!workspace || !resizerH) return;

    let draggingH = false;
    resizerH.addEventListener("pointerdown", (e) => {
      draggingH = true;
      resizerH.classList.add("dragging");
      resizerH.setPointerCapture(e.pointerId);
    });
    resizerH.addEventListener("pointermove", (e) => {
      if (!draggingH) return;
      const rect = workspace.getBoundingClientRect();
      const relY = e.clientY - rect.top;
      const pct = Math.min(82, Math.max(20, (relY / rect.height) * 100));
      document.documentElement.style.setProperty("--tree-pane-height", `${pct.toFixed(1)}%`);
    });
    resizerH.addEventListener("pointerup", () => {
      draggingH = false;
      resizerH.classList.remove("dragging");
    });
  }

  function bindViewNavigationEvents() {
    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".mode-btn").forEach((b) => {
          b.classList.remove("active");
          b.setAttribute("aria-selected", "false");
        });
        document.querySelectorAll(".view-section").forEach((s) => s.classList.remove("active"));
        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");
        document.getElementById(`view-${btn.dataset.view}`).classList.add("active");
      });
    });
  }

  function bindTreeInteractionEvents() {
    document.getElementById("arqmedTreeBody").addEventListener("click", (e) => {
      const twisty = e.target.closest("[data-toggle-row]");
      if (twisty) {
        e.stopPropagation();
        const rId = Number(twisty.dataset.toggleRow);
        if (expandedRowIds.has(rId)) expandedRowIds.delete(rId);
        else expandedRowIds.add(rId);
        renderArqmedTree();
        return;
      }

      const moveTrigger = e.target.closest("[data-move-row]");
      if (moveTrigger) {
        e.stopPropagation();
        const rId = Number(moveTrigger.dataset.moveRow);
        const dir = Number(moveTrigger.dataset.dir);
        moveTreeRow(rId, dir);
        return;
      }

      const editTrigger = e.target.closest("[data-edit-row]");
      if (editTrigger) {
        e.stopPropagation();
        const rId = Number(editTrigger.dataset.editRow);
        selectRow(rId, false);
        openImpactModalForConcept(rId);
        return;
      }

      const addChildTrigger = e.target.closest("[data-add-child]");
      if (addChildTrigger) {
        e.stopPropagation();
        const rId = Number(addChildTrigger.dataset.addChild);
        selectRow(rId, false);
        openImpactModalForAddChild(rId);
        return;
      }

      const delTrigger = e.target.closest("[data-delete-row]");
      if (delTrigger) {
        e.stopPropagation();
        const rId = Number(delTrigger.dataset.deleteRow);
        openImpactModalForDelete(rId);
        return;
      }

      const tr = e.target.closest("tr[data-row-id]");
      if (tr) {
        selectRow(Number(tr.dataset.rowId));
      }
    });

    document.getElementById("activeBreadcrumb").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-crumb-row]");
      if (!btn) return;
      selectRow(Number(btn.dataset.crumbRow), true);
    });

    const btnExpP = document.getElementById("btnExpandPartidas");
    if (btnExpP) btnExpP.addEventListener("click", expandPartidas);

    const btnExpAll = document.getElementById("btnExpandAll");
    if (btnExpAll) btnExpAll.addEventListener("click", expandAll);

    document.getElementById("treeSearchInput").addEventListener("input", (e) => {
      treeSearchTerm = e.target.value;
      renderArqmedTree();
    });
  }

  function bindColumnResizeAndDragEvents() {
    const treeHeadEl = document.getElementById("arqmedTreeHead");
    if (!treeHeadEl) return;

    treeHeadEl.addEventListener("dragstart", (e) => {
      const th = e.target.closest("th[data-th-col]");
      if (!th || e.target.closest("[data-col-drag-resize]")) {
        e.preventDefault();
        return;
      }
      draggedColId = th.dataset.thCol;
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
      }
    });

    treeHeadEl.addEventListener("dragover", (e) => {
      const th = e.target.closest("th[data-th-col]");
      if (!th || !draggedColId || th.dataset.thCol === draggedColId) return;
      e.preventDefault();
      treeHeadEl.querySelectorAll("th").forEach((el) => el.classList.remove("drag-over-th"));
      th.classList.add("drag-over-th");
    });

    treeHeadEl.addEventListener("dragleave", (e) => {
      const th = e.target.closest("th[data-th-col]");
      if (th) th.classList.remove("drag-over-th");
    });

    treeHeadEl.addEventListener("drop", (e) => {
      e.preventDefault();
      treeHeadEl.querySelectorAll("th").forEach((el) => el.classList.remove("drag-over-th"));
      const targetTh = e.target.closest("th[data-th-col]");
      if (!targetTh || !draggedColId) return;
      const targetColId = targetTh.dataset.thCol;
      if (targetColId === draggedColId) return;

      const fromIdx = treeColumns.findIndex((c) => c.id === draggedColId);
      const toIdx = treeColumns.findIndex((c) => c.id === targetColId);
      if (fromIdx !== -1 && toIdx !== -1) {
        const [moved] = treeColumns.splice(fromIdx, 1);
        treeColumns.splice(toIdx, 0, moved);
        renderArqmedTree();
        saveUiPrefsToLocal();
      }
      draggedColId = null;
    });

    treeHeadEl.addEventListener("pointerdown", (e) => {
      const handle = e.target.closest("[data-col-drag-resize]");
      if (!handle) return;
      e.stopPropagation();
      e.preventDefault();
      const colId = handle.dataset.colDragResize;
      const colObj = treeColumns.find((c) => c.id === colId);
      if (!colObj) return;

      const startX = e.clientX;
      const startWidth = colObj.width;
      handle.classList.add("resizing");
      handle.setPointerCapture(e.pointerId);

      const onMove = (moveEv) => {
        const delta = moveEv.clientX - startX;
        colObj.width = Math.max(46, Math.min(720, Math.round(startWidth + delta)));
        const thEl = treeHeadEl.querySelector(`th[data-th-col="${colId}"]`);
        if (thEl) {
          thEl.style.width = `${colObj.width}px`;
          thEl.style.minWidth = `${Math.max(40, colObj.width - 20)}px`;
        }
      };

      const onUp = () => {
        handle.classList.remove("resizing");
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        renderArqmedTree();
        saveUiPrefsToLocal();
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });
  }

  function bindColumnManagerEvents() {
    const sideColsEl = document.getElementById("sideTreeColumnsList");
    if (sideColsEl) {
      sideColsEl.addEventListener("change", (e) => {
        const chk = e.target.closest("input[data-col-vis]");
        if (!chk) return;
        const colId = chk.dataset.colVis;
        const colObj = treeColumns.find((c) => c.id === colId);
        if (!colObj) return;
        if (!chk.checked && treeColumns.filter((c) => c.visible).length <= 1) {
          chk.checked = true;
          return;
        }
        colObj.visible = chk.checked;
        renderArqmedTree();
        saveUiPrefsToLocal();
      });

      sideColsEl.addEventListener("click", (e) => {
        const moveBtn = e.target.closest("[data-col-move]");
        if (moveBtn) {
          const colId = moveBtn.dataset.colMove;
          const dir = Number(moveBtn.dataset.dir);
          const idx = treeColumns.findIndex((c) => c.id === colId);
          const swapIdx = idx + dir;
          if (idx !== -1 && swapIdx >= 0 && swapIdx < treeColumns.length) {
            const tmp = treeColumns[idx];
            treeColumns[idx] = treeColumns[swapIdx];
            treeColumns[swapIdx] = tmp;
            renderArqmedTree();
            saveUiPrefsToLocal();
          }
          return;
        }

        const resizeBtn = e.target.closest("[data-col-resize]");
        if (resizeBtn) {
          const colId = resizeBtn.dataset.colResize;
          const delta = Number(resizeBtn.dataset.delta);
          const colObj = treeColumns.find((c) => c.id === colId);
          if (colObj) {
            colObj.width = Math.max(46, Math.min(720, colObj.width + delta));
            renderArqmedTree();
            saveUiPrefsToLocal();
          }
        }
      });
    }

    const btnResetTreeCols = document.getElementById("btnResetTreeCols");
    if (btnResetTreeCols) {
      btnResetTreeCols.addEventListener("click", () => {
        treeColumns = JSON.parse(JSON.stringify(DEFAULT_TREE_COLUMNS));
        renderArqmedTree();
        saveUiPrefsToLocal();
      });
    }
  }

  function bindRowCustomizationEvents() {
    document.querySelectorAll("[data-row-density]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll("[data-row-density]").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        treeRowDensity = btn.dataset.rowDensity;
        renderTreeHead();
        saveUiPrefsToLocal();
      });
    });

    const btnMoveRowUp = document.getElementById("btnMoveRowUp");
    if (btnMoveRowUp) {
      btnMoveRowUp.addEventListener("click", () => moveTreeRow(selectedRowId, -1));
    }
    const btnMoveRowDown = document.getElementById("btnMoveRowDown");
    if (btnMoveRowDown) {
      btnMoveRowDown.addEventListener("click", () => moveTreeRow(selectedRowId, 1));
    }

    const chkHideHashSymbol = document.getElementById("chkHideHashSymbol");
    if (chkHideHashSymbol) {
      chkHideHashSymbol.addEventListener("change", () => {
        hideHashInCodes = chkHideHashSymbol.checked;
        renderHeaderAndLevelButtons();
        renderArqmedTree();
        selectRow(selectedRowId, false);
        saveUiPrefsToLocal();
      });
    }

    const sideRoleVisEl = document.getElementById("sideRoleVisibilityList");
    if (sideRoleVisEl) {
      sideRoleVisEl.addEventListener("click", (e) => {
        const chip = e.target.closest("[data-vis-role]");
        if (!chip) return;
        const roleKey = chip.dataset.visRole;
        if (visibleTreeRoles.has(roleKey)) {
          visibleTreeRoles.delete(roleKey);
          chip.classList.remove("active");
        } else {
          visibleTreeRoles.add(roleKey);
          chip.classList.add("active");
        }
        renderArqmedTree();
        saveUiPrefsToLocal();
      });
    }
  }

  function bindDecompositionEvents() {
    document.getElementById("decompTableBody").addEventListener("click", (e) => {
      const editBtn = e.target.closest("[data-edit-row]");
      if (editBtn) {
        e.stopPropagation();
        openImpactModalForConcept(Number(editBtn.dataset.editRow));
        return;
      }
      const delBtn = e.target.closest("[data-delete-row]");
      if (delBtn) {
        e.stopPropagation();
        openImpactModalForDelete(Number(delBtn.dataset.deleteRow));
        return;
      }
      const tr = e.target.closest("tr[data-decomp-row]");
      if (!tr) return;
      const targetId = Number(tr.dataset.decompRow);
      const targetRow = rowMap.get(targetId);
      if (targetRow && targetRow.parent_row_id) {
        expandedRowIds.add(targetRow.parent_row_id);
        renderArqmedTree();
      }
      selectRow(targetId, true);
    });

    document.getElementById("btnAddChildNode").addEventListener("click", () => {
      openImpactModalForAddChild(selectedRowId);
    });
  }

  function bindMeasurementsEvents() {
    document.getElementById("measurementsTableBody").addEventListener("input", (e) => {
      const input = e.target.closest("input[data-mfield]");
      if (!input) return;
      const idx = Number(input.dataset.midx);
      const field = input.dataset.mfield;
      const line = draftMeasurementLines[idx];
      if (!line) return;

      if (field === "comment") {
        line.comment = input.value;
      } else {
        const raw = input.value.trim().replace(",", ".");
        line[field] = raw === "" ? null : Number(raw);
        if (Number.isNaN(line[field])) line[field] = null;
      }

      const newTotal = recomputeDraftMeasurementTotals();
      const subCell = document.getElementById(`measSubtotal_${idx}`);
      if (subCell) {
        subCell.innerHTML =
          line.subtotal !== null
            ? formatQty(line.subtotal)
            : `<span style="color:var(--accent);font-size:10.5px;">ZONA</span>`;
      }

      const mRow = rowMap.get(draftMeasurementRowId);
      if (mRow) {
        document.getElementById("measSummaryBadge").textContent = `Total: ${formatQty(newTotal)}${mRow.unit ? " " + mRow.unit : ""}`;
      }
      isMeasurementDirty = true;
      document.getElementById("measDirtyBanner").classList.add("visible");
    });

    document.getElementById("measurementsTableBody").addEventListener("blur", (e) => {
      const input = e.target.closest("input[data-mfield]");
      if (!input || input.dataset.mfield === "comment") return;
      const raw = input.value.trim().replace(",", ".");
      if (raw !== "" && !Number.isNaN(Number(raw))) {
        input.value = Number(raw).toFixed(2);
      }
    }, true);

    document.getElementById("measurementsTableBody").addEventListener("click", (e) => {
      const delBtn = e.target.closest("[data-del-meas]");
      if (!delBtn) return;
      const idx = Number(delBtn.dataset.delMeas);
      draftMeasurementLines.splice(idx, 1);
      isMeasurementDirty = true;
      document.getElementById("measDirtyBanner").classList.add("visible");
      renderMeasurementsEditor();
    });

    document.getElementById("btnAddMeasLine").addEventListener("click", () => {
      draftMeasurementLines.push({
        line_index: draftMeasurementLines.length + 1,
        line_type: "",
        comment: "Nueva línea",
        units: 1,
        length: 1,
        width: null,
        height: null,
        subtotal: 1,
      });
      isMeasurementDirty = true;
      document.getElementById("measDirtyBanner").classList.add("visible");
      renderMeasurementsEditor();
    });

    document.getElementById("btnAddMeasSubheader").addEventListener("click", () => {
      draftMeasurementLines.push({
        line_index: draftMeasurementLines.length + 1,
        line_type: "",
        comment: "NUEVA ZONA / PLANTA",
        units: null,
        length: null,
        width: null,
        height: null,
        subtotal: null,
      });
      isMeasurementDirty = true;
      document.getElementById("measDirtyBanner").classList.add("visible");
      renderMeasurementsEditor();
    });

    document.getElementById("btnPreviewApplyMeas").addEventListener("click", () => {
      openImpactModalForMeasurement();
    });

    document.getElementById("btnDiscardMeas").addEventListener("click", () => {
      const row = rowMap.get(selectedRowId);
      if (row) {
        initDraftMeasurementsForRow(row);
        renderMeasurementsEditor();
      }
    });
  }

  function bindImpactModalEvents() {
    ["editFieldUnit", "editFieldSummary", "editFieldYield", "editFieldPrice"].forEach((id) => {
      document.getElementById(id).addEventListener("input", () => {
        refreshImpactModalTable();
      });
    });

    document.getElementById("impactOccurrencesBody").addEventListener("click", (e) => {
      const okBtn = e.target.closest("[data-occ-ok]");
      if (okBtn) {
        modalState.approvedSet.add(Number(okBtn.dataset.occOk));
        refreshImpactModalTable();
        return;
      }
      const noBtn = e.target.closest("[data-occ-no]");
      if (noBtn) {
        modalState.approvedSet.delete(Number(noBtn.dataset.occNo));
        refreshImpactModalTable();
      }
    });

    document.getElementById("btnAllOk").addEventListener("click", () => {
      modalState.approvedSet = new Set(modalState.occurrences.map((o) => o.row_id));
      refreshImpactModalTable();
    });

    document.getElementById("btnOnlyCurrentOk").addEventListener("click", () => {
      modalState.approvedSet = new Set([modalState.focusRowId]);
      refreshImpactModalTable();
    });

    document.getElementById("btnAllNo").addEventListener("click", () => {
      modalState.approvedSet.clear();
      refreshImpactModalTable();
    });

    document.getElementById("btnConfirmModalOk").addEventListener("click", applyConfirmedModalChanges);
    document.getElementById("btnRejectModalNo").addEventListener("click", closeImpactModal);
    document.getElementById("btnCloseImpactModal").addEventListener("click", closeImpactModal);

    document.getElementById("btnUndo").addEventListener("click", performUndo);
    document.getElementById("btnExportBc3").addEventListener("click", () => exportCurrentBc3File());
  }

  function bindKeyboardTreeNavigationEvents() {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && document.getElementById("impactModalBackdrop").classList.contains("open")) {
        closeImpactModal();
        return;
      }
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "SELECT" ||
        e.target.tagName === "TEXTAREA" ||
        document.getElementById("impactModalBackdrop").classList.contains("open")
      ) {
        return;
      }
      if (!document.getElementById("view-arqmed").classList.contains("active")) return;

      const idx = visibleTreeRowIds.indexOf(selectedRowId);
      if (idx === -1) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (idx + 1 < visibleTreeRowIds.length) {
          selectRow(visibleTreeRowIds[idx + 1], true);
        }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (idx - 1 >= 0) {
          selectRow(visibleTreeRowIds[idx - 1], true);
        }
      } else if (e.key === "ArrowRight") {
        const hasCh = (childrenMap.get(selectedRowId) || []).length > 0;
        if (hasCh && !expandedRowIds.has(selectedRowId)) {
          e.preventDefault();
          expandedRowIds.add(selectedRowId);
          renderArqmedTree();
        }
      } else if (e.key === "ArrowLeft") {
        if (expandedRowIds.has(selectedRowId)) {
          e.preventDefault();
          expandedRowIds.delete(selectedRowId);
          renderArqmedTree();
        } else {
          const cur = rowMap.get(selectedRowId);
          if (cur && cur.parent_row_id) {
            e.preventDefault();
            selectRow(cur.parent_row_id, true);
          }
        }
      }
    });
  }

  function bindDockAndWorkspaceEvents() {
    document.querySelectorAll("[data-dock-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.dockToggle;
        if (visibleDockPanes.has(id)) {
          visibleDockPanes.delete(id);
        } else {
          visibleDockPanes.add(id);
        }
        syncDockPanesUI();
      });
    });

    document.querySelectorAll("[data-minimize-pane]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.minimizePane;
        visibleDockPanes.delete(id);
        syncDockPanesUI();
      });
    });

    let previousVisiblePanes = null;
    document.querySelectorAll("[data-maximize-pane]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.dataset.maximizePane;
        if (visibleDockPanes.size === 1 && visibleDockPanes.has(id)) {
          visibleDockPanes.clear();
          if (previousVisiblePanes && previousVisiblePanes.size > 0) {
            previousVisiblePanes.forEach((p) => visibleDockPanes.add(p));
          } else {
            visibleDockPanes.add("descomposicion");
            visibleDockPanes.add("mediciones");
          }
        } else {
          previousVisiblePanes = new Set(visibleDockPanes);
          visibleDockPanes.clear();
          visibleDockPanes.add(id);
        }
        syncDockPanesUI();
      });
    });

    const closeMobileSideDock = () => {
      const dock = document.getElementById("sidePanelDock");
      const backdrop = document.getElementById("sideDockBackdrop");
      if (dock) dock.classList.remove("mobile-open");
      if (backdrop) backdrop.classList.remove("open");
    };

    const btnMobileDrawerToggle = document.getElementById("btnMobileDrawerToggle");
    if (btnMobileDrawerToggle) {
      btnMobileDrawerToggle.addEventListener("click", () => {
        const dock = document.getElementById("sidePanelDock");
        const backdrop = document.getElementById("sideDockBackdrop");
        const willOpen = !dock.classList.contains("mobile-open");
        dock.classList.toggle("mobile-open", willOpen);
        if (backdrop) backdrop.classList.toggle("open", willOpen);
      });
    }

    const sideDockBackdrop = document.getElementById("sideDockBackdrop");
    if (sideDockBackdrop) {
      sideDockBackdrop.addEventListener("click", closeMobileSideDock);
    }

    document.querySelectorAll("[data-dock-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const raw = btn.dataset.dockPreset;
        visibleDockPanes.clear();
        if (raw && raw !== "none") {
          raw.split(",").map((s) => s.trim()).filter(Boolean).forEach((id) => visibleDockPanes.add(id));
        }
        syncDockPanesUI();
        if (window.innerWidth <= 1024) {
          closeMobileSideDock();
        }
      });
    });

    const btnToggleSideDock = document.getElementById("btnToggleSideDock");
    if (btnToggleSideDock) {
      btnToggleSideDock.addEventListener("click", () => {
        const dock = document.getElementById("sidePanelDock");
        if (window.innerWidth <= 1024) {
          closeMobileSideDock();
          return;
        }
        dock.classList.toggle("collapsed");
        btnToggleSideDock.textContent = dock.classList.contains("collapsed") ? "▶" : "◀";
        saveUiPrefsToLocal();
      });
    }

    syncDockPanesUI();
  }

  function bindMatrixAndThemeEvents() {
    document.getElementById("matrixRoleFilter").addEventListener("change", renderMatrixTable);
    document.getElementById("matrixSearchInput").addEventListener("input", renderMatrixTable);

    const handleJump = (e) => {
      const editBtn = e.target.closest("[data-edit-row]");
      if (editBtn) {
        e.stopPropagation();
        openImpactModalForConcept(Number(editBtn.dataset.editRow));
        return;
      }
      const el = e.target.closest("[data-jump-row]");
      if (!el) return;
      const rId = Number(el.dataset.jumpRow);
      let curr = rowMap.get(rId);
      while (curr && curr.parent_row_id) {
        expandedRowIds.add(curr.parent_row_id);
        curr = rowMap.get(curr.parent_row_id);
      }
      document.querySelector('.mode-btn[data-view="arqmed"]').click();
      renderArqmedTree();
      selectRow(rId, true);
    };
    document.getElementById("matrixTableBody").addEventListener("click", handleJump);
    document.getElementById("analyticsContainer").addEventListener("click", handleJump);

    document.getElementById("btnTheme").addEventListener("click", () => {
      const html = document.documentElement;
      html.dataset.theme = (html.dataset.theme === "dark") ? "light" : "dark";
      saveUiPrefsToLocal();
    });
  }

  function bindProjectLibraryEvents() {
    const onProjectSelectChange = (e) => {
      const targetId = e.target.value;
      if (targetId && targetId !== activeProjectId) {
        switchActiveProject(targetId);
      }
    };
    const topProjSel = document.getElementById("projectSwitcherSelect");
    if (topProjSel) topProjSel.addEventListener("change", onProjectSelectChange);
    const sideProjSel = document.getElementById("sideProjectSelect");
    if (sideProjSel) sideProjSel.addEventListener("change", onProjectSelectChange);

    const openProjectsModal = () => {
      refreshProjectsLibraryUI();
      document.getElementById("projectsModalBackdrop").classList.add("open");
    };
    const closeProjectsModal = () => {
      document.getElementById("projectsModalBackdrop").classList.remove("open");
    };

    const btnOpenProjectsModal = document.getElementById("btnOpenProjectsModal");
    if (btnOpenProjectsModal) btnOpenProjectsModal.addEventListener("click", openProjectsModal);
    const btnSideManageBc3 = document.getElementById("btnSideManageBc3");
    if (btnSideManageBc3) btnSideManageBc3.addEventListener("click", openProjectsModal);
    const btnCloseProjectsModal = document.getElementById("btnCloseProjectsModal");
    if (btnCloseProjectsModal) btnCloseProjectsModal.addEventListener("click", closeProjectsModal);

    const duplicateProjectById = async (projId) => {
      const src = await dbGetProject(projId);
      if (!src || !src.data) return;
      const newId = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const copyName = `Copia de ${src.name}`;
      const clonedData = JSON.parse(JSON.stringify(src.data));
      clonedData.metadata.source_file = copyName;
      const newRec = buildProjectRecord(newId, clonedData, copyName);
      await dbPutProject(newRec);
      await switchActiveProject(newId);
    };

    const btnDuplicateActiveProject = document.getElementById("btnDuplicateActiveProject");
    if (btnDuplicateActiveProject) {
      btnDuplicateActiveProject.addEventListener("click", () => duplicateProjectById(activeProjectId));
    }

    const btnResetFactoryProject = document.getElementById("btnResetFactoryProject");
    if (btnResetFactoryProject) {
      btnResetFactoryProject.addEventListener("click", async () => {
        if (!window.__INITIAL_BC3_DATA__) return;
        const freshData = JSON.parse(JSON.stringify(window.__INITIAL_BC3_DATA__));
        const rec = buildProjectRecord(
          DEFAULT_PROJECT_ID,
          freshData,
          freshData.metadata.source_file || freshData.metadata.title || "Presupuesto"
        );
        await dbPutProject(rec);
        await switchActiveProject(DEFAULT_PROJECT_ID);
      });
    }

    const projectsCardsContainer = document.getElementById("projectsCardsContainer");
    if (projectsCardsContainer) {
      projectsCardsContainer.addEventListener("click", async (e) => {
        const actBtn = e.target.closest("[data-proj-activate]");
        if (actBtn) {
          await switchActiveProject(actBtn.dataset.projActivate);
          closeProjectsModal();
          return;
        }

        const renBtn = e.target.closest("[data-proj-rename]");
        if (renBtn) {
          await renameProjectById(renBtn.dataset.projRename);
          return;
        }

        const dupBtn = e.target.closest("[data-proj-duplicate]");
        if (dupBtn) {
          await duplicateProjectById(dupBtn.dataset.projDuplicate);
          return;
        }

        const expBtn = e.target.closest("[data-proj-export]");
        if (expBtn) {
          const rec = await dbGetProject(expBtn.dataset.projExport);
          if (rec && rec.data) {
            exportCurrentBc3File(rec.data);
          }
          return;
        }

        const delBtn = e.target.closest("[data-proj-delete]");
        if (delBtn) {
          const pid = delBtn.dataset.projDelete;
          if (savedProjectsMeta.length <= 1) return;
          await dbDeleteProject(pid);
          await refreshProjectsLibraryUI();
          if (pid === activeProjectId && savedProjectsMeta.length > 0) {
            await switchActiveProject(savedProjectsMeta[0].id);
          }
        }
      });
    }

    document.getElementById("btnExportCsv").addEventListener("click", () => {
      if (!currentData || !currentData.budget_matrix.length) return;
      const cols = Object.keys(currentData.budget_matrix[0]);
      const lines = [cols.join(";")];
      for (const r of currentData.budget_matrix) {
        lines.push(
          cols
            .map((k) => {
              const v = r[k] === null || r[k] === undefined ? "" : String(r[k]).replace(/;/g, ",");
              return `"${v.replace(/"/g, '""')}"`;
            })
            .join(";")
        );
      }
      const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `matriz_${currentData.metadata.source_file}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });

    const handleFilesList = async (fileList) => {
      if (!fileList || !fileList.length) return;
      setLocalSaveStatus("⟳ Importando .BC3...", true);
      let lastProjectId = null;
      try {
        for (const file of Array.from(fileList)) {
          const buf = await file.arrayBuffer();
          const parsed = parseBc3ArrayBuffer(buf, file.name);
          const newId = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const rec = buildProjectRecord(newId, parsed, file.name);
          await dbPutProject(rec);
          lastProjectId = newId;
        }
        if (lastProjectId) {
          await switchActiveProject(lastProjectId);
          setLocalSaveStatus("✓ .BC3 importado", false);
        }
      } catch (err) {
        console.error("Error importando .bc3:", err);
        alert("Error al procesar el archivo .bc3: " + (err && err.message ? err.message : String(err)));
        setLocalSaveStatus("⚠️ Error al importar", false);
      }
    };

    document.getElementById("bc3FileInput").addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length) {
        handleFilesList(e.target.files);
        e.target.value = "";
      }
    });

    const overlay = document.getElementById("dropOverlay");
    window.addEventListener("dragover", (e) => {
      e.preventDefault();
      overlay.classList.add("visible");
    });
    window.addEventListener("dragleave", (e) => {
      if (e.target === overlay) overlay.classList.remove("visible");
    });
    window.addEventListener("drop", (e) => {
      e.preventDefault();
      overlay.classList.remove("visible");
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        handleFilesList(e.dataTransfer.files);
      }
    });
  }

  function bindEvents() {
    initSplitResizers();
    bindViewNavigationEvents();
    bindTreeInteractionEvents();
    bindColumnResizeAndDragEvents();
    bindColumnManagerEvents();
    bindRowCustomizationEvents();
    bindDecompositionEvents();
    bindMeasurementsEvents();
    bindImpactModalEvents();
    bindKeyboardTreeNavigationEvents();
    bindDockAndWorkspaceEvents();
    bindMatrixAndThemeEvents();
    bindProjectLibraryEvents();
  }

  async function initAppWithLocalLibrary() {
    loadUiPrefsFromLocal();
    bindEvents();

    let allSaved = await dbGetAllProjects();
    if (window.__INITIAL_BC3_DATA__) {
      const existingDefault = allSaved.find((p) => p.id === DEFAULT_PROJECT_ID);
      const initMeta = window.__INITIAL_BC3_DATA__.metadata || {};
      const existingMeta = existingDefault && existingDefault.data ? existingDefault.data.metadata || {} : null;
      const bundleChanged =
        !existingMeta ||
        existingMeta.root_code !== initMeta.root_code ||
        existingMeta.source_file !== initMeta.source_file;
      if (bundleChanged) {
        const initialCopy = JSON.parse(JSON.stringify(window.__INITIAL_BC3_DATA__));
        const defaultRec = buildProjectRecord(
          DEFAULT_PROJECT_ID,
          initialCopy,
          initMeta.source_file || initMeta.title || "Presupuesto"
        );
        await dbPutProject(defaultRec);
        allSaved = await dbGetAllProjects();
      }
    }

    await refreshProjectsLibraryUI();

    let targetRec = await dbGetProject(activeProjectId);
    if (!targetRec && allSaved.length > 0) {
      targetRec = allSaved[0];
      activeProjectId = targetRec.id;
    }

    if (targetRec && targetRec.data) {
      isInitialBoot = true;
      loadDataset(targetRec.data);
      isInitialBoot = false;
      await refreshProjectsLibraryUI();
      setLocalSaveStatus("✓ Guardado Local", false);
    } else if (window.__INITIAL_BC3_DATA__) {
      isInitialBoot = true;
      loadDataset(window.__INITIAL_BC3_DATA__);
      isInitialBoot = false;
    }
  }

  const clickById = (id) => {
    const el = document.getElementById(id);
    if (el) el.click();
  };
  const isCompactLayout = () => window.matchMedia("(max-width: 1024px)").matches;
  const selectedRow = () => (currentData ? rowMap.get(selectedRowId) : null);

  window.ArqmedApp = {
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    undo: performUndo,
    redo: performRedo,
    getSelectedRowId: () => selectedRowId,
    hasSelection: () => !!selectedRow(),
    canDeleteSelected: () => {
      const r = selectedRow();
      return !!r && r.node_role !== "ROOT";
    },
    editSelected: () => {
      if (selectedRow()) openImpactModalForConcept(selectedRowId);
    },
    addChildToSelected: () => {
      if (selectedRow()) openImpactModalForAddChild(selectedRowId);
    },
    deleteSelected: () => {
      if (selectedRow()) openImpactModalForDelete(selectedRowId);
    },
    moveSelected: (dir) => {
      if (selectedRow()) moveTreeRow(selectedRowId, dir < 0 ? -1 : 1);
    },
    focusSearch: () => {
      window.ArqmedApp.setView("arqmed");
      const input = document.getElementById("treeSearchInput");
      if (input) {
        input.focus();
        input.select();
      }
    },
    importBc3: () => clickById("bc3FileInput"),
    openProjects: () => clickById("btnOpenProjectsModal"),
    duplicateActiveProject: () => clickById("btnDuplicateActiveProject"),
    renameActiveProject: () => renameProjectById(activeProjectId),
    exportBc3: () => exportCurrentBc3File(),
    exportCsv: () => clickById("btnExportCsv"),
    resetFactoryProject: () => {
      const ok = window.confirm(
        "¿Restaurar el presupuesto base original?\nSe perderán los cambios hechos sobre la copia base (los demás .BC3 no se tocan)."
      );
      if (ok) clickById("btnResetFactoryProject");
    },
    getView: () => {
      const active = document.querySelector(".mode-btn.active");
      return active ? active.dataset.view : "arqmed";
    },
    setView: (name) => {
      const btn = document.querySelector(`.mode-btn[data-view="${name}"]`);
      if (btn && !btn.classList.contains("active")) btn.click();
    },
    isPaneVisible: (id) => visibleDockPanes.has(id),
    togglePane: (id) => {
      if (!ALL_DOCK_PANES.includes(id)) return;
      if (visibleDockPanes.has(id)) visibleDockPanes.delete(id);
      else visibleDockPanes.add(id);
      syncDockPanesUI();
    },
    expandToChapterLevel: (lvl) => expandToChapterLevel(lvl),
    getMaxChapterDepth: () => (currentData && currentData.metadata ? currentData.metadata.max_chapter_depth || 5 : 5),
    expandPartidas: () => expandPartidas(),
    expandAll: () => expandAll(),
    collapseAll: () => {
      if (!currentData) return;
      expandedRowIds.clear();
      for (const r of currentData.budget_matrix) {
        if (r.node_role === "ROOT") expandedRowIds.add(r.row_id);
      }
      renderArqmedTree();
    },
    isHashHidden: () => hideHashInCodes,
    toggleHash: () => {
      const chk = document.getElementById("chkHideHashSymbol");
      if (!chk) return;
      chk.checked = !chk.checked;
      chk.dispatchEvent(new Event("change", { bubbles: true }));
    },
    isSideDockOpen: () => {
      const dock = document.getElementById("sidePanelDock");
      if (!dock) return false;
      return isCompactLayout() ? dock.classList.contains("mobile-open") : !dock.classList.contains("collapsed");
    },
    toggleSideDock: () => {
      if (isCompactLayout()) clickById("btnMobileDrawerToggle");
      else clickById("btnToggleSideDock");
    },
    isDarkTheme: () => document.documentElement.dataset.theme === "dark",
    toggleTheme: () => clickById("btnTheme"),
    getRowDensity: () => treeRowDensity,
    setRowDensity: (d) => {
      const btn = document.querySelector(`[data-row-density="${d}"]`);
      if (btn) btn.click();
    },
    resetColumns: () => clickById("btnResetTreeCols"),
    resetInterface: () => {
      const ok = window.confirm(
        "¿Restablecer la interfaz?\nSe restauran paneles, columnas, tema y tamaño de filas. Tus presupuestos .BC3 guardados NO se borran."
      );
      if (!ok) return;
      try {
        localStorage.setItem(UI_PREFS_KEY, JSON.stringify({ activeProjectId }));
      } catch (_e) {
      }
      window.location.reload();
    },
    onStateChange: (cb) => {
      if (typeof cb === "function") stateChangeListeners.push(cb);
    },
  };

  window.addEventListener("DOMContentLoaded", () => {
    initAppWithLocalLibrary();
  });
})();
