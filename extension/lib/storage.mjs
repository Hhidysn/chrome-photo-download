const databaseName = "page-image-save";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function stateValue(key, value) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("state", value === undefined ? "readonly" : "readwrite");
      const store = transaction.objectStore("state");
      const request = value === undefined ? store.get(key) : store.put(value, key);
      let result;
      request.onsuccess = () => {result = request.result;};
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("本地记录保存已取消"));
    });
  } finally {db.close();}
}
