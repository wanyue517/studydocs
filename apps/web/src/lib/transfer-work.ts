let worker: Worker | null = null;
let serial = 0;
const pending = new Map<number,{resolve:(result:never)=>void;reject:(error:Error)=>void}>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./transfer.worker.ts',import.meta.url),{type:'module'});
    worker.onmessage = (event:MessageEvent<{id:number;result?:unknown;error?:string}>) => {
      const task = pending.get(event.data.id);
      if (!task) return;
      pending.delete(event.data.id);
      if (event.data.error) task.reject(new Error(event.data.error));
      else task.resolve(event.data.result as never);
    };
    worker.onerror = () => {
      for (const task of pending.values()) task.reject(new Error('文件处理线程异常'));
      pending.clear();
      worker?.terminate(); worker = null;
    };
  }
  return worker;
}
function run<T>(data:{type:'hash'|'blob';chunk?:Blob;chunks?:Blob[]}):Promise<T> {
  return new Promise((resolve,reject) => {
    try {
      const id = ++serial;
      pending.set(id,{resolve:resolve as (result:never)=>void,reject});
      getWorker().postMessage({id,...data});
    } catch(error) { pending.delete(serial); reject(error); }
  });
}
export const hashChunk = (chunk:Blob) => run<string>({type:'hash',chunk});
export const joinChunks = (chunks:Blob[]) => run<Blob>({type:'blob',chunks});

// Let the browser paint progress and handle input before scheduling another large chunk.
export function yieldToBrowser():Promise<void> {
  return new Promise((resolve) => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(() => resolve(),{timeout:100});
    else setTimeout(resolve,0);
  });
}
