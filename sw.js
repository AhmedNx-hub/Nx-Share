const CACHE='ft-v15', SHARE='ft-share';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>Promise.all(ASSETS.map(a=>c.add(new Request(a,{cache:'reload'})).catch(()=>{})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE&&k!==SHARE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

// استقبال ملفات من قائمة المشاركة في أندرويد (Web Share Target)
async function handleShare(r){
  try{
    const fd=await r.formData();
    await caches.delete(SHARE);
    const c=await caches.open(SHARE), ts=String(Date.now());
    let i=0;
    for(const f of fd.getAll('files')){
      if(!f||typeof f!=='object'||!('name' in f)) continue;
      await c.put(new Request('./shared/'+String(i++).padStart(4,'0')),new Response(f,{headers:{'x-name':encodeURIComponent(f.name||'file'),'x-lm':String(f.lastModified||''),'x-ts':ts,'content-type':f.type||'application/octet-stream'}}));
    }
    const parts=['title','text','url'].map(k=>{ const v=fd.get(k); return typeof v==='string'?v:''; }).filter(Boolean);
    if(parts.length) await c.put(new Request('./shared/text'),new Response(parts.join('\n'),{headers:{'x-ts':ts,'content-type':'text/plain;charset=utf-8'}}));
  }catch(_){}
  return Response.redirect(new URL('./index.html?share=1',self.registration.scope).href,303);
}

let notified=false;
function notifyUpdate(){
  if(notified) return; notified=true;
  self.clients.matchAll({type:'window'}).then(cs=>cs.forEach(c=>c.postMessage({t:'update'})));
}

self.addEventListener('fetch',e=>{
  const r=e.request, u=new URL(r.url);
  if(u.origin!==location.origin) return;
  if(r.method==='POST'&&u.pathname.endsWith('/share-target')){ e.respondWith(handleShare(r)); return; }
  if(r.method!=='GET') return;
  const isDoc=r.mode==='navigate'||/\/(index\.html)?$/.test(u.pathname);
  e.respondWith((async()=>{
    const c=await caches.open(CACHE);
    const hit=await c.match(r,{ignoreSearch:true});
    const old=hit&&isDoc?hit.clone():null;   // لازم ننسخها قبل ما نرجّع hit للصفحة (بعدها ما ينفعش نقرأ منها)
    // بنعرض النسخة المحفوظة فورًا، وفي الخلفية بنجيب الجديدة. لو الصفحة اتغيّرت بنبلّغ المستخدم.
    const net=fetch(r.url,{cache:'no-cache'}).then(async res=>{
      if(res&&res.ok){
        const a=res.clone(), b=res.clone();
        let changed=false;
        if(old){ try{ changed=(await old.text())!==(await a.text()); }catch(_){} }
        await c.put(r,b).catch(()=>{});
        if(changed) notifyUpdate();
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

self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{ const c=cs[0]; return c?c.focus():self.clients.openWindow('./index.html'); }));
});
