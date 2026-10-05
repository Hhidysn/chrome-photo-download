import {extractImages, safeName} from "./lib/mhtml.mjs";
import {buildCatalog, eligibleItems, sourceFingerprint} from "./lib/catalog.mjs";
import {scanLoadedImages} from "./lib/scan.mjs";
import {saveBatch} from "./lib/files.mjs";
import {stateValue} from "./lib/storage.mjs";

const $ = (id) => document.getElementById(id);
let windowId, sourceKey, sourceRequest, source, pendingSource;
let items = [], selected = new Set(), previewUrls = [], directoryHandle, permission = "prompt";
let phase = "initializing", stopRequested = false, lastAnchor, lastSave, previousJob;
let sourceChanged = false;
let report = {version: "1.0.0", build: "20261005.2", capture: null, save: null};

const scopeItems = () => eligibleItems(items, $("scope").value, Number($("minimum").value));
const scopeReady = () => scopeItems().filter((item) => item.status === "ready");
const picked = () => scopeReady().filter((item) => selected.has(item.index));
function status(text) {$("status").textContent = text;}
function message(error) {
  if (error.name === "AbortError") return "已取消选择目录，图片尚未保存";
  if (error.name === "NotAllowedError") return "目录没有写入授权，请重新授权或更换目录";
  if (error.name === "SecurityError") return "浏览器阻止了目录授权，请直接点击“选择目录”后重试";
  return error.message || String(error);
}
function cleanPreviews() {previewUrls.forEach((url) => URL.revokeObjectURL(url)); previewUrls = [];}

function controls() {
  const busy = Boolean(phase);
  for (const id of ["choose-directory", "regrant", "use-subfolder", "folder-name", "scope", "minimum", "select-all", "invert", "clear"]) $(id).disabled = busy;
  $("folder-name").disabled ||= !$("use-subfolder").checked;
  $("refresh").disabled = busy || !sourceRequest;
  $("refresh-visible").hidden = $("scope").value !== "visible";
  $("refresh-visible").disabled = busy || !source;
  $("download-selected").disabled = busy || picked().length === 0;
  $("download-all").disabled = busy || scopeReady().length === 0;
  $("download-selected").textContent = `下载所选 · ${picked().length}`;
  $("download-all").textContent = `一键下载全部 · ${scopeReady().length}`;
  $("selection-count").textContent = `已选 ${picked().length} 张`;
  for (const checkbox of document.querySelectorAll(".card input")) checkbox.disabled = busy;
  const failures = lastSave?.job.results.filter((result) => result.status !== "saved").length || 0;
  $("retry").hidden = failures === 0;
  $("retry").disabled = busy;
  $("retry").textContent = `重试未成功项 · ${failures}`;
  $("stop").hidden = phase !== "saving";
  $("stop").disabled = stopRequested;
  $("permission-tag").textContent = directoryHandle ? (permission === "granted" ? "已授权" : "待授权") : "首次选择";
  $("directory-name").textContent = directoryHandle?.name || "尚未选择目录";
  $("choose-directory").textContent = directoryHandle ? "更换目录" : "选择目录";
  $("regrant").hidden = !directoryHandle || permission === "granted";
  updateDestination();
}
function updateDestination() {
  const root = directoryHandle?.name || "所选目录";
  $("destination-preview").textContent = $("use-subfolder").checked ? `${root} / ${safeName($("folder-name").value)}` : `${root} / 直接保存`;
}
async function preference() {
  await chrome.storage.local.set({preferences: {scope: $("scope").value, minimum: $("minimum").value, subfolder: $("use-subfolder").checked}});
}

function renderGallery() {
  const fragment = document.createDocumentFragment();
  const filtered = scopeItems();
  for (const item of filtered) {
    const card = document.createElement("label");
    card.className = "card";
    card.dataset.index = item.index;
    const thumb = document.createElement("div");
    thumb.className = "thumb";
    const number = document.createElement("span");
    number.className = "number";
    number.textContent = String(item.index).padStart(3, "0");
    thumb.append(number);
    if (item.status === "ready") {
      if (!item.previewUrl) {
        item.previewUrl = URL.createObjectURL(new Blob([item.resource.bytes], {type: item.resource.mime}));
        previewUrls.push(item.previewUrl);
      }
      const image = document.createElement("img");
      image.src = item.previewUrl;
      image.alt = `图片 ${item.index} 的缩略图`;
      image.loading = "lazy";
      image.addEventListener("error", () => {
        image.hidden = true;
        const caption = document.createElement("span");
        caption.className = "card-error";
        caption.textContent = "预览不可用，仍可保存原文件";
        thumb.append(caption);
      }, {once: true});
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = selected.has(item.index);
      input.setAttribute("aria-label", `选择图片 ${item.index}`);
      input.addEventListener("click", (event) => {
        const checked = input.checked;
        const ready = scopeReady();
        const anchor = ready.findIndex((entry) => entry.index === lastAnchor);
        const position = ready.indexOf(item);
        const targets = event.shiftKey && anchor !== -1 ? ready.slice(Math.min(anchor, position), Math.max(anchor, position) + 1) : [item];
        for (const target of targets) checked ? selected.add(target.index) : selected.delete(target.index);
        lastAnchor = item.index;
        syncSelection();
      });
      thumb.append(image, input);
    } else {
      card.dataset.unavailable = "true";
      const error = document.createElement("span");
      error.className = "card-error";
      error.textContent = item.error;
      thumb.append(error);
    }
    const info = document.createElement("div");
    info.className = "card-info";
    const dimensions = document.createElement("div");
    dimensions.textContent = `${item.width} × ${item.height}${item.kind === "background" ? " · 背景" : ""}`;
    const format = document.createElement("p");
    format.textContent = item.resource ? `${item.extension.toUpperCase()} · ${Math.max(1, Math.round(item.resource.bytes.length / 1024))} KB` : "可刷新图片重新提取";
    const outcome = document.createElement("div");
    outcome.className = "save-tag";
    outcome.dataset.outcome = item.index;
    info.append(dimensions, format, outcome);
    card.append(thumb, info);
    fragment.append(card);
  }
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = source ? "这个范围内没有已加载图片。可调整范围或滚动网页后刷新。" : "在想保存的网页上点击工具栏里的扩展图标";
    fragment.append(empty);
  }
  $("gallery").replaceChildren(fragment);
  $("total-count").textContent = items.length;
  syncSelection();
}
function syncSelection() {
  for (const card of document.querySelectorAll(".card")) {
    const input = card.querySelector("input");
    if (input) input.checked = selected.has(Number(card.dataset.index));
  }
  controls();
}

async function collect() {
  const tab = await chrome.tabs.get(sourceRequest.tabId);
  if (!/^https?:\/\//.test(tab.url || "")) throw new Error("此页面无法读取图片，请在普通网页上点击扩展图标");
  const [result] = await chrome.scripting.executeScript({target: {tabId: sourceRequest.tabId}, func: scanLoadedImages});
  if (!result?.result) throw new Error("无法读取来源页面，请在网页上重新点击扩展图标");
  if (result.result.url !== tab.url) throw new Error("来源页面正在跳转，请稍后重新读取");
  return {...result.result, documentId: result.documentId, tabId: tab.id};
}

async function capture() {
  cleanPreviews();
  items = []; selected.clear(); lastAnchor = undefined; lastSave = undefined;
  report.capture = null; report.save = null; report.source = undefined;
  renderGallery();
  status("正在读取当前网页已加载的图片…");
  const before = await collect();
  source = before;
  sourceChanged = false;
  report.source = {tabId: before.tabId, documentId: before.documentId, title: before.title, url: before.url};
  $("source-title").textContent = before.title || "未命名页面";
  $("source-host").textContent = new URL(before.url).hostname;
  $("folder-name").value = safeName(before.title);
  controls();
  const snapshot = await chrome.pageCapture.saveAsMHTML({tabId: sourceRequest.tabId});
  if (!snapshot) throw new Error("Chrome 未返回图片快照，请刷新图片重试");
  if (snapshot.size > 150 * 1024 * 1024) throw new Error("页面快照超过 150 MiB，请减少已加载内容后重试");
  const after = await collect();
  if (sourceFingerprint(before) !== sourceFingerprint(after)) throw new Error("读取期间页面或图片发生变化，请刷新图片重试");
  const catalog = await buildCatalog(before.images, extractImages(await snapshot.arrayBuffer()));
  items = catalog.items;
  // Visibility comes from the latest scan; duplicates inherit all occurrences.
  const visible = new Set(after.images.filter((item) => item.visible).map((item) => item.id));
  items.forEach((item) => {item.visible = item.occurrences.some((id) => visible.has(id));});
  report.source = {tabId: before.tabId, documentId: before.documentId, title: before.title, url: before.url};
  report.capture = {sourceCount: before.images.length, readyCount: items.filter((item) => item.status === "ready").length, unavailableCount: items.filter((item) => item.status !== "ready").length, duplicateCount: catalog.duplicates, snapshotBytes: snapshot.size, warnings: after.warnings, images: items.map(({index, status, width, height, hash, resource, error}) => ({index, status, width, height, sha256: hash, mime: resource?.mime, bytes: resource?.bytes.length, error}))};
  $("duplicate-count").textContent = catalog.duplicates ? `去重 ${catalog.duplicates} 张` : "";
  $("scan-notes").textContent = [...after.warnings, report.capture.unavailableCount ? `${report.capture.unavailableCount} 张未能提取，可刷新重试` : "", $("scope").value === "visible" ? "可见范围按读取时的网页视口计算" : ""].filter(Boolean).join("；");
  renderGallery();
  status(`已读取 ${report.capture.readyCount} 张可保存图片${report.capture.unavailableCount ? `，${report.capture.unavailableCount} 张未能提取` : ""}`);
  await sourceNotice();
}

async function refreshVisibility() {
  if (!source) return;
  const latest = await collect();
  if (sourceFingerprint(source) !== sourceFingerprint(latest)) throw new Error("网页内容已变化，请点击“刷新图片”后再选择可见范围");
  const visible = new Set(latest.images.filter((image) => image.visible).map((image) => image.id));
  items.forEach((item) => {item.visible = item.occurrences.some((id) => visible.has(id));});
}

async function rememberHandle(handle) {
  directoryHandle = handle;
  permission = "granted";
  await stateValue("directory", handle);
  controls();
  return handle;
}
// Invoke this directly from the button handler, before asynchronous capture or DB calls.
function authorizeDirectory() {
  if (!directoryHandle) return window.showDirectoryPicker({mode: "readwrite", id: "page-image-save"}).then(rememberHandle);
  const handle = directoryHandle;
  return handle.requestPermission({mode: "readwrite"}).then((state) => {
    permission = state;
    controls();
    if (state !== "granted") throw new DOMException("目录没有写入授权", "NotAllowedError");
    return handle;
  });
}

async function performSave(chosen, handle, folder) {
  const frozen = chosen.slice();
  const target = folder ? await handle.getDirectoryHandle(folder, {create: true}) : handle;
  const job = {id: crypto.randomUUID(), source: {...report.source}, directory: handle.name, subfolder: folder || null, requestedCount: frozen.length, requested: frozen.map(({index, hash}) => ({index, hash})), results: [], startedAt: new Date().toISOString()};
  lastSave = {job, target, root: handle, folder, items: frozen};
  report.save = job;
  $("progress").hidden = false;
  $("progress").max = frozen.length;
  $("progress").value = 0;
  status("正在保存图片，请保持侧边栏打开…");
  function progress(current) {
    $("progress").value = current.results.length;
    const success = current.results.filter((result) => result.status === "saved").length;
    status(`已处理 ${current.results.length}/${frozen.length} 张，成功 ${success} 张`);
    for (const result of current.results) {
      const label = document.querySelector(`[data-outcome="${result.index}"]`);
      if (label) label.textContent = result.status === "saved" ? `已保存 · ${result.name}` : result.error;
    }
  }
  await navigator.locks.request("page-image-save-writes", async () => {
    try {
      await saveBatch({directory: target, items: frozen, job, persist: async (value) => {
        await stateValue(`job:${windowId}`, value);
        await stateValue("last-job", value);
      }, progress, shouldStop: () => stopRequested});
    } catch (error) {
      for (const item of frozen.slice(job.results.length)) job.results.push({index: item.index, hash: item.hash, status: "cancelled", error: `记录失败，已停止后续写入：${message(error)}`});
      job.status = "interrupted";
      progress(job);
      throw error;
    }
  });
  const success = job.results.filter((result) => result.status === "saved").length;
  status(`保存完成：${success}/${frozen.length} 张通过字节校验${success !== frozen.length ? "，未成功项可以重试" : ""}`);
  $("previous-job").hidden = true;
}

function beginSave(chosen, {automatic = false, retry = false} = {}) {
  if (phase || !chosen.length) return;
  const frozen = chosen.slice();
  // Each new save/retry uses the destination currently shown in the UI.
  // The root and folder are then frozen for that batch.
  const folder = $("use-subfolder").checked ? safeName($("folder-name").value) : null;
  const root = directoryHandle;
  phase = "saving"; stopRequested = false; controls();
  let authorization;
  try {
    if (automatic) authorization = root.queryPermission({mode: "readwrite"}).then((state) => {
      permission = state;
      if (state !== "granted") throw new Error("快捷下载需要目录授权，请在侧边栏点击下载按钮");
      return root;
    });
    else authorization = authorizeDirectory();
  } catch (error) {authorization = Promise.reject(error);}
  report.lastError = undefined;
  authorization.then((handle) => performSave(frozen, handle, folder)).catch((error) => {
    report.lastError = {phase: "saving", error: message(error)}; status(message(error));
  }).finally(finishOperation);
}

async function finishOperation() {
  phase = "";
  controls();
  if (pendingSource) {
    const request = pendingSource;
    pendingSource = undefined;
    await acceptSource(request);
  }
}
async function operation(name, callback) {
  if (phase) return;
  phase = name; controls();
  report.lastError = undefined;
  try {await callback();}
  catch (error) {
    report.lastError = {phase: name, error: message(error)};
    if (name === "capture") report.capture = {status: "failed", error: message(error)};
    status(message(error));
  }
  finally {await finishOperation();}
}

async function acceptSource(request) {
  if (!request || request.windowId !== windowId || request.requestId === sourceRequest?.requestId) return;
  if (phase) {pendingSource = request; return;}
  sourceRequest = request;
  source = undefined;
  $("source-title").textContent = "正在读取当前网页…";
  $("source-host").textContent = "当前网页 · 已加载图片";
  $("source-warning").hidden = true;
  await operation("capture", capture);
  if (request !== sourceRequest || request.mode !== "all" || !scopeReady().length) return;
  // Do not replay an automatic download when the panel is reopened or refreshed.
  const key = `consumed:${windowId}`;
  const previous = await chrome.storage.session.get(key);
  if (previous[key] === request.requestId) return;
  await chrome.storage.session.set({[key]: request.requestId});
  if (!directoryHandle || await directoryHandle.queryPermission({mode: "readwrite"}) !== "granted") {
    status("图片已准备好。请点击“一键下载全部”选择目录或授权；以后快捷键可直接保存。");
    return;
  }
  beginSave(scopeReady(), {automatic: true});
}

async function sourceNotice() {
  if (!source) return;
  const capturedSource = source;
  const [active] = await chrome.tabs.query({active: true, windowId});
  const original = await chrome.tabs.get(capturedSource.tabId).catch(() => null);
  if (source !== capturedSource) return;
  const notice = !original ? "来源标签页已关闭；仍可保存已读取的图片" : (sourceChanged || (original.url && original.url !== capturedSource.url)) ? "来源页面已变化；当前列表仍是之前读取的图片" : active?.id !== capturedSource.tabId ? "已固定来源页面，当前仍会保存这里显示的图片" : "";
  $("source-warning").textContent = notice;
  $("source-warning").hidden = !notice;
}

$("choose-directory").addEventListener("click", () => {
  if (phase) return;
  // Start picker in the original click, not after operation() awaits anything.
  let promise;
  try {promise = window.showDirectoryPicker({mode: "readwrite", id: "page-image-save"});}
  catch (error) {status(message(error)); return;}
  operation("directory", async () => {await rememberHandle(await promise); status("目录已记住，之后可复用");});
});
$("regrant").addEventListener("click", () => {
  if (phase) return;
  const promise = authorizeDirectory();
  operation("directory", async () => {await promise; status("目录写入授权已确认");});
});
$("refresh").addEventListener("click", () => operation("capture", capture));
$("refresh-visible").addEventListener("click", () => operation("filter", async () => {
  await refreshVisibility(); renderGallery(); status("已按当前网页屏幕更新可见范围");
}));
$("scope").addEventListener("change", () => operation("filter", async () => {
  if ($("scope").value === "visible") {
    try {await refreshVisibility();}
    catch (error) {$("scope").value = "all"; renderGallery(); throw error;}
  }
  renderGallery(); await preference(); status("已更新范围；下载全部仅保存当前范围内图片");
}));
$("minimum").addEventListener("change", () => {renderGallery(); preference().catch((error) => status(message(error)));});
$("use-subfolder").addEventListener("change", () => {controls(); preference().catch((error) => status(message(error)));});
$("folder-name").addEventListener("input", updateDestination);
for (const [id, mode] of [["select-all", "all"], ["invert", "invert"], ["clear", "clear"]]) $(id).addEventListener("click", () => {
  for (const item of scopeReady()) {
    if (mode === "all" || (mode === "invert" && !selected.has(item.index))) selected.add(item.index);
    else selected.delete(item.index);
  }
  syncSelection();
});
$("gallery").addEventListener("keydown", (event) => {
  if (phase) return;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {event.preventDefault(); $("select-all").click();}
});
$("download-selected").addEventListener("click", () => beginSave(picked()));
$("download-all").addEventListener("click", () => beginSave(scopeReady()));
$("retry").addEventListener("click", () => {
  const failures = new Set(lastSave.job.results.filter((result) => result.status !== "saved").map((result) => result.index));
  beginSave(lastSave.items.filter((item) => failures.has(item.index)), {retry: true});
});
$("stop").addEventListener("click", () => {stopRequested = true; controls(); status("将完成当前文件，然后停止后续保存");});
$("export-report").addEventListener("click", () => {
  const data = {...report, previousJob, exportedAt: new Date().toISOString()};
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: "application/json"}));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = "page-image-save-report.json"; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
});
chrome.tabs.onActivated.addListener(() => sourceNotice().catch(() => {}));
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (source && tabId === source.tabId && (change.status === "loading" || (change.url && change.url !== source.url))) sourceChanged = true;
  sourceNotice().catch(() => {});
});
chrome.tabs.onRemoved.addListener(() => sourceNotice().catch(() => {}));
window.addEventListener("beforeunload", (event) => {
  if (phase === "saving") {event.preventDefault(); event.returnValue = "";}
});
window.addEventListener("pagehide", cleanPreviews);

async function initialize() {
  const current = await chrome.windows.getCurrent();
  windowId = current.id; sourceKey = `source:${windowId}`;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "session" && changes[sourceKey]?.newValue) acceptSource(changes[sourceKey].newValue).catch((error) => status(message(error)));
  });
  directoryHandle = await stateValue("directory");
  if (directoryHandle) permission = await directoryHandle.queryPermission({mode: "readwrite"});
  const {preferences = {}} = await chrome.storage.local.get("preferences");
  if (["all", "visible"].includes(preferences.scope)) $("scope").value = preferences.scope;
  if (["0", "100", "300", "600"].includes(preferences.minimum)) $("minimum").value = preferences.minimum;
  $("use-subfolder").checked = preferences.subfolder !== false;
  previousJob = await stateValue(`job:${windowId}`) || await stateValue("last-job");
  if (previousJob && ["running", "interrupted"].includes(previousJob.status)) {
    $("previous-job").hidden = false;
    $("previous-job").textContent = `上次保存可能中断，已记录 ${previousJob.results.filter((result) => result.status === "saved").length} 张成功。可导出报告查看；重新读取后手动选择未完成图片。`;
  }
  phase = ""; controls();
  const stored = await chrome.storage.session.get(sourceKey);
  const request = pendingSource || stored[sourceKey]; pendingSource = undefined;
  if (request) await acceptSource(request);
}
initialize().catch((error) => {phase = ""; status(message(error)); controls();});
