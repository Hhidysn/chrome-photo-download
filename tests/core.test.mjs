import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {extractImages, safeName, extensionFor} from "../extension/lib/mhtml.mjs";
import {buildCatalog, dataImage, eligibleItems, sha256, sourceFingerprint, validateImage} from "../extension/lib/catalog.mjs";
import {saveBatch} from "../extension/lib/files.mjs";

const image = Uint8Array.of(255,216,255,224,128,255,217);
const resource = {location: "https://example.test/image.jpg", mime: "image/jpeg", bytes: image};
const candidate = {id: "p/1", index: 1, src: resource.location, currentSrc: resource.location, width: 1568, height: 1000, visible: false};
function archive(parts, encoding = "base64") {
  return Buffer.from(`MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="snapshot-test"\r\n\r\n${parts.map((part) => `--snapshot-test\r\nContent-Type: ${part.mime}\r\nContent-Location: ${part.location}\r\nContent-Transfer-Encoding: ${encoding}\r\n\r\n${Buffer.from(part.bytes).toString("base64")}\r\n`).join("")}--snapshot-test--\r\n`);
}

test("Chrome MIME decoding preserves the user's independently verified original bytes", async (t) => {
  let bytes;
  try {bytes = await readFile(new URL("../target/downloadDir/001.jpg", import.meta.url));}
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    t.skip("用户原图基线不随源码和安装包分发；此工作区缺少该可选基线");
    return;
  }
  const [actual] = extractImages(archive([{...resource, bytes}, {location: "https://example.test/", mime: "text/html", bytes: Buffer.from("<script>bad()</script>")} ]));
  assert.deepEqual(Buffer.from(actual.bytes), bytes);
  assert.equal(await sha256(actual.bytes), "257cd7f9b6a26c763905c3754bb3783d127f6b937139af78c387afa22c016427");
});
test("truncated archive and invalid transfer encodings fail clearly", () => {
  assert.throws(() => extractImages(archive([resource]).subarray(0, -25)), /结束边界/);
  assert.throws(() => extractImages(archive([resource], "unsupported")), /编码/);
});
test("binary bytes and a trailing newline are preserved", () => {
  const prefix = Buffer.from('Content-Type: multipart/related; boundary="b"\r\n\r\n--b\r\nContent-Type: image/jpeg\r\nContent-Location: x\r\nContent-Transfer-Encoding: binary\r\n\r\n');
  const raw = Buffer.from([0,128,255,10]);
  assert.deepEqual(Buffer.from(extractImages(Buffer.concat([prefix,raw,Buffer.from('\r\n--b--\r\n')]))[0].bytes), raw);
});
test("quoted printable preserves high bytes and ignores soft line breaks", () => {
  const raw = Buffer.from('Content-Type: multipart/related; boundary="b"\r\n\r\n--b\r\nContent-Type: image/jpeg\r\nContent-Location: x\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n=FF=D8=\r\n=FF\r\n--b--\r\n');
  assert.deepEqual([...extractImages(raw)[0].bytes], [255,216,255]);
});
test("dedupe uses actual bytes and retains visibility from duplicate occurrences", async () => {
  const catalog = await buildCatalog([candidate, {...candidate, id: "p/2", index: 2, visible: true, src: "https://example.test/second.jpg", currentSrc: "https://example.test/second.jpg"}], [resource, {...resource, location: "https://example.test/second.jpg"}]);
  assert.equal(catalog.items.length, 1); assert.equal(catalog.duplicates, 1);
  assert.equal(catalog.items[0].visible, true);
  assert.deepEqual(catalog.items[0].occurrences, ["p/1", "p/2"]);
});
test("shared srcset aliases never substitute a different image's bytes", async () => {
  const candidates = [candidate, {...candidate, id: "p/2", index: 2, currentSrc: "https://example.test/retina.jpg"}];
  const catalog = await buildCatalog(candidates, [resource]);
  assert.equal(catalog.items[0].status, "unavailable");
  assert.equal(catalog.items[1].status, "unavailable");
});
test("a unique Chrome src alias can map currentSrc bytes", async () => {
  const catalog = await buildCatalog([{...candidate, currentSrc: "https://example.test/retina.jpg"}], [resource]);
  assert.equal(catalog.items[0].status, "ready");
});
test("ambiguous resource locations are shown as unavailable", async () => {
  const catalog = await buildCatalog([candidate], [resource, {...resource, bytes: image.slice()}]);
  assert.equal(catalog.items[0].status, "unavailable");
});
test("data URLs preserve binary percent bytes, base64 bytes and UTF-8 SVG", () => {
  assert.deepEqual([...dataImage("data:image/jpeg,%FF%D8%FF").bytes], [255,216,255]);
  assert.deepEqual([...dataImage("data:image/jpeg;base64,/9j/").bytes], [255,216,255]);
  assert.equal(new TextDecoder().decode(dataImage("data:image/svg+xml,<svg>测试</svg>").bytes), "<svg>测试</svg>");
  assert.throws(() => dataImage("data:image/jpeg,%XY"), /编码/);
});
test("HTML masquerading as an image is rejected", () => {
  assert.throws(() => validateImage({...resource, bytes: Buffer.from("<html>Access denied</html>")}), /格式不符/);
  assert.throws(() => extensionFor("text/html"), /格式/);
});
test("APNG and common JPEG MIME aliases preserve original bytes", () => {
  const png = Uint8Array.of(137,80,78,71,13,10,26,10);
  assert.doesNotThrow(() => validateImage({mime: "image/apng", bytes: png}));
  assert.equal(extensionFor("image/apng"), "png");
  assert.doesNotThrow(() => validateImage({...resource, mime: "image/pjpeg"}));
});
test("visible scope and size filters do not trigger new resource requests", () => {
  const list = [candidate, {...candidate, index: 2, visible: true}, {...candidate, index: 3, visible: true, width: 50}];
  assert.deepEqual(eligibleItems(list, "visible", 100).map((item) => item.index), [2]);
  assert.equal(eligibleItems(list).length, 3);
});
test("source changes invalidate capture, scrolling alone does not", () => {
  const initial = {url: "https://example.test/", documentId: "abc", images: [candidate]};
  assert.equal(sourceFingerprint(initial), sourceFingerprint({...initial, images: [{...candidate, visible: true}]}));
  assert.notEqual(sourceFingerprint(initial), sourceFingerprint({...initial, documentId: "def"}));
  assert.notEqual(sourceFingerprint(initial), sourceFingerprint({...initial, images: [{...candidate, currentSrc: "other"}]}));
});
test("Windows folder names remain one safe path segment", () => {
  assert.equal(safeName('CON.txt'), '_CON.txt');
  assert.equal(safeName('../a:b\\c/'), '.._a_b_c_');
  assert.equal(safeName('  ... '), '未命名页面');
  assert.equal([...safeName('图'.repeat(120))].length, 100);
  assert.equal(extensionFor("image/vnd.microsoft.icon"), "ico");
});

function fakeDirectory(initial = {}, failures = new Set(), corrupt = false) {
  const files = new Map(Object.entries(initial).map(([name, data]) => [name, Uint8Array.from(data)]));
  let aborted = 0;
  return {files, get aborted() {return aborted;}, async getFileHandle(name, options) {
    if (!files.has(name) && !options?.create) throw new DOMException("missing", "NotFoundError");
    if (!files.has(name)) files.set(name, new Uint8Array());
    return {async getFile() {return new Blob([files.get(name)]);}, async createWritable() {
      let data;
      return {async write(bytes) {if (failures.has(name)) throw new Error("磁盘写入失败"); data = bytes.slice();}, async close() {files.set(name, corrupt ? Uint8Array.of(1) : data);}, async abort() {aborted++;}};
    }};
  }};
}
async function savingItems() {
  return [1,3].map((index) => ({index, hash: null, extension: "jpg", resource}));
}
async function runSave(directory, extra = {}) {
  const items = await savingItems();
  for (const item of items) item.hash = await sha256(image);
  const job = {results: []};
  await saveBatch({directory, items, job, persist: async () => {}, progress: () => {}, ...extra});
  return job;
}
test("selected subset preserves original numbering and never overwrites an existing file", async () => {
  const directory = fakeDirectory({'001.jpg': [9,9]});
  const job = await runSave(directory);
  assert.equal(job.status, "complete");
  assert.deepEqual(job.results.map((result) => result.name), ["001 (1).jpg", "003.jpg"]);
  assert.deepEqual([...directory.files.get('001.jpg')], [9,9]);
  assert.equal(directory.files.has('002.jpg'), false);
});
test("one failed write is isolated, aborted and explicitly retryable", async () => {
  const directory = fakeDirectory({}, new Set(['001.jpg']));
  const job = await runSave(directory);
  assert.deepEqual(job.results.map((result) => result.status), ["failed", "saved"]);
  assert.equal(directory.aborted, 1); assert.equal(job.status, "partial");
});
test("post-write corruption is reported as failure", async () => {
  const job = await runSave(fakeDirectory({}, new Set(), true));
  assert.ok(job.results.every((result) => result.status === "failed" && /校验/.test(result.error)));
});
test("stop finishes the current file and preserves unsaved indices", async () => {
  let processed = false;
  const job = await runSave(fakeDirectory(), {progress: () => {processed = true;}, shouldStop: () => processed});
  assert.deepEqual(job.results.map((result) => result.status), ["saved", "cancelled"]);
  assert.equal(job.results[1].index, 3);
});
test("journal failure stops writing more files", async () => {
  const directory = fakeDirectory();
  let writes = 0;
  await assert.rejects(runSave(directory, {persist: async () => {if (++writes === 2) throw new Error("journal unavailable");}}), /journal/);
  assert.equal(directory.files.has('003.jpg'), false);
});
