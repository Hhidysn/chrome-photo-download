import test from "node:test";
import assert from "node:assert/strict";

test("toolbar and shortcut bind separate window sources and open before async work", async () => {
  const calls = [], contexts = [];
  let action, command;
  globalThis.chrome = {
    action: {onClicked: {addListener(callback) {action = callback;}}},
    commands: {onCommand: {addListener(callback) {command = callback;}}},
    sidePanel: {open(options) {calls.push({kind: "open", ...options}); return Promise.resolve();}},
    storage: {session: {set(value) {calls.push({kind: "store"}); contexts.push(value); return Promise.resolve();}}}
  };
  await import("../extension/background.js");
  action({id: 11, windowId: 1});
  await command("save-all", {id: 22, windowId: 2});
  assert.deepEqual(calls.map((call) => call.kind), ["open", "store", "open", "store"]);
  assert.equal(contexts[0]["source:1"].tabId, 11);
  assert.equal(contexts[1]["source:2"].tabId, 22);
  assert.equal(contexts[0]["source:1"].mode, "select");
  assert.equal(contexts[1]["source:2"].mode, "all");
  assert.notEqual(contexts[0]["source:1"].requestId, contexts[1]["source:2"].requestId);
  action({id: 0, windowId: 0});
  assert.equal(contexts[2]["source:0"].tabId, 0);
  delete globalThis.chrome;
});
