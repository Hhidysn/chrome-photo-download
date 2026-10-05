import {readFile, readdir, access} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";
const root = new URL("../extension/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ["activeTab", "scripting", "pageCapture", "sidePanel", "storage"]);
assert.equal(manifest.host_permissions, undefined);
assert.equal(manifest.action.default_popup, undefined);
assert.ok(manifest.content_security_policy.extension_pages.includes("connect-src 'none'"));
for (const path of [manifest.background.service_worker, manifest.side_panel.default_path, ...Object.values(manifest.icons)]) await access(new URL(path, root));
const html = await readFile(new URL("panel.html", root), "utf8");
const panel = await readFile(new URL("panel.mjs", root), "utf8");
for (const match of panel.matchAll(/\$\("([^"\n]+)"\)/g)) assert.ok(html.includes(`id="${match[1]}"`), `Missing element ${match[1]}`);
let count = 0;
async function check(directory) {
  for (const item of await readdir(directory, {withFileTypes: true})) {
    const path = new URL(item.name, directory);
    if (item.isDirectory()) await check(new URL(`${item.name}/`, directory));
    else if (/\.(js|mjs)$/.test(item.name)) {
      const result = spawnSync(process.execPath, ["--check", fileURLToPath(path)], {encoding: "utf8"});
      assert.equal(result.status, 0, result.stderr); count++;
    }
  }
}
await check(root);
console.log(`PASS manifest, permissions, entrypoints, UI element references and ${count} script syntax checks`);
