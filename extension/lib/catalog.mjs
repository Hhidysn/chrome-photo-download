import {matchResource, extensionFor} from "./mhtml.mjs";

export async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function dataImage(url) {
  const match = /^data:([^,]*),([\s\S]*)$/i.exec(url);
  if (!match) return null;
  const meta = match[1].split(";");
  const mime = meta[0].toLowerCase();
  extensionFor(mime);
  let bytes;
  if (meta.some((part) => part.toLowerCase() === "base64")) {
    bytes = Uint8Array.from(atob(match[2].replace(/\s/g, "")), (char) => char.charCodeAt(0));
  } else {
    const output = [];
    const encoder = new TextEncoder();
    for (let i = 0; i < match[2].length;) {
      if (match[2][i] === "%") {
        const hex = match[2].slice(i + 1, i + 3);
        if (!/^[a-f\d]{2}$/i.test(hex)) throw new Error("内嵌图片的编码无效");
        output.push(parseInt(hex, 16));
        i += 3;
      } else {
        const character = String.fromCodePoint(match[2].codePointAt(i));
        output.push(...encoder.encode(character));
        i += character.length;
      }
    }
    bytes = Uint8Array.from(output);
  }
  return {location: url, mime, bytes};
}

export function validateImage(resource) {
  const {bytes, mime} = resource;
  const ascii = (start, count) => String.fromCharCode(...bytes.subarray(start, start + count));
  const magic = {
    "image/jpeg": () => bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255,
    "image/png": () => [137,80,78,71,13,10,26,10].every((byte, i) => bytes[i] === byte),
    "image/gif": () => ["GIF87a", "GIF89a"].includes(ascii(0, 6)),
    "image/webp": () => ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP",
    "image/avif": () => ascii(4, 4) === "ftyp" && /avif|avis/.test(ascii(8, 72)),
    "image/bmp": () => ascii(0, 2) === "BM",
    "image/x-icon": () => bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0,
    "image/vnd.microsoft.icon": () => bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0,
    "image/svg+xml": () => /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE[\s\S]*?>\s*)?<svg(?:\s|>)/i.test(new TextDecoder().decode(bytes.subarray(0, 8192)).replace(/^\uFEFF/, ""))
  };
  extensionFor(mime);
  const canonical = {"image/jpg": "image/jpeg", "image/pjpeg": "image/jpeg", "image/apng": "image/png"}[mime] || mime;
  if (!bytes.length || !magic[canonical]?.()) throw new Error("资源内容与图片格式不符，未保存");
}

function keyFor(url) {
  // Fragments do not select different cached bytes. Keep data URLs literal.
  return url?.startsWith("data:") ? url : String(url || "").split("#")[0];
}

export async function buildCatalog(candidates, resources) {
  const normalized = resources.map((resource) => ({...resource, location: keyFor(resource.location)}));
  const locations = new Map();
  for (const resource of normalized) {
    if (!locations.has(resource.location)) locations.set(resource.location, []);
    locations.get(resource.location).push(resource);
  }
  const aliases = new Map();
  for (const candidate of candidates) {
    const src = keyFor(candidate.src);
    if (!aliases.has(src)) aliases.set(src, new Set());
    aliases.get(src).add(keyFor(candidate.currentSrc || candidate.src));
  }
  const hashes = new Map();
  const seen = new Map();
  const items = [];
  let duplicates = 0;
  for (const candidate of candidates) {
    try {
      const current = keyFor(candidate.currentSrc || candidate.src);
      const src = keyFor(candidate.src);
      if (!current.startsWith("data:") && aliases.get(current)?.size > 1) throw new Error("响应式图片地址别名存在冲突，无法确认原字节");
      const fallback = aliases.get(src)?.size === 1 ? src : "";
      const relevant = [...new Set([...(locations.get(current) || []), ...(locations.get(fallback) || [])])];
      const resource = current.startsWith("data:") ? dataImage(current) : matchResource({
        currentSrc: current,
        // A shared src fallback may point at multiple different srcset images.
        src: fallback
      }, relevant);
      if (!resource) throw new Error("快照中没有这张图片的可用字节");
      validateImage(resource);
      if (!hashes.has(resource.bytes)) hashes.set(resource.bytes, await sha256(resource.bytes));
      const hash = hashes.get(resource.bytes);
      if (seen.has(hash)) {
        const existing = seen.get(hash);
        existing.occurrences.push(candidate.id);
        existing.visible ||= candidate.visible;
        duplicates++;
        continue;
      }
      const item = {...candidate, status: "ready", resource, hash, extension: extensionFor(resource.mime), occurrences: [candidate.id]};
      seen.set(hash, item);
      items.push(item);
    } catch (error) {
      items.push({...candidate, status: "unavailable", error: error.message, occurrences: [candidate.id]});
    }
  }
  return {items, duplicates};
}

export function eligibleItems(items, scope = "all", minimum = 0) {
  return items.filter((item) => (scope !== "visible" || item.visible) && Math.min(item.width, item.height) >= minimum);
}

export function sourceFingerprint(source) {
  return JSON.stringify({url: source.url, documentId: source.documentId, images: source.images.map(({id, src, currentSrc, width, height}) => ({id, src, currentSrc, width, height}))});
}
