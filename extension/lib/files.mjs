import {sha256} from "./catalog.mjs";

export async function uniqueFile(directory, stem, extension) {
  for (let suffix = 0; suffix < 10000; suffix++) {
    const name = `${stem}${suffix ? ` (${suffix})` : ""}.${extension}`;
    try {await directory.getFileHandle(name);}
    catch (error) {
      if (error.name === "TypeMismatchError") continue; // A directory has this name.
      if (error.name !== "NotFoundError") throw error;
      const handle = await directory.getFileHandle(name, {create: true});
      if ((await handle.getFile()).size !== 0) throw new Error("同名文件在保存前发生变化，请重试");
      return {name, handle};
    }
  }
  throw new Error("同名文件过多，请更换目录");
}

export async function saveBatch({directory, items, job, persist, progress, shouldStop = () => false}) {
  job.status = "running";
  await persist(job);
  for (const item of items) {
    if (shouldStop()) break;
    let writable;
    let name;
    try {
      const file = await uniqueFile(directory, String(item.index).padStart(3, "0"), item.extension);
      name = file.name;
      writable = await file.handle.createWritable();
      await writable.write(item.resource.bytes);
      await writable.close();
      writable = null;
      const saved = await file.handle.getFile();
      const hash = await sha256(await saved.arrayBuffer());
      if (hash !== item.hash) throw new Error("落盘字节校验不一致");
      job.results.push({index: item.index, hash: item.hash, name, bytes: saved.size, status: "saved"});
    } catch (error) {
      if (writable) await writable.abort().catch(() => {});
      job.results.push({index: item.index, hash: item.hash, name, status: "failed", error: error.message || String(error)});
    }
    // Persist after each file. A journal failure stops further writes.
    await persist(job);
    progress(job);
  }
  for (const item of items.slice(job.results.length)) job.results.push({index: item.index, hash: item.hash, status: "cancelled", error: "已停止，尚未保存"});
  job.status = job.results.some((result) => result.status !== "saved") ? "partial" : "complete";
  await persist(job);
  progress(job);
  return job;
}
