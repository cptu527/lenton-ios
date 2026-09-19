const CACHE="lenton-pwa-v4";
const SHELL=["./","./index.html","./styles.css","./app.js","./manifest.webmanifest","./generated/android-spec.js","./changelog.json","./icon-192.png","./icon-512.png","./icon-1024.png"];

self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(async c=>{
        for(const u of SHELL.filter(x=>!x.includes("icon-"))){
          try{const r=await fetch(u,{cache:"no-store"});if(r.ok)await c.put(u,r.clone())}catch{}
        }
      })
      .then(()=>self.skipWaiting())
  );
});
self.addEventListener("activate",event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k!=="lenton-meta").map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});
async function networkFirst(req,fallback){
  try{
    const r=await fetch(req,{cache:"no-store"});
    if(r&&r.ok){const c=r.clone();caches.open(CACHE).then(x=>x.put(req,c))}
    return r;
  }catch{
    return (await caches.match(req)) || (fallback?await caches.match(fallback):Response.error());
  }
}
self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET") return;
  const u=new URL(req.url);
  if(u.origin!==location.origin) return;
  if(req.mode==="navigate"){
    event.respondWith(networkFirst(req,"./index.html"));
    return;
  }
  if(
    /\/(?:app\.js|styles\.css|index\.html|manifest\.webmanifest|build\.json|changelog\.json)$/.test(u.pathname) ||
    u.pathname.includes("/generated/android-spec.js")
  ){
    event.respondWith(networkFirst(req));
    return;
  }
  event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>{if(r.ok){const c=r.clone();caches.open(CACHE).then(x=>x.put(req,c))}return r})));
});

self.addEventListener("message",event=>{
  if(event.data?.type==="SKIP_WAITING")self.skipWaiting();
});

self.addEventListener("push",event=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch{try{data={body:event.data?.text()||""}}catch{}}
  const n=data.notification||{};
  const title=data.title||n.title||"렌톤";
  const body=data.body||n.body||data.message||"새 알림이 도착했습니다.";
  const icon=data.icon||n.icon||"./icon-1024.png";
  const target=n.navigate||data.url||(data.notification_id?("./?notification_id="+encodeURIComponent(data.notification_id)):"./?view=notifications");
  const options={
    body,icon,badge:"./icon-1024.png",tag:data.notification_id||data.id||"lenton-notification",
    renotify:true,data:{url:target},silent:false
  };
  event.waitUntil(Promise.all([
    self.registration.showNotification(title,options),
    caches.open("lenton-meta").then(c=>c.put("./__lastpush",new Response(String(Date.now())))),
    self.clients.matchAll({type:"window",includeUncontrolled:true}).then(cs=>Promise.all(cs.map(c=>c.postMessage({type:"push"}))))
  ]));
});

self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const raw=event.notification.data?.url||"./?view=notifications";
  const url=new URL(raw,self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(cs=>{
    for(const c of cs){if("focus"in c){c.navigate?.(url);return c.focus()}}
    return self.clients.openWindow(url);
  }));
});
