// HTTP-only UI/fixture preview. It never loads an extension or accesses the user's Chrome profile.
import http from "node:http";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
const extension = path.resolve(fileURLToPath(new URL("../extension/", import.meta.url)));
const types = {".html":"text/html; charset=utf-8", ".mjs":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8"};
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    let bytes, suffix;
    if (url.pathname === "/preview-api.mjs") {bytes = await readFile(new URL("preview-api.mjs", import.meta.url)); suffix = ".mjs";}
    else if (url.pathname === "/scan-fixture.html") {bytes = await readFile(new URL("../tests/scan-fixture.html", import.meta.url)); suffix = ".html";}
    else if (url.pathname === "/responsive.html") {
      bytes = Buffer.from('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>侧边栏响应式测试 · 模拟 API</title><style>body{display:grid;place-items:center;margin:0;background:#f5f6f8}iframe{width:380px;height:640px;border:1px solid #ccc;max-width:100vw}</style><iframe src="/panel.html?failOnce=1" title="380×640 侧边栏测试"></iframe></html>'); suffix = ".html";
    }
    else {
      const pathname = url.pathname === "/" ? "/panel.html" : decodeURIComponent(url.pathname);
      const target = path.resolve(extension, `.${pathname}`);
      if (!target.startsWith(`${extension}${path.sep}`)) throw new Error("outside preview");
      bytes = await readFile(target); suffix = path.extname(target);
      if (pathname === "/panel.html") bytes = Buffer.from(bytes.toString().replace('<script type="module" src="panel.mjs"></script>', '<script type="module" src="preview-api.mjs"></script><style>body{max-width:380px;margin:auto;min-height:100vh;border-left:1px solid #dce2e8;border-right:1px solid #dce2e8}</style>'));
    }
    response.writeHead(200, {"Content-Type": types[suffix] || "application/octet-stream", "Cache-Control":"no-store"}); response.end(bytes);
  } catch {response.writeHead(404); response.end("Not found");}
});
server.listen(0, "127.0.0.1", () => console.log(`UI PREVIEW ONLY: http://127.0.0.1:${server.address().port}/`));
