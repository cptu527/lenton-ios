const META_CACHE="lenton-push-meta-v2";
const META_KEY="./__account_push_state";

function accountSlot(){
  try{
    const p=new URL(self.registration.scope).pathname;
    const m=p.match(/\/a(\d+)\/$/);
    return m?Number(m[1]):-1;
  }catch{return -1}
}
async function readMeta(){
  try{
    const cache=await caches.open(META_CACHE),res=await cache.match(META_KEY);
    if(!res)return {accounts:{}};
    const data=await res.json();
    return data&&typeof data==="object"?{...data,accounts:data.accounts||{}}:{accounts:{}};
  }catch{return {accounts:{}}}
}
async function writeMeta(meta){
  try{
    const cache=await caches.open(META_CACHE);
    await cache.put(META_KEY,new Response(JSON.stringify(meta||{accounts:{}}),{headers:{"Content-Type":"application/json"}}));
  }catch{}
}
async function incrementUnread(){
  const slot=accountSlot(),meta=await readMeta(),key=String(slot),acc=meta.accounts?.[key]||null;
  if(acc){acc.unread=Math.max(0,Number(acc.unread)||0)+1;meta.accounts[key]=acc;await writeMeta(meta)}
  const total=Object.values(meta.accounts||{}).reduce((n,a)=>n+Math.max(0,Number(a?.unread)||0),0);
  try{
    if("setAppBadge" in self.navigator){
      if(total>0)await self.navigator.setAppBadge(total);
      else if("clearAppBadge" in self.navigator)await self.navigator.clearAppBadge();
    }
  }catch{}
  return {slot,acc,total};
}
function appIcon(){
  try{return new URL("../../icon-192.png",self.registration.scope).href}catch{return "../../icon-192.png"}
}
self.addEventListener("push",event=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch{try{data={body:event.data?.text()||""}}catch{}}
  event.waitUntil((async()=>{
    const {slot,acc,total}=await incrementUnread();
    const n=data.notification||{};
    const title=data.title||n.title||"렌톤";
    const body=data.body||n.body||data.message||"새 알림이 도착했습니다.";
    const senderIcon=data.icon||n.icon||acc?.avatar||appIcon();
    const notificationId=String(data.notification_id||data.id||"");
    const target=n.navigate||data.url||("../../?notification_id="+encodeURIComponent(notificationId)+"&account_slot="+encodeURIComponent(slot));
    const options={
      body,
      icon:senderIcon,
      badge:appIcon(),
      tag:(acc?.key||"lenton")+"|"+(notificationId||Date.now()),
      renotify:true,
      data:{url:target,accountSlot:slot,notificationId,accountKey:acc?.key||"",icon:senderIcon},
      silent:false
    };
    await self.registration.showNotification(title,options);
    const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    await Promise.all(clients.map(c=>c.postMessage({
      type:"push",title,body,icon:senderIcon,notificationId,accountSlot:slot,accountKey:acc?.key||"",totalUnread:total
    })));
  })());
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const d=event.notification.data||{},slot=Number(d.accountSlot);
  let raw=d.url||("../../?view=notifications");
  try{
    const u=new URL(raw,self.registration.scope);
    if(Number.isInteger(slot)&&slot>=0&&!u.searchParams.has("account_slot"))u.searchParams.set("account_slot",String(slot));
    if(d.notificationId&&!u.searchParams.has("notification_id"))u.searchParams.set("notification_id",String(d.notificationId));
    raw=u.href;
  }catch{}
  event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(cs=>{
    for(const c of cs){if("focus" in c){c.navigate?.(raw);return c.focus()}}
    return self.clients.openWindow(raw);
  }));
});
