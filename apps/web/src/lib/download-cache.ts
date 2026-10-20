const DATABASE = 'studydocs-downloads';
const STORE = 'chunks';

function open():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request = indexedDB.open(DATABASE,1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cachedChunk(key:string):Promise<Blob|undefined> {
  const db = await open();
  try { return await new Promise((resolve,reject)=>{
    const request = db.transaction(STORE,'readonly').objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result as Blob|undefined);
    request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
export async function saveChunk(key:string,blob:Blob):Promise<void> {
  const db = await open();
  try { await new Promise<void>((resolve,reject)=>{
    const request = db.transaction(STORE,'readwrite').objectStore(STORE).put(blob,key);
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  }); } finally { db.close(); }
}
export async function clearChunks(prefix:string,count:number):Promise<void> {
  const db = await open();
  try { await new Promise<void>((resolve,reject)=>{
    const store = db.transaction(STORE,'readwrite').objectStore(STORE);
    let remaining = count;
    if (!remaining) { resolve(); return; }
    for (let i=0;i<count;i++) {
      const request = store.delete(`${prefix}:${i}`);
      request.onsuccess = () => { if (!--remaining) resolve(); };
      request.onerror = () => reject(request.error);
    }
  }); } finally { db.close(); }
}
