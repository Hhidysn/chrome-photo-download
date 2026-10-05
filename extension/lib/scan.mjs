// Self-contained: Chrome serializes this function into the active page's isolated world.
export function scanLoadedImages() {
  // Keep IDs in this extension's isolated world; unrelated DOM insertions must
  // not renumber existing images. No attributes or page content are modified.
  const stateKey = Symbol.for("page-image-save:scan-identities");
  const identityState = globalThis[stateKey] ||= {ids: new WeakMap(), next: 0};
  function identity(element) {
    if (!identityState.ids.has(element)) identityState.ids.set(element, ++identityState.next);
    return identityState.ids.get(element);
  }
  const images = [];
  const warnings = [];
  let nodes = 0;
  let blockedFrames = 0;
  const intersect = (a, b) => ({left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom)});
  const positive = (rect) => rect.right > rect.left && rect.bottom > rect.top;
  const mainClip = {left: 0, top: 0, right: innerWidth, bottom: innerHeight};

  function bounds(element, offset) {
    const rect = element.getBoundingClientRect();
    return {left: rect.left + offset.x, right: rect.right + offset.x, top: rect.top + offset.y, bottom: rect.bottom + offset.y};
  }
  function visible(element, view, offset, clip) {
    let area = intersect(bounds(element, offset), clip);
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement || ancestor.getRootNode()?.host) {
      const style = view.getComputedStyle(ancestor);
      if (style.display === "none" || ["hidden", "collapse"].includes(style.visibility) || Number(style.opacity) === 0 || style.contentVisibility === "hidden") return false;
      if (ancestor !== element) {
        const rect = bounds(ancestor, offset);
        if (/hidden|scroll|auto|clip/.test(style.overflowX)) area = intersect(area, {left: rect.left, right: rect.right, top: -Infinity, bottom: Infinity});
        if (/hidden|scroll|auto|clip/.test(style.overflowY)) area = intersect(area, {top: rect.top, bottom: rect.bottom, left: -Infinity, right: Infinity});
      }
      if (!positive(area)) return false;
    }
    return positive(area);
  }
  function visit(root, view, offset, clip, prefix, depth = 0) {
    if (depth > 12) {warnings.push("嵌套层级超过扫描上限"); return;}
    const loaded = new Set(view.performance.getEntriesByType("resource").map((entry) => entry.name.split("#")[0]));
    for (const element of root.querySelectorAll("*")) {
      const id = `${prefix}/${identity(element)}`;
      if (++nodes > 30000 || images.length >= 5000) return;
      const style = view.getComputedStyle(element);
      const isVisible = visible(element, view, offset, clip);
      if (element.localName === "img" && element.complete && element.naturalWidth > 0 && element.naturalHeight > 0) {
        images.push({id, index: images.length + 1, kind: "img", src: element.src, currentSrc: element.currentSrc || element.src, width: element.naturalWidth, height: element.naturalHeight, visible: isVisible});
      }
      let background = 0;
      for (const match of style.backgroundImage.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/g)) {
        try {
          const url = new URL((match[1] || match[2] || match[3]).trim(), element.baseURI).href;
          if (!loaded.has(url.split("#")[0])) continue;
          const rect = element.getBoundingClientRect();
          images.push({id: `${id}:bg${background++}`, index: images.length + 1, kind: "background", src: url, currentSrc: url, width: Math.round(rect.width), height: Math.round(rect.height), visible: isVisible});
        } catch { /* A malformed CSS URL does not block ordinary images. */ }
      }
      if (element.shadowRoot) visit(element.shadowRoot, view, offset, clip, `${id}:shadow`, depth + 1);
      if (element.localName === "iframe" || element.localName === "frame") {
        try {
          const child = element.contentDocument;
          if (!child) {blockedFrames++; continue;}
          const rect = bounds(element, offset);
          const childClip = isVisible ? intersect(clip, rect) : {left: 0, right: 0, top: 0, bottom: 0};
          visit(child, child.defaultView, {x: rect.left + element.clientLeft, y: rect.top + element.clientTop}, childClip, `${id}:frame`, depth + 1);
        } catch {blockedFrames++;}
      }
    }
  }
  visit(document, window, {x: 0, y: 0}, mainClip, "page");
  if (blockedFrames) warnings.push(`${blockedFrames} 个跨域或不可访问的框架未扫描`);
  if (nodes > 30000 || images.length >= 5000) warnings.push("页面超过 30000 个元素 / 5000 张图片的扫描上限，清单可能不完整");
  return {url: location.href, title: document.title, images, warnings: [...new Set(warnings)]};
}
