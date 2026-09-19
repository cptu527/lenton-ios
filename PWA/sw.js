const CACHE="lenton-pwa-v3";
const SHELL=["./","./index.html","./styles.css","./app.js","./manifest.webmanifest","./generated/android-spec.js","./icon-192.png","./icon-512.png","./icon-1024.png"];

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL.filter(x=>!x.includes("icon-")))).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k!=="lenton-meta").map(k=>caches.delete(k)))),
    self.clients.claim()
  ]));
});
self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET") return;
  const u=new URL(req.url);
  if(u.origin!==location.origin) return;
  if(req.mode==="navigate"){
    event.respondWith(fetch(req).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put("./index.html",c));return r}).catch(()=>caches.match("./index.html")));
    return;
  }
  event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>{if(r.ok){const c=r.clone();caches.open(CACHE).then(x=>x.put(req,c))}return r})));
});

self.addEventListener("push",event=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch{try{data={body:event.data?.text()||""}}catch{}}
  const n=data.notification||{};
  const title=data.title||n.title||"렌톤";
  const body=data.body||n.body||data.message||"새 알림이 도착했습니다.";
  const icon=data.icon||n.icon||"./icon-1024.png";
  const target=n.navigate||data.url||"./?view=notifications";
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
