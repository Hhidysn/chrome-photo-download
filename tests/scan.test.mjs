import test from "node:test";
import assert from "node:assert/strict";
import {scanLoadedImages} from "../extension/lib/scan.mjs";
import {sourceFingerprint} from "../extension/lib/catalog.mjs";

test("unrelated DOM insertions do not change image identities or invalidate a stable source", () => {
  const keys = ["window", "document", "location", "innerWidth", "innerHeight"];
  const previous = new Map(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const stateKey = Symbol.for("page-image-save:scan-identities");
  const previousState = globalThis[stateKey];
  const styles = {backgroundImage: "none", display: "block", visibility: "visible", opacity: "1", contentVisibility: "visible", overflowX: "visible", overflowY: "visible"};
  const rectangle = {left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100};
  const element = (name, url) => ({localName: name, complete: true, naturalWidth: 100, naturalHeight: 100, src: url, currentSrc: url, parentElement: null, getRootNode: () => ({}), getBoundingClientRect: () => rectangle});
  const a = element("img", "https://example.test/a.jpg"), b = element("img", "https://example.test/b.jpg");
  let order = [a, b];
  const view = {getComputedStyle: () => styles, performance: {getEntriesByType: () => []}};
  try {
    globalThis.window = view;
    globalThis.document = {querySelectorAll: () => order, title: "test"};
    globalThis.location = {href: "https://example.test/"};
    globalThis.innerWidth = 400; globalThis.innerHeight = 600;
    delete globalThis[stateKey];
    const before = scanLoadedImages();
    order = [element("div"), a, b];
    const after = scanLoadedImages();
    assert.deepEqual(after.images.map((image) => image.id), before.images.map((image) => image.id));
    assert.equal(sourceFingerprint(before), sourceFingerprint(after));
    order = [a, element("img", "https://example.test/c.jpg"), b];
    assert.notEqual(sourceFingerprint(before), sourceFingerprint(scanLoadedImages()));
  } finally {
    for (const key of keys) {
      if (previous.get(key)) Object.defineProperty(globalThis, key, previous.get(key));
      else delete globalThis[key];
    }
    if (previousState === undefined) delete globalThis[stateKey]; else globalThis[stateKey] = previousState;
  }
});
