(function (root, factory) {
  const lib = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = lib;
  } else {
    root.ArqmedMenubar = lib;
    if (root.document) {
      if (root.document.readyState === "loading") {
        root.document.addEventListener("DOMContentLoaded", () => lib.mount(root));
      } else {
        lib.mount(root);
      }
    }
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const KEY_ALIASES = {
    supr: "delete",
    del: "delete",
    ins: "insert",
    esc: "escape",
    space: " ",
    up: "arrowup",
    down: "arrowdown",
    left: "arrowleft",
    right: "arrowright",
  };

  const KEY_LABELS = {
    arrowup: "↑",
    arrowdown: "↓",
    arrowleft: "←",
    arrowright: "→",
    delete: "Supr",
    insert: "Insert",
    escape: "Esc",
  };

  function normalizeKey(k) {
    const low = String(k || "").toLowerCase();
    return KEY_ALIASES[low] || low;
  }

  function parseShortcut(str) {
    const parts = String(str || "").split("+").map((p) => p.trim()).filter(Boolean);
    const out = { ctrl: false, alt: false, shift: false, key: "" };
    for (const p of parts) {
      const low = p.toLowerCase();
      if (low === "ctrl" || low === "cmd" || low === "meta") out.ctrl = true;
      else if (low === "alt") out.alt = true;
      else if (low === "shift") out.shift = true;
      else out.key = normalizeKey(p);
    }
    return out;
  }

  function matchShortcut(evt, str) {
    if (!evt || !str) return false;
    const sc = parseShortcut(str);
    if (!sc.key) return false;
    const ctrl = !!(evt.ctrlKey || evt.metaKey);
    if (ctrl !== sc.ctrl) return false;
    if (!!evt.altKey !== sc.alt) return false;
    if (!!evt.shiftKey !== sc.shift) return false;
    return normalizeKey(evt.key) === sc.key;
  }

  function shortcutList(sc) {
    if (!sc) return [];
    return Array.isArray(sc) ? sc : [sc];
  }

  function formatShortcut(sc) {
    const first = shortcutList(sc)[0];
    if (!first) return "";
    return String(first)
      .split("+")
      .map((p) => {
        const n = normalizeKey(p.trim());
        return KEY_LABELS[n] || p.trim();
      })
      .join("+");
  }

  function isTypingTarget(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = String(el.tagName || "").toUpperCase();
    if (tag === "TEXTAREA" || tag === "SELECT") return true;
    if (tag === "INPUT") {
      const t = String(el.type || "text").toLowerCase();
      return !["checkbox", "radio", "button", "submit", "reset", "range", "color", "file"].includes(t);
    }
    return false;
  }

  function isEnabled(cmd) {
    return typeof cmd.enabled !== "function" || cmd.enabled() !== false;
  }

  function findCommandForEvent(commands, evt) {
    for (const cmd of commands || []) {
      if (!cmd || !cmd.shortcut) continue;
      if (!shortcutList(cmd.shortcut).some((s) => matchShortcut(evt, s))) continue;
      return isEnabled(cmd) ? cmd : null;
    }
    return null;
  }

  function buildMenus(api) {
    const has = () => api.hasSelection();
    const view = (name) => () => api.getView() === name;
    return [
      {
        id: "archivo",
        label: "Archivo",
        items: [
          { id: "file.saveBc3", label: "Guardar .BC3", shortcut: "Ctrl+S", allowWhileTyping: true, run: () => api.exportBc3() },
          { id: "file.import", label: "Importar .BC3…", shortcut: "Ctrl+O", allowWhileTyping: true, run: () => api.importBc3() },
          { id: "file.projects", label: "Mis .BC3…", run: () => api.openProjects() },
          { id: "file.duplicate", label: "Duplicar presupuesto", run: () => api.duplicateActiveProject() },
          { id: "file.rename", label: "Renombrar…", run: () => api.renameActiveProject() },
          { sep: true },
          { id: "file.exportBc3", label: "Exportar copia .BC3…", allowWhileTyping: true, run: () => api.exportBc3() },
          { id: "file.exportCsv", label: "Exportar CSV (Excel)", run: () => api.exportCsv() },
          { sep: true },
          { id: "file.resetFactory", label: "Restaurar .BC3 base…", run: () => api.resetFactoryProject() },
        ],
      },
      {
        id: "editar",
        label: "Editar",
        items: [
          { id: "edit.undo", label: "Deshacer", icon: "↩", shortcut: "Ctrl+Z", enabled: () => api.canUndo(), run: () => api.undo() },
          { id: "edit.redo", label: "Rehacer", icon: "↪", shortcut: ["Ctrl+Y", "Ctrl+Shift+Z"], enabled: () => api.canRedo(), run: () => api.redo() },
          { sep: true },
          { id: "edit.concept", label: "Editar concepto…", icon: "✎", shortcut: "F2", enabled: has, run: () => api.editSelected() },
          { id: "edit.addChild", label: "Añadir hijo…", icon: "＋", shortcut: "Insert", enabled: has, run: () => api.addChildToSelected() },
          { id: "edit.delete", label: "Eliminar…", icon: "🗑", shortcut: "Supr", enabled: () => api.canDeleteSelected(), run: () => api.deleteSelected() },
          { sep: true },
          { id: "edit.moveUp", label: "Subir fila", icon: "↑", shortcut: "Alt+ArrowUp", enabled: has, run: () => api.moveSelected(-1) },
          { id: "edit.moveDown", label: "Bajar fila", icon: "↓", shortcut: "Alt+ArrowDown", enabled: has, run: () => api.moveSelected(1) },
          { sep: true },
          { id: "edit.search", label: "Buscar en el árbol", icon: "🔍", shortcut: "Ctrl+K", allowWhileTyping: true, run: () => api.focusSearch() },
        ],
      },
      {
        id: "ver",
        label: "Ver",
        items: [
          { id: "view.arqmed", label: "Editor árbol", type: "radio", checked: view("arqmed"), run: () => api.setView("arqmed") },
          { id: "view.matrix", label: "Matriz multi-nivel", type: "radio", checked: view("matrix"), run: () => api.setView("matrix") },
          { id: "view.analytics", label: "Dashboard de obra", type: "radio", checked: view("analytics"), run: () => api.setView("analytics") },
          { sep: true },
          { id: "view.pane.descomposicion", label: "Panel Descomposición", type: "check", checked: () => api.isPaneVisible("descomposicion"), run: () => api.togglePane("descomposicion") },
          { id: "view.pane.mediciones", label: "Panel Mediciones", type: "check", checked: () => api.isPaneVisible("mediciones"), run: () => api.togglePane("mediciones") },
          { id: "view.pane.pliego", label: "Panel Comentario / Pliego", type: "check", checked: () => api.isPaneVisible("pliego"), run: () => api.togglePane("pliego") },
          { sep: true, label: "Profundidad del Árbol" },
          { id: "view.depth.dialog", label: "Selector de profundidad…", icon: "≡", run: () => openDialog("depthDialog") },
          { id: "view.depth.n1", label: "Capítulos Nivel 1 (Cap N1)", icon: "1", run: () => api.expandToChapterLevel(1) },
          { id: "view.depth.n2", label: "Capítulos Nivel 2 (Cap N2)", icon: "2", run: () => api.expandToChapterLevel(2) },
          { id: "view.depth.n3", label: "Capítulos Nivel 3 (Cap N3)", icon: "3", run: () => api.expandToChapterLevel(3) },
          { id: "view.depth.n4", label: "Capítulos Nivel 4 (Cap N4)", icon: "4", run: () => api.expandToChapterLevel(4) },
          { id: "view.depth.n5", label: "Capítulos Nivel 5 (Cap N5)", icon: "5", run: () => api.expandToChapterLevel(5) },
          { id: "view.expandPartidas", label: "Partidas de Obra", icon: "⊞", run: () => api.expandPartidas() },
          { id: "view.expandAll", label: "Desplegar Todo el Árbol", icon: "⊟", run: () => api.expandAll() },
          { id: "view.collapseAll", label: "Plegar Todo (Solo Raíz)", icon: "⌂", run: () => api.collapseAll() },
          { sep: true },
          { id: "view.hash", label: "Ocultar # técnico en códigos", type: "check", checked: () => api.isHashHidden(), run: () => api.toggleHash() },
          { id: "view.sideDock", label: "Panel lateral de vista", type: "check", checked: () => api.isSideDockOpen(), run: () => api.toggleSideDock() },
        ],
      },
      {
        id: "preferencias",
        label: "Preferencias",
        items: [
          { id: "pref.theme", label: "Tema oscuro", type: "check", checked: () => api.isDarkTheme(), run: () => api.toggleTheme() },
          { sep: true, label: "Altura de fila" },
          { id: "pref.density.sm", label: "Filas compactas (S)", type: "radio", checked: () => api.getRowDensity() === "sm", run: () => api.setRowDensity("sm") },
          { id: "pref.density.md", label: "Filas estándar (M)", type: "radio", checked: () => api.getRowDensity() === "md", run: () => api.setRowDensity("md") },
          { id: "pref.density.lg", label: "Filas grandes (L)", type: "radio", checked: () => api.getRowDensity() === "lg", run: () => api.setRowDensity("lg") },
          { id: "pref.density.xl", label: "Filas extra grandes (XL)", type: "radio", checked: () => api.getRowDensity() === "xl", run: () => api.setRowDensity("xl") },
          { sep: true },
          { id: "pref.resetColumns", label: "Restablecer columnas del árbol", run: () => api.resetColumns() },
          { id: "pref.resetInterface", label: "Restablecer interfaz…", run: () => api.resetInterface() },
        ],
      },
      {
        id: "ayuda",
        label: "Ayuda",
        items: [
          { id: "help.shortcuts", label: "Atajos de teclado", icon: "⌨", run: () => openDialog("shortcutsDialog") },
          { id: "help.about", label: "Acerca de ARQMED Studio", icon: "ℹ", run: () => openDialog("aboutDialog") },
        ],
      },
    ];
  }

  function flattenCommands(menus) {
    const out = [];
    for (const m of menus) for (const it of m.items) if (!it.sep) out.push(it);
    return out;
  }

  let doc = null;
  let menus = [];
  let commands = [];
  let openMenuId = null;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isChecked(it) {
    return typeof it.checked === "function" && !!it.checked();
  }

  function roleFor(it) {
    if (it.type === "check") return "menuitemcheckbox";
    if (it.type === "radio") return "menuitemradio";
    return "menuitem";
  }

  function itemHtml(it, extraClass) {
    if (it.sep) {
      return it.label
        ? `<div class="menu-sep-label" role="presentation">${esc(it.label)}</div>`
        : `<div class="menu-sep" role="separator"></div>`;
    }
    const enabled = isEnabled(it);
    const checked = isChecked(it);
    const mark = it.type ? (checked ? (it.type === "radio" ? "●" : "✓") : "") : esc(it.icon || "");
    const ariaChecked = it.type ? ` aria-checked="${checked}"` : "";
    return `<button type="button" class="menu-item ${extraClass || ""}${checked ? " is-checked" : ""}" role="${roleFor(it)}"
        data-cmd="${esc(it.id)}"${ariaChecked} aria-disabled="${!enabled}" ${enabled ? "" : "disabled"} tabindex="-1">
        <span class="menu-item-mark" aria-hidden="true">${mark}</span>
        <span class="menu-item-label">${esc(it.label)}</span>
        <span class="menu-item-shortcut">${esc(formatShortcut(it.shortcut))}</span>
      </button>`;
  }

  function renderMenubar() {
    const bar = doc.getElementById("appMenubar");
    if (!bar) return;
    bar.innerHTML = menus
      .map(
        (m) => `<div class="menubar-entry" data-menu-entry="${m.id}">
          <button type="button" class="menubar-btn" role="menuitem" aria-haspopup="menu" aria-expanded="false"
            data-menu-btn="${m.id}" id="menubtn-${m.id}" tabindex="-1">${esc(m.label)}</button>
          <div class="menu-dropdown" role="menu" aria-labelledby="menubtn-${m.id}" data-menu-panel="${m.id}" hidden></div>
        </div>`
      )
      .join("");
    const first = bar.querySelector(".menubar-btn");
    if (first) first.tabIndex = 0;
  }

  function fillDropdown(menuId) {
    const panel = doc.querySelector(`[data-menu-panel="${menuId}"]`);
    const m = menus.find((x) => x.id === menuId);
    if (!panel || !m) return null;
    panel.innerHTML = m.items.map((it) => itemHtml(it)).join("");
    return panel;
  }

  function enabledItems(panel) {
    return Array.from(panel.querySelectorAll(".menu-item:not([disabled])"));
  }

  function openMenu(menuId, focusFirstItem) {
    closeMenu(false);
    const panel = fillDropdown(menuId);
    const btn = doc.querySelector(`[data-menu-btn="${menuId}"]`);
    if (!panel || !btn) return;
    openMenuId = menuId;
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    btn.classList.add("open");
    panel.style.left = "0px";
    const rect = panel.getBoundingClientRect();
    const vw = doc.documentElement.clientWidth;
    if (rect.right > vw - 6) panel.style.left = `${Math.min(0, vw - 6 - rect.right)}px`;
    if (focusFirstItem) {
      const items = enabledItems(panel);
      if (items[0]) items[0].focus();
    }
  }

  function closeMenu(returnFocus) {
    if (!openMenuId) return;
    const id = openMenuId;
    openMenuId = null;
    const panel = doc.querySelector(`[data-menu-panel="${id}"]`);
    const btn = doc.querySelector(`[data-menu-btn="${id}"]`);
    if (panel) panel.hidden = true;
    if (btn) {
      btn.setAttribute("aria-expanded", "false");
      btn.classList.remove("open");
      if (returnFocus) btn.focus();
    }
  }

  function runCommandById(id) {
    const cmd = commands.find((c) => c.id === id);
    if (!cmd || !isEnabled(cmd)) return;
    try {
      cmd.run();
    } finally {
      refreshDynamic();
    }
  }

  function bindMenubar() {
    const bar = doc.getElementById("appMenubar");
    if (!bar) return;

    bar.addEventListener("click", (e) => {
      const itemBtn = e.target.closest(".menu-item");
      if (itemBtn) {
        if (itemBtn.disabled) return;
        const id = itemBtn.dataset.cmd;
        closeMenu(false);
        runCommandById(id);
        return;
      }
      const mBtn = e.target.closest("[data-menu-btn]");
      if (mBtn) {
        const id = mBtn.dataset.menuBtn;
        if (openMenuId === id) closeMenu(false);
        else openMenu(id, false);
      }
    });

    bar.addEventListener("pointerover", (e) => {
      if (!openMenuId || e.pointerType === "touch") return;
      const mBtn = e.target.closest("[data-menu-btn]");
      if (mBtn && mBtn.dataset.menuBtn !== openMenuId) openMenu(mBtn.dataset.menuBtn, false);
    });

    bar.addEventListener("keydown", (e) => {
      const ids = menus.map((m) => m.id);
      const mBtn = e.target.closest("[data-menu-btn]");
      const itemBtn = e.target.closest(".menu-item");
      const curId = mBtn ? mBtn.dataset.menuBtn : openMenuId;
      const curIdx = ids.indexOf(curId);

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (openMenuId) closeMenu(true);
        else if (mBtn) mBtn.blur();
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const next = ids[(curIdx + (e.key === "ArrowRight" ? 1 : -1) + ids.length) % ids.length];
        const nextBtn = doc.querySelector(`[data-menu-btn="${next}"]`);
        if (openMenuId) openMenu(next, true);
        else if (nextBtn) nextBtn.focus();
        return;
      }
      if (mBtn && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        openMenu(curId, true);
        return;
      }
      if (itemBtn && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Home" || e.key === "End")) {
        e.preventDefault();
        const items = enabledItems(itemBtn.closest(".menu-dropdown"));
        const i = items.indexOf(itemBtn);
        let n = i;
        if (e.key === "ArrowDown") n = (i + 1) % items.length;
        else if (e.key === "ArrowUp") n = (i - 1 + items.length) % items.length;
        else if (e.key === "Home") n = 0;
        else n = items.length - 1;
        if (items[n]) items[n].focus();
        return;
      }
      if (e.key === "Tab" && openMenuId) {
        closeMenu(false);
      }
    });

    doc.addEventListener("pointerdown", (e) => {
      if (openMenuId && !e.target.closest("#appMenubar")) closeMenu(false);
    });
    window.addEventListener("resize", () => closeMenu(false));
    window.addEventListener("blur", () => closeMenu(false));
  }

  function renderMobileSheet() {
    const body = doc.getElementById("mobileMenuSheetBody");
    if (!body) return;
    const openIds = new Set(
      Array.from(body.querySelectorAll("details[open]")).map((d) => d.dataset.sheetMenu)
    );
    body.innerHTML = menus
      .map(
        (m) => `<details class="sheet-group" data-sheet-menu="${m.id}" ${openIds.has(m.id) ? "open" : ""}>
          <summary class="sheet-group-title">${esc(m.label)}</summary>
          <div class="sheet-group-items" role="menu">${m.items.map((it) => itemHtml(it, "sheet-item")).join("")}</div>
        </details>`
      )
      .join("");
  }

  function setMobileSheet(open) {
    const sheet = doc.getElementById("mobileMenuSheet");
    const backdrop = doc.getElementById("mobileMenuBackdrop");
    const trigger = doc.getElementById("btnMobileMenu");
    if (!sheet) return;
    if (open) renderMobileSheet();
    sheet.classList.toggle("open", open);
    sheet.setAttribute("aria-hidden", String(!open));
    if (backdrop) backdrop.classList.toggle("open", open);
    if (trigger) trigger.setAttribute("aria-expanded", String(open));
    if (open) {
      const firstSummary = sheet.querySelector("summary");
      if (firstSummary) firstSummary.focus();
    } else if (trigger && sheet.contains(doc.activeElement)) {
      trigger.focus();
    }
  }

  function bindMobileSheet() {
    const trigger = doc.getElementById("btnMobileMenu");
    const sheet = doc.getElementById("mobileMenuSheet");
    const backdrop = doc.getElementById("mobileMenuBackdrop");
    const closeBtn = doc.getElementById("btnCloseMobileMenu");
    if (trigger) trigger.addEventListener("click", () => setMobileSheet(!sheet.classList.contains("open")));
    if (backdrop) backdrop.addEventListener("click", () => setMobileSheet(false));
    if (closeBtn) closeBtn.addEventListener("click", () => setMobileSheet(false));
    if (sheet) {
      sheet.addEventListener("click", (e) => {
        const itemBtn = e.target.closest(".menu-item");
        if (!itemBtn || itemBtn.disabled) return;
        const cmd = commands.find((c) => c.id === itemBtn.dataset.cmd);
        const keepOpen = cmd && (cmd.type === "check" || cmd.type === "radio");
        if (!keepOpen) setMobileSheet(false);
        runCommandById(itemBtn.dataset.cmd);
        if (keepOpen) renderMobileSheet();
      });
      sheet.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setMobileSheet(false);
        }
      });
    }
  }

  const BOTTOM_BAR = [
    { cmd: "edit.undo", icon: "↩", label: "Deshacer" },
    { cmd: "edit.concept", icon: "✎", label: "Editar" },
    { cmd: "edit.addChild", icon: "＋", label: "Añadir" },
    { cmd: "view.sideDock", icon: "▤", label: "Paneles" },
    { cmd: "file.projects", icon: "📚", label: "Mis .BC3" },
  ];

  function renderBottomBar() {
    const bar = doc.getElementById("mobileBottomBar");
    if (!bar) return;
    bar.innerHTML = BOTTOM_BAR.map((b) => {
      const cmd = commands.find((c) => c.id === b.cmd);
      const enabled = cmd ? isEnabled(cmd) : false;
      return `<button type="button" class="bottom-bar-btn" data-cmd="${b.cmd}" ${enabled ? "" : "disabled"}
          aria-label="${esc(cmd ? cmd.label : b.label)}">
          <span class="bottom-bar-icon" aria-hidden="true">${b.icon}</span>
          <span class="bottom-bar-label">${esc(b.label)}</span>
        </button>`;
    }).join("");
  }

  function bindBottomBar() {
    const bar = doc.getElementById("mobileBottomBar");
    if (!bar) return;
    bar.addEventListener("click", (e) => {
      const b = e.target.closest("[data-cmd]");
      if (!b || b.disabled) return;
      runCommandById(b.dataset.cmd);
    });
  }

  function renderShortcutsList() {
    const list = doc.getElementById("shortcutsList");
    if (!list) return;
    const rows = commands
      .filter((c) => c.shortcut)
      .map((c) => {
        const keys = shortcutList(c.shortcut).map((s) => `<kbd>${esc(formatShortcut(s))}</kbd>`).join(" / ");
        return `<tr><td>${esc(c.label)}</td><td class="num">${keys}</td></tr>`;
      });
    rows.push(`<tr><td>Navegar por el árbol</td><td class="num"><kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd></td></tr>`);
    rows.push(`<tr><td>Abrir la barra de menús</td><td class="num"><kbd>Alt</kbd></td></tr>`);
    list.innerHTML = rows.join("");
  }

  let lastFocusBeforeDialog = null;
  function renderDepthDialog() {
    const container = doc.getElementById("depthDialogButtonsContainer");
    if (!container) return;
    const api = doc.defaultView?.ArqmedApp || {};
    const maxDepth = typeof api.getMaxChapterDepth === "function" && Number.isInteger(api.getMaxChapterDepth())
      ? api.getMaxChapterDepth()
      : 5;
    let html = "";
    for (let i = 1; i <= maxDepth; i++) {
      html += `<button type="button" class="lvl-pill" data-depth-lvl="${i}" style="padding:6px 14px;font-size:12px;">Cap N${i}</button>`;
    }
    html += `<button type="button" class="lvl-pill" data-depth-act="partidas" style="padding:6px 14px;font-size:12px;">Partidas</button>`;
    html += `<button type="button" class="lvl-pill" data-depth-act="all" style="padding:6px 14px;font-size:12px;">Todo el Árbol</button>`;
    html += `<button type="button" class="lvl-pill" data-depth-act="collapse" style="padding:6px 14px;font-size:12px;">Plegar Todo (Raíz)</button>`;
    container.innerHTML = html;
  }

  function openDialog(id) {
    const dlg = doc.getElementById(id);
    if (!dlg) return;
    if (id === "shortcutsDialog") renderShortcutsList();
    if (id === "depthDialog") renderDepthDialog();
    lastFocusBeforeDialog = doc.activeElement;
    dlg.classList.add("open");
    const closeBtn = dlg.querySelector("[data-close-dialog]");
    if (closeBtn) closeBtn.focus();
  }

  function closeDialog(dlg) {
    dlg.classList.remove("open");
    if (lastFocusBeforeDialog && lastFocusBeforeDialog.focus) lastFocusBeforeDialog.focus();
  }

  function bindDialogs() {
    doc.querySelectorAll(".menu-dialog-backdrop").forEach((dlg) => {
      dlg.addEventListener("click", (e) => {
        if (e.target === dlg || e.target.closest("[data-close-dialog]")) closeDialog(dlg);
      });
    });

    const depthContainer = doc.getElementById("depthDialogButtonsContainer");
    if (depthContainer) {
      depthContainer.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        const api = doc.defaultView?.ArqmedApp || {};
        if (btn.dataset.depthLvl) {
          if (api.expandToChapterLevel) api.expandToChapterLevel(Number(btn.dataset.depthLvl));
        } else if (btn.dataset.depthAct === "partidas") {
          if (api.expandPartidas) api.expandPartidas();
        } else if (btn.dataset.depthAct === "all") {
          if (api.expandAll) api.expandAll();
        } else if (btn.dataset.depthAct === "collapse") {
          if (api.collapseAll) api.collapseAll();
        }
        const dlg = doc.getElementById("depthDialog");
        if (dlg) closeDialog(dlg);
      });
    }
  }

  function anyModalOpen() {
    return !!doc.querySelector(
      "#impactModalBackdrop.open, #projectsModalBackdrop.open, .menu-dialog-backdrop.open, #mobileMenuSheet.open"
    );
  }

  let altAlone = false;
  function bindGlobalShortcuts() {
    doc.addEventListener("keydown", (e) => {
      if (e.key === "Alt") {
        altAlone = !e.repeat;
        return;
      }
      altAlone = false;
      if (e.defaultPrevented) return;

      if (e.key === "Escape") {
        const openDlg = doc.querySelector(".menu-dialog-backdrop.open");
        if (openDlg) {
          closeDialog(openDlg);
          return;
        }
        if (doc.getElementById("mobileMenuSheet")?.classList.contains("open")) {
          setMobileSheet(false);
          return;
        }
        if (openMenuId) closeMenu(true);
        return;
      }

      if (anyModalOpen()) return;
      if (e.target && e.target.closest && e.target.closest("#appMenubar") && !e.ctrlKey && !e.metaKey && !e.altKey) return;

      const cmd = findCommandForEvent(commands, e);
      if (!cmd) return;
      if (isTypingTarget(e.target) && !cmd.allowWhileTyping) return;
      e.preventDefault();
      e.stopPropagation();
      runCommandById(cmd.id);
    }, true);

    doc.addEventListener("keyup", (e) => {
      if (e.key !== "Alt" || !altAlone) return;
      altAlone = false;
      if (anyModalOpen() || isTypingTarget(e.target)) return;
      const bar = doc.getElementById("appMenubar");
      if (!bar || bar.offsetParent === null) return;
      e.preventDefault();
      const first = bar.querySelector(".menubar-btn");
      if (first) first.focus();
    });
    doc.addEventListener("pointerdown", () => {
      altAlone = false;
    });
  }

  function refreshDynamic() {
    renderBottomBar();
    if (openMenuId) {
      const focusedCmd = doc.activeElement && doc.activeElement.dataset ? doc.activeElement.dataset.cmd : null;
      const panel = fillDropdown(openMenuId);
      if (panel && focusedCmd) {
        const again = panel.querySelector(`[data-cmd="${focusedCmd}"]`);
        if (again) again.focus();
      }
    }
    const sheet = doc.getElementById("mobileMenuSheet");
    if (sheet && sheet.classList.contains("open")) renderMobileSheet();
  }

  function mount(win) {
    doc = win.document;
    const api = win.ArqmedApp;
    if (!api) {
      console.warn("[ARQMED] window.ArqmedApp no disponible: barra de menús desactivada");
      return;
    }
    menus = buildMenus(api);
    commands = flattenCommands(menus);
    renderMenubar();
    bindMenubar();
    bindMobileSheet();
    renderBottomBar();
    bindBottomBar();
    bindDialogs();
    bindGlobalShortcuts();
    if (typeof api.onStateChange === "function") api.onStateChange(refreshDynamic);
  }

  return {
    parseShortcut,
    matchShortcut,
    formatShortcut,
    isTypingTarget,
    findCommandForEvent,
    buildMenus,
    flattenCommands,
    mount,
  };
});
