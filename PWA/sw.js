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

const PUSH_META_CACHE="lenton-push-meta-v2",PUSH_META_KEY="./__account_push_state";
async function pushMetaRead(){
  try{const cache=await caches.open(PUSH_META_CACHE),r=await cache.match(PUSH_META_KEY);return r?await r.json():{accounts:{}}}catch{return {accounts:{}}}
}
async function pushMetaWrite(meta){
  try{const cache=await caches.open(PUSH_META_CACHE);await cache.put(PUSH_META_KEY,new Response(JSON.stringify(meta||{accounts:{}}),{headers:{"Content-Type":"application/json"}}))}catch{}
}
async function swTokenHash(token){
  try{const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(token||"")));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}catch{return ""}
}
async function rootPushBadge(data){
  const meta=await pushMetaRead(),hash=await swTokenHash(data?.access_token||""),accounts=meta.accounts||{};
  let match=null;
  for(const a of Object.values(accounts))if(hash&&a?.tokenHash===hash){match=a;break}
  let kind="notification";
  const type=String(data?.notification_type||data?.notification?.type||"");
  const notificationId=String(data?.notification_id||data?.id||"");
  if(type==="mention"&&match?.host&&notificationId&&data?.access_token){
    try{
      const r=await fetch("https://"+match.host+"/api/v1/notifications/"+encodeURIComponent(notificationId),{
        headers:{Accept:"application/json",Authorization:"Bearer "+String(data.access_token)},cache:"no-store"
      });
      if(r.ok){
        const n=await r.json();
        if(n?.status?.visibility==="direct")kind="dm";
      }
    }catch{}
  }
  if(match){
    match.notificationUnread=Math.max(0,Number(match.notificationUnread)||0);
    match.dmUnread=Math.max(0,Number(match.dmUnread)||0);
    if(kind==="dm")match.dmUnread++;else match.notificationUnread++;
    match.unread=match.notificationUnread+match.dmUnread;
  }else meta.unscopedUnread=Math.max(0,Number(meta.unscopedUnread)||0)+1;
  await pushMetaWrite(meta);
  const total=Object.values(accounts).reduce((n,a)=>n+Math.max(0,Number(a?.unread)||0),0)+Math.max(0,Number(meta.unscopedUnread)||0);
  try{if("setAppBadge" in self.navigator){if(total>0)await self.navigator.setAppBadge(total);else if("clearAppBadge" in self.navigator)await self.navigator.clearAppBadge()}}catch{}
  return {match,total,kind};
}

self.addEventListener("push",event=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch{try{data={body:event.data?.text()||""}}catch{}}
  event.waitUntil((async()=>{
    const n=data.notification||{},title=data.title||n.title||"렌톤",body=data.body||n.body||data.message||"새 알림이 도착했습니다.";
    const icon=data.icon||n.icon||"./icon-1024.png",notificationId=String(data.notification_id||data.id||"");
    const badgeInfo=await rootPushBadge(data),accountKey=badgeInfo.match?.key||"",kind=badgeInfo.kind||"notification";
    const target=n.navigate||data.url||(notificationId?("./?notification_id="+encodeURIComponent(notificationId)):"./?view=notifications");
    const options={body,icon,badge:"./icon-1024.png",tag:notificationId||"lenton-notification",renotify:true,data:{url:target,accountKey,notificationId,icon,kind},silent:false};
    await Promise.all([
      self.registration.showNotification(title,options),
      caches.open("lenton-meta").then(c=>c.put("./__lastpush",new Response(String(Date.now())))),
      self.clients.matchAll({type:"window",includeUncontrolled:true}).then(cs=>Promise.all(cs.map(c=>c.postMessage({
        type:"push",title,body,icon,url:target,notificationId,accountKey,totalUnread:badgeInfo.total,kind
      }))))
    ]);
  })());
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
