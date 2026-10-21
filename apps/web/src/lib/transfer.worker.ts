/// <reference lib="webworker" />

self.onmessage = async (event: MessageEvent<{id:number;type:'hash'|'blob';chunks?:Blob[];chunk?:Blob}>) => {
  const {id,type,chunks,chunk} = event.data;
  try {
    if (type === 'hash' && chunk) {
      const digest = await crypto.subtle.digest('SHA-256',await chunk.arrayBuffer());
      const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2,'0')).join('');
      self.postMessage({id,result:hex});
    } else if (type === 'blob' && chunks) self.postMessage({id,result:new Blob(chunks)});
    else throw new Error('传输任务无效');
  } catch (error) { self.postMessage({id,error:error instanceof Error ? error.message : '后台处理失败'}); }
};
