const CACHE='ft-v5', SHARE='ft-share';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>Promise.all(ASSETS.map(a=>c.add(a).catch(()=>{})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE&&k!==SHARE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
async function notify(){
  const cs=await self.clients.matchAll({includeUncontrolled:true});
  cs.forEach(c=>c.postMessage({t:'update'}));
}
async function handleShare(req){
  try{
    const fd=await req.formData();
    await caches.delete(SHARE);
    const c=await caches.open(SHARE), now=String(Date.now());
    let i=0;
    for(const f of fd.getAll('files')){
      if(!(f instanceof File)) continue;
      await c.put(new Request('./shared/f'+String(i++).padStart(4,'0')),new Response(f,{headers:{'x-name':encodeURIComponent(f.name||'file'),'x-lm':String(f.lastModified||Date.now()),'x-ts':now,'content-type':f.type||'application/octet-stream'}}));
    }
    const text=[fd.get('title'),fd.get('text'),fd.get('url')].filter(x=>typeof x==='string'&&x).join('\n');
    if(text) await c.put(new Request('./shared/text'),new Response(text,{headers:{'x-ts':now,'content-type':'text/plain;charset=utf-8'}}));
  }catch(_){}
  return Response.redirect('./index.html?share=1',303);
}
self.addEventListener('fetch',e=>{
  const r=e.request, u=new URL(r.url);
  if(u.origin!==location.origin) return;
  if(r.method==='POST'&&u.pathname.endsWith('/share-target')){ e.respondWith(handleShare(r)); return; }
  if(r.method!=='GET') return;
  e.respondWith((async()=>{
    const c=await caches.open(CACHE);
    const hit=await c.match(r,{ignoreSearch:true});
    const isPage=r.mode==='navigate'||u.pathname.endsWith('/index.html');
    const net=fetch(r).then(async res=>{
      if(res&&res.ok){
        if(isPage&&hit){ try{ const [a,b]=await Promise.all([hit.clone().text(),res.clone().text()]); if(a!==b) notify(); }catch(_){} }
        await c.put(r.mode==='navigate'?new Request('./index.html'):r,res.clone());
      }
      return res;
    }).catch(()=>null);
    if(hit){ e.waitUntil(net); return hit; }
    const res=await net;
    if(res) return res;
    if(r.mode==='navigate'){ const p=await c.match('./index.html')||await c.match('./'); if(p) return p; }
    return new Response('offline',{status:503});
  })());
});
