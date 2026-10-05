// Synthetic HTTP preview adapters; never part of the extension package.
const listeners = () => {const events = []; return {addListener(callback) {events.push(callback);}, fire(...args) {events.forEach((callback) => callback(...args));}};};
const storageEvents = listeners();
const sourceUrl = `${location.origin}/example-page`;
const colors = ["#8aa9ab", "#bbab95", "#d3bba3", "#869d9c", "#bfb49e", "#7c979a"];
const resources = colors.map((color, index) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="${color}"/><circle cx="610" cy="145" r="64" fill="#ffffff66"/><path d="M0 600V440L210 180 490 520 650 330 800 500V600Z" fill="#203c4566"/><text x="40" y="78" font-size="36" font-family="sans-serif" fill="white">PAGE ${String(index+1).padStart(2,"0")}</text></svg>`;
  return {location: `${location.origin}/image-${index+1}.svg`, mime: "image/svg+xml", data: svg};
});
const candidates = resources.map((resource, i) => ({id: `page/${i}`, index: i+1, kind:"img", src:resource.location, currentSrc:resource.location, width:800, height:600, visible:i<2}));
candidates.push({...candidates[0], id:"page/duplicate", index:7, visible:true});
candidates.push({...candidates[0], id:"page/missing", index:8, src:`${location.origin}/missing.jpg`, currentSrc:`${location.origin}/missing.jpg`, visible:false});
const dataUrl = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#8f9ab4"/><circle cx="200" cy="200" r="120" fill="#ecece7"/></svg>')}`;
candidates.push({id:"page/data", index:9, kind:"img", src:dataUrl, currentSrc:dataUrl, width:400, height:400, visible:true});
const storage = {session:{"source:1":{tabId:101, windowId:1, requestId:"preview-first", mode:"select"}}, local:{}};
function area(kind) {return {async get(key) {return key ? {[key]:storage[kind][key]} : {...storage[kind]};}, async set(values) {const changes = {}; for (const [key, value] of Object.entries(values)) {changes[key]={oldValue:storage[kind][key],newValue:value};storage[kind][key]=value;} storageEvents.fire(changes,kind);}};}
window.chrome = {
  windows:{async getCurrent() {return {id:1};}},
  tabs:{async get(id) {return {id,url:sourceUrl};},async query() {return [{id:101,url:sourceUrl}];},onActivated:listeners(),onUpdated:listeners(),onRemoved:listeners()},
  scripting:{async executeScript() {return [{documentId:"preview-doc", result:{url:sourceUrl,title:"周末旅行 / 图片集：2026",images:structuredClone(candidates),warnings:[]}}];}},
  pageCapture:{async saveAsMHTML() {
    return new Blob([`Content-Type: multipart/related; boundary="preview"\r\n\r\n${resources.map((resource) => `--preview\r\nContent-Type: ${resource.mime}\r\nContent-Location: ${resource.location}\r\nContent-Transfer-Encoding: base64\r\n\r\n${btoa(resource.data)}\r\n`).join("")}--preview--\r\n`]);
  }},
  storage:{local:area("local"),session:area("session"),onChanged:storageEvents}
};

const records = new Map();
Object.defineProperty(window,"indexedDB",{value:{open() {
  const request={result:{close(){},transaction() {
    const tx={objectStore(){return {get(key){return operation(()=>records.get(key));},put(value,key){return operation(()=>{records.set(key,value);return key;});}};}};
    function operation(callback){const req={};setTimeout(()=>{req.result=callback();req.onsuccess?.();setTimeout(()=>tx.oncomplete?.(),0);},0);return req;}
    return tx;
  }}};setTimeout(()=>request.onsuccess?.(),0);return request;
}}});
let failOnce = new URL(location.href).searchParams.get("failOnce") === "1";
function directory(name) {
  const files = new Map(), folders = new Map();
  return {name,async queryPermission(){return "granted";},async requestPermission(){return "granted";},async getDirectoryHandle(child){if(!folders.has(child))folders.set(child,directory(child));return folders.get(child);},async getFileHandle(filename,options) {
    if(!files.has(filename)&&!options?.create)throw new DOMException("Missing","NotFoundError");
    if(!files.has(filename))files.set(filename,new Uint8Array());
    return {async getFile(){return new Blob([files.get(filename)]);},async createWritable(){let value;return {async write(bytes){if(failOnce){failOnce=false;throw new Error("测试磁盘写入失败");}value=bytes.slice();},async close(){files.set(filename,value);},async abort(){}};}};
  }};
}
const output = directory("图片收藏");
window.showDirectoryPicker = async () => output;
await import("/panel.mjs");
