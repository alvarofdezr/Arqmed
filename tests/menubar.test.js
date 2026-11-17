"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const mb = require(path.join(__dirname, "..", "dashboard", "menubar.js"));

test("matchShortcut: Ctrl+Z basic", () => {
  assert.equal(mb.matchShortcut({ ctrlKey: true, key: "z" }, "Ctrl+Z"), true);
});

test("matchShortcut: Shift breaks exact match", () => {
  assert.equal(mb.matchShortcut({ ctrlKey: true, shiftKey: true, key: "Z" }, "Ctrl+Z"), false);
  assert.equal(mb.matchShortcut({ ctrlKey: true, shiftKey: true, key: "Z" }, "Ctrl+Shift+Z"), true);
});

test("matchShortcut: metaKey counts as Ctrl (macOS)", () => {
  assert.equal(mb.matchShortcut({ metaKey: true, key: "s" }, "Ctrl+S"), true);
});

test("matchShortcut: Alt+ArrowUp and Spanish key aliases", () => {
  assert.equal(mb.matchShortcut({ altKey: true, key: "ArrowUp" }, "Alt+ArrowUp"), true);
  assert.equal(mb.matchShortcut({ key: "Delete" }, "Supr"), true);
  assert.equal(mb.matchShortcut({ key: "Insert" }, "Insert"), true);
  assert.equal(mb.matchShortcut({ key: "F2" }, "F2"), true);
  assert.equal(mb.matchShortcut({ ctrlKey: true, key: "F2" }, "F2"), false);
});

test("isTypingTarget", () => {
  assert.equal(mb.isTypingTarget({ tagName: "INPUT", type: "text" }), true);
  assert.equal(mb.isTypingTarget({ tagName: "TEXTAREA" }), true);
  assert.equal(mb.isTypingTarget({ tagName: "SELECT" }), true);
  assert.equal(mb.isTypingTarget({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(mb.isTypingTarget({ tagName: "TD" }), false);
  assert.equal(mb.isTypingTarget(null), false);
});

test("findCommandForEvent: respects enabled() and shortcut arrays", () => {
  const cmds = [
    { id: "undo", shortcut: "Ctrl+Z", enabled: () => false, run() {} },
    { id: "redo", shortcut: ["Ctrl+Y", "Ctrl+Shift+Z"], enabled: () => true, run() {} },
    { id: "noshort", run() {} },
  ];
  assert.equal(mb.findCommandForEvent(cmds, { ctrlKey: true, key: "z" }), null);
  assert.equal(mb.findCommandForEvent(cmds, { ctrlKey: true, key: "y" }).id, "redo");
  assert.equal(mb.findCommandForEvent(cmds, { ctrlKey: true, shiftKey: true, key: "Z" }).id, "redo");
  assert.equal(mb.findCommandForEvent(cmds, { key: "x" }), null);
});

test("formatShortcut renders Spanish labels", () => {
  assert.equal(mb.formatShortcut("Alt+ArrowUp"), "Alt+↑");
  assert.equal(mb.formatShortcut(["Ctrl+Y", "Ctrl+Shift+Z"]), "Ctrl+Y");
  assert.equal(mb.formatShortcut(undefined), "");
});

test("buildMenus: 5 menus in order, unique ids, unique shortcuts, all runnable", () => {
  const calls = [];
  const api = new Proxy({}, { get: (_, k) => (...a) => { calls.push(k); return k === "getView" ? "arqmed" : true; } });
  const menus = mb.buildMenus(api);
  assert.deepEqual(menus.map((m) => m.label), ["Archivo", "Editar", "Ver", "Preferencias", "Ayuda"]);
  const cmds = mb.flattenCommands(menus);
  const ids = cmds.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  const shorts = cmds.flatMap((c) => (c.shortcut ? [].concat(c.shortcut) : []));
  assert.equal(new Set(shorts.map((s) => s.toLowerCase())).size, shorts.length);
  for (const c of cmds) assert.equal(typeof c.run, "function", c.id);
  const del = cmds.find((c) => c.id === "edit.delete");
  assert.equal(del.allowWhileTyping, undefined);
  assert.equal(cmds.find((c) => c.id === "file.exportBc3").allowWhileTyping, true);
});
