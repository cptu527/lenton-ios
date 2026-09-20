const ANDROID = window.LENTON_ANDROID_SPEC || {};
const $ = (s, r=document) => r.querySelector(s);
const esc = (s="") => String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
const plain = (html="") => { const d=document.createElement("div"); d.innerHTML=html; return d.textContent||""; };
const fmtTime = (v) => { try { const sec=Math.max(0,Math.floor((Date.now()-new Date(v).getTime())/1000)); if(sec<60)return "지금"; if(sec<3600)return Math.floor(sec/60)+"분"; if(sec<86400)return Math.floor(sec/3600)+"시간"; if(sec<604800)return Math.floor(sec/86400)+"일"; const d=new Date(v); return (d.getMonth()+1)+"월 "+d.getDate()+"일"; } catch { return ""; } };

const fmtDateOnly=(v)=>{try{const d=new Date(v);return (d.getMonth()+1)+"월 "+d.getDate()+"일"}catch{return ""}};
const store = {
  get(k,d=null){try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},
  set(k,v){localStorage.setItem(k,JSON.stringify(v))},
  del(k){localStorage.removeItem(k)}
};
const state = {
  session: store.get("lenton_session"),
  me:null, view:"home", homeMode:"home", listId:null, lists:[], busy:false,
  theme:store.get("lenton_theme","system"), accent:store.get("lenton_accent",ANDROID?.theme?.accent||"#1d9bf0"),
  uiScale:Math.max(.8,Math.min(1.2,Number(store.get("lenton_ui_scale",1))||1)),
  pushError:"", toast:"", notificationUnread:0, notificationUnreadOverflow:false, dmUnread:0, accountUnread:{}, accountNotificationUnread:{}, accountDmUnread:{}, currentConversation:null, profileReplies:false, profileMode:"posts", profileAccount:null, profileRelationship:null, returnView:"home", customEmojis:null, timelineItems:[], timelineLoadingMore:false, scrolls:{}, pageCache:{}, homeCache:{}, profileCache:{}, profilePagerData:{}, homePagerData:{}, navStack:[], dmDraftRecipients:[], searchResults:null, searchQuery:"", searchMode:"posts", updateAvailable:null, buildInfo:null
};

function accountScope(){
  const host=state.session?.host||"";
  const id=state.me?.id||"anon";
  return host+"|"+id;
}
function scopedKey(name){return "lenton_"+name+"_"+accountScope()}
const DEFAULT_MAIN_TABS=["home","search","notifications","dm"];
function mainTabLayout(){
  const saved=store.get("lenton_main_tab_layout",{order:DEFAULT_MAIN_TABS,hidden:[]})||{};
  const order=[];
  for(const x of Array.isArray(saved.order)?saved.order:DEFAULT_MAIN_TABS) if(DEFAULT_MAIN_TABS.includes(x)&&!order.includes(x))order.push(x);
  for(const x of DEFAULT_MAIN_TABS) if(!order.includes(x))order.push(x);
  let hidden=new Set(Array.isArray(saved.hidden)?saved.hidden.filter(x=>DEFAULT_MAIN_TABS.includes(x)):[]);
  if(hidden.size>=order.length)hidden.delete(order[0]);
  return {order,hidden};
}
function saveMainTabLayout(order,hidden){
  const clean=order.filter((x,i)=>DEFAULT_MAIN_TABS.includes(x)&&order.indexOf(x)===i);
  for(const x of DEFAULT_MAIN_TABS)if(!clean.includes(x))clean.push(x);
  const h=[...hidden].filter(x=>DEFAULT_MAIN_TABS.includes(x));
  if(h.length>=clean.length)h.pop();
  store.set("lenton_main_tab_layout",{order:clean,hidden:h});
}
function visibleNavItems(){
  const cfg=mainTabLayout(),src=androidNavItems();
  const by=new Map(src.map(x=>[x.id,x]));
  return cfg.order.filter(x=>!cfg.hidden.has(x)).map(x=>by.get(x)||{id:x,glyph:x==="home"?"⌂":x==="search"?"⌕":x==="notifications"?"♢":"✉"});
}
function renderEmojiText(text,emojis=[]){
  let out=esc(text||"");
  const merged=[],seen=new Set();
  for(const e of [...(emojis||[]),...(state.customEmojis||[])]){
    const code=e?.shortcode;if(!code||seen.has(code))continue;seen.add(code);merged.push(e);
  }
  for(const e of merged){
    const code=e.shortcode,src=e.static_url||e.url;if(!src)continue;
    const needle=":"+code+":";
    out=out.split(esc(needle)).join('<img class="custom-emoji" src="'+esc(src)+'" alt="'+esc(needle)+'">');
  }
  return out;
}
function mentionAcctFromAnchor(node,href=""){
  const raw=String(node?.textContent||"").trim();
  const isMention=!!node?.classList?.contains("mention")||raw.startsWith("@");
  if(!isMention)return "";
  let acct=raw.replace(/^@+/,"").replace(/\s+/g,"");
  if(acct.includes("@"))return acct;
  try{
    const u=new URL(href,location.href),m=u.pathname.match(/^\/@([^/]+)|^\/users\/([^/]+)/);
    const user=m?.[1]||m?.[2]||acct;
    if(user){
      acct=user;
      if(u.host&&u.host!==state.session?.host)acct=user+"@"+u.host;
    }
  }catch{}
  return acct;
}
async function openMentionProfile(acct,href=""){
  let key=String(acct||"").replace(/^@+/,"").trim();
  if(!key&&href){
    try{const u=new URL(href,location.href),m=u.pathname.match(/^\/@([^/]+)|^\/users\/([^/]+)/);if(m){key=m[1]||m[2]||"";if(key&&u.host&&u.host!==state.session?.host)key+="@"+u.host}}catch{}
  }
  if(!key)return;
  try{
    let a=null;
    try{a=await api("/api/v1/accounts/lookup",{query:{acct:key}})}catch{}
    if(!a?.id){
      const r=await api("/api/v2/search",{query:{q:key,type:"accounts",resolve:"true",limit:"5"}});
      a=(r?.accounts||[]).find(x=>String(x.acct||"").toLowerCase()===key.toLowerCase())||(r?.accounts||[])[0];
    }
    if(!a?.id)throw new Error("계정을 찾지 못했어요.");
    pushNavSnapshot();await openProfile(a.id,"posts",true);
  }catch(e){toast("프로필을 열지 못했어요: "+e.message)}
}
function renderRichText(html=""){
  const d=document.createElement("div");d.innerHTML=html;
  const walk=node=>{
    if(node.nodeType===Node.TEXT_NODE)return renderEmojiText(node.nodeValue||"",state.customEmojis||[]);
    if(node.nodeType!==Node.ELEMENT_NODE)return "";
    const tag=node.tagName.toLowerCase();
    if(tag==="br")return "<br>";
    if(tag==="img"&&(node.classList.contains("emoji")||node.classList.contains("emojione"))){
      const src=node.getAttribute("src")||"",alt=node.getAttribute("alt")||"";
      return '<img class="custom-emoji" src="'+esc(src)+'" alt="'+esc(alt)+'">';
    }
    const inner=[...node.childNodes].map(walk).join("");
    if(tag==="p")return inner+"<br>";
    if(tag==="a"){
      const href=node.getAttribute("href")||"",mention=mentionAcctFromAnchor(node,href);
      if(mention)return '<button type="button" class="inline-mention" data-mention-acct="'+esc(mention)+'" data-mention-href="'+esc(href)+'">'+inner+"</button>";
      return '<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">'+inner+"</a>";
    }
    return inner;
  };
  return [...d.childNodes].map(walk).join("").replace(/(?:<br>){3,}/g,"<br><br>").replace(/<br>$/,"");
}
async function apiMultipart(path,formData,{method="POST"}={}){
  if(!state.session)throw new Error("로그인이 필요합니다.");
  const res=await fetch("https://"+state.session.host+path,{method,headers:{Accept:"application/json",Authorization:"Bearer "+state.session.token},body:formData});
  const txt=await res.text();let data=null;try{data=txt?JSON.parse(txt):null}catch{data=txt}
  if(!res.ok)throw new Error((data&&data.error)||"HTTP "+res.status);
  return data;
}
const REDIRECT_URI = location.origin + location.pathname;
document.documentElement.style.setProperty("--accent",state.accent);
if(state.theme!=="system") document.documentElement.dataset.theme=state.theme;

function applyAndroidSpecMetrics(){
  const ui=ANDROID?.ui||{}, root=document.documentElement,scale=Math.max(.8,Math.min(1.2,Number(state.uiScale)||1));
  root.style.setProperty("--lenton-ui-scale",String(scale));
  const px=(name,value,fallback)=>root.style.setProperty(name,String(Math.round(Number(value??fallback)*scale*100)/100)+"px");
  px("--android-topbar",ui.topBarDp,62);
  px("--android-bottom",ui.bottomBarDp,64);
  px("--android-topbar-avatar",ui.topBarAvatarDp,40);
  px("--android-topbar-title",ui.topBarTitleSp,20);
  px("--android-topbar-search",ui.topBarSearchDp,48);
  px("--android-topbar-more",ui.topBarMoreDp,44);
  px("--android-avatar",ui.avatarDp,46);
  px("--android-body",ui.bodySp,16);
  px("--android-author-line",ui.authorLineDp,28);
  px("--android-content-inset",ui.statusContentInsetDp,12);
  px("--android-action-row",ui.actionRowDp,48);
  px("--android-action-item",ui.actionItemDp,46);
  px("--android-action-glyph",ui.actionGlyphSp,22);
  px("--android-media-single",ui.mediaSingleDp,260);
  px("--android-media-multi",ui.mediaMultiDp,220);
  px("--android-drawer-avatar",ui.drawerAvatarDp,64);
  px("--android-drawer-row",ui.drawerRowDp,58);
  px("--android-drawer-glyph",ui.drawerGlyphDp,25);
  px("--android-drawer-text",ui.drawerTextSp,19);
  px("--android-profile-header",ui.profileHeaderDp,170);
  px("--android-profile-avatar",ui.profileAvatarDp,92);
  px("--android-profile-avatar-left",ui.profileAvatarLeftDp,18);
  px("--android-profile-avatar-top",ui.profileAvatarTopDp,126);
  px("--android-profile-hero",ui.profileHeroDp,226);
  px("--android-profile-name",ui.profileNameSp,22);
  px("--android-profile-tab",ui.profileTabDp,50);
  px("--android-notification-glyph",ui.notificationGlyphDp,25);
  px("--android-message-avatar",ui.messageAvatarDp,48);
  px("--android-standalone-top",ui.standaloneTopDp,60);
  root.style.setProperty("--android-drawer-width",String(Math.round((ui.drawerWidthRatio||.88)*100))+"vw");
  const scaled=x=>Math.round(Number(x)*scale*100)/100;
  const sp=ui.statusPadding||[16,10,14,8];
  root.style.setProperty("--android-status-padding",sp.map(x=>String(scaled(x))+"px").join(" "));
  root.style.setProperty("--android-status-pad-top",String(scaled(sp[0]))+"px");
  root.style.setProperty("--android-status-pad-right",String(scaled(sp[1]))+"px");
  root.style.setProperty("--android-status-pad-bottom",String(scaled(sp[2]))+"px");
  root.style.setProperty("--android-status-pad-left",String(scaled(sp[3]))+"px");
  const dp=ui.drawerPadding||[24,24,24,20];
  root.style.setProperty("--android-drawer-padding",dp.map(x=>String(scaled(x))+"px").join(" "));
  root.style.setProperty("--android-drawer-pad-top",String(scaled(dp[0]))+"px");
  root.style.setProperty("--android-drawer-pad-right",String(scaled(dp[1]))+"px");
  root.style.setProperty("--android-drawer-pad-bottom",String(scaled(dp[2]))+"px");
  root.style.setProperty("--android-drawer-pad-left",String(scaled(dp[3]))+"px");
  const np=ui.notificationPadding||[16,12,14,10];
  root.style.setProperty("--android-notification-padding",np.map(x=>String(scaled(x))+"px").join(" "));
  const mp=ui.messagePadding||[16,12,14,12];
  root.style.setProperty("--android-message-padding",mp.map(x=>String(scaled(x))+"px").join(" "));
}
applyAndroidSpecMetrics();

function toast(msg){ state.toast=msg; renderToast(); setTimeout(()=>{state.toast="";renderToast()},2600) }
function renderToast(){ const old=$(".toast"); if(old) old.remove(); if(state.toast){const x=document.createElement("div");x.className="toast";x.textContent=state.toast;document.body.append(x)}}
function normalizeHost(v){ return v.trim().replace(/^https?:\/\//i,"").split("/")[0].replace(/\/+$/,""); }
function randB64(bytes=32){ const a=new Uint8Array(bytes);crypto.getRandomValues(a);return btoa(String.fromCharCode(...a)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }
async function sha256b64(s){ const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s));return btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,""); }

async function rawFetch(host,path,opts={}){
  const res=await fetch(`https://${host}${path}`,opts);
  const txt=await res.text(); let data=null; try{data=txt?JSON.parse(txt):null}catch{data=txt}
  if(!res.ok) throw new Error((data&&data.error_description)||(data&&data.error)||`HTTP ${res.status}`);
  return data;
}
async function api(path,{method="GET",form=null,query=null}={}){
  if(!state.session) throw new Error("로그인이 필요합니다.");
  let url=`https://${state.session.host}${path}`;
  if(query){const q=new URLSearchParams(query);url+=`?${q}`}
  const h={Accept:"application/json",Authorization:`Bearer ${state.session.token}`};
  const o={method,headers:h};
  if(form){h["Content-Type"]="application/x-www-form-urlencoded;charset=UTF-8";o.body=form instanceof URLSearchParams?form:new URLSearchParams(form)}
  const res=await fetch(url,o); const txt=await res.text(); let data=null; try{data=txt?JSON.parse(txt):null}catch{data=txt}
  if(!res.ok) throw new Error((data&&data.error)||`HTTP ${res.status}`);
  return data;
}

async function beginLogin(){
  const input=$("#server");const host=normalizeHost(input?.value||"");
  return beginLoginForHost(host);
}
async function beginLoginForHost(rawHost){
  const host=normalizeHost(rawHost||"");
  if(!host||!host.includes(".")){toast("서버 주소를 확인해주세요.");return}
  state.busy=true;if(!document.querySelector(".drawer-shade")&&!document.querySelector(".account-add-page"))render();
  try{
    const scopes="read write push";
    const body=new URLSearchParams({client_name:"Lenton Web",redirect_uris:REDIRECT_URI,scopes,website:location.origin});
    const reg=await rawFetch(host,"/api/v1/apps",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body});
    let pkce=false;
    try{
      const meta=await rawFetch(host,"/.well-known/oauth-authorization-server");
      pkce=Array.isArray(meta.code_challenge_methods_supported)&&meta.code_challenge_methods_supported.includes("S256");
    }catch{}
    const verifier=pkce?randB64(48):null,stateToken=randB64(24);
    const pending={host,client_id:reg.client_id,client_secret:reg.client_secret,vapid_key:reg.vapid_key||null,verifier,state:stateToken,scopes};
    sessionStorage.setItem("lenton_oauth_pending",JSON.stringify(pending));
    const u=new URL(`https://${host}/oauth/authorize`);
    u.searchParams.set("response_type","code");u.searchParams.set("client_id",reg.client_id);u.searchParams.set("redirect_uri",REDIRECT_URI);u.searchParams.set("scope",scopes);u.searchParams.set("state",stateToken);
    if(verifier){u.searchParams.set("code_challenge",await sha256b64(verifier));u.searchParams.set("code_challenge_method","S256")}
    location.href=u.toString();
  }catch(e){
    toast("로그인 준비 실패: "+e.message);state.busy=false;
    if(document.querySelector(".account-add-page"))accountAddScreen();else render();
  }
}
async function finishOAuth(){
  const q=new URLSearchParams(location.search), code=q.get("code"); if(!code) return false;
  const pending=JSON.parse(sessionStorage.getItem("lenton_oauth_pending")||"null");
  if(!pending) throw new Error("로그인 정보가 사라졌습니다. 다시 로그인해주세요.");
  if(q.get("state")!==pending.state) throw new Error("OAuth state가 일치하지 않습니다.");
  const form={grant_type:"authorization_code",client_id:pending.client_id,client_secret:pending.client_secret,redirect_uri:REDIRECT_URI,code};
  if(pending.verifier) form.code_verifier=pending.verifier;
  const tok=await rawFetch(pending.host,"/oauth/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body:new URLSearchParams(form)});
  state.session={host:pending.host,token:tok.access_token,client_id:pending.client_id,client_secret:pending.client_secret,vapid_key:pending.vapid_key};
  store.set("lenton_session",state.session);sessionStorage.removeItem("lenton_oauth_pending");
  history.replaceState({},document.title,REDIRECT_URI);
  return true;
}

function savedAccounts(){return store.get("lenton_accounts",[])||[]}
const PUSH_META_CACHE="lenton-push-meta-v2",PUSH_META_KEY="./__account_push_state";
function currentAccountKey(){return state.session&&state.me?state.session.host+"|"+state.me.id:""}
function allocatePushSlot(list,key){
  const existing=list.find(x=>x.key===key);
  if(Number.isInteger(existing?.pushSlot)&&existing.pushSlot>=0)return existing.pushSlot;
  const used=new Set(list.map(x=>Number(x.pushSlot)).filter(Number.isInteger));
  for(let i=0;i<16;i++)if(!used.has(i))return i;
  return Math.max(0,list.length);
}
async function readPushMeta(){
  try{
    const cache=await caches.open(PUSH_META_CACHE),res=await cache.match(PUSH_META_KEY);
    if(!res)return {accounts:{}};
    const parsed=await res.json();
    return parsed&&typeof parsed==="object"?{...parsed,accounts:parsed.accounts||{}}:{accounts:{}};
  }catch{return {accounts:{}}}
}
async function writePushMeta(meta){
  try{
    const cache=await caches.open(PUSH_META_CACHE);
    await cache.put(PUSH_META_KEY,new Response(JSON.stringify(meta||{accounts:{}}),{headers:{"Content-Type":"application/json"}}));
  }catch{}
}
async function tokenFingerprint(token){
  try{
    const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(token||"")));
    return [...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,"0")).join("");
  }catch{return ""}
}
async function syncSavedAccountsToPushMeta(){
  const list=savedAccounts(),meta=await readPushMeta(),next={...meta,accounts:{...meta.accounts}};
  const keep=new Set();
  for(const x of list){
    const slot=Number.isInteger(x.pushSlot)?x.pushSlot:allocatePushSlot(list,x.key);
    keep.add(String(slot));
    const prev=next.accounts[String(slot)]||{};
    const prevNotification=Math.max(0,Number(prev.notificationUnread)||0);
    const prevDm=Math.max(0,Number(prev.dmUnread)||0);
    const legacyTotal=Math.max(0,Number(prev.unread)||0);
    next.accounts[String(slot)]={
      key:x.key,id:x.id,host:x.host,acct:x.acct,display_name:x.display_name,avatar:x.avatar,
      accessToken:String(x.session?.token||""),
      tokenHash:await tokenFingerprint(x.session?.token||""),
      pushEnabled:pushEnabledForAccount(x),
      notificationUnread:prevNotification,
      dmUnread:prevDm,
      unread:prevNotification+prevDm || legacyTotal
    };
  }
  for(const slot of Object.keys(next.accounts))if(!keep.has(String(slot)))delete next.accounts[slot];
  await writePushMeta(next);
  state.accountUnread={};state.accountNotificationUnread={};state.accountDmUnread={};
  for(const a of Object.values(next.accounts||{}))if(a?.key){
    const notificationUnread=Math.max(0,Number(a.notificationUnread)||0);
    const dmUnread=Math.max(0,Number(a.dmUnread)||0);
    const total=Math.max(0,Number(a.unread)||0)||notificationUnread+dmUnread;
    state.accountUnread[a.key]=total;
    state.accountNotificationUnread[a.key]=notificationUnread;
    state.accountDmUnread[a.key]=dmUnread;
  }
  return next;
}
async function setSharedAccountUnreadBreakdown(key,notificationCount,dmCount){
  if(!key)return;
  const meta=await readPushMeta();
  const a=Object.values(meta.accounts||{}).find(x=>x?.key===key);
  if(a){
    a.notificationUnread=Math.max(0,Number(notificationCount)||0);
    a.dmUnread=Math.max(0,Number(dmCount)||0);
    a.unread=a.notificationUnread+a.dmUnread;
  }
  await writePushMeta(meta);
  state.accountUnread={};state.accountNotificationUnread={};state.accountDmUnread={};
  for(const x of Object.values(meta.accounts||{}))if(x?.key){
    const notificationUnread=Math.max(0,Number(x.notificationUnread)||0);
    const dmUnread=Math.max(0,Number(x.dmUnread)||0);
    state.accountUnread[x.key]=Math.max(0,Number(x.unread)||0)||notificationUnread+dmUnread;
    state.accountNotificationUnread[x.key]=notificationUnread;
    state.accountDmUnread[x.key]=dmUnread;
  }
}
function totalAccountUnread(){
  const vals=Object.values(state.accountUnread||{}).map(Number).filter(Number.isFinite);
  return vals.length?vals.reduce((a,b)=>a+Math.max(0,b),0):Math.max(0,Number(state.notificationUnread)||0);
}
function accountUnreadFor(entry){return Math.max(0,Number(state.accountUnread?.[entry?.key])||0)}
function accountNotificationUnreadFor(entry){return Math.max(0,Number(state.accountNotificationUnread?.[entry?.key])||0)}
function accountDmUnreadFor(entry){return Math.max(0,Number(state.accountDmUnread?.[entry?.key])||0)}
async function saveCurrentAccount(){
  if(!state.session||!state.me)return;
  const list=savedAccounts(),key=state.session.host+"|"+state.me.id,i=list.findIndex(x=>x.key===key),old=i>=0?list[i]:null;
  const entry={...(old||{}),key,id:state.me.id,host:state.session.host,acct:state.me.acct,display_name:state.me.display_name||state.me.username,avatar:state.me.avatar_static||state.me.avatar||"",session:state.session,pushSlot:Number.isInteger(old?.pushSlot)?old.pushSlot:allocatePushSlot(list,key)};
  if(i>=0)list[i]=entry;else list.push(entry);
  store.set("lenton_accounts",list);
  await syncSavedAccountsToPushMeta();
}
function resetAccountState(){
  state.lists=[];state.timelineItems=[];state.pageCache={};state.homeCache={};state.profileAccount=null;state.profileRelationship=null;state.profileMode="posts";state.profileReplies=false;state.currentConversation=null;state.customEmojis=null;state.listId=null;state.homeMode="home";state.scrolls={};state.navStack=[];state.dmDraftRecipients=[];state.searchResults=null;state.searchQuery="";state.searchMode="posts";state.notificationUnread=0;state.notificationUnreadOverflow=false;state.dmUnread=0;
}
async function switchSavedAccount(index){
  const list=savedAccounts(),entry=list[index];if(!entry?.session)return;
  rememberScroll();state.session=entry.session;store.set("lenton_session",state.session);resetAccountState();
  try{state.me=await api("/api/v1/accounts/verify_credentials");state.customEmojis=null;await loadCustomEmojis();await saveCurrentAccount();state.notificationUnread=accountNotificationUnreadFor(entry);state.dmUnread=accountDmUnreadFor(entry);state.view="home";render();refreshNotificationBadgeDom();setTimeout(()=>refreshUnreadNotificationCount(),80);toast("계정을 전환했어요.")}
  catch(e){toast("계정 전환 실패: "+e.message)}
}
function savedAccountFullHandle(x){
  const acct=String(x?.acct||"");
  return "@"+acct+(acct.includes("@")?"":("@"+String(x?.host||"")));
}
function closeAccountSwitcher(){document.querySelector(".account-switcher-shade")?.remove()}
async function openAccountSwitcher(){
  closeAccountSwitcher();
  await syncSavedAccountsToPushMeta();
  const list=savedAccounts(),current=state.session?.host+"|"+(state.me?.id||""),shade=document.createElement("div");
  shade.className="account-switcher-shade";
  shade.innerHTML='<section class="account-switcher-sheet"><header><h2>계정</h2><button type="button" data-account-sheet-close aria-label="닫기">×</button></header>'+
    '<div class="account-switcher-list">'+list.map((x,i)=>{const unread=accountUnreadFor(x);return '<button type="button" class="account-switcher-row" data-account-sheet-switch="'+i+'"><img src="'+esc(x.avatar||"")+'" alt=""><span><b>'+esc(x.display_name||x.acct||"계정")+'</b><small>'+esc(savedAccountFullHandle(x))+'</small></span><em>'+(unread>0?'<i class="account-unread-badge">'+esc(unread>99?"99+":String(unread))+'</i>':(x.key===current?'<i class="account-current-check">✓</i>':""))+'</em></button>'}).join("")+'</div>'+
    '<button type="button" class="account-existing-add" data-existing-account-add>기존 계정 추가</button></section>';
  document.body.append(shade);
  shade.onclick=e=>{if(e.target===shade)closeAccountSwitcher()};
  shade.querySelector("[data-account-sheet-close]").onclick=closeAccountSwitcher;
  shade.querySelectorAll("[data-account-sheet-switch]").forEach(b=>b.onclick=()=>{const i=Number(b.dataset.accountSheetSwitch);closeAccountSwitcher();switchSavedAccount(i)});
  shade.querySelector("[data-existing-account-add]").onclick=()=>{closeAccountSwitcher();addAccountFlow()};
}
function accountAddScreen(){
  closeDrawer();closeAccountSwitcher();
  $("#app").innerHTML='<div class="account-add-page">'+
    '<button type="button" class="account-add-cancel" id="cancelAccountAdd">취소</button>'+
    '<div class="account-add-body"><img class="account-add-logo" src="./icon-192.png" alt="렌톤"><h1>계정 추가</h1><p>추가할 Mastodon 서버를 입력하세요</p>'+
    '<input id="accountAddServer" class="account-add-input" inputmode="url" autocapitalize="none" autocomplete="off" placeholder="mastodon.social">'+
    '<button type="button" class="account-add-login" id="accountAddLogin">Mastodon으로 로그인</button></div></div>';
  bind();
  $("#cancelAccountAdd").onclick=()=>goBackScreen();
  const run=()=>beginLoginForHost($("#accountAddServer")?.value||"");
  $("#accountAddLogin").onclick=run;
  $("#accountAddServer").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();run()}});
}
function addAccountFlow(){
  pushNavSnapshot();
  accountAddScreen();
}
async function profileEditScreen(){
  closeDrawer();
  try{
    if(!state.me)state.me=await api("/api/v1/accounts/verify_credentials");
    const m=state.me,header=m.header_static||m.header||"",avatar=m.avatar_static||m.avatar||"";
    state.profileEditFields=(m.fields||[]).map(x=>({name:plain(x.name||""),value:plain(x.value||"")})).slice(0,4);
    const body='<div class="profile-editor android-profile-editor">'+
      '<div class="profile-edit-hero">'+
        '<img id="profileEditHeaderPreview" class="profile-edit-header-preview" src="'+esc(header)+'" alt="">'+
        '<img id="profileEditAvatarPreview" class="profile-edit-avatar-preview" src="'+esc(avatar)+'" alt="">'+
        '<button type="button" class="profile-edit-header-button" id="pickProfileHeader">헤더 변경</button>'+
        '<button type="button" class="profile-edit-avatar-button" id="pickProfileAvatar">사진 변경</button>'+
      '</div>'+
      '<input id="profileEditAvatar" type="file" accept="image/*" hidden>'+
      '<input id="profileEditHeader" type="file" accept="image/*" hidden>'+
      '<div class="profile-edit-fields">'+
        '<label><span>표시 이름</span><input id="profileEditName" class="field" value="'+esc(m.display_name||"")+'" maxlength="30"></label>'+
        '<label><span>소개</span><textarea id="profileEditNote" class="field" rows="5">'+esc(plain(m.note||""))+'</textarea></label>'+
        '<label class="check-row profile-edit-lock"><input id="profileEditLocked" type="checkbox" '+(m.locked?"checked":"")+'> <span>팔로우 요청 승인 필요</span></label>'+
        '<div class="profile-edit-section-title">프로필 메타데이터</div>'+
        '<div id="profileMetaFields"></div>'+
        '<button type="button" class="outline-btn profile-meta-add" id="addProfileMeta">＋ 메타데이터 추가</button>'+
        '<button class="primary profile-save" data-action="saveProfileEdit">저장</button>'+
      '</div></div>';
    $("#app").innerHTML=standaloneShell("프로필 편집",body);bind();
    const renderMeta=()=>{
      const box=$("#profileMetaFields");if(!box)return;
      box.innerHTML=(state.profileEditFields||[]).map((x,i)=>'<div class="profile-edit-field-pair">'+
        '<input class="field" data-profile-field-name="'+i+'" placeholder="라벨" value="'+esc(x.name||"")+'">'+
        '<input class="field" data-profile-field-value="'+i+'" placeholder="내용" value="'+esc(x.value||"")+'">'+
        '<button type="button" class="profile-meta-remove" data-meta-remove="'+i+'" aria-label="삭제">×</button></div>').join("");
      box.querySelectorAll("[data-meta-remove]").forEach(b=>b.onclick=()=>{
        const i=Number(b.dataset.metaRemove);
        state.profileEditFields.splice(i,1);renderMeta();
      });
      $("#addProfileMeta").disabled=(state.profileEditFields||[]).length>=4;
    };
    renderMeta();
    $("#addProfileMeta")?.addEventListener("click",()=>{if((state.profileEditFields||[]).length>=4)return;state.profileEditFields.push({name:"",value:""});renderMeta()});
    const avatarInput=$("#profileEditAvatar"),headerInput=$("#profileEditHeader");
    $("#pickProfileAvatar")?.addEventListener("click",()=>avatarInput?.click());
    $("#pickProfileHeader")?.addEventListener("click",()=>headerInput?.click());
    avatarInput?.addEventListener("change",()=>{const file=avatarInput.files?.[0];if(file)$("#profileEditAvatarPreview").src=URL.createObjectURL(file)});
    headerInput?.addEventListener("change",()=>{const file=headerInput.files?.[0];if(file)$("#profileEditHeaderPreview").src=URL.createObjectURL(file)});
  }catch(e){toast(e.message)}
}
async function saveProfileEdit(){
  const btn=document.querySelector('[data-action="saveProfileEdit"]');if(btn){btn.disabled=true;btn.textContent="저장 중…"}
  const fd=new FormData();
  fd.append("display_name",$("#profileEditName")?.value||"");
  fd.append("note",$("#profileEditNote")?.value||"");
  fd.append("locked",$("#profileEditLocked")?.checked?"true":"false");
  const avatar=$("#profileEditAvatar")?.files?.[0],header=$("#profileEditHeader")?.files?.[0];
  if(avatar)fd.append("avatar",avatar);if(header)fd.append("header",header);
  const rows=[...document.querySelectorAll("#profileMetaFields .profile-edit-field-pair")].slice(0,4);
  rows.forEach((row,i)=>{
    const name=row.querySelector("[data-profile-field-name]")?.value||"";
    const value=row.querySelector("[data-profile-field-value]")?.value||"";
    fd.append("fields_attributes["+i+"][name]",name);
    fd.append("fields_attributes["+i+"][value]",value);
  });
  for(let i=rows.length;i<4;i++){
    fd.append("fields_attributes["+i+"][name]","");
    fd.append("fields_attributes["+i+"][value]","");
  }
  try{
    state.me=await apiMultipart("/api/v1/accounts/update_credentials",fd,{method:"PATCH"});
    await saveCurrentAccount();toast("프로필을 저장했어요.");
    state.view="profile";state.profileMode="posts";render();
  }catch(e){toast(e.message);if(btn){btn.disabled=false;btn.textContent="저장"}}
}
function realtimeSettingsScreen(){
  const on=store.get("lenton_realtime_indicator",true)!==false;
  const body=`<div class="settings"><div class="section"><h3>실시간 연결 상태 표시</h3><div class="setting-row toggle-row"><span>상단에 연결 상태 표시</span><label><input id="realtimeToggle" type="checkbox" ${on?"checked":""}></label></div><div class="notice">온라인 상태와 네트워크 연결 여부를 작은 표시로 보여줍니다.</div></div></div>`;
  $("#app").innerHTML=standaloneShell("실시간 연결 상태 표시 설정",body);
  $("#realtimeToggle").onchange=e=>{store.set("lenton_realtime_indicator",e.target.checked);toast("설정을 저장했어요.")};bind();
}

function logout(){
  if(!confirm("로그아웃할까요?"))return;
  const key=state.session&&state.me?state.session.host+"|"+state.me.id:"";
  if(key)store.set("lenton_accounts",savedAccounts().filter(x=>x.key!==key));
  store.del("lenton_session");state.session=null;state.me=null;resetAccountState();render();
}
function standalone(){return matchMedia("(display-mode: standalone)").matches||navigator.standalone===true}

function androidNavItems(){
  const items=ANDROID?.renderer?.bottomNavItems;
  return Array.isArray(items)&&items.length?items:[
    {id:"home",glyph:"⌂"},{id:"search",glyph:"⌕"},{id:"notifications",glyph:"♢"},{id:"dm",glyph:"✉"}
  ];
}
function lentonIcon(name,cls=""){
  const c='class="lenton-icon '+esc(cls)+'" viewBox="0 0 24 24" aria-hidden="true"';
  if(name==="back")return `<svg ${c}><path d="M15.5 4.5 8 12l7.5 7.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if(name==="home")return `<svg ${c}><path d="M3.5 10.5 12 3.5l8.5 7V21h-5.7v-6.2H9.2V21H3.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
  if(name==="search")return `<svg ${c}><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15.5 15.5 5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  if(name==="notifications")return `<svg ${c}><path d="M5 16h14c-1.5-1.7-2-3.5-2-7a5 5 0 0 0-10 0c0 3.5-.5 5.3-2 7Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9.5 19a2.8 2.8 0 0 0 5 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  if(name==="dm")return `<svg ${c}><path d="M4 5h16v11H9l-5 4V5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
  if(name==="reply")return `<svg ${c}><path d="M4 5h16v11H9l-5 4V5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
  if(name==="boost")return `<svg ${c}><path d="M7 7h10l-2.5-2.5M17 17H7l2.5 2.5M17 7l-2.5 2.5M7 17l2.5-2.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if(name==="heart")return `<svg ${c}><path d="M12 20.5S4 15.7 4 9.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8 3.5c0 6.2-8 11-8 11Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
  if(name==="heartFill")return `<svg ${c}><path d="M12 20.5S4 15.7 4 9.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8 3.5c0 6.2-8 11-8 11Z" fill="currentColor"/></svg>`;
  if(name==="bookmark")return `<svg ${c}><path d="M6.5 3.5h11v17l-5.5-4-5.5 4v-17Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
  if(name==="bookmarkFill")return `<svg ${c}><path d="M6.5 3.5h11v17l-5.5-4-5.5 4v-17Z" fill="currentColor"/></svg>`;
  if(name==="share")return `<svg ${c}><circle cx="6" cy="12" r="2.3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="6" r="2.3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="18" r="2.3" fill="none" stroke="currentColor" stroke-width="2"/><path d="m8 11 7.6-3.8M8 13l7.6 3.8" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
  if(name==="more")return `<svg ${c}><circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/></svg>`;
  if(name==="profile")return `<svg ${c}><circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5.5 20c.7-4 3-6 6.5-6s5.8 2 6.5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  if(name==="edit")return `<svg ${c}><path d="M5 19h4l10-10-4-4L5 15v4Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m13.5 6.5 4 4" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
  if(name==="list")return `<svg ${c}><path d="M8 6h12M8 12h12M8 18h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>`;
  if(name==="personAdd")return `<svg ${c}><circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 19c.6-3.4 2.5-5.2 5.5-5.2 1.4 0 2.5.4 3.4 1.1M17 10v8M13 14h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  if(name==="settings")return `<svg ${c}><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5 7 7M17 17l1.5 1.5M18.5 5.5 17 7M7 17l-1.5 1.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="6.2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`;
  if(name==="update")return `<svg ${c}><path d="M12 3v12m0 0-4-4m4 4 4-4M5 20h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if(name==="photo")return `<svg ${c}><rect x="3.5" y="5" width="17" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="10" r="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="m5.5 17 4.2-4 3.1 3 2.3-2.2 3.4 3.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if(name==="camera")return `<svg ${c}><path d="M4 8h3l1.5-2.5h7L17 8h3v11H4Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="13.5" r="3.2" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
  if(name==="smile")return `<svg ${c}><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="10" r="1" fill="currentColor"/><circle cx="15" cy="10" r="1" fill="currentColor"/><path d="M8.5 14c1 1.5 2.1 2.2 3.5 2.2s2.5-.7 3.5-2.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  return "";
}
function navIcon(v){return lentonIcon(v,"nav-icon")}
function shell(title,body,opts={}){
  const av=state.me?.avatar_static||state.me?.avatar||"";
  const avatar=av? `<img src="${esc(av)}" alt="">` : '<span class="fallback">○</span>';
  const view=opts.view||state.view;
  let right="";
  if(view==="home"){
    right="";
  }else if(view==="search"){
    right=`<button class="top-icon" data-action="searchMenu" aria-label="검색 메뉴">${lentonIcon("more")}</button>`;
  }else if(view==="settings"){
    right=`<button class="top-icon" data-action="topmenu" aria-label="더보기">${lentonIcon("more")}</button>`;
  }else if(view==="notifications"){
    right=`<button class="top-icon" data-action="notificationMenu" aria-label="알림 메뉴">${lentonIcon("more")}</button>`;
  }
  return `<div class="app lenton-view-${esc(view)}">
    <header class="topbar lenton-topbar">
      <button class="topbar-avatar" data-action="drawer">${avatar}</button>
      <h1>${esc(title)}</h1>
      <div class="topbar-actions">${right}</div>
    </header>
    <main class="main">${body}</main>
    <nav class="bottom lenton-bottom" style="--nav-count:${Math.max(1,visibleNavItems().length)}">${navBar()}</nav>
    ${opts.fab?`<button class="fab lenton-fab" data-action="${esc(opts.fabAction||"compose")}">＋</button>`:""}
  </div>`;
}
function badgeText(n,overflow=false){
  n=Math.max(0,Number(n)||0);
  if(!n)return "";
  return overflow||n>99?"99+":String(n);
}
function notificationBadgeText(){return badgeText(state.notificationUnread,state.notificationUnreadOverflow)}
function dmBadgeText(){return badgeText(state.dmUnread,false)}
function nav(v){
  const txt=v==="notifications"?notificationBadgeText():v==="dm"?dmBadgeText():"";
  const badge=txt?`<span class="nav-notification-badge">${esc(txt)}</span>`:"";
  return `<button data-view="${v}" class="${state.view===v?"active":""}" aria-label="${v}">${navIcon(v)}${badge}</button>`;
}
function navBar(){return visibleNavItems().map(x=>nav(x.id)).join("")}
function refreshNotificationBadgeDom(){
  for(const [view,txt] of [["notifications",notificationBadgeText()],["dm",dmBadgeText()]]){
    document.querySelectorAll('.bottom button[data-view="'+view+'"]').forEach(btn=>{
      let badge=btn.querySelector(".nav-notification-badge");
      if(!txt){badge?.remove();return}
      if(!badge){badge=document.createElement("span");badge.className="nav-notification-badge";btn.appendChild(badge)}
      badge.textContent=txt;
    });
  }
  try{
    const total=totalAccountUnread();
    if("setAppBadge"in navigator){
      if(total>0)navigator.setAppBadge(total).catch(()=>{});
      else navigator.clearAppBadge?.().catch(()=>{});
    }
  }catch{}
}

function stableItemKey(el){
  if(el?.dataset?.statusId)return "status:"+el.dataset.statusId;
  if(el?.dataset?.conv)return "conv:"+el.dataset.conv;
  if(el?.dataset?.notificationId)return "notification:"+el.dataset.notificationId;
  return "";
}
function reconcileMain(main,html){
  const holder=document.createElement("div");holder.innerHTML=html;
  const old=new Map();
  main.querySelectorAll("[data-status-id],[data-conv],[data-notification-id]").forEach(el=>{const k=stableItemKey(el);if(k&&!old.has(k))old.set(k,el)});
  holder.querySelectorAll("[data-status-id],[data-conv],[data-notification-id]").forEach(el=>{const k=stableItemKey(el),keep=k?old.get(k):null;if(keep)el.replaceWith(keep)});
  const frag=document.createDocumentFragment();while(holder.firstChild)frag.appendChild(holder.firstChild);
  main.replaceChildren(frag);
}
function renderMainStable(title,body,opts={}){
  const view=opts.view||state.view;
  const current=document.querySelector("#app>.app");
  if(current&&current.classList.contains("lenton-view-"+view)){
    current.classList.remove("refreshing");
    const h=current.querySelector(".topbar h1");if(h)h.textContent=title;
    const main=current.querySelector(".main");if(main)reconcileMain(main,body);
    const oldFab=current.querySelector(".fab");
    if(opts.fab){
      const action=opts.fabAction||"compose";
      if(oldFab)oldFab.dataset.action=action;
      else current.insertAdjacentHTML("beforeend",`<button class="fab lenton-fab" data-action="${esc(action)}">＋</button>`);
    }else oldFab?.remove();
    bind();return;
  }
  $("#app").innerHTML=shell(title,body,opts);bind();
}

function loginView(){
  const install=!standalone()?'<div class="install-card"><b>아이폰/아이패드 설치</b><p>Safari 공유 버튼 → <b>홈 화면에 추가</b> → <b>웹 앱으로 열기</b></p></div>':"";
  return `<div class="login">
    <img class="logo" src="./icon-192.png" alt="렌톤">
    <h1>렌톤</h1>
    <p class="tagline">마스토돈은 그대로, 더 편하고 예쁘게.</p>
    ${install}
    <div class="login-form">
      <input id="server" class="field" inputmode="url" autocapitalize="none" autocomplete="off" placeholder="예: occm.cc">
      <button id="loginBtn" class="primary" ${state.busy?"disabled":""}>${state.busy?"로그인 준비 중…":"Mastodon으로 로그인"}</button>
    </div>
    <p class="login-note">로그인 토큰은 이 기기 브라우저에만 저장합니다.</p>
  </div>`;
}

function mediaMarkup(attachments=[]){
  if(!Array.isArray(attachments)||!attachments.length)return "";
  const items=attachments.map((m,i)=>{
    const type=m.type||"unknown",url=m.url||m.remote_url||"",preview=m.preview_url||url;
    const desc=m.description||"";
    if(type==="video"||type==="gifv"){
      return `<div class="media-item media-video"><video controls playsinline preload="metadata" poster="${esc(preview)}"><source src="${esc(url)}"></video></div>`;
    }
    if(type==="audio"){
      return `<div class="media-item media-audio"><audio controls preload="metadata" src="${esc(url)}"></audio></div>`;
    }
    return `<button class="media-item media-image" data-media-url="${esc(url)}" data-media-alt="${esc(desc)}"><img src="${esc(preview)}" alt="${esc(desc)}" loading="lazy"></button>`;
  }).join("");
  return `<div class="media-grid media-count-${Math.min(attachments.length,4)}">${items}</div>`;
}
function visibleReplyCount(raw,items=[]){
  const st=raw?.reblog||raw||{},id=String(st.id||"");
  if(!id)return Number(st.replies_count||0);
  const authors=new Set();
  for(const item of items||[]){
    const child=item?.reblog||item||{};
    if(String(child.in_reply_to_id||"")===id)authors.add(String(child.account?.id||child.id||""));
  }
  return Math.max(Number(st.replies_count||0),authors.size);
}
function statusCard(raw,opts={}){
  const st=raw.reblog||raw, boosted=!!raw.reblog, a=st.account||{};
  const boostAllowed=st?.rebloggable!==false&&!["private","direct"].includes(String(st?.visibility||""));
  const boostLine=boosted?`<div class="boosted">↻ ${renderEmojiText(raw.account?.display_name||raw.account?.username||"",raw.account?.emojis||[])}님이 부스트</div>`:"";
  const pinnedLine=opts.pinned?'<div class="profile-pinned-label">📌 고정됨</div>':"";
  const replyCount=opts.replyCountOverride===undefined||opts.replyCountOverride===null?Number(st.replies_count||0):Number(opts.replyCountOverride||0);
  const cw=st.spoiler_text? `<div class="cw"><span>CW · ${renderEmojiText(st.spoiler_text,st.emojis||[])}</span> <button class="pill" data-action="togglecw">보기</button></div>`:"";
  const hidden=st.spoiler_text?' style="display:none" data-cwbody':"";
  return `<article class="status lenton-status" data-status-id="${st.id}">
    ${boostLine}${pinnedLine}
    <div class="status-head">
      <button class="avatar-button" data-profile="${esc(a.id||"")}"><img class="avatar" src="${esc(a.avatar_static||a.avatar||"")}" alt=""></button>
      <div class="status-main">
        <div class="lenton-status-top">
          <button class="author-line" data-profile="${esc(a.id||"")}"><span class="name">${renderEmojiText(a.display_name||a.username||"",a.emojis||[])}</span><span class="acctline">&nbsp;@${esc(a.acct||"")} · ${fmtTime(st.created_at)}</span></button>
          <button class="status-more" data-action="statusmenu" data-id="${st.id}" aria-label="더보기">${lentonIcon("more")}</button>
        </div>
        ${cw}<div class="content"${hidden}>${renderRichText(st.content||"")}</div>
        ${mediaMarkup(st.media_attachments||[])}
        <div class="actions lenton-actions">
          <button data-action="reply" data-id="${st.id}" aria-label="답글">${lentonIcon("reply")} <span class="count">${replyCount>0?replyCount:""}</span></button>
          <button class="boost ${st.reblogged?"on":""} ${boostAllowed?"":"unavailable"}" data-action="boost" data-id="${st.id}" aria-label="${boostAllowed?"부스트":"부스트할 수 없는 게시물"}" ${boostAllowed?"":"disabled"}>${boostAllowed?lentonIcon("boost"):'<span class="boost-unavailable-mark">×</span>'} <span class="count">${boostAllowed?(st.reblogs_count||""):""}</span></button>
          <button class="fav ${st.favourited?"on":""}" data-action="fav" data-id="${st.id}" aria-label="좋아요">${lentonIcon(st.favourited?"heartFill":"heart")} <span class="count">${st.favourites_count||""}</span></button>
          <button class="bookmark ${st.bookmarked?"on":""}" data-action="bookmark" data-id="${st.id}" aria-label="북마크">${lentonIcon(st.bookmarked?"bookmarkFill":"bookmark")}</button>
        </div>
      </div>
    </div>
  </article>`;
}

function hiddenListIds(){return new Set(store.get(scopedKey("hidden_lists"),[])||[])}
function setListHidden(id,hidden){
  const set=hiddenListIds();
  if(hidden)set.add(id);else set.delete(id);
  store.set(scopedKey("hidden_lists"),[...set]);
}
async function loadLists(){try{state.lists=await api("/api/v1/lists")}catch{state.lists=[]}}
async function loadAllFollowing({fresh=false}={}){
  if(!state.me) state.me=await api("/api/v1/accounts/verify_credentials");
  const cacheKey=scopedKey("following_cache_v1"),cached=store.get(cacheKey,null);
  if(!fresh&&cached?.at&&Date.now()-Number(cached.at)<300000&&Array.isArray(cached.items))return cached.items;
  const out=[],seen=new Set();let maxId="";
  for(let page=0;page<50;page++){
    const query={limit:"80"};if(maxId)query.max_id=maxId;
    const a=await api(`/api/v1/accounts/${state.me.id}/following`,{query});
    if(!Array.isArray(a)||!a.length)break;
    for(const ac of a){if(ac?.id&&!seen.has(ac.id)){seen.add(ac.id);out.push(ac)}}
    if(a.length<80)break;
    const next=a[a.length-1]?.id||"";
    if(!next||next===maxId)break;maxId=next;
  }
  store.set(cacheKey,{at:Date.now(),items:out});
  return out;
}
function statusId(raw){return raw?.id||raw?.reblog?.id||""}
function nonDirect(raw){return raw&&raw.visibility!=="direct"}
function lentonPublicStatus(raw){
  if(!raw||!raw.account)return false;
  const cfg=ANDROID?.timeline?.public||{};
  const author=raw.account.id||"",me=state.me?.id||"";
  if(!author)return false;
  if(cfg.excludeDirect!==false&&raw.visibility==="direct")return false;
  if(cfg.excludeBoosts!==false&&raw.reblog)return false;
  if(cfg.excludeReplies!==false&&raw.in_reply_to_id!==null&&raw.in_reply_to_id!==undefined&&String(raw.in_reply_to_id)!=="")return false;
  if(cfg.excludeOwnPosts!==false&&me&&String(author)===String(me))return false;
  return true;
}
function mergeChronological(home,pub,allowed){
  const out=[],seen=new Set();
  const add=raw=>{if(!nonDirect(raw))return;const id=statusId(raw);if(id&&seen.has(id))return;if(id)seen.add(id);out.push(raw)};
  for(const raw of home||[])add(raw);
  for(const raw of pub||[]){const author=raw?.account?.id||"";if(author&&allowed.has(author))add(raw)}
  out.sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
  return out;
}
async function loadLentonHome(chronological){
  const following=await loadAllFollowing(),allowed=new Set(following.map(x=>x.id));if(state.me?.id)allowed.add(String(state.me.id));
  if(chronological){
    const [home,pub]=await Promise.all([
      api("/api/v1/timelines/home",{query:{limit:"40"}}),
      api("/api/v1/timelines/public",{query:{limit:"40"}})
    ]);
    return mergeChronological(home,pub,allowed);
  }

  const [firstHome,firstPub]=await Promise.all([
    api("/api/v1/timelines/home",{query:{limit:"40"}}),
    api("/api/v1/timelines/public",{query:{limit:"40"}})
  ]);
  const collected=[],seen=new Set();
  let home=firstHome||[],pub=firstPub||[],homeCursor=home[home.length-1]?.id||"",homeDone=false;

  const addPage=()=>{
    for(const raw of home){
      if(!lentonPublicStatus(raw))continue;
      const id=statusId(raw);if(id&&seen.has(id))continue;if(id)seen.add(id);
      collected.push(raw);if(collected.length>=(ANDROID?.timeline?.public?.targetInitialItems||30))return;
    }
    for(const raw of pub){
      if(!lentonPublicStatus(raw))continue;
      const author=raw?.account?.id||"";if(!allowed.has(author))continue;
      const id=statusId(raw);if(id&&seen.has(id))continue;if(id)seen.add(id);
      collected.push(raw);if(collected.length>=(ANDROID?.timeline?.public?.targetInitialItems||30))return;
    }
  };

  const target=ANDROID?.timeline?.public?.targetInitialItems||30,maxScans=ANDROID?.timeline?.public?.maxHomeScans||6;
  for(let scan=0;scan<maxScans&&collected.length<target;scan++){
    if(scan>0){
      if(homeDone)break;
      const query={limit:"40"};if(homeCursor)query.max_id=homeCursor;
      const rawHome=await api("/api/v1/timelines/home",{query});
      const next=rawHome?.[rawHome.length-1]?.id||"";
      home=rawHome||[];pub=[];
      if(!home.length||!next||next===homeCursor)homeDone=true;
      else homeCursor=next;
    }
    addPage();
  }
  collected.sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
  return collected.slice(0,80);
}
async function loadLentonHomePair({maxScans=1,initialHome=null}={}){
  const firstHome=Array.isArray(initialHome)?initialHome:await api("/api/v1/timelines/home",{query:{limit:"40"}});
  const homeData=(firstHome||[]).filter(nonDirect);
  const collected=[],seen=new Set(),target=ANDROID?.timeline?.public?.targetInitialItems||30,scanLimit=Math.max(1,Number(maxScans)||1);
  let home=firstHome||[],homeCursor=home[home.length-1]?.id||"",homeDone=false;
  const addPage=()=>{
    for(const raw of home){
      if(!lentonPublicStatus(raw))continue;
      const id=statusId(raw);if(id&&seen.has(id))continue;if(id)seen.add(id);
      collected.push(raw);if(collected.length>=target)return;
    }
  };
  for(let scan=0;scan<scanLimit&&collected.length<target;scan++){
    if(scan>0){
      if(homeDone)break;
      const query={limit:"40"};if(homeCursor)query.max_id=homeCursor;
      const rawHome=await api("/api/v1/timelines/home",{query});
      const next=rawHome?.[rawHome.length-1]?.id||"";
      home=rawHome||[];
      if(!home.length||!next||next===homeCursor)homeDone=true;else homeCursor=next;
    }
    addPage();
  }
  collected.sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
  return {home:homeData,public:collected.slice(0,80)};
}

function homeSnapshotRead(){
  const snap=store.get(scopedKey("home_snapshot_v3"),null);
  if(!snap?.at||Date.now()-Number(snap.at)>15*60*1000)return null;
  const data=snap.data;
  return data&&Array.isArray(data.home)&&Array.isArray(data.public)?data:null;
}
function homeSnapshotWrite(data){
  try{if(data&&Array.isArray(data.home)&&Array.isArray(data.public))store.set(scopedKey("home_snapshot_v3"),{at:Date.now(),data})}catch{}
}
async function loadHomeQuickPair(limit=20){
  const home=await api("/api/v1/timelines/home",{query:{limit:String(limit)}});
  const clean=(home||[]).filter(nonDirect);
  const pub=clean.filter(lentonPublicStatus).slice(0,ANDROID?.timeline?.public?.targetInitialItems||30);
  return {data:{home:clean,public:pub},rawHome:home||[]};
}
function renderHomePagerData(data,{preserveScroll=false}={}){
  if(!data)return;
  const y=preserveScroll?(window.scrollY||document.documentElement.scrollTop||0):null;
  const chronologicalLabel=ANDROID?.homeTabs?.chronological||"시간순",publicLabel=ANDROID?.homeTabs?.public||"퍼블릭";
  state.homePagerData=data;
  const homeData=data.home||[];
  state.timelineItems=data[state.homeMode]||homeData;
  const tabs='<div class="home-tabs" data-home-tabs><button data-home-mode="home" class="'+(state.homeMode==="home"?"active":"")+'">'+esc(chronologicalLabel)+'</button><button data-home-mode="public" class="'+(state.homeMode==="public"?"active":"")+'">'+esc(publicLabel)+'</button><span class="home-tab-indicator" aria-hidden="true"></span></div>';
  const visibleLists=state.lists.filter(x=>!hiddenListIds().has(x.id));
  const chips=(visibleLists.length||state.lists.length)?'<div class="chips">'+visibleLists.map(x=>'<button class="chip" data-list="'+x.id+'">'+esc(x.title)+'</button>').join("")+'<button class="chip" data-action="newlist">＋ 리스트</button></div>':"";
  renderMainStable("홈",tabs+chips+buildHomePager(state.homeMode,data),{view:"home",fab:true});
  requestAnimationFrame(()=>{
    syncHomePagerUi(state.homeMode,false);
    if(y!==null)window.scrollTo(0,y);
  });
}
function mergeNewestTimeline(fresh=[],existing=[],limit=80){
  const out=[],seen=new Set();
  for(const raw of [...fresh,...existing]){
    if(!raw)continue;
    const id=statusId(raw);if(id&&seen.has(id))continue;if(id)seen.add(id);
    out.push(raw);
  }
  out.sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
  return out.slice(0,limit);
}
function updatePublicTimelinePage(items,{preserveScroll=true}={}){
  const data=state.homePagerData||{home:[],public:[]};
  data.public=items||[];state.homePagerData=data;
  homeSnapshotWrite(data);
  if(state.homeMode==="public")state.timelineItems=data.public;
  const page=document.querySelector('[data-home-page="public"]');
  if(!page||state.view!=="home"||state.listId)return;
  const y=preserveScroll?(window.scrollY||document.documentElement.scrollTop||0):null;
  page.innerHTML=homePageHtml(data.public,"public");
  bind();
  requestAnimationFrame(()=>{
    syncHomePagerUi(state.homeMode,false);
    if(y!==null)window.scrollTo(0,y);
  });
}
function cachedFollowingIdSet(){
  const cached=store.get(scopedKey("following_cache_v1"),null);
  if(!cached?.at||Date.now()-Number(cached.at)>300000||!Array.isArray(cached.items))return null;
  const ids=new Set(cached.items.map(x=>String(x?.id||"")).filter(Boolean));
  if(state.me?.id)ids.add(String(state.me.id));
  return ids;
}
async function ensurePublicTimelineFilled(){
  if(state.publicFillPromise)return state.publicFillPromise;
  state.publicFillPromise=(async()=>{
    const cfg=ANDROID?.timeline?.public||{},target=Math.max(10,Number(cfg.targetInitialItems)||30),maxScans=Math.max(1,Number(cfg.maxHomeScans)||6);
    const base=state.homePagerData||{home:[],public:[]};
    let collected=mergeNewestTimeline((base.public||[]).filter(lentonPublicStatus),(base.home||[]).filter(lentonPublicStatus),80);
    updatePublicTimelinePage(collected);

    const knownAllowed=new Set((base.home||[]).map(x=>String(x?.account?.id||"")).filter(Boolean));
    if(state.me?.id)knownAllowed.add(String(state.me.id));
    const publicPagePromise=api("/api/v1/timelines/public",{query:{limit:"40"}}).catch(()=>[]);
    const fullFollowingPromise=loadAllFollowing().then(rows=>{
      const set=new Set((rows||[]).map(x=>String(x?.id||"")).filter(Boolean));
      if(state.me?.id)set.add(String(state.me.id));
      return set;
    }).catch(()=>null);

    // Fast path: use a cached following set (or accounts already seen in HOME)
    // against one public endpoint request while HOME pagination fills in parallel.
    const cachedAllowed=cachedFollowingIdSet();
    publicPagePromise.then(rows=>{
      const allowed=cachedAllowed||knownAllowed;
      const extra=(rows||[]).filter(x=>allowed.has(String(x?.account?.id||""))&&lentonPublicStatus(x));
      if(extra.length){
        collected=mergeNewestTimeline(extra,collected,80);
        updatePublicTimelinePage(collected);
      }
    }).catch(()=>{});

    let cursor=(base.home||[])[(base.home||[]).length-1]?.id||"",lastCursor="";
    for(let scan=0;scan<maxScans&&collected.length<target;scan++){
      const query={limit:"40"};if(cursor)query.max_id=cursor;
      const rows=await api("/api/v1/timelines/home",{query}).catch(()=>[]);
      if(!Array.isArray(rows)||!rows.length)break;
      const eligible=rows.filter(lentonPublicStatus);
      if(eligible.length){
        collected=mergeNewestTimeline(eligible,collected,80);
        updatePublicTimelinePage(collected);
      }
      const next=rows[rows.length-1]?.id||"";
      if(!next||next===cursor||next===lastCursor)break;
      lastCursor=cursor;cursor=next;
    }

    // Android also knows the public endpoint. Once the full following set is
    // available, merge any followed-account public originals from that page.
    const [allPublic,fullAllowed]=await Promise.all([publicPagePromise,fullFollowingPromise]);
    if(fullAllowed){
      const extra=(allPublic||[]).filter(x=>fullAllowed.has(String(x?.account?.id||""))&&lentonPublicStatus(x));
      if(extra.length){
        collected=mergeNewestTimeline(extra,collected,80);
        updatePublicTimelinePage(collected);
      }
    }
    return collected;
  })().finally(()=>{state.publicFillPromise=null});
  return state.publicFillPromise;
}
async function refreshHomeIncremental(){
  if(state.homeRefreshPromise)return state.homeRefreshPromise;
  state.homeRefreshPromise=(async()=>{
    const base=state.homePagerData?.home?.length?state.homePagerData:homeSnapshotRead();
    if(!base?.home?.length){
      const quick=await loadHomeQuickPair(20);
      state.homePagerData=quick.data;homeSnapshotWrite(quick.data);
      if(state.view==="home"&&!state.listId)renderHomePagerData(quick.data);
      return quick.data;
    }
    const newest=statusId(base.home[0]),query={limit:"20"};
    if(newest)query.since_id=newest;
    const raw=await api("/api/v1/timelines/home",{query});
    const freshHome=(raw||[]).filter(nonDirect);
    if(!freshHome.length)return base;
    const freshPublic=freshHome.filter(lentonPublicStatus);
    const data={
      home:mergeNewestTimeline(freshHome,base.home),
      public:mergeNewestTimeline(freshPublic,base.public)
    };
    state.homePagerData=data;homeSnapshotWrite(data);
    if(state.view==="home"&&!state.listId)renderHomePagerData(data,{preserveScroll:true});
    return data;
  })().finally(()=>{state.homeRefreshPromise=null});
  return state.homeRefreshPromise;
}
async function refreshHomeAfterPost(){
  try{await refreshHomeIncremental()}catch{}
}
function homeModes(){return ["home","public"]}
function homePageHtml(items,mode){
  return (items?.length?items.map(x=>statusCard(x,{replyCountOverride:visibleReplyCount(x,items)})).join(""):'<div class="center">표시할 게시물이 없어요.</div>')+
    '<button class="load-more" data-action="loadmorehome" data-home-load-mode="'+mode+'">더 불러오기</button>';
}
function buildHomePager(mode,data){
  const modes=homeModes(),index=Math.max(0,modes.indexOf(mode));
  return '<div class="home-pager" data-home-pager><div class="home-pager-track" data-home-track style="transform:translate3d(-'+(index*100)+'%,0,0)">'+
    modes.map(m=>'<section class="home-pager-page" data-home-page="'+m+'">'+homePageHtml(data[m]||[],m)+'</section>').join("")+
    '</div></div>';
}
function syncHomePagerUi(mode,animate=true){
  const modes=homeModes(),index=Math.max(0,modes.indexOf(mode));
  const pager=document.querySelector("[data-home-pager]"),track=document.querySelector("[data-home-track]"),tabs=document.querySelector("[data-home-tabs]");
  if(!pager||!track||!tabs)return;
  const width=Math.max(1,pager.clientWidth);
  track.style.transition=animate?"transform 190ms cubic-bezier(.2,.75,.25,1)":"none";
  track.style.transform="translate3d("+(-index*width)+"px,0,0)";
  tabs.querySelectorAll("[data-home-mode]").forEach(b=>b.classList.toggle("active",b.dataset.homeMode===mode));
  const indicator=tabs.querySelector(".home-tab-indicator"),tabW=tabs.clientWidth/modes.length;
  if(indicator){indicator.style.transition=animate?"transform 190ms cubic-bezier(.2,.75,.25,1)":"none";indicator.style.transform="translate3d("+(index*tabW+(tabW-36)/2)+"px,0,0)"}
  const page=track.querySelector('[data-home-page="'+mode+'"]');
  if(page)requestAnimationFrame(()=>{pager.style.height=Math.max(1,page.scrollHeight)+"px"});
}
function setHomePagerMode(mode,animate=true){
  if(!homeModes().includes(mode))mode="home";
  state.homeMode=mode;state.listId=null;state.timelineItems=state.homePagerData?.[mode]||[];
  syncHomePagerUi(mode,animate);
  if(mode==="public")setTimeout(()=>ensurePublicTimelineFilled().catch(()=>{}),0);
}
async function homeView({silent=false,forceFresh=false}={}){
  state.busy=true;
  try{
    if(state.listId){
      if(!silent)renderLoadingShell("홈");
      const data=await api("/api/v1/timelines/list/"+state.listId,{query:{limit:"30"}});
      const visibleLists=state.lists.filter(x=>!hiddenListIds().has(x.id));
      const chips=(visibleLists.length||state.lists.length)?'<div class="chips">'+visibleLists.map(x=>'<button class="chip '+(state.listId===x.id?"active":"")+'" data-list="'+x.id+'">'+esc(x.title)+'</button>').join("")+'<button class="chip" data-action="newlist">＋ 리스트</button></div>':"";
      state.timelineItems=data;
      renderMainStable(state.lists.find(x=>x.id===state.listId)?.title||"리스트",chips+homePageHtml(data,"list"),{view:"home",fab:true});
      return;
    }

    const cached=state.homePagerData?.home?.length?state.homePagerData:homeSnapshotRead();
    if(cached){
      state.homePagerData=cached;
      renderHomePagerData(cached);
      if(forceFresh){
        await refreshHomeIncremental();
        return;
      }
    }else if(!silent){
      renderLoadingShell("홈");
    }

    const listsPromise=state.lists.length?Promise.resolve():loadLists();

    // First paint only needs a small Mastodon home page.
    let quickRawHome=null;
    if(!cached){
      try{
        const quick=await loadHomeQuickPair(20);
        quickRawHome=quick.rawHome;
        if(state.view==="home"&&!state.listId){
          renderHomePagerData(quick.data);
          homeSnapshotWrite(quick.data);
        }
      }catch{}
    }

    // Keep HOME immediate. Lists may finish in the background; Public is filled
    // on demand when its tab is opened so HOME refresh never waits for it.
    listsPromise.catch(()=>{});
    if(state.homeMode==="public")setTimeout(()=>ensurePublicTimelineFilled().catch(()=>{}),0);
  }catch(e){
    if(!state.homePagerData?.home?.length)renderMainStable("홈",'<div class="center">타임라인을 불러오지 못했어요.<br><br>'+esc(e.message)+'<br><br><button class="primary" data-action="reload">다시 시도</button></div>',{view:"home",fab:true});
  }finally{
    state.busy=false;
    bind();
  }
}
async function loadMoreHome(){
  if(state.timelineLoadingMore)return;
  const last=state.timelineItems[state.timelineItems.length-1];const maxId=statusId(last);
  if(!maxId){toast("더 불러올 게시물이 없어요.");return}
  const btn=document.querySelector('[data-action="loadmorehome"]');state.timelineLoadingMore=true;if(btn){btn.disabled=true;btn.textContent="불러오는 중…"}
  try{
    let more=[];
    if(state.listId){
      more=await api(`/api/v1/timelines/list/${state.listId}`,{query:{limit:"40",max_id:maxId}});
    }else if(state.homeMode==="public"){
      let cursor=maxId;
      for(let scan=0;scan<Math.max(2,Number(ANDROID?.timeline?.public?.maxHomeScans||6))&&more.length<20;scan++){
        const rows=await api("/api/v1/timelines/home",{query:{limit:"40",max_id:cursor}});
        if(!Array.isArray(rows)||!rows.length)break;
        more.push(...rows.filter(lentonPublicStatus));
        const next=rows[rows.length-1]?.id||"";
        if(!next||next===cursor)break;cursor=next;
      }
    }else{
      more=await api("/api/v1/timelines/home",{query:{limit:"40",max_id:maxId}});
    }
    const seen=new Set(state.timelineItems.map(statusId));
    more=more.filter(x=>{const id=statusId(x);if(!id||seen.has(id))return false;seen.add(id);return true});
    if(!more.length){if(btn)btn.textContent="더 불러올 게시물이 없어요.";return}
    state.timelineItems.push(...more);
    if(btn){btn.insertAdjacentHTML("beforebegin",more.map(x=>statusCard(x,{replyCountOverride:visibleReplyCount(x,state.timelineItems)})).join(""));btn.disabled=false;btn.textContent="더 불러오기"}
    bind();
  }catch(e){toast(e.message);if(btn){btn.disabled=false;btn.textContent="다시 시도"}}
  finally{state.timelineLoadingMore=false}
}
function scrollKey(){return state.view+(state.view==="home"?":"+state.homeMode+":"+(state.listId||""):"")}
function rememberScroll(){state.scrolls[scrollKey()]=window.scrollY||document.documentElement.scrollTop||0}
function restoreScroll(){const y=state.scrolls[scrollKey()];if(typeof y==="number")requestAnimationFrame(()=>window.scrollTo(0,y))}

function pushNavSnapshot(){
  const app=$("#app");if(!app||!app.innerHTML)return;
  const snap={
    html:app.innerHTML,view:state.view,homeMode:state.homeMode,listId:state.listId,
    scrollY:window.scrollY||document.documentElement.scrollTop||0,
    profileAccount:state.profileAccount,profileRelationship:state.profileRelationship,
    profileReplies:state.profileReplies,profileMode:state.profileMode,currentConversation:state.currentConversation
  };
  const last=state.navStack[state.navStack.length-1];
  if(last&&last.html===snap.html&&last.scrollY===snap.scrollY)return;
  state.navStack.push(snap);if(state.navStack.length>30)state.navStack.shift();
}
function clearGestureBindingMarks(root=document){
  const marks=["interactiveSwipe","homeSwipe","lentonSwipe","edgeDrawerSwipe","closeSwipe","profileSwipe","backSwipe","pullRefresh"];
  root.querySelectorAll?.("[data-interactive-swipe],[data-home-swipe],[data-lenton-swipe],[data-edge-drawer-swipe],[data-close-swipe],[data-profile-swipe],[data-back-swipe],[data-pull-refresh]").forEach(el=>{
    for(const k of marks)if(k in el.dataset)delete el.dataset[k];
  });
}
function goBackScreen(){
  const snap=state.navStack.pop();
  if(snap){
    state.view=snap.view;state.homeMode=snap.homeMode;state.listId=snap.listId;
    state.profileAccount=snap.profileAccount;state.profileRelationship=snap.profileRelationship;
    state.profileReplies=snap.profileReplies;state.profileMode=snap.profileMode||"posts";state.currentConversation=snap.currentConversation;
    $("#app").innerHTML=snap.html;
    clearGestureBindingMarks($("#app"));
    bind();
    requestAnimationFrame(()=>{window.scrollTo(0,snap.scrollY||0);attachLentonGestures()});
    return;
  }
  state.profileAccount=null;state.profileRelationship=null;state.currentConversation=null;
  if(state.view!=="home"){state.view=state.returnView||"home";render();return}
  if(history.length>1)history.back();
}
function renderLoadingShell(title){
  const current=document.querySelector("#app>.app");
  if(current)return;
  if(document.querySelector("#app>.standalone-page"))return;
  $("#app").innerHTML=shell(title,'<div class="center lenton-loading">불러오는 중…</div>',{fab:title==="홈"});
  bind();
}


const NOTIFICATION_FILTER_DEFS=[
  ["mention","멘션/답글"],["status","계정 새 게시물"],["reblog","부스트"],["favourite","좋아요"],
  ["follow","팔로워"],["follow_request","팔로우 요청"],["poll","투표 결과"],["update","게시물 수정"],
  ["quote","Quotes"],["quoted_update","인용한 게시물 수정"],["added_to_collection","컬렉션 추가"],
  ["collection_update","컬렉션 변경"],["admin.sign_up","관리자: 가입"],["admin.report","관리자: 신고"]
];
function notificationFilterPrefs(){
  const saved=store.get(scopedKey("notification_filter"),null),out={};
  for(const [key] of NOTIFICATION_FILTER_DEFS)out[key]=saved?.[key]!==false;
  return out;
}
function saveNotificationFilterPrefs(prefs){store.set(scopedKey("notification_filter"),prefs)}
function pushAlertPrefs(){
  const d={dm:true,mention:true,status:true,interactions:true,follow:true};
  return {...d,...(store.get(scopedKey("push_alerts"),{})||{})};
}
function savePushAlertPrefs(p){store.set(scopedKey("push_alerts"),p)}
function pushAlertForm(prefs=pushAlertPrefs()){
  const mention=!!(prefs.mention||prefs.dm);
  return {
    "data[alerts][mention]":mention?"true":"false",
    "data[alerts][follow]":prefs.follow?"true":"false",
    "data[alerts][follow_request]":prefs.follow?"true":"false",
    "data[alerts][favourite]":prefs.interactions?"true":"false",
    "data[alerts][reblog]":prefs.interactions?"true":"false",
    "data[alerts][poll]":"true",
    "data[alerts][status]":prefs.status?"true":"false",
    "data[alerts][update]":"true",
    "data[policy]":"all"
  };
}

function pushAlertPrefsForAccount(entry){
  const saved=store.get("lenton_push_alerts_"+String(entry?.key||""),{})||{};
  return {dm:true,mention:true,status:true,interactions:true,follow:true,...saved};
}
function pushEnabledStorageKey(entry){return "lenton_push_enabled_"+String(entry?.key||"")}
function pushEnabledForAccount(entry){
  if(!entry?.key)return true;
  return store.get(pushEnabledStorageKey(entry),true)!==false;
}
function setPushEnabledForAccount(entry,on){
  if(entry?.key)store.set(pushEnabledStorageKey(entry),!!on);
}
function pushAlertFormForAccount(entry){return pushAlertForm(pushAlertPrefsForAccount(entry))}
async function apiWithSession(session,path,{method="GET",form=null,query=null}={}){
  if(!session?.host||!session?.token)throw new Error("계정 세션이 없습니다.");
  let url="https://"+session.host+path;
  if(query){const q=new URLSearchParams(query);url+="?"+q}
  const headers={Accept:"application/json",Authorization:"Bearer "+session.token},opts={method,headers};
  if(form){headers["Content-Type"]="application/x-www-form-urlencoded;charset=UTF-8";opts.body=form instanceof URLSearchParams?form:new URLSearchParams(form)}
  const res=await fetch(url,opts),txt=await res.text();let data=null;try{data=txt?JSON.parse(txt):null}catch{data=txt}
  if(!res.ok)throw new Error((data&&data.error)||("HTTP "+res.status));
  return data;
}
function arrayBufferEqual(a,b){
  if(!a||!b)return false;const x=new Uint8Array(a),y=new Uint8Array(b);if(x.length!==y.length)return false;
  for(let i=0;i<x.length;i++)if(x[i]!==y[i])return false;
  return true;
}
async function accountPushRegistration(entry){
  const slot=Number(entry?.pushSlot);if(!Number.isInteger(slot)||slot<0)throw new Error("알림 슬롯이 없습니다.");
  return navigator.serviceWorker.register("./push/account-sw.js",{scope:"./push/a"+slot+"/",updateViaCache:"none"});
}
async function registerPushForAccount(entry,{force=false}={}){
  if(!entry?.session)return false;
  if(!force&&!pushEnabledForAccount(entry))return false;
  const inst=await apiWithSession(entry.session,"/api/v2/instance");
  const vapid=inst?.configuration?.vapid?.public_key||entry.session?.vapid_key;
  if(!vapid)throw new Error((entry.display_name||entry.acct||"계정")+" 서버의 VAPID 키를 찾지 못했습니다.");
  const reg=await accountPushRegistration(entry);
  await reg.update().catch(()=>{});
  const wanted=urlBase64ToUint8Array(vapid),old=await reg.pushManager.getSubscription();
  let sub=old;
  if(old&&!arrayBufferEqual(old.options?.applicationServerKey,wanted.buffer)){await old.unsubscribe().catch(()=>{});sub=null}
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:wanted});
  const j=sub.toJSON(),form={
    "subscription[endpoint]":j.endpoint,
    "subscription[keys][p256dh]":j.keys.p256dh,
    "subscription[keys][auth]":j.keys.auth,
    "subscription[standard]":"true",
    ...pushAlertFormForAccount(entry)
  };
  try{await apiWithSession(entry.session,"/api/v1/push/subscription",{method:"POST",form})}
  catch(firstError){
    const legacy={...form};delete legacy["subscription[standard]"];
    try{await apiWithSession(entry.session,"/api/v1/push/subscription",{method:"POST",form:legacy})}catch{throw firstError}
  }
  return true;
}
async function ensureAllAccountPushSubscriptions({quiet=true}={}){
  if(!("serviceWorker"in navigator)||!("PushManager"in window)||!("Notification"in window))return false;
  if(Notification.permission!=="granted")return false;
  await syncSavedAccountsToPushMeta();
  const list=savedAccounts();
  let ok=0,failed=0,enabled=0;
  for(const entry of list){
    if(!pushEnabledForAccount(entry))continue;
    enabled++;
    try{await registerPushForAccount(entry);ok++}catch{failed++}
  }
  const root=await navigator.serviceWorker.getRegistration("./").catch(()=>null);
  const legacy=await root?.pushManager?.getSubscription?.().catch(()=>null);
  if(legacy)await legacy.unsubscribe().catch(()=>{});
  if(!quiet)toast(failed?("알림 "+ok+"개 계정 연결, "+failed+"개 실패"):(enabled?("저장된 "+ok+"개 계정의 빠른 알림을 연결했어요."):"켜진 푸시 알림 계정이 없어요."));
  return ok>0||enabled===0;
}
async function cleanupAccountPush(entry){
  try{await apiWithSession(entry.session,"/api/v1/push/subscription",{method:"DELETE"})}catch{}
  try{
    const reg=await navigator.serviceWorker.getRegistration("./push/a"+Number(entry.pushSlot)+"/");
    const sub=await reg?.pushManager?.getSubscription?.();await sub?.unsubscribe?.();await reg?.unregister?.();
  }catch{}
}

async function syncPushPreferences({quiet=false}={}){
  try{
    if(!("serviceWorker"in navigator)||!("PushManager"in window)||Notification.permission!=="granted")return false;
    const key=currentAccountKey(),entry=savedAccounts().find(x=>x.key===key);
    if(!entry||!pushEnabledForAccount(entry))return false;
    await registerPushForAccount(entry);
    await api("/api/v1/push/subscription",{method:"PUT",form:pushAlertForm()});
    if(!quiet)toast("알림 종류를 저장했어요.");
    return true;
  }catch(e){
    if(!quiet)toast("알림 종류 저장 실패: "+e.message);
    return false;
  }
}
function closeNotificationPopup(){document.querySelector(".notification-menu-shade")?.remove()}
function openNotificationMenu(){
  closeNotificationPopup();
  const shade=document.createElement("div");shade.className="notification-menu-shade";
  shade.innerHTML='<div class="notification-menu-popup"><button data-notification-menu="filter">알림 필터</button><button data-notification-menu="clear">알림 모두 지우기</button></div>';
  document.body.append(shade);
  shade.onclick=e=>{if(e.target===shade)closeNotificationPopup()};
  shade.querySelectorAll("[data-notification-menu]").forEach(b=>b.onclick=async()=>{
    const a=b.dataset.notificationMenu;closeNotificationPopup();
    if(a==="filter")openNotificationFilter();
    else if(a==="clear"){
      if(!confirm("알림을 모두 지울까요?"))return;
      try{await api("/api/v1/notifications/clear",{method:"POST",form:{}});notificationsView(false)}catch(e){toast(e.message)}
    }
  });
}
function openNotificationFilter(){
  document.querySelector(".notification-filter-shade")?.remove();
  const prefs=notificationFilterPrefs(),shade=document.createElement("div");shade.className="notification-filter-shade";
  shade.innerHTML='<section class="notification-filter-dialog"><h2>알림 필터</h2><div class="notification-filter-list">'+
    NOTIFICATION_FILTER_DEFS.map(([key,label])=>'<label><input type="checkbox" data-notification-filter="'+esc(key)+'" '+(prefs[key]?"checked":"")+'><span>'+esc(label)+'</span></label>').join("")+
    '</div><footer><button type="button" data-filter-cancel>취소</button><button type="button" class="apply" data-filter-apply>적용</button></footer></section>';
  document.body.append(shade);
  shade.onclick=e=>{if(e.target===shade)shade.remove()};
  shade.querySelector("[data-filter-cancel]").onclick=()=>shade.remove();
  shade.querySelector("[data-filter-apply]").onclick=()=>{
    shade.querySelectorAll("[data-notification-filter]").forEach(x=>prefs[x.dataset.notificationFilter]=x.checked);
    saveNotificationFilterPrefs(prefs);shade.remove();notificationsView(false);
  };
}

function localNotificationReadId(){return String(store.get(scopedKey("notification_last_read_id"),"")||"")}
function setLocalNotificationReadId(id){if(id)store.set(scopedKey("notification_last_read_id"),String(id))}
async function serverNotificationReadId(){
  try{
    const m=await api("/api/v1/markers",{query:{"timeline[]":"notifications"}});
    return String(m?.notifications?.last_read_id||"");
  }catch{return ""}
}
async function markNotificationsRead(latestId){
  const id=String(latestId||"");if(!id)return;
  setLocalNotificationReadId(id);
  state.notificationUnread=0;state.notificationUnreadOverflow=false;
  await setSharedAccountUnreadBreakdown(currentAccountKey(),0,state.dmUnread);
  refreshNotificationBadgeDom();
  try{await api("/api/v1/markers",{method:"POST",form:{"notifications[last_read_id]":id}})}catch{}
}
let notificationUnreadReady=false;
function notificationPreviewPayload(n){
  const a=n?.account||{},st=n?.status||{},labels=ANDROID?.renderer?.notificationLabels||{};
  const who=a.display_name||a.username||"렌톤";
  const title=who+" · "+(labels[n?.type]||"새 알림");
  const body=plain(st.content||"")||(
    n?.type==="follow"?"새 팔로워가 생겼어요.":
    n?.type==="follow_request"?"팔로우 요청이 왔어요.":
    n?.type==="favourite"?"내 게시물을 좋아합니다.":
    n?.type==="reblog"?"내 게시물을 부스트했습니다.":"새 알림이 도착했어요."
  );
  return {title,body,icon:a.avatar_static||a.avatar||"",notificationId:String(n?.id||"")};
}
async function refreshUnreadNotificationCount({bootstrap=true}={}){
  if(!state.session||!state.me)return 0;
  try{
    const previous=Math.max(0,Number(state.notificationUnread)||0);
    const [items,markerFromServer,conversations]=await Promise.all([
      api("/api/v1/notifications",{query:{limit:"80"}}),
      serverNotificationReadId(),
      api("/api/v1/conversations",{query:{limit:"80"}}).catch(()=>[])
    ]);
    const filter=notificationFilterPrefs();
    const isDirect=n=>n?.status?.visibility==="direct";
    const visibleNonDirect=(items||[]).filter(n=>filter[n.type]!==false&&!isDirect(n));
    const newest=String((items||[])[0]?.id||"");
    let marker=markerFromServer||localNotificationReadId();
    state.dmUnread=(conversations||[]).filter(x=>x?.unread).length;
    if(!marker&&bootstrap){
      if(newest)setLocalNotificationReadId(newest);
      state.notificationUnread=0;state.notificationUnreadOverflow=false;
      await setSharedAccountUnreadBreakdown(currentAccountKey(),0,state.dmUnread);
      refreshNotificationBadgeDom();
      notificationUnreadReady=true;
      return 0;
    }
    let count=0,found=!marker;
    if(marker){
      for(const n of items||[]){
        if(String(n.id)===marker){found=true;break}
        if(filter[n.type]!==false&&!isDirect(n))count++;
      }
    }else count=visibleNonDirect.length;
    state.notificationUnread=count;
    state.notificationUnreadOverflow=!!marker&&!found&&(items||[]).length>=80;
    await setSharedAccountUnreadBreakdown(currentAccountKey(),count,state.dmUnread);
    refreshNotificationBadgeDom();
    if(notificationUnreadReady&&count>previous&&document.visibilityState==="visible"&&state.view!=="notifications"&&visibleNonDirect[0]){
      showForegroundPushBanner(notificationPreviewPayload(visibleNonDirect[0]));
    }
    notificationUnreadReady=true;
    return count;
  }catch{return state.notificationUnread||0}
}
function closeForegroundPushBanner(){document.querySelector(".foreground-push-banner")?.remove()}
function showForegroundPushBanner(payload={}){
  if(document.visibilityState!=="visible"||state.view==="notifications")return;
  closeForegroundPushBanner();
  const b=document.createElement("button");b.type="button";b.className="foreground-push-banner";
  const title=String(payload.title||"새 알림"),body=String(payload.body||"새 알림이 도착했어요."),icon=String(payload.icon||"");
  b.innerHTML='<span class="foreground-push-icon">'+(icon?'<img src="'+esc(icon)+'" alt="">':lentonIcon("notifications"))+'</span><span class="foreground-push-copy"><b>'+esc(title)+'</b><small>'+esc(body)+'</small></span>';
  b.onclick=async()=>{
    closeForegroundPushBanner();
    const pushedKey=String(payload.accountKey||"");
    if(pushedKey&&pushedKey!==currentAccountKey()){
      const i=savedAccounts().findIndex(x=>x.key===pushedKey);
      if(i>=0)await switchSavedAccount(i);
    }
    const id=String(payload.notificationId||"");
    if(id)await openNotificationDeepLink(id);
    else{rememberScroll();state.view="notifications";await notificationsView(false)}
  };
  document.body.append(b);
  setTimeout(()=>{if(b.isConnected)b.classList.add("show")},20);
  setTimeout(()=>{if(b.isConnected){b.classList.remove("show");setTimeout(()=>b.remove(),180)}},5200);
}

async function notificationsView(mentionsOnly=false,silent=false){
  if(!silent)renderLoadingShell("알림");
  try{
    const query={limit:"40"};if(mentionsOnly)query["types[]"]="mention";
    let items=await api("/api/v1/notifications",{query});
    const rawItems=items||[];
    if(!mentionsOnly&&rawItems?.[0]?.id)await markNotificationsRead(rawItems[0].id);
    const filter=notificationFilterPrefs();
    items=rawItems.filter(n=>n?.status?.visibility!=="direct"&&(mentionsOnly?n.type==="mention":filter[n.type]!==false));
    const tabLabels=ANDROID?.renderer?.notificationTabs||["전체","멘션"];
    const tabs='<div class="notify-tabs lenton-notify-tabs"><button data-notify="all" class="'+(mentionsOnly?"":"active")+'">'+esc(tabLabels[0]||"전체")+'</button><button data-notify="mention" class="'+(mentionsOnly?"active":"")+'">'+esc(tabLabels[1]||"멘션")+'</button></div>';
    const labels=ANDROID?.renderer?.notificationLabels||{};
    const glyphs=ANDROID?.renderer?.notificationGlyphs||{};
    const colors={favourite:"fav",reblog:"boost",mention:"mention",follow:"follow",follow_request:"follow"};
    const rows=items.length?items.map(n=>{
      const a=n.account||{},st=n.status||null,type=n.type||"";
      const label=labels[type]||type||"새 알림",glyph=glyphs[type]||glyphs.default||"♢";
      const body=st?'<div class="notify-content">'+renderRichText(st.content||"")+'</div>':"";
      const tone=type==="mention"?"notify-mention":type==="status"?"notify-passive":"notify-neutral";
      return '<article class="android-notify-card '+tone+' '+(st?"has-status":"")+'" '+(st?'data-notify-status="'+esc(st.id||"")+'"':"")+'>'+
        '<div class="android-notify-glyph '+(colors[type]||"default")+'">'+esc(glyph)+'</div>'+
        '<div class="android-notify-main">'+
          '<div class="android-notify-person"><button type="button" class="android-notify-avatar" data-profile="'+esc(a.id||"")+'" aria-label="프로필 열기"><img src="'+esc(a.avatar_static||a.avatar||"")+'" alt=""></button><b>'+renderEmojiText(a.display_name||a.username||"알림",a.emojis||[])+' · '+esc(label)+'</b></div>'+
          body+
        '</div></article>';
    }).join(""):'<div class="center">새 알림이 없어요.</div>';
    renderMainStable("알림",tabs+rows,{view:"notifications",fab:true});
  }catch(e){renderMainStable("알림",'<div class="center">'+esc(e.message)+'</div>',{view:"notifications",fab:true})}
}
function dmConversationKey(c){
  const ids=(c?.accounts||[]).map(a=>String(a.id||a.acct||"")).filter(Boolean).sort();
  return ids.join("|")||String(c?.id||"");
}
function groupDmConversations(cs){
  const groups=new Map();
  for(const c of cs||[]){
    const key=dmConversationKey(c);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(c);
  }
  for(const group of groups.values()){
    group.sort((a,b)=>String(b.last_status?.created_at||"").localeCompare(String(a.last_status?.created_at||"")));
    const ids=group.map(c=>String(c.id));
    group.forEach((c,i)=>{
      c._threadIndex=i;
      c._threadSiblingIds=ids;
      c._threadLabel=group.length>1?"타래 "+(i+1)+"/"+group.length:"";
      c._previousConversationId=group[i+1]?.id||"";
    });
  }
  return [...(cs||[])].sort((a,b)=>String(b.last_status?.created_at||"").localeCompare(String(a.last_status?.created_at||"")));
}
async function dmView(silent=false){
  if(!silent)renderLoadingShell("메시지");
  try{
    const raw=await api("/api/v1/conversations",{query:{limit:"80"}});
    state.dmUnread=(raw||[]).filter(x=>x?.unread).length;
    await setSharedAccountUnreadBreakdown(currentAccountKey(),state.notificationUnread,state.dmUnread);
    refreshNotificationBadgeDom();
    const cs=groupDmConversations(raw);
    const body=cs.length?cs.map(c=>{
      const a=c.accounts?.[0],txt=c.last_status?plain(c.last_status.content):"";
      const thread=c._threadLabel?'<span class="message-thread-label"> · '+esc(c._threadLabel)+'</span>':"";
      return '<button class="message-row '+(c.unread?"unread":"")+'" data-conv="'+esc(c.id)+'">'+
        '<img class="message-avatar" src="'+esc(a?.avatar_static||a?.avatar||"")+'" alt="">'+
        '<div class="message-main"><div class="message-name">'+renderEmojiText(a?.display_name||a?.username||"대화",a?.emojis||[])+thread+'</div>'+
        '<div class="message-handle">@'+esc(a?.acct||"")+'</div><div class="message-preview">'+esc(txt)+'</div></div>'+
        '<time class="message-date">'+fmtDateOnly(c.last_status?.created_at)+'</time></button>';
    }).join(""):'<div class="center">대화가 없어요.</div>';
    renderMainStable("메시지",body,{view:"dm",fab:true,fabAction:"newdm"}); state._conversations=cs;
  }catch(e){renderMainStable("메시지",'<div class="center">'+esc(e.message)+'</div>',{view:"dm",fab:true,fabAction:"newdm"})}
}

async function searchDmAccounts(q){
  const text=String(q||"").trim();if(!text)return [];
  try{
    const r=await api("/api/v2/search",{query:{q:text,type:"accounts",resolve:"true",limit:"20"}});
    return Array.isArray(r?.accounts)?r.accounts:[];
  }catch{
    try{return await api("/api/v1/accounts/search",{query:{q:text,resolve:"true",limit:"20"}})}catch{return []}
  }
}
async function newDmScreen(){
  state.currentConversation=null;
  state.dmDraftRecipients=[];
  const selected=new Map();
  let following=[],shown=[],searchTimer=null,searchSeq=0;

  $("#app").innerHTML=standaloneShell("새 메시지",`
    <div class="dm-new dm-new-lenton">
      <div class="dm-recipient-search lenton-dm-search">
        <input id="dmRecipientSearch" class="field" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="사용자 검색">
      </div>
      <div id="dmSelectedRecipients" class="dm-selected dm-selected-lenton"></div>
      <div class="dm-list-heading" id="dmListHeading">팔로잉</div>
      <div id="dmRecipientResults" class="dm-results dm-results-lenton"><div class="center">팔로잉 목록을 불러오는 중…</div></div>
      <div class="dm-next-dock"><button class="primary dm-start dm-next" id="dmStartCompose" disabled>다음</button></div>
    </div>`);
  bind();

  const updateNext=()=>{
    const btn=$("#dmStartCompose");if(!btn)return;
    btn.disabled=selected.size===0;
  };
  const drawSelected=()=>{
    const box=$("#dmSelectedRecipients");if(!box)return;
    const values=[...selected.values()];
    box.innerHTML=values.length?values.map(x=>`
      <button class="dm-selected-chip" data-dm-remove="${esc(x.id)}" aria-label="${esc(x.display_name||x.username||x.acct||"선택한 사용자")} 선택 해제">
        <img src="${esc(x.avatar_static||x.avatar||"")}" alt="">
        <span>${renderEmojiText(x.display_name||x.username||x.acct||"",x.emojis||[])}</span>
        <b>×</b>
      </button>`).join(""):"";
    box.classList.toggle("has-selection",values.length>0);
    box.querySelectorAll("[data-dm-remove]").forEach(b=>b.onclick=()=>{
      selected.delete(String(b.dataset.dmRemove));
      drawSelected();renderRows(shown);updateNext();
    });
    updateNext();
  };
  const renderRows=items=>{
    const box=$("#dmRecipientResults");if(!box)return;
    shown=(items||[]).filter(a=>a?.id&&String(a.id)!==String(state.me?.id||""));
    box.innerHTML=shown.length?shown.map(a=>{
      const key=String(a.id),isSelected=selected.has(key);
      return `<button class="dm-person-row lenton-dm-person ${isSelected?"selected":""}" data-dm-toggle="${esc(a.id)}" aria-pressed="${isSelected?"true":"false"}">
        <img class="dm-person-avatar" src="${esc(a.avatar_static||a.avatar||"")}" alt="">
        <span class="dm-person-copy"><b>${renderEmojiText(a.display_name||a.username,a.emojis||[])}</b><small>@${esc(a.acct||a.username||"")}</small></span>
        <span class="dm-person-plus" aria-hidden="true">${isSelected?"✓":"＋"}</span>
      </button>`;
    }).join(""):'<div class="center dm-empty-results">표시할 사용자가 없어요.</div>';
    box.querySelectorAll("[data-dm-toggle]").forEach(b=>b.onclick=()=>{
      const a=shown.find(x=>String(x.id)===String(b.dataset.dmToggle));if(!a)return;
      const key=String(a.id);
      if(selected.has(key))selected.delete(key);else selected.set(key,a);
      drawSelected();renderRows(shown);
    });
  };
  const showFollowing=()=>{
    const heading=$("#dmListHeading");if(heading)heading.textContent="팔로잉";
    renderRows(following);
  };
  const runSearch=async()=>{
    const input=$("#dmRecipientSearch"),q=String(input?.value||"").trim(),heading=$("#dmListHeading"),box=$("#dmRecipientResults");
    if(!q){showFollowing();return}
    const seq=++searchSeq;
    if(heading)heading.textContent="검색 결과";
    if(box)box.innerHTML='<div class="center">검색 중…</div>';
    const found=(await searchDmAccounts(q)).filter(a=>a?.id&&String(a.id)!==String(state.me?.id||""));
    if(seq!==searchSeq)return;
    renderRows(found);
  };

  $("#dmRecipientSearch")?.addEventListener("input",()=>{
    clearTimeout(searchTimer);
    const q=String($("#dmRecipientSearch")?.value||"").trim();
    if(!q){searchSeq++;showFollowing();return}
    searchTimer=setTimeout(runSearch,260);
  });
  $("#dmRecipientSearch")?.addEventListener("keydown",e=>{
    if(e.key==="Enter"){e.preventDefault();clearTimeout(searchTimer);runSearch()}
  });
  $("#dmStartCompose").onclick=()=>{
    const recipients=[...selected.values()];if(!recipients.length)return;
    state.dmDraftRecipients=recipients;
    compose(null,"direct",recipients);
  };

  updateNext();
  try{
    if(!state.me)state.me=await api("/api/v1/accounts/verify_credentials");
    following=await api("/api/v1/accounts/"+encodeURIComponent(state.me.id)+"/following",{query:{limit:"80"}});
    showFollowing();
  }catch(e){
    const box=$("#dmRecipientResults");if(box)box.innerHTML='<div class="center">'+esc(e.message)+'</div>';
  }
}
function dmDayKey(st){
  const d=new Date(st?.created_at||0);
  return isNaN(d)?String(st?.created_at||""):d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function dmDayLabel(st){
  const d=new Date(st?.created_at||0);if(isNaN(d))return "";
  return new Intl.DateTimeFormat("ko-KR",{year:"numeric",month:"long",day:"numeric",weekday:"long"}).format(d);
}
function dmContentHtml(st){
  const raw=String(st?.content||"");
  try{
    const doc=new DOMParser().parseFromString('<div id="x">'+raw+'</div>',"text/html"),box=doc.querySelector("#x");
    const p=box?.firstElementChild;
    if(p){
      while(p.firstChild){
        const n=p.firstChild;
        if(n.nodeType===Node.TEXT_NODE&&!String(n.textContent||"").trim()){n.remove();continue}
        if(n.nodeType===Node.ELEMENT_NODE&&n.matches("a.mention,a[href*='/@']")){n.remove();continue}
        break;
      }
    }
    return renderRichText(box?.innerHTML||raw);
  }catch{return renderRichText(raw)}
}
function dmThreadRow(st){
  const own=String(st.account?.id||"")===String(state.me?.id||"");
  const media=(st.media_attachments||[]).map(m=>'<button class="dm-bubble-media" data-media-url="'+esc(m.url||m.preview_url||"")+'" data-media-alt="'+esc(m.description||"DM 이미지")+'"><img src="'+esc(m.preview_url||m.url||"")+'" alt=""></button>').join("");
  return '<div class="dm-chat-row '+(own?"mine":"theirs")+'">'+
    (own?"":'<img class="dm-chat-avatar" src="'+esc(st.account?.avatar_static||st.account?.avatar||"")+'" alt="">')+
    '<div class="dm-chat-time">'+fmtTime(st.created_at)+'</div>'+
    '<div class="dm-chat-bubble">'+dmContentHtml(st)+media+'</div>'+
    '</div>';
}
function dmThreadMarkup(statuses){
  let lastDay="",out="";
  for(const st of statuses||[]){
    const day=dmDayKey(st);
    if(day!==lastDay){out+='<div class="dm-day-separator"><span>'+esc(dmDayLabel(st))+'</span></div>';lastDay=day}
    out+=dmThreadRow(st);
  }
  return out;
}
async function sendInlineDm(conversation){
  const input=$("#dmInlineInput"),send=$("#dmInlineSend"),file=$("#dmInlineFile"),camera=$("#dmInlineCameraFile");
  if(!input||!send)return;
  const text=input.value.trim(),files=[...(file?.files||[]),...(camera?.files||[])].slice(0,4);
  if(!text&&!files.length)return;
  send.disabled=true;send.textContent="전송 중…";
  try{
    const media=[];for(const f of files)media.push(await uploadComposerFile(f));
    const recipient=(conversation.accounts||[]).filter(a=>String(a.id)!==String(state.me?.id))[0];
    const form=new URLSearchParams();
    form.append("status",(recipient?.acct?"@"+recipient.acct+" ":"")+text);
    form.append("visibility","direct");
    if(conversation.last_status?.id)form.append("in_reply_to_id",conversation.last_status.id);
    for(const m of media)if(m.id)form.append("media_ids[]",m.id);
    await api("/api/v1/statuses",{method:"POST",form});
    input.value="";if(file)file.value="";if(camera)camera.value="";
    await dmView();const refreshed=state._conversations?.find(x=>String(x.id)===String(conversation.id))||state._conversations?.find(x=>dmConversationKey(x)===dmConversationKey(conversation));
    if(refreshed)await openConversation(refreshed.id);
  }catch(e){toast(e.message);send.disabled=false;send.textContent="보내기"}
}
async function openConversation(id){
  const c=state._conversations?.find(x=>String(x.id)===String(id));if(!c?.last_status)return;
  state.currentConversation=c;
  try{
    const ctx=await api("/api/v1/statuses/"+c.last_status.id+"/context");
    const all=[...(ctx.ancestors||[]),c.last_status,...(ctx.descendants||[])].filter(st=>st.visibility==="direct");
    const uniq=new Map();for(const st of all)if(st?.id)uniq.set(String(st.id),st);
    const statuses=[...uniq.values()].sort((a,b)=>String(a.created_at||"").localeCompare(String(b.created_at||"")));
    const title=(c.accounts?.[0]?.display_name||"DM")+(c._threadLabel?" · "+c._threadLabel:"");
    const previous=c._previousConversationId?'<button class="dm-previous-conversation" data-dm-previous="'+esc(c._previousConversationId)+'">이전 대화 보기 ›</button>':"";
    const body=previous+'<div class="dm-thread-list">'+dmThreadMarkup(statuses)+'</div>'+
      '<div class="dm-inline-compose android-dm-compose">'+
        '<button class="dm-tool-btn" id="dmInlineAttach" aria-label="사진 첨부">'+lentonIcon("photo")+'</button>'+
        '<button class="dm-tool-btn" id="dmInlineCamera" aria-label="카메라">'+lentonIcon("camera")+'</button>'+
        '<input id="dmInlineFile" type="file" accept="image/*,video/*" multiple hidden>'+
        '<input id="dmInlineCameraFile" type="file" accept="image/*" capture="environment" hidden>'+
        '<textarea id="dmInlineInput" rows="1" maxlength="'+Number(state.instance?.configuration?.statuses?.max_characters||500)+'" placeholder="메시지 보내기"></textarea>'+
        '<span id="dmInlineCount" class="dm-inline-count">'+Number(state.instance?.configuration?.statuses?.max_characters||500)+'</span>'+
        '<button class="dm-inline-send" id="dmInlineSend" aria-label="보내기">보내기</button>'+
      '</div><div id="dmMediaPreview" class="dm-media-preview"></div>';
    $("#app").innerHTML=standaloneShell(title,body);bind();
    const input=$("#dmInlineInput"),max=Number(input?.maxLength||500),count=$("#dmInlineCount");
    const updateCount=()=>{if(count)count.textContent=String(Math.max(0,max-(input?.value.length||0)))};
    input?.addEventListener("input",updateCount);updateCount();
    $("#dmInlineAttach")?.addEventListener("click",()=>$("#dmInlineFile")?.click());
    $("#dmInlineCamera")?.addEventListener("click",()=>$("#dmInlineCameraFile")?.click());
    const previewFiles=files=>{const box=$("#dmMediaPreview");if(!box)return;box.innerHTML=[...files].slice(0,4).map(f=>'<div class="dm-media-chip">'+esc(f.name)+'</div>').join("")};
    $("#dmInlineFile")?.addEventListener("change",e=>previewFiles(e.target.files));
    $("#dmInlineCameraFile")?.addEventListener("change",e=>previewFiles(e.target.files));
    $("#dmInlineSend")?.addEventListener("click",()=>sendInlineDm(c));
    input?.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendInlineDm(c)}});
    api("/api/v1/conversations/"+id+"/read",{method:"POST",form:{}}).then(async()=>{
      if(c.unread){
        c.unread=false;
        state.dmUnread=Math.max(0,Number(state.dmUnread||0)-1);
        await setSharedAccountUnreadBreakdown(currentAccountKey(),state.notificationUnread,state.dmUnread);
        refreshNotificationBadgeDom();
      }
    }).catch(()=>{});
    requestAnimationFrame(()=>{const main=document.querySelector(".standalone-page .main");if(main)main.scrollTop=main.scrollHeight});
  }catch(e){toast(e.message)}
}

function accentTextColor(){
  let h=String(state.accent||"#1d9bf0").replace("#","");
  if(h.length===3) h=h.split("").map(x=>x+x).join("");
  const r=parseInt(h.slice(0,2),16)||0,g=parseInt(h.slice(2,4),16)||0,b=parseInt(h.slice(4,6),16)||0;
  return ((r*299+g*587+b*114)/1000)>=160?"#000":"#fff";
}
function standaloneShell(title,body,right=""){
  return `<div class="standalone-page"><header class="standalone-top"><button class="back" data-action="backScreen" aria-label="뒤로가기">${lentonIcon("back")}</button><h1>${esc(title)}</h1>${right}</header><main class="main">${body}</main></div>`;
}
function normalizeProfileMode(mode){return ["posts","replies","pinned","media"].includes(mode)?mode:"posts"}
function profileQuery(mode){
  const q={limit:"25"};
  if(mode==="posts")q.exclude_replies="true";
  else if(mode==="pinned")q.pinned="true";
  else if(mode==="media")q.only_media="true";
  return q;
}
function profileModes(){return ["posts","replies","pinned","media"]}
function profileMediaGrid(items){
  const cells=[];
  for(const raw of items||[]){
    const st=raw.reblog||raw;
    for(let i=0;i<(st.media_attachments||[]).length;i++){
      const m=st.media_attachments[i],preview=m.preview_url||m.url||m.remote_url||"";
      if(!preview)continue;
      cells.push('<button class="profile-media-cell" data-profile-media-status="'+esc(st.id||"")+'" data-profile-media-index="'+i+'" aria-label="미디어 게시물 열기"><img src="'+esc(preview)+'" alt="'+esc(m.description||"")+'" loading="lazy"></button>');
    }
  }
  return cells.length?'<div class="profile-media-gallery">'+cells.join("")+'</div>':'<div class="center">미디어가 없어요.</div>';
}
function profilePageHtml(items,mode="posts",pinnedItems=[]){
  if(mode==="media")return profileMediaGrid(items);
  if(mode==="pinned"){
    return items?.length?items.map(x=>statusCard(x,{pinned:true,replyCountOverride:visibleReplyCount(x,items)})).join(""):'<div class="center">고정된 게시물이 없어요.</div>';
  }
  if(mode==="posts"){
    const pinnedIds=new Set((pinnedItems||[]).map(statusId).filter(Boolean).map(String)),seen=new Set(),merged=[];
    for(const raw of [...(pinnedItems||[]),...(items||[])]){
      const id=String(statusId(raw)||"");if(id&&seen.has(id))continue;if(id)seen.add(id);merged.push(raw);
    }
    return merged.length?merged.map(x=>statusCard(x,{pinned:pinnedIds.has(String(statusId(x)||"")),replyCountOverride:visibleReplyCount(x,merged)})).join(""):'<div class="center">게시물이 없어요.</div>';
  }
  return items?.length?items.map(x=>statusCard(x,{replyCountOverride:visibleReplyCount(x,items)})).join(""):'<div class="center">게시물이 없어요.</div>';
}
function buildProfilePager(mode,data){
  const modes=profileModes(),index=Math.max(0,modes.indexOf(mode));
  return '<div class="profile-pager" data-profile-pager><div class="profile-pager-track" data-profile-track style="transform:translate3d(-'+(index*100)+'%,0,0)">'+
    modes.map(m=>'<section class="profile-pager-page" data-profile-page="'+m+'">'+profilePageHtml(data[m]||[],m,data.pinned||[])+'</section>').join("")+
    '</div></div>';
}
function syncProfilePagerUi(mode,animate=true){
  const modes=profileModes(),index=Math.max(0,modes.indexOf(mode));
  const pager=document.querySelector("[data-profile-pager]"),track=document.querySelector("[data-profile-track]"),tabs=document.querySelector("[data-profile-tabs]");
  if(!pager||!track||!tabs)return;
  const width=Math.max(1,pager.clientWidth);
  track.style.transition=animate?"transform 190ms cubic-bezier(.2,.75,.25,1)":"none";
  track.style.transform="translate3d("+(-index*width)+"px,0,0)";
  tabs.querySelectorAll("[data-profile-mode]").forEach(b=>b.classList.toggle("active",b.dataset.profileMode===mode));
  const indicator=tabs.querySelector(".profile-tab-indicator"),tabW=tabs.clientWidth/modes.length;
  if(indicator){indicator.style.transition=animate?"transform 190ms cubic-bezier(.2,.75,.25,1)":"none";indicator.style.transform="translate3d("+(index*tabW+(tabW-36)/2)+"px,0,0)"}
  const page=track.querySelector('[data-profile-page="'+mode+'"]');
  if(page)requestAnimationFrame(()=>{pager.style.height=Math.max(1,page.scrollHeight)+"px"});
}
function setProfilePagerMode(mode,animate=true){
  mode=normalizeProfileMode(mode);state.profileMode=mode;state.profileReplies=mode==="replies";
  syncProfilePagerUi(mode,animate);
}
function profileMarkup(a,opts={}){
  const own=!!opts.own,mode=opts.mode||"posts",relationship=opts.relationship||null;
  const note=relationship?.note||"",noteColor=accentTextColor();
  const mutual=!own&&!!relationship?.followed_by;
  const controls=own
    ? '<button class="outline-btn profile-own-edit" data-action="profileEditOwn">프로필 편집</button>'
    : '<div class="profile-actions">'+
        '<button class="profile-message-btn" data-action="profileMessage">쪽지</button>'+
        '<button class="profile-bell '+(relationship?.notifying?"on":"")+'" data-action="profileNotify" '+(!relationship?.following?"disabled":"")+' aria-label="게시물 알림">'+lentonIcon("notifications")+'</button>'+
        '<button class="profile-follow-btn" data-action="followProfile">'+(relationship?.following?"팔로우 해제":"팔로우")+'</button>'+
      '</div>';
  const privateNote=own?"":'<div class="private-note-card" data-action="editPrivateNote" style="color:'+noteColor+'"><div class="label">비밀 메모</div><div class="note">'+esc(note.trim()?note:"메모를 추가하려면 탭하세요.")+'</div></div>';
  const header=a.header_static||a.header||"",avatar=a.avatar_static||a.avatar||"";
  const fields=(a.fields||[]).map(f=>'<div class="profile-field"><span>'+renderRichText(f.name||"")+'</span><b>'+renderRichText(f.value||"")+'</b></div>').join("");
  const profileLabels=ANDROID?.renderer?.profileTabs||[];
  const tabs=[
    ["posts",profileLabels[0]||"게시물","profilePosts"],
    ["replies",profileLabels[1]||"게시물과 답장","profileReplies"],
    ["pinned",profileLabels[2]||"고정","profilePinned"],
    ["media",profileLabels[3]||"미디어","profileMedia"]
  ];
  return '<div class="profile-hero">'+
    (header?'<button class="profile-header-button" data-media-url="'+esc(header)+'" data-media-alt="프로필 헤더"><img class="profile-header" src="'+esc(header)+'" alt=""></button>':'<div class="profile-header"></div>')+
    (avatar?'<button class="profile-avatar-button" data-media-url="'+esc(avatar)+'" data-media-alt="프로필 사진"><img class="profile-avatar" src="'+esc(avatar)+'" alt=""></button>':"")+
    '</div><div class="profile-info"><div class="profile-name-row"><div class="profile-names"><h2>'+renderEmojiText(a.display_name||a.username,a.emojis||[])+'</h2>'+
      (mutual?'<div class="profile-mutual">나를 팔로우합니다</div>':"")+
      '<div class="profile-handle">@'+esc(a.acct)+'</div></div>'+controls+'</div>'+
    '<div class="profile-bio">'+renderRichText(a.note||"")+'</div>'+privateNote+(fields?'<div class="profile-fields">'+fields+'</div>':"")+
    '<div class="profile-count-grid"><div class="profile-count-static"><b>'+Number(a.statuses_count||0).toLocaleString()+'</b><span>게시물</span></div><button type="button" class="profile-count-link" data-connections-kind="following" data-connections-account="'+esc(a.id||"")+'"><b>'+Number(a.following_count||0).toLocaleString()+'</b><span>팔로잉</span></button><button type="button" class="profile-count-link" data-connections-kind="followers" data-connections-account="'+esc(a.id||"")+'"><b>'+Number(a.followers_count||0).toLocaleString()+'</b><span>팔로워</span></button></div></div>'+
    '<div class="profile-tabs-4" data-profile-tabs>'+tabs.map((x,i)=>'<button data-profile-mode="'+x[0]+'" data-action="'+x[2]+'" class="'+(mode===x[0]?"active":"")+'">'+x[1]+'</button>').join("")+'<span class="profile-tab-indicator" aria-hidden="true"></span></div>';

}
function fullAccountHandle(a){
  const acct=String(a?.acct||a?.username||"");
  return "@"+acct+(acct&&acct.includes("@")?"":("@"+(state.session?.host||"")));
}
async function profileConnectionsScreen(accountId,kind="following"){
  const isFollowers=kind==="followers",title=isFollowers?"팔로워":"팔로잉";
  $("#app").innerHTML=standaloneShell(title,'<div class="center">불러오는 중…</div>');bind();
  try{
    const items=await api("/api/v1/accounts/"+encodeURIComponent(accountId)+"/"+(isFollowers?"followers":"following"),{query:{limit:"80"}});
    const ids=(items||[]).map(a=>a.id).filter(Boolean);
    let rels=[];
    if(ids.length){
      const q=new URLSearchParams();ids.forEach(id=>q.append("id[]",id));
      rels=await api("/api/v1/accounts/relationships",{query:q}).catch(()=>[]);
    }
    const relMap=new Map((rels||[]).map(r=>[String(r.id),r]));
    const rows=(items||[]).map(a=>{
      const rel=relMap.get(String(a.id))||{};
      const mutual=!!(rel.following&&rel.followed_by);
      const following=!!rel.following;
      return '<div class="following-list-row">'+
        '<button type="button" class="following-list-person" data-profile="'+esc(a.id||"")+'">'+
          '<img src="'+esc(a.avatar_static||a.avatar||"")+'" alt="">'+
          '<span><b>'+renderEmojiText(a.display_name||a.username||"",a.emojis||[])+'</b><small>'+esc(fullAccountHandle(a))+'</small></span>'+
        '</button>'+
        (mutual?'<span class="following-mutual-badge">맞팔</span>':'<span class="following-mutual-placeholder"></span>')+
        '<button type="button" class="following-state-button '+(following?"on":"")+'" data-connection-follow="'+esc(a.id||"")+'" data-current-following="'+(following?"1":"0")+'" data-connections-account="'+esc(accountId)+'" data-connections-kind="'+esc(kind)+'">'+(following?"팔로잉":"팔로우")+'</button>'+
      '</div>';
    }).join("");
    $("#app").innerHTML=standaloneShell(title,'<div class="following-list">'+(rows||'<div class="center">'+title+' 목록이 없어요.</div>')+'</div>');bind();
  }catch(e){
    $("#app").innerHTML=standaloneShell(title,'<div class="center">'+esc(e.message)+'</div>');bind();
  }
}
async function toggleConnectionFollow(button){
  const id=button?.dataset.connectionFollow;if(!id)return;
  const was=button.dataset.currentFollowing==="1";
  button.disabled=true;
  try{
    await api("/api/v1/accounts/"+encodeURIComponent(id)+"/"+(was?"unfollow":"follow"),{method:"POST",form:{}});
    await profileConnectionsScreen(button.dataset.connectionsAccount,button.dataset.connectionsKind||"following");
  }catch(e){button.disabled=false;toast(e.message)}
}
async function profileView(mode=state.profileMode||"posts"){
  if(typeof mode==="boolean")mode=mode?"replies":"posts";
  state.profileAccount=null;state.profileRelationship=null;mode=normalizeProfileMode(mode);state.profileMode=mode;state.profileReplies=mode==="replies";
  renderLoadingShell("프로필");
  try{
    if(!state.me)state.me=await api("/api/v1/accounts/verify_credentials");
    const a=state.me,modes=profileModes();
    const entries=await Promise.all(modes.map(async m=>[m,await api("/api/v1/accounts/"+a.id+"/statuses",{query:profileQuery(m)})]));
    const data=Object.fromEntries(entries.map(([m,items])=>[m,(items||[]).filter(raw=>{
      const st=raw?.reblog||raw;
      return st?.visibility!=="direct";
    })]));state.profilePagerData=data;
    $("#app").innerHTML=shell("프로필",profileMarkup(a,{own:true,mode})+buildProfilePager(mode,data));bind();
    requestAnimationFrame(()=>syncProfilePagerUi(mode,false));
  }catch(e){$("#app").innerHTML=shell("프로필",'<div class="center">'+esc(e.message)+'</div>');bind()}
}
async function openProfile(id,mode=state.profileMode||"posts",standalone=false){
  if(!id)return;if(typeof mode==="boolean")mode=mode?"replies":"posts";mode=normalizeProfileMode(mode);
  if(state.me?.id&&String(id)===String(state.me.id)){
    rememberScroll();state.profileAccount=null;state.profileRelationship=null;state.profileMode=mode;
    if(!standalone){state.view="profile";return profileView(mode)}
    $("#app").innerHTML=standaloneShell("프로필",'<div class="center">불러오는 중…</div>');bind();
    try{
      const a=state.me,modes=profileModes(),entries=await Promise.all(modes.map(async m=>[m,await api("/api/v1/accounts/"+a.id+"/statuses",{query:profileQuery(m)})]));
      const data=Object.fromEntries(entries.map(([m,items])=>[m,(items||[]).filter(raw=>(raw?.reblog||raw)?.visibility!=="direct")]));state.profilePagerData=data;
      $("#app").innerHTML=standaloneShell("프로필",profileMarkup(a,{own:true,mode})+buildProfilePager(mode,data));bind();
      requestAnimationFrame(()=>syncProfilePagerUi(mode,false));
    }catch(e){$("#app").innerHTML=standaloneShell("프로필",'<div class="center">'+esc(e.message)+'</div>');bind()}
    return;
  }
  rememberScroll();state.returnView=state.view;state.profileMode=mode;state.profileReplies=mode==="replies";
  $("#app").innerHTML=standaloneShell("프로필",'<div class="center">불러오는 중…</div>');bind();
  try{
    const modes=profileModes();
    const [a,rels,...lists]=await Promise.all([
      api("/api/v1/accounts/"+id),
      api("/api/v1/accounts/relationships",{query:{"id[]":id}}),
      ...modes.map(m=>api("/api/v1/accounts/"+id+"/statuses",{query:profileQuery(m)}))
    ]);
    const relationship=Array.isArray(rels)?(rels[0]||{}):{},data={};
    modes.forEach((m,i)=>data[m]=lists[i]||[]);state.profilePagerData=data;
    state.profileAccount=a;state.profileRelationship=relationship;
    const more='<button class="profile-more" data-action="profileMenu" aria-label="프로필 관리">'+lentonIcon("more")+'</button>';
    $("#app").innerHTML=standaloneShell("프로필",profileMarkup(a,{own:false,mode,relationship})+buildProfilePager(mode,data),more);bind();
    requestAnimationFrame(()=>syncProfilePagerUi(mode,false));
  }catch(e){$("#app").innerHTML=standaloneShell("프로필",'<div class="center">'+esc(e.message)+'</div>');bind()}
}
function closePopup(){document.querySelector(".android-popup-shade")?.remove()}
function openProfilePopup(){
  closePopup(); const a=state.profileAccount,rel=state.profileRelationship||{}; if(!a)return;
  const shade=document.createElement("div");shade.className="android-popup-shade";
  shade.innerHTML=`<div class="android-popup">
    <button data-pm="follow">${rel.following?"언팔로우":"팔로우"}</button>
    <button data-pm="lists">리스트 관리</button>
    <button data-pm="mute">${rel.muting?"뮤트 해제":"뮤트"}</button>
    <button data-pm="block">${rel.blocking?"차단 해제":"차단"}</button>
    <button data-pm="report">신고</button>
    <button data-pm="copy">프로필 링크 복사</button>
  </div>`;
  document.body.append(shade);shade.onclick=e=>{if(e.target===shade)closePopup()};
  shade.querySelectorAll("[data-pm]").forEach(b=>b.onclick=async()=>{const x=b.dataset.pm;closePopup();if(x==="follow")await toggleFollowProfile();else if(x==="lists")await showProfileListManager();else if(x==="mute")await toggleProfileRelation(rel.muting?"unmute":"mute");else if(x==="block")await toggleProfileRelation(rel.blocking?"unblock":"block");else if(x==="report")await reportProfile();else if(x==="copy"){try{await navigator.clipboard.writeText(a.url||"");toast("프로필 링크를 복사했어요.")}catch{toast("프로필 링크를 복사하지 못했어요.")}}});
}
function dialogBox(title,message,bodyHtml){
  document.querySelector(".android-dialog-shade")?.remove();
  const shade=document.createElement("div");shade.className="android-dialog-shade";
  shade.innerHTML=`<div class="android-dialog"><h3>${esc(title)}</h3>${message?`<p>${esc(message)}</p>`:""}${bodyHtml}</div>`;
  document.body.append(shade);
  shade.addEventListener("click",e=>{if(e.target===shade)shade.remove()});
  return shade;
}
async function editPrivateNote(){
  const a=state.profileAccount,rel=state.profileRelationship;if(!a||!rel)return;
  const shade=dialogBox("비밀 메모","상대방에게는 보이지 않습니다. 비워서 저장하면 메모가 삭제됩니다.",`<textarea id="privateNoteInput" placeholder="나만 볼 수 있는 메모">${esc(rel.note||"")}</textarea><div class="android-dialog-actions"><button data-cancel>취소</button><button data-save>저장</button></div>`);
  shade.querySelector("[data-cancel]").onclick=()=>shade.remove();
  requestAnimationFrame(()=>$("#privateNoteInput",shade)?.focus());
  shade.querySelector("[data-save]").onclick=async()=>{const btn=shade.querySelector("[data-save]"),value=$("#privateNoteInput",shade).value.trim();btn.disabled=true;try{const r=await api(`/api/v1/accounts/${a.id}/note`,{method:"POST",form:{comment:value}});const next=r?.note??value;state.profileRelationship={...rel,...r,note:next};const noteEl=document.querySelector(".private-note-card .note");if(noteEl)noteEl.textContent=String(next||"").trim()||"메모를 추가하려면 탭하세요.";shade.classList.add("closing");setTimeout(()=>shade.remove(),130);toast(value?"비밀 메모를 저장했어요.":"비밀 메모를 삭제했어요.")}catch(e){btn.disabled=false;toast(e.message)}};
}
async function toggleProfileRelation(endpoint){
  const a=state.profileAccount;if(!a)return;
  const title=endpoint==="mute"?"뮤트":endpoint==="unmute"?"뮤트 해제":endpoint==="block"?"차단":"차단 해제";
  if(!confirm(endpoint==="block"?"이 계정을 차단할까요?\n\n차단하면 현재 팔로우 중인 상태가 해제될 수 있어요.":`이 계정을 ${title}할까요?`))return;
  try{const r=await api(`/api/v1/accounts/${a.id}/${endpoint}`,{method:"POST",form:{}});state.profileRelationship={...(state.profileRelationship||{}),...r};toast(title+" 완료");openProfile(a.id,state.profileMode||"posts")}catch(e){toast(e.message)}
}
async function toggleFollowProfile(){
  const a=state.profileAccount,rel=state.profileRelationship||{};if(!a)return;
  try{const r=await api(`/api/v1/accounts/${a.id}/${rel.following?"unfollow":"follow"}`,{method:"POST",form:{}});state.profileRelationship={...rel,...r};openProfile(a.id,state.profileMode||"posts")}catch(e){toast(e.message)}
}
async function toggleProfileNotify(){
  const a=state.profileAccount,rel=state.profileRelationship||{};if(!a)return;
  if(!rel.following){toast("먼저 팔로우해 주세요.");return}
  const btn=document.querySelector(".profile-bell[data-action='profileNotify']");
  const next=!rel.notifying;
  if(btn){btn.disabled=true;btn.classList.toggle("on",next)}
  try{
    const r=await api(`/api/v1/accounts/${a.id}/follow`,{method:"POST",form:{notify:next?"true":"false"}});
    state.profileRelationship={...rel,...r,notifying:r?.notifying??next};
    if(btn){btn.classList.toggle("on",!!state.profileRelationship.notifying);btn.disabled=false}
  }catch(e){
    if(btn){btn.classList.toggle("on",!!rel.notifying);btn.disabled=false}
    toast(e.message)
  }
}
async function reportProfile(){
  const a=state.profileAccount;if(!a)return;
  const shade=dialogBox("신고","신고 사유를 입력해 주세요.",'<textarea id="reportInput" placeholder="신고 내용"></textarea><div class="android-dialog-actions"><button data-cancel>취소</button><button data-save>신고</button></div>');
  shade.querySelector("[data-cancel]").onclick=()=>shade.remove();
  shade.querySelector("[data-save]").onclick=async()=>{const comment=$("#reportInput",shade).value.trim();try{await api("/api/v1/reports",{method:"POST",form:{account_id:a.id,comment,forward:"false"}});shade.remove();toast("신고를 접수했어요.")}catch(e){toast(e.message)}};
}
async function showProfileListManager(){
  const a=state.profileAccount;if(!a)return;
  try{
    const [all,member]=await Promise.all([api("/api/v1/lists"),api(`/api/v1/accounts/${a.id}/lists`)]);
    if(!all.length){toast("리스트가 없어요.");return}
    const have=new Set((member||[]).map(x=>x.id));
    const shade=dialogBox("리스트 관리","",`<div class="choices">${all.map((x,i)=>`<label><input type="checkbox" data-list-choice="${esc(x.id)}" ${have.has(x.id)?"checked":""}> ${esc(x.title||"리스트")}</label>`).join("")}</div><div class="android-dialog-actions"><button data-cancel>취소</button><button data-save>저장</button></div>`);
    shade.querySelector("[data-cancel]").onclick=()=>shade.remove();
    shade.querySelector("[data-save]").onclick=async()=>{const selected=new Set([...shade.querySelectorAll("[data-list-choice]:checked")].map(x=>x.dataset.listChoice));try{for(const list of all){const was=have.has(list.id),now=selected.has(list.id);if(was===now)continue;await api(`/api/v1/lists/${list.id}/accounts`,{method:now?"POST":"DELETE",form:{"account_ids[]":a.id}})}shade.remove();toast("리스트 설정을 저장했어요.")}catch(e){toast(e.message)}};
  }catch(e){toast(e.message)}
}


function searchTabsMarkup(){
  const modes=[["posts","게시물"],["people","사람"],["media","미디어"]];
  return '<div class="search-tabs">'+modes.map(([id,label])=>'<button type="button" data-search-mode="'+id+'" class="'+(state.searchMode===id?"active":"")+'">'+label+'</button>').join("")+'</div>';
}
function searchPeopleMarkup(items=[]){
  return items.length?items.map(a=>'<button class="row search-person-row" data-profile="'+esc(a.id||"")+'"><img class="avatar search-person-avatar" src="'+esc(a.avatar_static||a.avatar||"")+'" alt=""><div class="grow"><b>'+renderEmojiText(a.display_name||a.username,a.emojis||[])+'</b><div class="muted">@'+esc(a.acct||"")+'</div><div class="search-person-note">'+esc(plain(a.note||""))+'</div></div></button>').join(""):'<div class="center">사람 검색 결과가 없어요.</div>';
}
function searchStatusesForMode(mode){
  const statuses=Array.isArray(state.searchResults?.statuses)?state.searchResults.statuses:[];
  if(mode==="media")return statuses.filter(x=>(x?.media_attachments||[]).length>0);
  return statuses;
}
function renderSearchResults(){
  const box=$("#searchResults");if(!box)return;
  if(!state.searchResults){
    box.className="center";
    box.innerHTML="검색어를 입력해 주세요.";
    return;
  }
  box.className="";
  const mode=state.searchMode||"posts";
  let body="";
  if(mode==="people")body=searchPeopleMarkup(state.searchResults.accounts||[]);
  else{
    const statuses=searchStatusesForMode(mode);
    body=statuses.length?statuses.map(statusCard).join(""):'<div class="center">'+(mode==="media"?"미디어가 포함된 게시물이 없어요.":"게시물 검색 결과가 없어요.")+'</div>';
  }
  box.innerHTML=searchTabsMarkup()+'<div class="search-tab-body">'+body+'</div>';
  bind();
}
function setSearchMode(mode){
  if(!["posts","people","media"].includes(mode))return;
  state.searchMode=mode;renderSearchResults();
}
function closeSearchMenu(){document.querySelector(".android-popup-shade.search-popup")?.remove()}
function openSearchMenu(){
  closeSearchMenu();
  const shade=document.createElement("div");shade.className="android-popup-shade search-popup";
  const items=[["posts","게시물"],["people","사람"],["media","미디어"],["clear","검색 초기화"]];
  shade.innerHTML='<div class="android-popup search-popup-menu">'+items.map(([id,label])=>'<button type="button" data-search-menu="'+id+'" class="'+(state.searchMode===id?"active":"")+'">'+esc(label)+'</button>').join("")+'</div>';
  document.body.append(shade);
  shade.onclick=e=>{if(e.target===shade)closeSearchMenu()};
  shade.querySelectorAll("[data-search-menu]").forEach(b=>b.onclick=()=>{
    const mode=b.dataset.searchMenu;
    closeSearchMenu();
    if(mode==="clear"){
      state.searchResults=null;state.searchQuery="";state.searchMode="posts";searchView();
    }else setSearchMode(mode);
  });
}
async function searchView(){
  const q=state.searchQuery||"";
  $("#app").innerHTML=shell("검색",'<div class="search-box"><input id="searchInput" class="field" placeholder="사람, 게시물, 해시태그 검색" value="'+esc(q)+'"><button class="primary" data-action="runsearch">검색</button></div><div id="searchResults" class="'+(state.searchResults?"":"center")+'"></div>');
  bind();renderSearchResults();
}
async function runSearch(){
  const q=$("#searchInput")?.value.trim(); if(!q)return;
  const box=$("#searchResults"); box.className="center"; box.textContent="검색 중…";
  try{
    const r=await api("/api/v2/search",{query:{q,resolve:"true",limit:"40"}});
    state.searchQuery=q;state.searchResults=r||{accounts:[],statuses:[],hashtags:[]};
    if(!["posts","people","media"].includes(state.searchMode))state.searchMode="posts";
    renderSearchResults();
  }catch(e){box.className="center";box.textContent=e.message}
}

async function bookmarksView(){
  closeDrawer(); $("#app").innerHTML=standaloneShell("북마크",'<div class="center">불러오는 중…</div>');bind();
  try{
    const a=await api("/api/v1/bookmarks",{query:{limit:"30"}});
    $("#app").innerHTML=standaloneShell("북마크",a.length?a.map(statusCard).join(""):'<div class="center">북마크가 없어요.</div>');bind();
  }catch(e){toast(e.message)}
}

function drawerMenuRows(){
  const iconMap={profile:"profile",profileedit:"edit",favourites:"heart",bookmarks:"bookmark",followrequests:"personAdd",layoutedit:"edit",lists:"list",settings:"settings",update:"update",history:"update",theme:"settings"};
  const fallback=[
    {id:"profile",label:"프로필"},{id:"profileedit",label:"프로필 편집"},{id:"favourites",label:"좋아요"},
    {id:"bookmarks",label:"북마크"},{id:"followrequests",label:"팔로우 요청"},{id:"layoutedit",label:"화면 구성 편집"},
    {id:"lists",label:"리스트"},{id:"settings",label:"설정"}
  ];
  let rows=Array.isArray(ANDROID?.renderer?.drawerRows)&&ANDROID.renderer.drawerRows.length?ANDROID.renderer.drawerRows:fallback;
  rows=rows.filter(x=>x?.id&&x.id!=="realtime");
  if(ANDROID?.features?.lists&&!rows.some(x=>x.id==="lists")){
    const settingsIndex=rows.findIndex(x=>x.id==="settings"||x.id==="update");
    const listRow={id:"lists",label:"리스트"};
    if(settingsIndex>=0)rows=[...rows.slice(0,settingsIndex),listRow,...rows.slice(settingsIndex)];
    else rows=[...rows,listRow];
  }
  const mapped=rows.map(x=>{
    let label=x.label||x.id;
    if(x.id==="theme")label=(state.theme==="dark"?"라이트 모드":"다크 모드");
    return {id:x.id==="update"?"history":x.id,label,icon:iconMap[x.id]||"more"};
  });
  if(!mapped.some(x=>x.id==="history"))mapped.push({id:"history",label:"업데이트 내역",icon:"update"});
  return mapped;
}
function drawerMenuMarkup(){
  return drawerMenuRows().map((x,i)=>{
    const divider=(x.id==="lists"||x.id==="settings"||x.id==="history")?'<div class="drawer-divider"></div>':"";
    return divider+'<button class="drawer-row '+(x.id==="lists"?"drawer-list-row":"")+'" data-drawer="'+esc(x.id)+'"><span class="glyph">'+lentonIcon(x.icon)+'</span>'+esc(x.label)+'</button>';
  }).join("");
}
function buildDrawerElement(){
  const m=state.me||{},shade=document.createElement("div");
  const allAccounts=savedAccounts(),currentKey=state.session?.host+"|"+m.id;const otherAccounts=allAccounts.filter(x=>x&&x.avatar&&x.key!==currentKey);
  shade.className="drawer-shade";
  shade.innerHTML=`<aside class="drawer lenton-drawer">
    <div class="drawer-account-strip">
      <button class="drawer-profile-avatar-button" data-drawer="profile" aria-label="프로필"><img class="drawer-avatar" src="${esc(m.avatar_static||m.avatar||"")}" alt=""></button>
      <div class="drawer-switchers">
        ${otherAccounts.map(x=>`<button class="drawer-account-btn" data-switch-account-key="${esc(x.key)}"><img class="drawer-switch-avatar" src="${esc(x.avatar)}" alt=""></button>`).join("")}
        <button class="drawer-add-account" data-drawer="accountswitcher" aria-label="계정">＋</button>
      </div>
    </div>
    <button class="drawer-profile-summary" data-drawer="profile"><div class="drawer-name">${renderEmojiText(m.display_name||m.username||"렌톤",m.emojis||[])}</div><div class="drawer-handle">@${esc(m.acct||"")}${m.acct?.includes("@")?"":"@"+esc(state.session?.host||"")}</div><div class="drawer-counts"><b>${m.following_count||0}</b> 팔로잉&nbsp;&nbsp;&nbsp;<b>${m.followers_count||0}</b> 팔로워</div></button>
    ${drawerMenuMarkup()}

  </aside>`;
  document.body.append(shade);
  shade.addEventListener("click",e=>{if(e.target===shade)closeDrawer()});
  shade.querySelectorAll("[data-drawer]").forEach(b=>b.onclick=async()=>{
    const v=b.dataset.drawer;
    if(v==="profile"){closeDrawer();state.view="profile";render()}
    else if(v==="bookmarks"){pushNavSnapshot();bookmarksView()}
    else if(v==="favourites"){pushNavSnapshot();favouritesView()}
    else if(v==="followrequests"){pushNavSnapshot();closeDrawer();followRequestsScreen()}
    else if(v==="lists"){pushNavSnapshot();closeDrawer();listsScreen()}
    else if(v==="settings"){closeDrawer();state.view="settings";render()}
    else if(v==="profileedit"){pushNavSnapshot();closeDrawer();profileEditScreen()}
    else if(v==="layoutedit"){pushNavSnapshot();closeDrawer();screenLayoutEditor()}
    else if(v==="history"){pushNavSnapshot();closeDrawer();updateHistoryScreen()}
    else if(v==="theme"){state.theme=state.theme==="dark"?"light":"dark";store.set("lenton_theme",state.theme);document.documentElement.dataset.theme=state.theme;closeDrawer();render()}
    else if(v==="accountswitcher"){closeDrawer();openAccountSwitcher()}
  });
  shade.querySelectorAll("[data-switch-account-key]").forEach(b=>b.onclick=()=>{
    const list=savedAccounts(),i=list.findIndex(x=>x.key===b.dataset.switchAccountKey);closeDrawer();if(i>=0)switchSavedAccount(i);
  });
  return shade;
}
function openDrawer(opts={}){
  if(document.querySelector(".drawer-shade"))return document.querySelector(".drawer-shade");
  const shade=buildDrawerElement(),drawer=shade.querySelector(".drawer");
  if(opts.interactive){
    shade.classList.add("drawer-interactive");
    drawer.style.transition="none";shade.style.transition="none";
    drawer.style.transform="translate3d(-100%,0,0)";shade.style.background="rgba(0,0,0,0)";
  }else{
    drawer.style.transform="translate3d(-100%,0,0)";shade.style.background="rgba(0,0,0,0)";
    requestAnimationFrame(()=>{
      drawer.style.transition="transform 180ms cubic-bezier(.2,.75,.25,1)";
      shade.style.transition="background 180ms ease";
      drawer.style.transform="translate3d(0,0,0)";shade.style.background="rgba(0,0,0,.45)";
    });
  }
  requestAnimationFrame(()=>attachLentonGestures());
  return shade;
}
function closeDrawer(animated=true){
  const shade=document.querySelector(".drawer-shade");if(!shade)return;
  const drawer=shade.querySelector(".drawer");
  if(!animated){shade.remove();return}
  drawer.style.transition="transform 170ms cubic-bezier(.2,.75,.25,1)";
  shade.style.transition="background 170ms ease";
  drawer.style.transform="translate3d(-100%,0,0)";shade.style.background="rgba(0,0,0,0)";
  setTimeout(()=>shade.remove(),185);
}

async function favouritesView(){
  closeDrawer();$("#app").innerHTML=standaloneShell("좋아요",'<div class="center">불러오는 중…</div>');bind();
  try{const a=await api("/api/v1/favourites",{query:{limit:"40"}});$("#app").innerHTML=standaloneShell("좋아요",a.length?a.map(statusCard).join(""):'<div class="center">좋아요한 게시물이 없어요.</div>');bind()}catch(e){toast(e.message)}
}
async function listsScreen(){
  closeDrawer();$("#app").innerHTML=standaloneShell("리스트",'<div class="center">불러오는 중…</div>');bind();
  try{
    const lists=await api("/api/v1/lists");state.lists=lists;
    const hidden=hiddenListIds();
    const rows=lists.map(x=>`<div class="list-manage-row">
      <button class="list-open grow" data-open-list="${esc(x.id)}"><b>${esc(x.title||"리스트")}</b><span>${esc(x.replies_policy||"list")}</span></button>
      <button class="list-eye ${hidden.has(x.id)?"off":""}" data-list-visible="${esc(x.id)}">${hidden.has(x.id)?"숨김":"표시"}</button>
      <button class="list-more" data-list-manage="${esc(x.id)}">⋮</button>
    </div>`).join("");
    const body=`<div class="list-toolbar"><button class="primary" data-action="newlist">＋ 새 리스트</button></div>${rows||'<div class="center">리스트가 없어요.</div>'}`;
    $("#app").innerHTML=standaloneShell("리스트",body);bind();
  }catch(e){toast(e.message)}
}
async function listManageScreen(id){
  $("#app").innerHTML=standaloneShell("리스트 관리",'<div class="center">불러오는 중…</div>');bind();
  try{
    const [list,members]=await Promise.all([
      api(`/api/v1/lists/${id}`),
      api(`/api/v1/lists/${id}/accounts`,{query:{limit:"80"}})
    ]);
    const hidden=hiddenListIds().has(id);
    const rows=(members||[]).map(a=>`<button class="row" data-profile="${esc(a.id)}"><img class="avatar" src="${esc(a.avatar_static||a.avatar||"")}" alt=""><div class="grow"><b>${renderEmojiText(a.display_name||a.username,a.emojis||[])}</b><div class="muted">@${esc(a.acct||"")}</div></div></button>`).join("");
    const body=`<div class="list-editor">
      <label>이름<input id="listTitleEdit" class="field" value="${esc(list.title||"")}"></label>
      <label>답글 표시 범위<select id="listRepliesEdit" class="field">
        <option value="followed">팔로우 중인 사람의 답글</option>
        <option value="list">리스트 멤버의 답글</option>
        <option value="none">답글 숨김</option>
      </select></label>
      <label class="check-row"><input id="listExclusiveEdit" type="checkbox" ${list.exclusive?"checked":""}> 홈 타임라인에서 제외</label>
      <label class="check-row"><input id="listVisibleEdit" type="checkbox" ${hidden?"":"checked"}> 홈에 리스트 표시</label>
      <div class="android-dialog-actions"><button data-list-save="${esc(id)}">저장</button><button class="danger-text" data-list-delete="${esc(id)}">삭제</button></div>
    </div>
    <div class="section-title">멤버 ${members?.length||0}</div>${rows||'<div class="center">멤버가 없어요.</div>'}`;
    $("#app").innerHTML=standaloneShell(list.title||"리스트 관리",body);$("#listRepliesEdit").value=list.replies_policy||"list";bind();
  }catch(e){toast(e.message)}
}
async function saveListSettings(id){
  const title=$("#listTitleEdit")?.value.trim();if(!title){toast("리스트 이름을 입력해 주세요.");return}
  const replies_policy=$("#listRepliesEdit")?.value||"list";
  const exclusive=!!$("#listExclusiveEdit")?.checked;
  try{
    await api(`/api/v1/lists/${id}`,{method:"PUT",form:{title,replies_policy,exclusive:String(exclusive)}});
    setListHidden(id,!$("#listVisibleEdit")?.checked);
    await loadLists();toast("리스트를 저장했어요.");listsScreen();
  }catch(e){
    try{
      await api(`/api/v1/lists/${id}`,{method:"PUT",form:{title,replies_policy}});
      setListHidden(id,!$("#listVisibleEdit")?.checked);
      await loadLists();toast("리스트를 저장했어요.");listsScreen();
    }catch(e2){toast(e2.message)}
  }
}
async function deleteList(id){
  if(!confirm("이 리스트를 삭제할까요?"))return;
  try{await api(`/api/v1/lists/${id}`,{method:"DELETE"});await loadLists();toast("리스트를 삭제했어요.");listsScreen()}catch(e){toast(e.message)}
}

function tabLabel(id){return id==="home"?"홈":id==="search"?"검색":id==="notifications"?"알림":"DM"}
function attachLayoutEditorDrag(){
  const container=document.querySelector(".layout-tab-rows");if(!container||container.dataset.dragReady==="1")return;
  container.dataset.dragReady="1";
  let row=null,timer=null,dragging=false,startY=0;
  container.querySelectorAll(".layout-grip").forEach(grip=>{
    grip.addEventListener("pointerdown",e=>{
      row=grip.closest(".layout-tab-row");if(!row)return;startY=e.clientY;dragging=false;
      try{grip.setPointerCapture(e.pointerId)}catch{}
      timer=setTimeout(()=>{if(!row)return;dragging=true;row.classList.add("dragging");},220);
    });
    grip.addEventListener("pointermove",e=>{
      if(!row)return;
      if(!dragging&&Math.abs(e.clientY-startY)>8){clearTimeout(timer);timer=null;row=null;return}
      if(!dragging)return;
      e.preventDefault();
      const rows=[...container.querySelectorAll(".layout-tab-row")].filter(x=>x!==row);
      const target=rows.find(x=>e.clientY<x.getBoundingClientRect().top+x.getBoundingClientRect().height/2);
      if(target)container.insertBefore(row,target);else container.appendChild(row);
    });
    const finish=()=>{
      clearTimeout(timer);timer=null;if(!row)return;
      if(dragging){
        row.classList.remove("dragging");
        const cfg=mainTabLayout(),order=[...container.querySelectorAll(".layout-tab-row")].map(x=>x.dataset.layoutId);
        saveMainTabLayout(order,cfg.hidden);screenLayoutEditor();
      }
      row=null;dragging=false;
    };
    grip.addEventListener("pointerup",finish);grip.addEventListener("pointercancel",finish);
  });
}
function screenLayoutEditor(){
  closeDrawer();
  const cfg=mainTabLayout();
  const rows=cfg.order.map((id,i)=>`<div class="layout-tab-row" data-layout-id="${id}">
    <span class="layout-grip">☰</span><b>${tabLabel(id)}</b>
    <button data-layout-up="${id}" ${i===0?"disabled":""}>↑</button>
    <button data-layout-down="${id}" ${i===cfg.order.length-1?"disabled":""}>↓</button>
    <button class="layout-toggle ${cfg.hidden.has(id)?"off":""}" data-layout-toggle="${id}">${cfg.hidden.has(id)?"숨김":"표시"}</button>
  </div>`).join("");
  const body=`<div class="layout-guide">하단 탭의 순서와 표시 여부를 편집할 수 있습니다. 숨긴 탭은 화면과 데이터를 지우지 않고 하단 메뉴와 좌우 스와이프 대상에서만 제외됩니다.</div>
    <div class="section-title">하단 탭</div><div class="layout-tab-rows">${rows}</div>
    <div class="section-title">초기화</div><button class="row reset-layout" data-action="resetLayout">기본값으로 초기화</button>`;
  $("#app").innerHTML=standaloneShell("화면 구성 편집",body);bind();
}
function mutateLayout(id,dir){
  const cfg=mainTabLayout(),i=cfg.order.indexOf(id);if(i<0)return;
  if(dir){
    const n=i+dir;if(n<0||n>=cfg.order.length)return;
    [cfg.order[i],cfg.order[n]]=[cfg.order[n],cfg.order[i]];
  }else{
    if(cfg.hidden.has(id))cfg.hidden.delete(id);
    else{
      if(cfg.hidden.size>=cfg.order.length-1){toast("하단 탭은 최소 1개 이상 표시해야 합니다.");return}
      cfg.hidden.add(id);
    }
  }
  saveMainTabLayout(cfg.order,cfg.hidden);
  const visible=visibleNavItems().map(x=>x.id);
  if(!visible.includes(state.view))state.view=visible[0]||"home";
  screenLayoutEditor();
}
function resetMainTabLayout(){store.del("lenton_main_tab_layout");screenLayoutEditor()}
async function followRequestsScreen(){
  closeDrawer();$("#app").innerHTML=standaloneShell("팔로우 요청",'<div class="center">불러오는 중…</div>');bind();
  try{
    const a=await api("/api/v1/follow_requests",{query:{limit:"40"}});
    const rows=a.length?a.map(x=>`<div class="follow-request-row">
      <button class="follow-request-person" data-profile="${esc(x.id||"")}">
        <img class="avatar" src="${esc(x.avatar_static||x.avatar||"")}" alt="">
        <div class="grow"><b>${renderEmojiText(x.display_name||x.username,x.emojis||[])}</b><div class="muted">@${esc(x.acct)}</div></div>
      </button>
      <button class="primary small" data-follow-accept="${esc(x.id)}">승인</button>
      <button class="outline-btn small" data-follow-reject="${esc(x.id)}">거절</button>
    </div>`).join(""):'<div class="center">팔로우 요청이 없어요.</div>';
    $("#app").innerHTML=standaloneShell("팔로우 요청",rows);bind()
  }catch(e){toast(e.message)}
}
async function decideFollowRequest(id,accept){
  try{
    await api(`/api/v1/follow_requests/${id}/${accept?"authorize":"reject"}`,{method:"POST",form:{}});
    toast(accept?"팔로우 요청을 승인했어요.":"팔로우 요청을 거절했어요.");followRequestsScreen();
  }catch(e){toast(e.message)}
}

async function pushDiagnostics(){
  const supported="serviceWorker"in navigator&&"PushManager"in window&&"Notification"in window;
  let regd=false,last="-";
  try{
    if(supported){
      const current=currentAccountKey(),entry=savedAccounts().find(x=>x.key===current);
      const slot=Number(entry?.pushSlot);
      if(Number.isInteger(slot)&&slot>=0){
        const reg=await navigator.serviceWorker.getRegistration("./push/a"+slot+"/");
        regd=!!(await reg?.pushManager?.getSubscription?.());
      }
      if(!regd){
        const legacy=await navigator.serviceWorker.getRegistration("./");
        regd=!!(await legacy?.pushManager?.getSubscription?.());
      }
    }
  }catch{}
  try{const c=await caches.open("lenton-meta"),r=await c.match("./__lastpush");if(r)last=new Date(Number(await r.text())).toLocaleString("ko-KR")}catch{}
  return {supported,regd,last};
}

async function accountManagerScreen(){
  await syncSavedAccountsToPushMeta();
  const list=savedAccounts(),current=state.session?.host+"|"+(state.me?.id||"");
  const rows=list.map((x,i)=>`<div class="account-manage-row">
    <button class="account-main" data-account-switch="${i}"><img class="avatar" src="${esc(x.avatar||"")}" alt=""><span class="grow"><b>${esc(x.display_name||x.acct||"계정")}</b><small>@${esc(x.acct||"")} · ${esc(x.host||"")}</small></span>${accountUnreadFor(x)>0?'<i class="account-unread-badge">'+esc(accountUnreadFor(x)>99?"99+":String(accountUnreadFor(x)))+'</i>':(x.key===current?"<em>사용 중</em>":"")}</button>
    <button class="danger-text" data-account-remove="${i}" ${x.key===current?"disabled":""}>제거</button>
  </div>`).join("");
  $("#app").innerHTML=standaloneShell("계정 관리",`<div class="settings"><div class="section"><h3>계정</h3>${rows||'<div class="center">저장된 계정이 없어요.</div>'}<div class="setting-row"><button class="primary" data-action="addAccount">＋ 계정 추가</button></div></div></div>`);
  bind();
}
async function removeSavedAccount(index){
  const list=savedAccounts();if(index<0||index>=list.length)return;
  const target=list[index],current=state.session?.host+"|"+(state.me?.id||"");if(target.key===current){toast("현재 사용 중인 계정은 먼저 다른 계정으로 전환해 주세요.");return}
  if(!confirm("이 계정을 이 기기에서 제거할까요?"))return;
  await cleanupAccountPush(target);
  list.splice(index,1);store.set("lenton_accounts",list);await syncSavedAccountsToPushMeta();refreshNotificationBadgeDom();accountManagerScreen();
}
function inquiryScreen(initialType=""){
  state.inquiryFiles=state.inquiryFiles||[];
  const body='<div class="settings inquiry-form"><div class="section"><h3>문의 / 기능 건의</h3>'+
    '<label>문의 유형<select id="inquiryType" class="field"><option '+(initialType==="오류 신고"?"selected":"")+'>오류 신고</option><option '+(initialType==="기능 건의"?"selected":"")+'>기능 건의</option><option '+(initialType==="기타 문의"?"selected":"")+'>기타 문의</option></select></label>'+
    '<label>발생 화면/기능<input id="inquiryArea" class="field" placeholder="예: DM, 알림, 프로필"></label>'+
    '<label>제목<input id="inquiryTitle" class="field" placeholder="문의 제목"></label>'+
    '<label>문의 내용<textarea id="inquiryBody" class="field inquiry-text" placeholder="내용을 입력하세요"></textarea></label>'+
    '<label>재현 방법<textarea id="inquirySteps" class="field inquiry-text" placeholder="오류라면 재현 방법을 적어주세요"></textarea></label>'+
    '<div class="inquiry-attachments"><div class="inquiry-attachments-head"><b>스크린샷</b><span>최대 3장</span></div>'+
    '<input id="inquiryFiles" type="file" accept="image/*" multiple hidden><button class="outline-btn" id="inquiryPickFiles">스크린샷 추가</button>'+
    '<div id="inquiryFilePreviews" class="inquiry-file-previews"></div></div>'+
    '<div class="notice">앱 버전, iOS/PWA 환경, 서버 정보가 함께 포함됩니다. 로그인 토큰이나 비밀번호는 포함하지 않습니다.</div>'+
    '<div class="setting-row"><button class="primary" data-action="sendInquiry">이메일로 보내기</button></div></div></div>';
  $("#app").innerHTML=standaloneShell("문의 / 기능 건의",body);bind();
  const draw=()=>{
    const box=$("#inquiryFilePreviews");if(!box)return;
    box.innerHTML=(state.inquiryFiles||[]).map((f,i)=>'<div class="inquiry-file"><img src="'+URL.createObjectURL(f)+'" alt=""><button type="button" data-inquiry-remove="'+i+'">×</button></div>').join("");
    box.querySelectorAll("[data-inquiry-remove]").forEach(b=>b.onclick=()=>{state.inquiryFiles.splice(Number(b.dataset.inquiryRemove),1);draw()});
  };
  $("#inquiryPickFiles")?.addEventListener("click",()=>$("#inquiryFiles")?.click());
  $("#inquiryFiles")?.addEventListener("change",e=>{state.inquiryFiles=[...(state.inquiryFiles||[]),...e.target.files].slice(0,3);draw()});
  draw();
}
async function sendInquiry(){
  const type=$("#inquiryType")?.value||"문의",area=$("#inquiryArea")?.value.trim()||"-",title=$("#inquiryTitle")?.value.trim()||"렌톤 문의";
  const body=$("#inquiryBody")?.value.trim()||"",steps=$("#inquirySteps")?.value.trim()||"-";
  if(!body){toast("문의 내용을 입력해 주세요.");return}
  const info=[
    "■ 문의 정보","문의 유형 : "+type,"발생 화면/기능 : "+area,"제목 : "+title,"",
    "■ 문의 내용",body,"","■ 재현 방법",steps,"","────────────────────",
    "렌톤 Android 기준 : v"+(ANDROID?.versionName||"?")+" ("+(ANDROID?.versionCode||"?")+")",
    "PWA 빌드 : "+(currentPwaToken()||"unknown"),
    "서버 : "+(state.session?.host||"-"),
    "환경 : "+(standalone()?"iPhone/iPad 홈 화면 PWA":"Safari 웹"),
    "User Agent : "+navigator.userAgent
  ].join("\n");
  const files=(state.inquiryFiles||[]).slice(0,3);
  try{
    const payload={title:"[Lenton] "+title,text:info};
    if(files.length&&navigator.canShare?.({files}))payload.files=files;
    if(navigator.share){await navigator.share(payload);toast(files.length?"문의 내용과 스크린샷을 공유했어요.":"문의 내용을 공유했어요.");state.inquiryFiles=[];return}
  }catch(e){if(e?.name==="AbortError")return}
  try{await navigator.clipboard.writeText(info)}catch{}
  toast(files.length?"메일 앱에서 선택한 스크린샷을 첨부해 주세요.":"메일 앱을 엽니다.");
  location.href="mailto:cptu527@gmail.com?subject="+encodeURIComponent("[Lenton] "+title)+"&body="+encodeURIComponent(info);
}
async function showCurrentReleaseNotes(){
  let build=null;
  try{const r=await fetch("./build.json?ts="+Date.now(),{cache:"no-store"});if(r.ok)build=await r.json()}catch{}
  const notes=String(build?.notes||"").trim();
  const lines=notes?notes.split(/\r?\n/).map(x=>x.replace(/^\s*[•*-]\s*/,"").trim()).filter(Boolean):[];
  const body='<div class="settings"><div class="section current-release">'+
    '<div class="update-head"><b>v'+esc(build?.versionName||ANDROID?.versionName||"?")+'</b><span>현재 버전</span></div>'+
    (lines.length?'<ul>'+lines.map(v=>'<li>'+esc(v)+'</li>').join("")+'</ul>':'<div class="notice">현재 버전의 업데이트 내용이 없어요.</div>')+
    '</div></div>';
  $("#app").innerHTML=standaloneShell("업데이트 내용",body);bind();
}
async function checkPwaUpdate(){
  toast("업데이트를 확인하고 있어요.");
  try{
    const r=await fetch("./build.json?ts="+Date.now(),{cache:"no-store"});if(!r.ok)throw new Error("업데이트 정보를 불러오지 못했어요.");
    const remote=await r.json();state.buildInfo=remote;
    const current=currentPwaToken(),next=String(remote?.cacheToken||"");
    if(next&&current&&next!==current){
      state.updateAvailable=remote;
      if(hasUnsavedLentonWork()){toast("새 버전이 있지만 작성 중인 내용이 있어 자동 적용하지 않았어요.");return}
      toast("새 버전을 적용합니다.");
      setTimeout(()=>activateLatestPwaNow(),250);
      return;
    }
    const notes=String(remote?.notes||"").trim();
    const lines=notes?notes.split(/\r?\n/).map(x=>x.replace(/^\s*[•*-]\s*/,"").trim()).filter(Boolean):[];
    const body='<div class="settings"><div class="section current-release">'+
      '<div class="update-head"><b>v'+esc(remote?.versionName||ANDROID?.versionName||"?")+'</b><span>현재 최신 버전</span></div>'+
      (lines.length?'<ul>'+lines.map(v=>'<li>'+esc(v)+'</li>').join("")+'</ul>':'<div class="notice">현재 버전의 업데이트 내용이 없어요.</div>')+
      '</div></div>';
    $("#app").innerHTML=standaloneShell("업데이트 확인",body);bind();
  }catch(e){toast(e.message||"업데이트 확인에 실패했어요.")}
}
async function updateHistoryScreen(){
  let build=null;
  try{const r=await fetch("./build.json?ts="+Date.now(),{cache:"no-store"});if(r.ok)build=await r.json()}catch{}
  const info='<div class="section"><h3>현재 버전</h3>'+
    '<div class="kv"><span>Android 원본</span><b>v'+esc(ANDROID?.versionName||"?")+' · code '+esc(ANDROID?.versionCode||"?")+'</b></div>'+
    '<div class="kv"><span>PWA revision</span><b>'+esc(build?.pwaRevision||currentPwaToken()||"unknown")+'</b></div>'+
    '<div class="kv"><span>업데이트 방식</span><b>자동 업데이트</b></div></div>';
  const body='<div class="settings">'+info+
    '<div class="section"><h3>업데이트</h3>'+
      '<button class="settings-link" data-action="checkPwaUpdate"><span><b>업데이트 확인</b><small>최신 버전과 변경사항을 확인합니다</small></span><span>›</span></button>'+
    '</div>'+
    '<div class="section"><h3>도움말</h3>'+
      '<button class="settings-link" data-action="inquiry" data-inquiry-type="오류 신고"><span><b>문제 신고하기</b><small>버그 · 오류 · 문의 내용을 이메일로 보내기</small></span><span>›</span></button>'+
      '<button class="settings-link" data-action="inquiry" data-inquiry-type="기능 건의"><span><b>기능 건의</b><small>렌톤에 원하는 기능을 알려주세요</small></span><span>›</span></button>'+
    '</div></div>';
  $("#app").innerHTML=standaloneShell("앱 업데이트",body);bind();
}

function accountSource(){
  return state.me?.source||{};
}
function privacyLabel(v){
  return ({public:"공개",unlisted:"조용한 공개",private:"팔로워만",direct:"멘션한 사람만"})[v]||v||"공개";
}
function quotePolicyLabel(v){
  return ({public:"누구나",followers:"팔로워만",nobody:"나만"})[v]||"누구나";
}
function replyVisibilityPref(){
  const v=store.get(scopedKey("reply_visibility"),"match");
  return ["match","public","unlisted","private"].includes(v)?v:"match";
}
function replyVisibilityLabel(v){
  return ({match:"답장 대상 게시물과 맞춤",public:"공개",unlisted:"조용한 공개",private:"팔로워만"})[v]||"답장 대상 게시물과 맞춤";
}
function composeDefaultVisibility(reply,forced){
  if(forced)return forced;
  if(reply){
    if(reply.visibility==="direct")return "direct";
    const pref=replyVisibilityPref();
    return pref==="match"?(reply.visibility||"public"):pref;
  }
  return accountSource().privacy||"public";
}
async function refreshCredentialAccount(){
  state.me=await api("/api/v1/accounts/verify_credentials");
  await saveCurrentAccount();
  return state.me;
}
async function updateAccountCredential(key,value,{quiet=false}={}){
  try{
    const form=new URLSearchParams();form.append(key,String(value));
    state.me=await api("/api/v1/accounts/update_credentials",{method:"PATCH",form});
    await saveCurrentAccount();
    if(!quiet)toast("계정 설정을 저장했어요.");
    return true;
  }catch(e){
    toast("설정 저장 실패: "+e.message);
    return false;
  }
}
function accountSettingsRow(action,title,sub="",value=""){
  return '<button class="account-setting-link" data-action="'+esc(action)+'"><span><b>'+esc(title)+'</b>'+(sub?'<small>'+esc(sub)+'</small>':"")+'</span>'+(value?'<span class="account-setting-value">'+esc(value)+'</span>':'<span class="account-setting-chevron">›</span>')+'</button>';
}
async function accountSettingsScreen(){
  $("#app").innerHTML=standaloneShell("계정 설정",'<div class="center">불러오는 중…</div>');bind();
  let prefs={};
  try{
    const [me,p]=await Promise.all([refreshCredentialAccount(),api("/api/v1/preferences").catch(()=>({}))]);
    prefs=p||{};
  }catch(e){toast(e.message)}
  const src=accountSource();
  const privacy=src.privacy||prefs["posting:default:visibility"]||"public";
  const language=src.language||prefs["posting:default:language"]||"";
  const quote=src.quote_policy||prefs["posting:default:quote_policy"]||prefs["posting:default:quoted_policy"]||"public";
  const sensitive=src.sensitive===true||prefs["posting:default:sensitive"]===true;
  const body='<div class="settings account-settings-screen">'+
    '<div class="section account-settings-group"><h3>계정</h3>'+
      accountSettingsRow("profileEditOwn","프로필 편집","이름 · 소개 · 프로필 사진 · 헤더 · 프로필 필드")+
      accountSettingsRow("loginEmailSettings","로그인 이메일","Mastodon 서버 웹 설정에서 변경")+
      accountSettingsRow("accountNotificationSettings","알림","휴대폰 알림 · 유형별 알림 필터")+
      accountSettingsRow("followedTagsSettings","팔로우한 해시태그","팔로우 중인 해시태그 관리")+
      accountSettingsRow("mutedAccountsSettings","뮤트한 유저","뮤트한 계정 목록과 해제")+
      accountSettingsRow("blockedAccountsSettings","블록한 유저","차단한 계정 목록과 해제")+
      accountSettingsRow("domainBlocksSettings","숨긴 도메인","차단한 도메인 관리")+
      accountSettingsRow("filtersSettings","필터","서버에 저장된 콘텐츠 필터 관리")+
    '</div>'+
    '<div class="section account-settings-group"><h3>게시글 기본값</h3>'+
      accountSettingsRow("privacySettings","공개 범위","새 게시물의 기본 공개 범위",privacyLabel(privacy))+
      accountSettingsRow("replyVisibilitySettings","답장 공개 범위","답장 대상 게시물과 맞춤 · 이 앱에만 저장",replyVisibilityLabel(replyVisibilityPref()))+
      accountSettingsRow("quotePolicySettings","인용 허용 범위","새 게시물의 기본 인용 허용 범위",quotePolicyLabel(quote))+
      accountSettingsRow("languageSettings","게시글 언어","새 게시물에 사용할 기본 언어",language?language.toUpperCase():"서버 기본값")+
      '<label class="account-toggle-row"><span><b>미디어를 항상 민감함으로 표시</b><small>새 게시물에 첨부한 미디어를 기본적으로 민감함 처리합니다.</small></span><input type="checkbox" class="lenton-switch" data-account-toggle="sensitive" '+(sensitive?"checked":"")+'></label>'+
      '<label class="account-toggle-row"><span><b>계정 잠금</b><small>새 팔로워를 자동 승인하지 않고 요청으로 받습니다.</small></span><input type="checkbox" class="lenton-switch" data-account-toggle="locked" '+(state.me?.locked?"checked":"")+'></label>'+
    '</div>'+
  '</div>';
  $("#app").innerHTML=standaloneShell("계정 설정",body);bind();
  document.querySelectorAll("[data-account-toggle]").forEach(x=>x.onchange=async()=>{
    const kind=x.dataset.accountToggle,key=kind==="sensitive"?"source[sensitive]":"locked";
    const ok=await updateAccountCredential(key,x.checked,{quiet:true});
    if(!ok)x.checked=!x.checked;else toast("계정 설정을 저장했어요.");
  });
}
async function accountNotificationSettingsScreen(){
  const d=await pushDiagnostics(),push=pushAlertPrefs(),filter=notificationFilterPrefs();
  const notif=("Notification"in window)?Notification.permission:"unsupported";
  const permissionText=notif==="granted"?"허용됨":notif==="denied"?"차단됨":notif==="default"?"아직 묻지 않음":"지원 안 됨";
  const currentPushEntry=savedAccounts().find(x=>x.key===currentAccountKey());
  const pushMasterOn=!!currentPushEntry&&pushEnabledForAccount(currentPushEntry)&&d.regd;
  const pushRows=[
    ["dm","DM","비공개 직접 메시지가 왔을 때"],
    ["mention","멘션과 답글","내 아이디가 언급되거나 내 게시물에 답글이 달릴 때"],
    ["status","계정 새 게시물","프로필에서 게시물 알림을 켠 계정이 새 글을 올릴 때"],
    ["interactions","좋아요와 부스트","내 게시물에 좋아요 또는 부스트가 생겼을 때"],
    ["follow","팔로우","새 팔로워나 팔로우 요청이 왔을 때"]
  ];
  const body='<div class="settings account-notification-settings">'+
    '<div class="section account-settings-group"><h3>휴대폰 알림</h3>'+
      pushRows.map(x=>'<label class="account-toggle-row"><span><b>'+esc(x[1])+'</b><small>'+esc(x[2])+'</small></span><input type="checkbox" class="lenton-switch" data-account-push="'+esc(x[0])+'" '+(push[x[0]]?"checked":"")+'></label>').join("")+
      '<div class="setting-note">DM과 멘션은 Mastodon 서버에 따라 같은 ‘멘션’ Push 유형으로 전달될 수 있습니다.</div>'+
      '<div class="push-summary"><div><span>현재 알림 상태</span><b class="'+(pushMasterOn?"ok":"bad")+'">'+(pushMasterOn?"켜짐":"꺼짐")+'</b></div><div><span>알림 권한</span><b>'+esc(permissionText)+'</b></div></div>'+
      '<div class="setting-row"><button class="'+(pushMasterOn?"danger":"primary")+' settings-push-button" data-action="'+(pushMasterOn?"disablepush":"enablepush")+'">'+(pushMasterOn?"알림 연결 끄기":"휴대폰 알림 켜기")+'</button></div>'+
    '</div>'+
    '<div class="section account-settings-group"><h3>알림 목록 필터</h3>'+
      '<div class="setting-intro"><b>알림 화면에 표시할 유형</b><p>체크를 끈 유형은 렌톤 알림 목록에서 숨깁니다.</p></div>'+
      NOTIFICATION_FILTER_DEFS.map(([key,label])=>'<label class="account-toggle-row compact"><span><b>'+esc(label)+'</b></span><input type="checkbox" class="lenton-switch" data-account-filter="'+esc(key)+'" '+(filter[key]!==false?"checked":"")+'></label>').join("")+
    '</div></div>';
  $("#app").innerHTML=standaloneShell("알림",body);bind();
  document.querySelectorAll("[data-account-push]").forEach(x=>x.onchange=async()=>{
    const p=pushAlertPrefs();p[x.dataset.accountPush]=x.checked;savePushAlertPrefs(p);
    const ok=await syncPushPreferences({quiet:true});
    toast(ok?"휴대폰 알림 설정을 저장했어요.":"설정을 저장했어요. 알림을 켜면 적용됩니다.");
  });
  document.querySelectorAll("[data-account-filter]").forEach(x=>x.onchange=()=>{
    const p=notificationFilterPrefs();p[x.dataset.accountFilter]=x.checked;saveNotificationFilterPrefs(p);toast("알림 필터를 저장했어요.");
  });
}
function accountListRow(a,action,label){
  return '<div class="managed-account-row"><button class="managed-account-main" data-profile="'+esc(a.id||"")+'"><img src="'+esc(a.avatar_static||a.avatar||"")+'" alt=""><span><b>'+renderEmojiText(a.display_name||a.username||"",a.emojis||[])+'</b><small>@'+esc(a.acct||"")+'</small></span></button><button class="outline-btn small" data-managed-account-action="'+esc(action)+'" data-id="'+esc(a.id||"")+'">'+esc(label)+'</button></div>';
}
async function followedTagsSettingsScreen(){
  $("#app").innerHTML=standaloneShell("팔로우한 해시태그",'<div class="center">불러오는 중…</div>');bind();
  try{
    const items=await api("/api/v1/followed_tags",{query:{limit:"200"}});
    const body='<div class="account-manage-tools"><input id="followTagInput" class="field" placeholder="팔로우할 해시태그 이름"><button class="primary" id="followTagBtn">팔로우</button></div>'+
      '<div class="managed-list">'+(items?.length?items.map(t=>'<div class="managed-simple-row"><span><b>#'+esc(t.name||"")+'</b><small>홈 타임라인에서 이 해시태그의 게시물을 받습니다.</small></span><button class="outline-btn small" data-unfollow-tag="'+esc(t.name||"")+'">해제</button></div>').join(""):'<div class="center">팔로우한 해시태그가 없어요.</div>')+'</div>';
    $("#app").innerHTML=standaloneShell("팔로우한 해시태그",body);bind();
    $("#followTagBtn").onclick=async()=>{
      const raw=$("#followTagInput")?.value.trim().replace(/^#/,"");if(!raw)return;
      try{await api("/api/v1/tags/"+encodeURIComponent(raw)+"/follow",{method:"POST",form:{}});toast("#"+raw+" 팔로우를 시작했어요.");followedTagsSettingsScreen()}catch(e){toast(e.message)}
    };
    document.querySelectorAll("[data-unfollow-tag]").forEach(b=>b.onclick=async()=>{
      try{await api("/api/v1/tags/"+encodeURIComponent(b.dataset.unfollowTag)+"/unfollow",{method:"POST",form:{}});toast("해시태그 팔로우를 해제했어요.");followedTagsSettingsScreen()}catch(e){toast(e.message)}
    });
  }catch(e){$("#app").innerHTML=standaloneShell("팔로우한 해시태그",'<div class="center">'+esc(e.message)+'</div>');bind()}
}
async function managedAccountsSettingsScreen(kind){
  const cfg=kind==="mute"?{title:"뮤트한 유저",path:"/api/v1/mutes",action:"unmute",label:"뮤트 해제"}:{title:"블록한 유저",path:"/api/v1/blocks",action:"unblock",label:"차단 해제"};
  $("#app").innerHTML=standaloneShell(cfg.title,'<div class="center">불러오는 중…</div>');bind();
  try{
    const items=await api(cfg.path,{query:{limit:"80"}});
    const body='<div class="managed-list">'+(items?.length?items.map(a=>accountListRow(a,cfg.action,cfg.label)).join(""):'<div class="center">표시할 계정이 없어요.</div>')+'</div>';
    $("#app").innerHTML=standaloneShell(cfg.title,body);bind();
    document.querySelectorAll("[data-managed-account-action]").forEach(b=>b.onclick=async()=>{
      try{await api("/api/v1/accounts/"+encodeURIComponent(b.dataset.id)+"/"+b.dataset.managedAccountAction,{method:"POST",form:{}});toast(cfg.label+"했어요.");managedAccountsSettingsScreen(kind)}catch(e){toast(e.message)}
    });
  }catch(e){$("#app").innerHTML=standaloneShell(cfg.title,'<div class="center">'+esc(e.message)+'</div>');bind()}
}
async function domainBlocksSettingsScreen(){
  $("#app").innerHTML=standaloneShell("숨긴 도메인",'<div class="center">불러오는 중…</div>');bind();
  try{
    const items=await api("/api/v1/domain_blocks",{query:{limit:"200"}});
    const body='<div class="account-manage-tools"><input id="domainBlockInput" class="field" inputmode="url" autocapitalize="none" placeholder="example.com"><button class="primary" id="domainBlockBtn">차단</button></div>'+
      '<div class="managed-list">'+(items?.length?items.map(d=>'<div class="managed-simple-row"><span><b>'+esc(d)+'</b><small>이 도메인의 공개 게시물과 알림을 숨깁니다.</small></span><button class="outline-btn small" data-unblock-domain="'+esc(d)+'">해제</button></div>').join(""):'<div class="center">숨긴 도메인이 없어요.</div>')+'</div>';
    $("#app").innerHTML=standaloneShell("숨긴 도메인",body);bind();
    $("#domainBlockBtn").onclick=async()=>{
      const domain=$("#domainBlockInput")?.value.trim().replace(/^https?:\/\//i,"").split("/")[0];if(!domain)return;
      try{await api("/api/v1/domain_blocks",{method:"POST",form:{domain}});toast(domain+" 도메인을 숨겼어요.");domainBlocksSettingsScreen()}catch(e){toast(e.message)}
    };
    document.querySelectorAll("[data-unblock-domain]").forEach(b=>b.onclick=async()=>{
      try{await api("/api/v1/domain_blocks",{method:"DELETE",form:{domain:b.dataset.unblockDomain}});toast("도메인 차단을 해제했어요.");domainBlocksSettingsScreen()}catch(e){toast(e.message)}
    });
  }catch(e){$("#app").innerHTML=standaloneShell("숨긴 도메인",'<div class="center">'+esc(e.message)+'</div>');bind()}
}
function filterActionLabel(v){return ({warn:"경고 표시",hide:"완전히 숨김",blur:"미디어 흐리기"})[v]||v||"경고 표시"}
async function filtersSettingsScreen(){
  $("#app").innerHTML=standaloneShell("필터",'<div class="center">불러오는 중…</div>');bind();
  try{
    const items=await api("/api/v2/filters");
    const body='<div class="filter-create-card"><h3>새 필터</h3><input id="filterTitle" class="field" placeholder="필터 이름"><input id="filterKeyword" class="field" placeholder="필터할 단어"><select id="filterAction" class="field"><option value="warn">경고 표시</option><option value="hide">완전히 숨김</option><option value="blur">미디어 흐리기</option></select><div class="filter-contexts">'+
      [["home","홈"],["notifications","알림"],["public","공개 타임라인"],["thread","대화"],["account","프로필"]].map(x=>'<label><input type="checkbox" data-filter-context="'+x[0]+'" '+(x[0]==="home"||x[0]==="notifications"?"checked":"")+'> '+x[1]+'</label>').join("")+
      '</div><button class="primary" id="createFilterBtn">필터 추가</button></div>'+
      '<div class="managed-list">'+(items?.length?items.map(f=>'<div class="filter-managed-row"><div><b>'+esc(f.title||"필터")+'</b><small>'+esc(filterActionLabel(f.filter_action))+' · '+esc((f.context||[]).join(", "))+'</small><small>'+esc((f.keywords||[]).map(k=>k.keyword).join(" · "))+'</small></div><button class="danger-text" data-delete-filter="'+esc(f.id||"")+'">삭제</button></div>').join(""):'<div class="center">필터가 없어요.</div>')+'</div>';
    $("#app").innerHTML=standaloneShell("필터",body);bind();
    $("#createFilterBtn").onclick=async()=>{
      const title=$("#filterTitle")?.value.trim(),keyword=$("#filterKeyword")?.value.trim();if(!title||!keyword){toast("필터 이름과 단어를 입력해주세요.");return}
      const contexts=[...document.querySelectorAll("[data-filter-context]:checked")].map(x=>x.dataset.filterContext);if(!contexts.length){toast("필터가 적용될 위치를 하나 이상 선택해주세요.");return}
      const form=new URLSearchParams();form.append("title",title);contexts.forEach(x=>form.append("context[]",x));form.append("filter_action",$("#filterAction")?.value||"warn");form.append("keywords_attributes[][keyword]",keyword);form.append("keywords_attributes[][whole_word]","false");
      try{await api("/api/v2/filters",{method:"POST",form});toast("필터를 추가했어요.");filtersSettingsScreen()}catch(e){toast(e.message)}
    };
    document.querySelectorAll("[data-delete-filter]").forEach(b=>b.onclick=async()=>{
      if(!confirm("이 필터를 삭제할까요?"))return;
      try{await api("/api/v2/filters/"+encodeURIComponent(b.dataset.deleteFilter),{method:"DELETE"});toast("필터를 삭제했어요.");filtersSettingsScreen()}catch(e){toast(e.message)}
    });
  }catch(e){$("#app").innerHTML=standaloneShell("필터",'<div class="center">'+esc(e.message)+'</div>');bind()}
}
function accountChoiceScreen(type){
  const src=accountSource();
  let title="",options=[],current="";
  if(type==="privacy"){title="공개 범위";current=src.privacy||"public";options=[["public","공개","누구나 볼 수 있으며 공개 타임라인에도 표시"],["unlisted","조용한 공개","프로필과 홈에는 보이지만 공개 타임라인에서는 숨김"],["private","팔로워만","팔로워와 멘션된 계정만 볼 수 있음"]]}
  else if(type==="reply"){title="답장 공개 범위";current=replyVisibilityPref();options=[["match","답장 대상 게시물과 맞춤","원글의 공개 범위를 그대로 사용"],["public","공개","답글을 공개로 작성"],["unlisted","조용한 공개","답글을 조용한 공개로 작성"],["private","팔로워만","답글을 팔로워 전용으로 작성"]]}
  else if(type==="quote"){title="인용 허용 범위";current=src.quote_policy||"public";options=[["public","누구나","차단된 계정을 제외하고 누구나 인용 가능"],["followers","팔로워만","팔로워와 작성자만 인용 가능"],["nobody","나만","다른 계정의 인용을 허용하지 않음"]]}
  else if(type==="language"){title="게시글 언어";current=src.language||"";options=[["","서버 기본값","서버 또는 자동 감지 설정 사용"],["ko","한국어","한국어로 게시"],["ja","日本語","일본어로 게시"],["en","English","영어로 게시"],["zh","中文","중국어로 게시"],["es","Español","스페인어로 게시"],["fr","Français","프랑스어로 게시"],["de","Deutsch","독일어로 게시"],["ru","Русский","러시아어로 게시"]]}
  const body='<div class="account-choice-list">'+options.map(x=>'<button data-account-choice="'+esc(type)+'" data-value="'+esc(x[0])+'" class="'+(String(current)===String(x[0])?"selected":"")+'"><span><b>'+esc(x[1])+'</b><small>'+esc(x[2])+'</small></span><strong>'+(String(current)===String(x[0])?"✓":"")+'</strong></button>').join("")+'</div>';
  $("#app").innerHTML=standaloneShell(title,body);bind();
}
async function applyAccountChoice(type,value){
  if(type==="reply"){
    store.set(scopedKey("reply_visibility"),value);toast("답장 기본값을 저장했어요.");
  }else{
    const key=type==="privacy"?"source[privacy]":type==="quote"?"source[quote_policy]":"source[language]";
    const ok=await updateAccountCredential(key,value,{quiet:true});if(!ok)return;
    toast("계정 설정을 저장했어요.");
  }
  if(state.navStack.length)state.navStack.pop();
  accountSettingsScreen();
}
function openLoginEmailSettings(){
  try{window.open("https://"+state.session.host+"/auth/edit","_blank","noopener")}catch{toast("서버 계정 설정을 열지 못했어요.")}
}

async function settingsView(){
  const d=await pushDiagnostics();
  const notif=("Notification"in window)?Notification.permission:"unsupported";
  const pushPrefs=pushAlertPrefs();
  let build=null;try{const r=await fetch("./build.json?ts="+Date.now(),{cache:"no-store"});if(r.ok)build=await r.json()}catch{}
  state.buildInfo=build;
  const permissionText=notif==="granted"?"허용됨":notif==="denied"?"차단됨":notif==="default"?"아직 묻지 않음":"지원 안 됨";
  const currentPushEntry=savedAccounts().find(x=>x.key===currentAccountKey());
  const pushMasterOn=!!currentPushEntry&&pushEnabledForAccount(currentPushEntry)&&d.regd;
  const pushState=pushMasterOn?"켜짐":"꺼짐";
  const body=`<div class="settings iphone-settings">
    ${!standalone()?'<div class="install-card"><b>홈 화면에 설치하기</b><p>iPhone/iPad에서 백그라운드 알림을 받으려면 Safari 공유 → 홈 화면에 추가가 필요합니다.</p></div>':""}

    <div class="section settings-group"><h3>화면</h3>
      <div class="setting-row setting-split"><div><b>테마</b><small>렌톤 화면의 밝기를 선택합니다.</small></div><select id="themeSel" class="compact-select"><option value="system">시스템</option><option value="light">라이트</option><option value="dark">다크</option></select></div>
      <div class="setting-row"><div class="setting-titleline"><div><b>강조 색상</b><small>버튼과 선택 표시의 색상입니다.</small></div><span id="accentName">사용자 색상</span></div>
        <div class="accent-presets">
          ${[["#249fe7","파랑"],["#f44fa0","핑크"],["#ff8b20","주황"],["#8751ef","보라"],["#ef5350","빨강"],["#37c6aa","민트"],["#60717b","회색"]].map(x=>`<button type="button" class="accent-dot ${state.accent.toLowerCase()===x[0]?"selected":""}" data-accent-preset="${x[0]}" aria-label="${x[1]}" style="--dot:${x[0]}"></button>`).join("")}
          <label class="accent-custom" aria-label="직접 색상 선택"><input id="accentSel" type="color" value="${esc(state.accent)}"><span>＋</span></label>
        </div>
      </div>
      <div class="setting-row ui-size-row">
        <div class="setting-titleline"><div><b>UI 크기</b><small>글자·아이콘·버튼·타임라인 간격을 함께 조절합니다.</small></div><strong id="uiScaleValue">${Math.round(state.uiScale*100)}%</strong></div>
        <div class="ui-scale-control"><span>가</span><input id="uiScaleRange" type="range" min="80" max="120" step="5" value="${Math.round(state.uiScale*100)}"><span class="large">가</span></div>
      </div>
    </div>

    <div class="section settings-group"><h3>알림</h3>
      <div class="setting-intro"><b>휴대폰 알림</b><p>홈 화면에 설치한 렌톤이 닫혀 있어도 받을 알림을 선택합니다.</p></div>
      ${[
        ["dm","DM","나에게 비공개 직접 메시지가 왔을 때"],
        ["mention","멘션과 답글","내 아이디가 언급되거나 내 게시물에 답글이 달릴 때"],
        ["status","계정 새 게시물","프로필의 종 알림을 켠 계정이 새 게시물을 올릴 때"],
        ["interactions","좋아요와 부스트","내 게시물이 좋아요 또는 부스트되었을 때"],
        ["follow","팔로우","새 팔로워가 생기거나 팔로우 요청이 왔을 때"]
      ].map(x=>`<label class="notification-setting-row"><span><b>${x[1]}</b><small>${x[2]}</small></span><input type="checkbox" class="lenton-switch" data-push-pref="${x[0]}" ${pushPrefs[x[0]]?"checked":""}></label>`).join("")}
      <div class="setting-note">DM과 멘션은 Mastodon 서버 종류에 따라 하나의 ‘멘션’ 푸시로 함께 전달될 수 있습니다.</div>
      <div class="push-summary">
        <div><span>현재 알림 상태</span><b class="${pushMasterOn?"ok":"bad"}">${pushState}</b></div>
        <div><span>iPhone 알림 권한</span><b>${esc(permissionText)}</b></div>
      </div>
      <div class="setting-row"><button class="${pushMasterOn?"danger":"primary"} settings-push-button" data-action="${pushMasterOn?"disablepush":"enablepush"}">${pushMasterOn?"알림 연결 끄기":"휴대폰 알림 켜기"}</button></div>
      ${state.pushError?`<div class="notice bad">${esc(state.pushError)}</div>`:""}
      <details class="push-details"><summary>알림 연결 상태 자세히 보기</summary>
        <div class="kv"><span>홈 화면 웹앱</span><b>${standalone()?"예":"아니오"}</b></div>
        <div class="kv"><span>Web Push 지원</span><b>${d.supported?"지원":"미지원"}</b></div>
        <div class="kv"><span>Push 등록</span><b>${d.regd?"등록됨":"미등록"}</b></div>
        <div class="kv"><span>마지막 Push 수신</span><b>${esc(d.last)}</b></div>
      </details>
    </div>

    <div class="section settings-group"><h3>계정</h3>
      <div class="setting-row"><button class="settings-link" data-action="accountSettings"><span><b>계정 설정</b><small>프로필 · 알림 · 뮤트 · 차단 · 필터 · 게시글 기본값</small></span><span>›</span></button></div>
      <div class="setting-row setting-split"><div><b>서버</b><small>현재 로그인한 Mastodon 서버</small></div><span>${esc(state.session.host)}</span></div>
      <div class="setting-row"><button class="danger settings-logout" data-action="logout">현재 계정 로그아웃</button></div>
    </div>

    <div class="section settings-group"><h3>지원</h3>
      <div class="setting-row"><button class="settings-link" data-action="inquiry"><span><b>문의 / 기능 건의</b><small>오류 신고나 기능 의견을 보냅니다.</small></span><span>›</span></button></div>
      <div class="setting-row"><button class="settings-link" data-action="updateHistory"><span><b>업데이트 내역</b><small>현재 버전과 변경 내용을 확인합니다.</small></span><span>›</span></button></div>
    </div>

    <div class="section settings-group"><h3>버전</h3>
      <div class="setting-row setting-split"><div><b>Android 원본</b></div><span>v${esc(ANDROID?.versionName||"?")} · code ${esc(ANDROID?.versionCode||"?")}</span></div>
      <div class="setting-row setting-split"><div><b>PWA revision</b></div><span>${esc(build?.pwaRevision||currentPwaToken()||"unknown")}</span></div>
    </div>
  </div>`;
  $("#app").innerHTML=shell("설정",body,{gear:false});
  $("#themeSel").value=state.theme; bind();
}
async function openNotificationDeepLink(id){
  try{
    const n=await api(`/api/v1/notifications/${id}`);
    if(n.status?.visibility==="direct"){
      const cs=await api("/api/v1/conversations",{query:{limit:"40"}});
      state._conversations=cs;
      const c=cs.find(x=>x.accounts?.some(a=>a.id===n.account?.id));
      if(c){state.view="dm";return openConversation(c.id)}
    }
    if(n.status)return openThread(n.status.id);
    if(n.account)return openProfile(n.account.id);
    state.view="notifications";render();
  }catch(e){state.view="notifications";render();toast(e.message)}
}
function render(){
  if(!state.session){$("#app").innerHTML=loginView();$("#loginBtn")?.addEventListener("click",beginLogin);renderToast();return}
  if(state.view==="home")homeView();
  else if(state.view==="search")searchView();
  else if(state.view==="notifications")notificationsView(false);
  else if(state.view==="dm")dmView();
  else if(state.view==="profile")profileView();
  else settingsView();
}

function updateActionButtons(id,kind,on,delta=0){
  document.querySelectorAll(`[data-action="${kind}"][data-id="${CSS.escape(String(id))}"]`).forEach(btn=>{
    btn.classList.toggle("on",on);
    const countEl=btn.querySelector(".count");
    if(countEl&&delta){
      const n=parseInt(countEl.textContent||"0",10)||0;
      countEl.textContent=String(Math.max(0,n+delta));
    }
    if(kind==="fav"){
      const html=lentonIcon(on?"heartFill":"heart");
      const icon=btn.querySelector(".lenton-icon");
      if(icon){const wrap=document.createElement("span");wrap.innerHTML=html;icon.replaceWith(wrap.firstElementChild)}
      else btn.insertAdjacentHTML("afterbegin",html);
    }
    if(kind==="bookmark"){
      const html=lentonIcon(on?"bookmarkFill":"bookmark");
      const icon=btn.querySelector(".lenton-icon");
      if(icon){const wrap=document.createElement("span");wrap.innerHTML=html;icon.replaceWith(wrap.firstElementChild)}
      else btn.innerHTML=html;
    }
  });
}
async function statusAction(id,kind){
  const btn=document.querySelector(`[data-action="${kind}"][data-id="${CSS.escape(String(id))}"]`);
  if(kind==="boost"&&btn?.disabled)return;
  const wasOn=!!btn?.classList.contains("on");
  const next=!wasOn;
  updateActionButtons(id,kind,next,next?1:-1);
  const endpoint=kind==="fav"?(next?"favourite":"unfavourite"):kind==="boost"?(next?"reblog":"unreblog"):(next?"bookmark":"unbookmark");
  try{
    const st=await api(`/api/v1/statuses/${id}/${endpoint}`,{method:"POST",form:{}});
    const truth=kind==="fav"?!!st.favourited:kind==="boost"?!!st.reblogged:!!st.bookmarked;
    if(truth!==next)updateActionButtons(id,kind,truth,truth?1:-1);
  }catch(e){
    updateActionButtons(id,kind,wasOn,wasOn?1:-1);
    toast(e.message);
  }
}
function closeStatusPopup(){document.querySelector(".android-popup-shade.status-popup")?.remove()}
async function openStatusMenu(id){
  closeStatusPopup();
  try{
    const st=await api(`/api/v1/statuses/${id}`);
    const own=st.account?.id===state.me?.id;
    let rel=null;
    if(!own){
      try{const a=await api("/api/v1/accounts/relationships",{query:{"id[]":st.account.id}});rel=Array.isArray(a)?a[0]:null}catch{}
    }
    const shade=document.createElement("div");shade.className="android-popup-shade status-popup";
    const items=own?[
      ["pin",st.pinned?"고정 해제":"툿 고정"],
      ["delete","삭제"],
      ["copy","링크 복사"]
    ]:[
      ["profile","프로필 보기"],
      ["mute",rel?.muting?"뮤트 해제":"뮤트"],
      ["block",rel?.blocking?"차단 해제":"차단"],
      ["report","신고"],
      ["copy","링크 복사"]
    ];
    shade.innerHTML=`<div class="android-popup">${items.map(x=>`<button data-status-menu="${x[0]}">${esc(x[1])}</button>`).join("")}</div>`;
    document.body.append(shade);
    shade.onclick=e=>{if(e.target===shade)closeStatusPopup()};
    shade.querySelectorAll("[data-status-menu]").forEach(b=>b.onclick=async()=>{
      const action=b.dataset.statusMenu;closeStatusPopup();
      try{
        if(action==="copy"){await navigator.clipboard.writeText(st.url||"");toast("링크를 복사했어요.")}
        else if(action==="profile")openProfile(st.account.id);
        else if(action==="pin"){await api(`/api/v1/statuses/${id}/${st.pinned?"unpin":"pin"}`,{method:"POST",form:{}});toast(st.pinned?"고정을 해제했어요.":"고정했어요.")}
        else if(action==="delete"){
          if(!confirm("이 게시물을 삭제할까요?"))return;
          await api(`/api/v1/statuses/${id}`,{method:"DELETE"});
          document.querySelectorAll(`[data-status-id="${CSS.escape(String(id))}"]`).forEach(x=>x.remove());
          toast("삭제했어요.");
        }else if(action==="mute"){
          const endpoint=rel?.muting?"unmute":"mute";
          await api(`/api/v1/accounts/${st.account.id}/${endpoint}`,{method:"POST",form:{}});
          toast(rel?.muting?"뮤트를 해제했어요.":"뮤트했어요.");
        }else if(action==="block"){
          if(!rel?.blocking&&!confirm("이 계정을 차단할까요?"))return;
          const endpoint=rel?.blocking?"unblock":"block";
          await api(`/api/v1/accounts/${st.account.id}/${endpoint}`,{method:"POST",form:{}});
          toast(rel?.blocking?"차단을 해제했어요.":"차단했어요.");
        }else if(action==="report"){
          const reason=prompt("신고 사유를 입력해 주세요.")||"";
          await api("/api/v1/reports",{method:"POST",form:{account_id:st.account.id,"status_ids[]":st.id,comment:reason,forward:"false"}});
          toast("신고를 접수했어요.");
        }
      }catch(e){toast(e.message)}
    });
  }catch(e){toast(e.message)}
}
function openMediaViewer(url,alt=""){
  document.querySelector(".media-viewer")?.remove();
  const v=document.createElement("div");v.className="media-viewer";
  v.innerHTML=`<button class="media-viewer-close" aria-label="닫기">×</button><div class="media-viewer-stage"><img src="${esc(url)}" alt="${esc(alt)}"></div>`;
  document.body.append(v);
  v.querySelector(".media-viewer-close").onclick=()=>v.remove();
  v.onclick=e=>{if(e.target===v||e.target.classList.contains("media-viewer-stage"))v.remove()};
}
async function openProfileMediaDetail(statusId,index=0){
  if(!statusId)return;
  $("#app").innerHTML='<div class="media-status-page"><header class="media-status-top"><button class="back" data-action="backScreen" aria-label="뒤로가기">‹</button><button class="media-status-more" data-media-thread="'+esc(statusId)+'" aria-label="게시물 보기">⋮</button></header><div class="center">불러오는 중…</div></div>';bind();
  try{
    const st=await api("/api/v1/statuses/"+statusId),a=st.account||{},media=st.media_attachments||[],m=media[Math.max(0,Math.min(media.length-1,Number(index)||0))]||media[0];
    const src=m?.url||m?.remote_url||m?.preview_url||"",preview=m?.preview_url||src,type=m?.type||"image";
    const stage=(type==="video"||type==="gifv")?'<video class="media-status-asset" controls playsinline poster="'+esc(preview)+'" src="'+esc(src)+'"></video>':'<img class="media-status-asset" src="'+esc(src)+'" alt="'+esc(m?.description||"")+'">';
    const body='<header class="media-status-top"><button class="back" data-action="backScreen" aria-label="뒤로가기">‹</button><button class="media-status-more" data-media-thread="'+esc(statusId)+'" aria-label="게시물 보기">⋮</button></header>'+
      '<div class="media-status-stage">'+stage+'</div>'+
      '<div class="media-status-info"><div class="media-status-author"><img src="'+esc(a.avatar_static||a.avatar||"")+'" alt=""><div><b>'+renderEmojiText(a.display_name||a.username||"",a.emojis||[])+'</b><span>@'+esc(a.acct||"")+'</span></div></div>'+
      '<div class="media-status-body">'+renderRichText(st.content||"")+'</div>'+
      '<button class="media-status-readmore" data-media-thread="'+esc(statusId)+'">…더보기</button></div>';
    $("#app").innerHTML='<div class="media-status-page">'+body+'</div>';bind();
  }catch(e){toast(e.message);goBackScreen()}
}
function threadStatusCard(raw,{connectTop=false,connectBottom=false,current=false,replyCountOverride=null}={}){
  const cls=["thread-node",connectTop?"thread-connect-top":"",connectBottom?"thread-connect-bottom":"",current?"thread-current":""].filter(Boolean).join(" ");
  return '<div class="'+cls+'">'+statusCard(raw,{replyCountOverride})+'</div>';
}
async function openThread(id,showAllAncestors=false){
  state.returnView=state.view;
  $("#app").innerHTML=standaloneShell("게시물",'<div class="center">불러오는 중…</div>');bind();
  try{
    const [st,ctx]=await Promise.all([
      api(`/api/v1/statuses/${id}`),
      api(`/api/v1/statuses/${id}/context`)
    ]);
    const ancestors=ctx.ancestors||[],desc=ctx.descendants||[];
    const visibleAnc=showAllAncestors?ancestors:ancestors.slice(-2);
    const older=ancestors.length>visibleAnc.length?`<button class="thread-older" data-thread-older="${esc(id)}">이전 대화 보기  ›</button>`:"";
    const nodes=[...visibleAnc,st,...desc],allNodes=[...ancestors,st,...desc];
    const body=older+nodes.map((raw,i)=>{
      const cur=raw.reblog||raw,idNow=String(cur.id||""),parentId=String(cur.in_reply_to_id||"");
      const earlierIds=new Set(nodes.slice(0,i).map(statusId).filter(Boolean).map(String));
      const connectTop=!!parentId&&earlierIds.has(parentId);
      const connectBottom=nodes.slice(i+1).some(x=>String((x.reblog||x)?.in_reply_to_id||"")===idNow);
      const derivedReplies=allNodes.filter(x=>String((x.reblog||x)?.in_reply_to_id||"")===idNow).length;
      const replyCountOverride=Math.max(Number(cur.replies_count||0),derivedReplies);
      return threadStatusCard(raw,{connectTop,connectBottom,current:idNow===String(st.id||""),replyCountOverride});
    }).join("");
    $("#app").innerHTML=standaloneShell("게시물",body);bind();
  }catch(e){toast(e.message)}
}

async function newList(){
  const title=prompt("새 리스트 이름");if(!title)return;
  try{await api("/api/v1/lists",{method:"POST",form:{title}});await loadLists();render()}catch(e){toast(e.message)}
}
async function loadCustomEmojis({fresh=false}={}){
  if(Array.isArray(state.customEmojis)&&!fresh)return state.customEmojis;
  const key=scopedKey("emoji_cache_v1"),cached=store.get(key,null);
  if(!fresh&&cached?.at&&Date.now()-Number(cached.at)<24*60*60*1000&&Array.isArray(cached.items)){
    state.customEmojis=cached.items;
    setTimeout(()=>loadCustomEmojis({fresh:true}).catch(()=>{}),0);
    return state.customEmojis;
  }
  try{
    const items=await api("/api/v1/custom_emojis");
    state.customEmojis=Array.isArray(items)?items:[];
    store.set(key,{at:Date.now(),items:state.customEmojis});
    return state.customEmojis;
  }catch{
    if(Array.isArray(cached?.items)){state.customEmojis=cached.items;return state.customEmojis}
    state.customEmojis=[];return [];
  }
}
async function uploadComposerFile(file){
  const fd=new FormData();fd.append("file",file);
  try{return await apiMultipart("/api/v2/media",fd)}
  catch{return await apiMultipart("/api/v1/media",fd)}
}
function composeToolMarkup(ct={},replyMode=false){
  const configured=replyMode?["photo","camera","cw","emoji","plus"]:(Array.isArray(ct.toolOrder)&&ct.toolOrder.length?[...ct.toolOrder]:["photo","camera","emoji","poll","cw","plus"]);
  if(!configured.includes("emoji")){
    const gifIndex=configured.indexOf("gif");
    if(gifIndex>=0)configured.splice(gifIndex,1,"emoji");
    else{
      const cameraIndex=configured.indexOf("camera");
      configured.splice(cameraIndex>=0?cameraIndex+1:Math.min(2,configured.length),0,"emoji");
    }
  }
  const order=[...configured.filter((x,i)=>x!=="plus"&&configured.indexOf(x)===i),"plus"];
  const enabled={
    photo:ct.hasPhoto!==false,camera:ct.hasCamera!==false,gif:ct.hasGif!==false,
    poll:ct.hasPoll!==false,cw:ct.cw!==""&&ct.cw!==false,plus:ct.hasThread!==false
  };
  const html={
    photo:'<button type="button" id="composeAttach" aria-label="사진">'+lentonIcon("photo")+'</button>',
    camera:'<button type="button" id="composeCamera" aria-label="카메라">'+lentonIcon("camera")+'</button>',
    gif:'<button type="button" id="composeGif" aria-label="GIF">GIF</button>',
    poll:'<button type="button" id="composePoll" aria-label="투표">☷</button>',
    cw:'<button type="button" class="compose-cw-toggle" id="composeCW" aria-label="CW">CW</button>',
    plus:'<button type="button" class="part-add" id="addPart" aria-label="타래 추가">＋</button>',
    emoji:'<button type="button" id="composeEmoji" class="compose-emoji-secondary" aria-label="서버 이모지">'+lentonIcon("smile")+'</button>'
  };
  enabled.emoji=true;
  return order.filter(x=>enabled[x]&&html[x]).map(x=>html[x]).join("");
}
function attachComposerViewportDock(m){
  window.__lentonComposeViewportCleanup?.();
  const vv=window.visualViewport,dock=m?.querySelector(".compose-bottom-dock");
  if(!dock)return ()=>{};
  let raf=0,lastKeyboardOffset=0,pendingEnsureVisible=false;
  const update=(ensureVisible=false)=>{
    if(ensureVisible)pendingEnsureVisible=true;
    cancelAnimationFrame(raf);
    raf=requestAnimationFrame(()=>{
      if(!m.isConnected)return;
      const shouldEnsure=pendingEnsureVisible;pendingEnsureVisible=false;
      const viewport=window.visualViewport;
      const currentWidth=Math.round(viewport?.width||window.innerWidth||0);
      if(window.__lentonComposeLayoutWidth!==currentWidth){
        window.__lentonComposeLayoutWidth=currentWidth;
        window.__lentonComposeLayoutHeight=Math.max(window.innerHeight||0,document.documentElement.clientHeight||0,viewport?.height||0);
      }
      const baseHeight=Math.max(Number(window.__lentonComposeLayoutHeight)||0,window.innerHeight||0,document.documentElement.clientHeight||0);
      const keyboardOffset=viewport
        ? Math.max(0,Math.round(baseHeight-viewport.height-viewport.offsetTop))
        : 0;
      const keyboardOpened=lastKeyboardOffset<=80&&keyboardOffset>80;
      lastKeyboardOffset=keyboardOffset;
      m.style.setProperty("--compose-keyboard-offset",keyboardOffset+"px");
      m.classList.toggle("keyboard-open",keyboardOffset>80);
      const focused=m.querySelector("textarea:focus,input:focus");
      if((shouldEnsure||keyboardOpened)&&focused&&keyboardOffset>80){
        const rect=focused.getBoundingClientRect();
        const dockTop=dock.getBoundingClientRect().top;
        if(rect.bottom>dockTop-12||rect.top<0)focused.scrollIntoView({block:"center",behavior:"auto"});
      }
    });
  };
  const onResize=()=>update(false);
  const onViewportScroll=()=>update(false);
  const onFocusIn=()=>setTimeout(()=>update(true),40);
  const onFocusOut=()=>setTimeout(()=>update(false),80);
  window.addEventListener("resize",onResize,{passive:true});
  vv?.addEventListener("resize",onResize,{passive:true});
  vv?.addEventListener("scroll",onViewportScroll,{passive:true});
  m.addEventListener("focusin",onFocusIn);
  m.addEventListener("focusout",onFocusOut);
  update(true);
  const cleanup=()=>{
    cancelAnimationFrame(raf);
    window.removeEventListener("resize",onResize);
    vv?.removeEventListener("resize",onResize);
    vv?.removeEventListener("scroll",onViewportScroll);
    m.removeEventListener("focusin",onFocusIn);
    m.removeEventListener("focusout",onFocusOut);
    if(window.__lentonComposeViewportCleanup===cleanup)window.__lentonComposeViewportCleanup=null;
  };
  window.__lentonComposeViewportCleanup=cleanup;
  return cleanup;
}
function compose(reply=null,forcedVisibility=null,initialRecipients=[],replyContext=[]){
  let historyPushed=false;
  window.__lentonComposeLayoutHeight=Math.max(window.innerHeight||0,document.documentElement.clientHeight||0,window.visualViewport?.height||0);
  window.__lentonComposeLayoutWidth=Math.round(window.visualViewport?.width||window.innerWidth||0);
  let parts=[{text:"",cw:!!reply?.spoiler_text,spoiler:reply?.spoiler_text||"",media:[],poll:null}];
  let visibility=composeDefaultVisibility(reply,forcedVisibility),activePart=0,uploading=false;
  const recips=[];
  const addRecipient=a=>{if(a&&a.id!==state.me?.id&&!recips.some(x=>String(x.id)===String(a.id)))recips.push({...a,on:true})};
  for(const a of initialRecipients||[])addRecipient(a);
  if(reply){
    addRecipient(reply.account);(reply.mentions||[]).forEach(addRecipient);
    for(const st of replyContext||[]){addRecipient(st.account);(st.mentions||[]).forEach(addRecipient)}
  }
  const dirty=()=>parts.some(p=>p.text.trim()||p.spoiler.trim()||p.media.length||p.poll?.options?.some(x=>x.trim()));
  const replyContextRows=()=>{
    if(!reply)return "";
    const uniq=new Map();for(const st of [...(replyContext||[]),reply])if(st?.id)uniq.set(String(st.id),st);
    return '<div class="compose-thread-context">'+[...uniq.values()].slice(-5).map(st=>{const a=st.account||{};return '<div class="compose-thread-row"><img src="'+esc(a.avatar_static||a.avatar||"")+'" alt=""><div><div class="compose-thread-author"><b>'+renderEmojiText(a.display_name||a.username||"",a.emojis||[])+'</b><span>@'+esc(a.acct||"")+' · '+fmtTime(st.created_at)+'</span></div><div class="compose-thread-text">'+renderRichText(st.content||"")+'</div></div></div>';}).join("")+'</div>';
  };
  const replySummaryText=()=>{
    const selected=recips.filter(x=>x.on);if(!selected.length)return "답글 받을 계정 선택";
    const first=selected[0],name=first.display_name||first.username||first.acct||"상대";
    return selected.length>1?name+" 외 "+(selected.length-1)+"명에게 보내는 답글":name+"에게 보내는 답글";
  };
  const directRecipientText=()=>{
    const selected=recips.filter(x=>x.on);if(!selected.length)return "받는 사람";
    const first=selected[0],name=first.display_name||first.username||first.acct||"상대";
    return selected.length>1?"받는 사람 "+name+" 외 "+(selected.length-1)+"명":"받는 사람 "+name;
  };
  const confirmClose=()=>!dirty()||confirm("작성 중인 내용을 버릴까요?");
  const hydrateRecipients=async()=>{
    for(let i=0;i<recips.length;i++){
      if(recips[i].avatar||!recips[i].id)continue;
      try{const a=await api(`/api/v1/accounts/${recips[i].id}`);recips[i]={...recips[i],avatar:a.avatar_static||a.avatar||"",display_name:a.display_name||a.username||recips[i].acct}}catch{}
    }
    draw(false);
  };
  const draw=(refocus=true)=>{
    window.__lentonComposeViewportCleanup?.();
    let old=$(".modal");if(old)old.remove();
    const m=document.createElement("div");m.className="modal compose-modal"+(reply?" reply-compose":"");
    const ct=ANDROID?.renderer?.compose||{};
    const visOptions=[["public","공개"],["unlisted","조용히 공개"],["private","팔로워만"],["direct","DM"]];
    const showThreadLabels=!reply&&visibility!=="direct"&&parts.length>1;
    m.innerHTML=`<div class="sheet compose-sheet">
      <div class="sheet-head"><button class="iconbtn" id="closeCompose">×</button><h2>${reply?(ct.replyTitle||"답글"):(visibility==="direct"?"새 DM":(ct.newTitle||"새 게시물"))}</h2><button class="primary" id="sendCompose">${reply?(ct.replyButton||"답글"):(visibility==="direct"?"보내기":(ct.postButton||"게시"))}</button></div>
      ${reply?replyContextRows()+`<button type="button" class="compose-reply-summary" id="replyRecipientPicker">${esc(replySummaryText())}</button>`:""}
      ${!reply&&visibility==="direct"&&recips.length?`<div class="compose-direct-recipient">${esc(directRecipientText())}</div>`:""}
      ${!reply&&visibility!=="direct"&&recips.length?`<div class="recips">${recips.map((r,i)=>`<button data-r="${i}" class="${r.on?"":"off"}">${r.avatar?`<img src="${esc(r.avatar)}" alt="">`:""}<span>@${esc(r.acct)}</span></button>`).join("")}</div>`:""}
      <div id="parts">${parts.map((p,i)=>`<div class="part ${i===activePart?"active":""}" data-p="${i}">
        ${i>0?`<div class="part-remove-row">${showThreadLabels?`<b>게시물 ${i+1}</b>`:""}<button type="button" data-remove-part="${i}" aria-label="추가 게시물 삭제">×</button></div>`:(showThreadLabels?`<div class="part-head"><b>게시물 1</b></div>`:"")}
        <div class="part-body"><img class="avatar" src="${esc(state.me?.avatar_static||state.me?.avatar||"")}" alt=""><div class="part-fields">
          ${p.cw?`<input type="text" data-sp="${i}" placeholder="내용 경고" value="${esc(p.spoiler)}">`:""}
          <textarea data-t="${i}" placeholder="${reply?"답글을 입력하세요":(visibility==="direct"?"메시지를 입력하세요":"무슨 일이 일어나고 있나요?")}">${esc(p.text)}</textarea>
          ${p.poll?`<div class="compose-poll" data-poll-box="${i}">
            ${p.poll.options.map((o,j)=>`<div class="compose-poll-option"><input data-poll-option="${i}:${j}" value="${esc(o)}" placeholder="선택지 ${j+1}">${p.poll.options.length>2?`<button type="button" data-poll-remove="${i}:${j}">×</button>`:""}</div>`).join("")}
            <div class="compose-poll-settings">
              <button type="button" data-poll-add="${i}" ${p.poll.options.length>=4?"disabled":""}>＋ 선택지</button>
              <select data-poll-expire="${i}"><option value="300" ${p.poll.expires===300?"selected":""}>5분</option><option value="1800" ${p.poll.expires===1800?"selected":""}>30분</option><option value="3600" ${p.poll.expires===3600?"selected":""}>1시간</option><option value="21600" ${p.poll.expires===21600?"selected":""}>6시간</option><option value="86400" ${p.poll.expires===86400?"selected":""}>1일</option><option value="604800" ${p.poll.expires===604800?"selected":""}>7일</option></select>
              <label><input type="checkbox" data-poll-multiple="${i}" ${p.poll.multiple?"checked":""}> 복수 선택</label>
            </div>
          </div>`:""}
          ${p.media.length?`<div class="compose-media">${p.media.map((x,j)=>`<div class="compose-media-item"><img src="${esc(x.preview_url||x.url||"")}" alt=""><button data-remove-media="${i}:${j}">×</button></div>`).join("")}</div>`:""}
        </div></div>
      </div>`).join("")}</div>
      <div class="compose-bottom-dock">
        <div class="compose-meta-row compose-visibility-row"><span id="composeVisibilityLabel" class="compose-visibility-label">${esc((visOptions.find(x=>x[0]===visibility)||visOptions[0])[1])}</span><span class="compose-visibility-chevron" aria-hidden="true"></span><select id="composeVisibility" class="compose-visibility" aria-label="공개 범위">${visOptions.map(x=>`<option value="${x[0]}" ${visibility===x[0]?"selected":""}>${x[1]}</option>`).join("")}</select></div>
        <div class="compose-tools android-compose-tools">
          ${composeToolMarkup(ct,!!reply)}
          <input id="composeFile" type="file" accept="image/*,video/*" multiple hidden>
          <input id="composeCameraFile" type="file" accept="image/*" capture="environment" hidden>
          <input id="composeGifFile" type="file" accept="image/gif" hidden>
        </div>
        <div id="emojiPicker" class="emoji-picker" hidden></div>
      </div>
    </div>`;
    document.body.append(m);
    attachComposerViewportDock(m);
    if(!historyPushed){history.pushState({...history.state,lentonCompose:true},"",location.href);historyPushed=true}
    window.__lentonComposeGuard=confirmClose;
    window.__lentonComposeClose=()=>{window.__lentonComposeViewportCleanup?.();document.querySelector(".compose-modal")?.remove();historyPushed=false;window.__lentonComposeLayoutHeight=0;window.__lentonComposeLayoutWidth=0;window.__lentonComposeGuard=null;window.__lentonComposeClose=null};
    const ta=m.querySelector(`[data-t="${activePart}"]`);
    if(refocus)requestAnimationFrame(()=>ta?.focus());
    m.querySelectorAll("[data-t]").forEach(x=>{
      x.addEventListener("focus",e=>activePart=+e.target.dataset.t);
      x.addEventListener("input",e=>parts[+e.target.dataset.t].text=e.target.value);
    });
    m.querySelectorAll("[data-sp]").forEach(x=>x.addEventListener("input",e=>parts[+e.target.dataset.sp].spoiler=e.target.value));
    m.querySelectorAll("[data-cw]").forEach(x=>x.addEventListener("change",e=>{parts[+e.target.dataset.cw].cw=e.target.checked;draw(false)}));
    m.querySelectorAll("[data-r]").forEach(x=>x.addEventListener("click",e=>{recips[+e.currentTarget.dataset.r].on=!recips[+e.currentTarget.dataset.r].on;draw(false)}));
    $("#replyRecipientPicker",m)?.addEventListener("click",()=>{
      const shade=document.createElement("div");shade.className="reply-recipient-shade";
      shade.innerHTML='<div class="reply-recipient-dialog"><h3>답글 받을 계정 선택</h3><div class="reply-recipient-list">'+recips.map((r,i)=>'<label><span class="reply-recipient-person">'+(r.avatar?'<img src="'+esc(r.avatar)+'" alt="">':"")+'<span><b>'+renderEmojiText(r.display_name||r.username||r.acct||"",r.emojis||[])+'</b><small>@'+esc(r.acct||"")+'</small></span></span><input type="checkbox" data-reply-recipient="'+i+'" '+(r.on?"checked":"")+'></label>').join("")+'</div><div class="reply-recipient-actions"><button type="button" data-reply-cancel>취소</button><button type="button" data-reply-done>완료</button></div></div>';
      document.body.append(shade);
      shade.querySelector("[data-reply-cancel]").onclick=()=>shade.remove();
      shade.querySelector("[data-reply-done]").onclick=()=>{shade.querySelectorAll("[data-reply-recipient]").forEach(x=>recips[Number(x.dataset.replyRecipient)].on=x.checked);if(!recips.some(x=>x.on)&&recips.length)recips[0].on=true;shade.remove();draw(false)};
    });
    m.querySelectorAll("[data-remove-media]").forEach(x=>x.onclick=e=>{const [pi,mi]=e.currentTarget.dataset.removeMedia.split(":").map(Number);parts[pi].media.splice(mi,1);activePart=pi;draw(false)});
    m.querySelectorAll("[data-poll-option]").forEach(x=>x.oninput=e=>{const [pi,oi]=e.currentTarget.dataset.pollOption.split(":").map(Number);if(parts[pi].poll)parts[pi].poll.options[oi]=e.currentTarget.value});
    m.querySelectorAll("[data-poll-add]").forEach(x=>x.onclick=e=>{const pi=+e.currentTarget.dataset.pollAdd;if(parts[pi].poll&&parts[pi].poll.options.length<4)parts[pi].poll.options.push("");activePart=pi;draw(false)});
    m.querySelectorAll("[data-poll-remove]").forEach(x=>x.onclick=e=>{const [pi,oi]=e.currentTarget.dataset.pollRemove.split(":").map(Number);if(parts[pi].poll&&parts[pi].poll.options.length>2)parts[pi].poll.options.splice(oi,1);activePart=pi;draw(false)});
    m.querySelectorAll("[data-poll-expire]").forEach(x=>x.onchange=e=>{const pi=+e.currentTarget.dataset.pollExpire;if(parts[pi].poll)parts[pi].poll.expires=+e.currentTarget.value});
    m.querySelectorAll("[data-poll-multiple]").forEach(x=>x.onchange=e=>{const pi=+e.currentTarget.dataset.pollMultiple;if(parts[pi].poll)parts[pi].poll.multiple=e.currentTarget.checked});
    $("#composeVisibility",m).onchange=e=>{visibility=e.target.value;const label=$("#composeVisibilityLabel",m),opt=e.target.selectedOptions?.[0];if(label)label.textContent=opt?.textContent||visibility};
    $("#addPart",m)?.addEventListener("click",()=>{parts.push({text:"",cw:!!reply?.spoiler_text,spoiler:reply?.spoiler_text||"",media:[],poll:null});activePart=parts.length-1;draw()});
    m.querySelectorAll("[data-remove-part]").forEach(x=>x.onclick=e=>{const pi=Number(e.currentTarget.dataset.removePart);if(pi<=0||pi>=parts.length)return;parts.splice(pi,1);activePart=Math.max(0,Math.min(activePart,parts.length-1));draw(false)});
    $("#composeCW",m)?.addEventListener("click",()=>{parts[activePart].cw=!parts[activePart].cw;if(parts[activePart].cw&&!parts[activePart].spoiler&&reply?.spoiler_text)parts[activePart].spoiler=reply.spoiler_text;draw()});
    $("#closeCompose",m).onclick=()=>{if(!confirmClose())return;if(historyPushed){window.__lentonComposeBypass=true;history.back()}else window.__lentonComposeClose?.()};
    $("#composeAttach",m)?.addEventListener("click",()=>$("#composeFile",m)?.click());
    $("#composeCamera",m)?.addEventListener("click",()=>$("#composeCameraFile",m)?.click());
    $("#composeGif",m)?.addEventListener("click",()=>$("#composeGifFile",m)?.click());
    $("#composePoll",m)?.addEventListener("click",()=>{
      const p=parts[activePart];
      p.poll=p.poll?null:{options:["",""],expires:86400,multiple:false};
      draw(false);
    });
    const handleComposeFiles=async filesLike=>{
      const files=[...filesLike].slice(0,Math.max(0,4-parts[activePart].media.length));
      if(!files.length)return;uploading=true;$("#sendCompose",m).disabled=true;toast("미디어 업로드 중…");
      try{
        for(const file of files){const media=await uploadComposerFile(file);parts[activePart].media.push(media)}
        toast("첨부했어요.");
      }catch(err){toast("첨부 실패: "+err.message)}
      uploading=false;draw(false);
    };
    $("#composeFile",m).onchange=async e=>{await handleComposeFiles(e.target.files)};
    $("#composeCameraFile",m).onchange=async e=>{await handleComposeFiles(e.target.files)};
    $("#composeGifFile",m).onchange=async e=>{await handleComposeFiles(e.target.files)};
    $("#composeEmoji",m)?.addEventListener("click",async e=>{
      e.preventDefault();e.stopPropagation();
      const box=$("#emojiPicker",m);if(!box)return;
      const opening=box.hidden;
      box.hidden=!opening;
      if(!opening)return;
      const active=document.activeElement;if(active&&m.contains(active)&&typeof active.blur==="function")active.blur();
      box.innerHTML='<div class="center">이모지 불러오는 중…</div>';
      const emojis=await loadCustomEmojis();
      box.innerHTML=emojis.length?emojis.map(e=>`<button data-emoji="${esc(e.shortcode)}" title=":${esc(e.shortcode)}:"><img src="${esc(e.static_url||e.url)}" alt=":${esc(e.shortcode)}:"></button>`).join(""):'<div class="center">서버 이모지가 없어요.</div>';
      box.querySelectorAll("[data-emoji]").forEach(b=>b.onclick=()=>{
        const textarea=m.querySelector(`[data-t="${activePart}"]`);if(!textarea)return;
        const ins=":"+b.dataset.emoji+":",start=textarea.selectionStart??textarea.value.length,end=textarea.selectionEnd??start;
        parts[activePart].text=textarea.value.slice(0,start)+ins+textarea.value.slice(end);
        textarea.value=parts[activePart].text;box.hidden=true;textarea.focus();textarea.setSelectionRange(start+ins.length,start+ins.length);
      });
    });
    $("#sendCompose",m).onclick=async()=>{
      if(uploading){toast("미디어 업로드가 끝날 때까지 기다려주세요.");return}
      const valid=parts.filter(p=>p.text.trim()||p.media.length||p.poll?.options?.some(x=>x.trim()));if(!valid.length){toast("내용을 입력해주세요.");return}
      const btn=$("#sendCompose",m);btn.disabled=true;btn.textContent="게시 중…";
      try{
        let replyId=reply?.id||null,prefix=recips.filter(x=>x.on).map(x=>"@"+x.acct).join(" ");
        for(let i=0;i<valid.length;i++){
          const p=valid[i],form=new URLSearchParams();
          form.append("status",(i===0&&prefix?prefix+" ":"")+p.text.trim());
          form.append("visibility",visibility);
          form.append("spoiler_text",p.cw?p.spoiler.trim():"");
          const defaultLanguage=accountSource().language||"";if(defaultLanguage)form.append("language",defaultLanguage);
          if(accountSource().sensitive===true)form.append("sensitive","true");
          if(replyId)form.append("in_reply_to_id",replyId);
          for(const media of p.media)if(media.id)form.append("media_ids[]",media.id);
          if(p.poll){
            const opts=p.poll.options.map(x=>x.trim()).filter(Boolean);
            if(opts.length<2)throw new Error("투표 선택지는 2개 이상 입력해 주세요.");
            for(const opt of opts)form.append("poll[options][]",opt);
            form.append("poll[expires_in]",String(p.poll.expires||86400));
            form.append("poll[multiple]",p.poll.multiple?"true":"false");
          }
          const posted=await api("/api/v1/statuses",{method:"POST",form});replyId=posted.id;
        }
        window.__lentonComposeClose?.();if(historyPushed){window.__lentonComposeBypass=true;history.back()}toast(visibility==="direct"?"DM을 보냈어요.":"게시했어요.");if(visibility==="direct"){state.dmDraftRecipients=[];if(state.currentConversation?.id)openConversation(state.currentConversation.id);else{state.view="dm";render()}}else{setTimeout(()=>refreshHomeAfterPost(),120)}
      }catch(e){toast(e.message);btn.disabled=false;btn.textContent=reply?"답글":"게시"}
    };
  };
  draw();
  if(recips.some(x=>!x.avatar))hydrateRecipients();
}
async function replyById(id,forced=null){
  try{
    const [st,ctx]=await Promise.all([api(`/api/v1/statuses/${id}`),api(`/api/v1/statuses/${id}/context`).catch(()=>({ancestors:[]}))]);
    compose(st,forced,[],ctx.ancestors||[]);
  }catch(e){toast(e.message)}
}

async function setCurrentPushEnabled(on,{reconnect=false}={}){
  state.pushError="";
  try{
    await saveCurrentAccount();
    const entry=savedAccounts().find(x=>x.key===currentAccountKey());
    if(!entry)throw new Error("현재 계정 정보를 찾지 못했습니다.");
    if(on){
      if(!standalone() && /iPad|iPhone|iPod/.test(navigator.userAgent)) throw new Error("iPhone/iPad에서는 먼저 Safari 공유 → 홈 화면에 추가로 설치해주세요.");
      if(!("serviceWorker"in navigator)||!("PushManager"in window)||!("Notification"in window)) throw new Error("이 브라우저는 Web Push를 지원하지 않습니다.");
      const perm=await Notification.requestPermission();if(perm!=="granted")throw new Error("알림 권한이 허용되지 않았습니다.");
      setPushEnabledForAccount(entry,true);
      try{await registerPushForAccount(entry,{force:true})}
      catch(err){setPushEnabledForAccount(entry,false);throw err}
      await syncSavedAccountsToPushMeta();
      toast(reconnect?"푸시 알림을 다시 연결했어요.":"푸시 알림을 켰어요.");
    }else{
      setPushEnabledForAccount(entry,false);
      await cleanupAccountPush(entry);
      await syncSavedAccountsToPushMeta();
      toast("푸시 알림을 껐어요.");
    }
    settingsView();
  }catch(e){
    state.pushError=e.message;
    toast("알림 설정 실패: "+e.message);
    settingsView();
  }
}
async function enablePush(){return setCurrentPushEnabled(true,{reconnect:true})}
function urlBase64ToUint8Array(s){const p="=".repeat((4-s.length%4)%4),b=(s+p).replace(/-/g,"+").replace(/_/g,"/"),raw=atob(b),a=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)a[i]=raw.charCodeAt(i);return a}


function gesturePoint(e){
  const t=e.changedTouches?.[0]||e.touches?.[0]||e;
  return {x:t.clientX||0,y:t.clientY||0,time:performance.now()};
}
function animateTransform(el,to,duration=180){
  if(!el)return Promise.resolve();
  return new Promise(resolve=>{
    el.style.transition=`transform ${duration}ms cubic-bezier(.2,.75,.25,1)`;
    requestAnimationFrame(()=>{el.style.transform=`translate3d(${to}px,0,0)`});
    setTimeout(resolve,duration+24);
  });
}
function buildSwipePreview(html,className,rect=null){
  const p=document.createElement("div");p.className=className;
  const width=Math.max(1,Math.round(rect?.width||window.innerWidth||document.documentElement.clientWidth));
  p.style.width=width+"px";p.style.minWidth=width+"px";p.style.maxWidth=width+"px";
  if(rect){p.style.left=Math.round(rect.left)+"px";p.style.right="auto"}
  p.innerHTML=html||'<div class="swipe-empty"></div>';
  document.body.append(p);
  const child=p.firstElementChild;if(child){child.style.width=width+"px";child.style.minWidth=width+"px";child.style.maxWidth=width+"px"}
  return p;
}
function previewForMainView(view){
  const cached=state.pageCache[view]||"";
  if(cached.includes(`lenton-view-${view}`))return cached;
  const title=view==="home"?"홈":view==="search"?"검색":view==="notifications"?"알림":"메시지";
  return `<div class="app lenton-view-${view}"><header class="topbar lenton-topbar"><h1>${title}</h1></header><main class="main"><div class="center">불러오는 중…</div></main><nav class="bottom lenton-bottom">${navBar()}</nav></div>`;
}
function attachInteractiveMainSwipe(bottom){
  if(!bottom||bottom.dataset.interactiveSwipe==="1")return;
  bottom.dataset.interactiveSwipe="1";
  let start=null,active=false,target=null,preview=null,current=null,width=0,dir=0;
  const cleanup=()=>{
    if(current){current.style.transition="";current.style.transform="";current.classList.remove("swipe-moving")}
    preview?.remove();preview=null;start=null;active=false;target=null;current=null;width=0;dir=0;
  };
  bottom.addEventListener("touchstart",e=>{
    if(e.touches?.length!==1)return;
    start=gesturePoint(e);current=document.querySelector("#app>.app");
    if(!current){start=null;return}
    width=Math.max(1,current.getBoundingClientRect().width);
  },{passive:true});
  bottom.addEventListener("touchmove",e=>{
    if(!start||!current||e.touches?.length!==1)return;
    const p=gesturePoint(e),dx=p.x-start.x,dy=p.y-start.y;
    if(!active){
      if(Math.abs(dy)>18&&Math.abs(dy)>=Math.abs(dx)){cleanup();return}
      if(Math.abs(dx)<10||Math.abs(dx)<=Math.abs(dy)*1.15)return;
      const order=visibleNavItems().map(x=>x.id),i=order.indexOf(state.view);
      dir=dx<0?1:-1;target=order[i+dir]||null;active=true;
      current.classList.add("swipe-moving");current.style.transition="none";
      if(target){
        const html=previewForMainView(target);
        preview=buildSwipePreview(html,"main-swipe-preview",current.getBoundingClientRect());
        preview.style.transform="translate3d("+(dir>0?width:-width)+"px,0,0)";
      }
    }
    if(!active)return;
    e.preventDefault();
    const shown=target?dx:dx*.18;
    current.style.transform="translate3d("+shown+"px,0,0)";
    if(preview)preview.style.transform="translate3d("+(shown+(dir>0?width:-width))+"px,0,0)";
  },{passive:false});
  bottom.addEventListener("touchend",e=>{
    if(!start||!current){cleanup();return}
    const p=gesturePoint(e),dx=p.x-start.x,dt=Math.max(1,p.time-start.time),vx=dx/dt;
    if(!active){cleanup();return}
    const commit=!!target&&(Math.abs(dx)>width*.20||Math.abs(vx)>.65);
    if(commit){
      current.style.transition="transform 180ms cubic-bezier(.2,.75,.25,1)";
      if(preview)preview.style.transition=current.style.transition;
      requestAnimationFrame(()=>{
        current.style.transform="translate3d("+(dir>0?-width:width)+"px,0,0)";
        if(preview)preview.style.transform="translate3d(0,0,0)";
      });
      const next=target;
      setTimeout(()=>{cleanup();rememberScroll();state.view=next;state.listId=null;render()},190);
    }else{
      current.style.transition="transform 160ms cubic-bezier(.2,.75,.25,1)";
      if(preview)preview.style.transition=current.style.transition;
      requestAnimationFrame(()=>{
        current.style.transform="translate3d(0,0,0)";
        if(preview)preview.style.transform="translate3d("+(dir>0?width:-width)+"px,0,0)";
      });
      setTimeout(cleanup,175);
    }
  },{passive:true});
  bottom.addEventListener("touchcancel",cleanup,{passive:true});
}
function attachInteractiveHomeSwipe(pager){
  if(!pager||pager.dataset.homeSwipe==="1"||state.listId)return;pager.dataset.homeSwipe="1";
  const track=pager.querySelector("[data-home-track]"),tabs=document.querySelector("[data-home-tabs]");
  if(!track||!tabs)return;
  const modes=homeModes();let start=null,active=false,width=0,startIndex=0;
  const indicator=tabs.querySelector(".home-tab-indicator");
  const settle=(index,animate=true)=>{
    const mode=modes[Math.max(0,Math.min(modes.length-1,index))];
    setHomePagerMode(mode,animate);
  };
  pager.addEventListener("touchstart",e=>{
    if(e.touches?.length!==1)return;const p=gesturePoint(e);start=p;active=false;width=Math.max(1,pager.clientWidth);startIndex=Math.max(0,modes.indexOf(state.homeMode||"home"));
    track.style.transition="none";if(indicator)indicator.style.transition="none";
  },{passive:true});
  pager.addEventListener("touchmove",e=>{
    if(!start||e.touches?.length!==1)return;const p=gesturePoint(e),dx=p.x-start.x,dy=p.y-start.y;
    if(!active){
      if(Math.abs(dy)>12&&Math.abs(dy)>=Math.abs(dx)){start=null;return}
      if(Math.abs(dx)<6||Math.abs(dx)<=Math.abs(dy))return;
      active=true;
    }
    e.preventDefault();
    let shown=dx;if((startIndex===0&&dx>0)||(startIndex===modes.length-1&&dx<0))shown=dx*.22;
    track.style.transform="translate3d("+(-startIndex*width+shown)+"px,0,0)";
    const frac=Math.max(0,Math.min(modes.length-1,startIndex-shown/width)),tabW=tabs.clientWidth/modes.length;
    if(indicator)indicator.style.transform="translate3d("+(frac*tabW+(tabW-36)/2)+"px,0,0)";
  },{passive:false});
  pager.addEventListener("touchend",e=>{
    if(!start)return;const p=gesturePoint(e),dx=p.x-start.x,dt=Math.max(1,p.time-start.time),vx=dx/dt;
    if(!active){start=null;return}
    let target=startIndex;
    if(dx<0&&startIndex<modes.length-1&&(Math.abs(dx)>width*.18||vx<-.45))target=startIndex+1;
    else if(dx>0&&startIndex>0&&(Math.abs(dx)>width*.18||vx>.45))target=startIndex-1;
    start=null;active=false;settle(target,true);
  },{passive:true});
  pager.addEventListener("touchcancel",()=>{if(start){start=null;active=false;settle(startIndex,true)}},{passive:true});
}
function attachSwipe(el,{onLeft,onRight,edgeOnly=false,threshold=40,ratio=1.25,startMaxX=28}={}){
  if(!el||el.dataset.lentonSwipe==="1")return;
  el.dataset.lentonSwipe="1";
  let start=null,tracking=false;
  el.addEventListener("touchstart",e=>{
    if(e.touches?.length!==1)return;
    const p=gesturePoint(e);
    if(edgeOnly&&p.x>startMaxX){start=null;tracking=false;return}
    start=p;tracking=true;
  },{passive:true});
  el.addEventListener("touchmove",e=>{
    if(!tracking||!start||e.touches?.length!==1)return;
    const p=gesturePoint(e),dx=p.x-start.x,dy=p.y-start.y;
    if(Math.abs(dx)>threshold&&Math.abs(dx)>Math.abs(dy)*ratio){try{e.preventDefault()}catch{}}
    else if(Math.abs(dy)>threshold&&Math.abs(dy)>=Math.abs(dx))tracking=false;
  },{passive:false});
  el.addEventListener("touchend",e=>{
    if(!tracking||!start){start=null;tracking=false;return}
    const p=gesturePoint(e),dx=p.x-start.x,dy=p.y-start.y;
    const ok=Math.abs(dx)>threshold&&Math.abs(dx)>Math.abs(dy)*ratio;
    start=null;tracking=false;if(!ok)return;if(dx<0)onLeft?.();else onRight?.();
  },{passive:true});
  el.addEventListener("touchcancel",()=>{start=null;tracking=false},{passive:true});
}
function moveMainView(dir){
  rememberScroll();
  const order=visibleNavItems().map(x=>x.id);
  const i=order.indexOf(state.view);if(i<0)return;const n=i+dir;if(n<0||n>=order.length)return;
  state.view=order[n];state.listId=null;render();
}
function attachEdgeDrawerSwipe(app){
  if(!app||app.dataset.edgeDrawerSwipe==="1")return;app.dataset.edgeDrawerSwipe="1";
  let start=null,active=false,shade=null,drawer=null,width=0;
  const reset=()=>{start=null;active=false;shade=null;drawer=null;width=0};
  app.addEventListener("touchstart",e=>{if(e.touches?.length!==1)return;const p=gesturePoint(e);if(p.x>28)return;start=p},{passive:true});
  app.addEventListener("touchmove",e=>{
    if(!start||e.touches?.length!==1)return;const p=gesturePoint(e),dx=p.x-start.x,dy=p.y-start.y;
    if(!active){
      if(dx<0||Math.abs(dy)>18&&Math.abs(dy)>=Math.abs(dx)){reset();return}
      if(dx<8||dx<=Math.abs(dy)*1.15)return;
      active=true;shade=openDrawer({interactive:true});drawer=shade.querySelector(".drawer");width=drawer.getBoundingClientRect().width||window.innerWidth*.82;
    }
    e.preventDefault();
    const progress=Math.max(0,Math.min(1,dx/width));
    drawer.style.transform=`translate3d(${-width+progress*width}px,0,0)`;
    shade.style.background=`rgba(0,0,0,${.45*progress})`;
  },{passive:false});
  app.addEventListener("touchend",async e=>{
    if(!active||!start||!drawer){reset();return}
    const p=gesturePoint(e),dx=p.x-start.x,dt=Math.max(1,p.time-start.time),vx=dx/dt;
    const commit=dx>width*.25||vx>.65;
    drawer.style.transition="transform 170ms cubic-bezier(.2,.75,.25,1)";shade.style.transition="background 170ms ease";
    if(commit){drawer.style.transform="translate3d(0,0,0)";shade.style.background="rgba(0,0,0,.45)"}
    else{drawer.style.transform=`translate3d(-${width}px,0,0)`;shade.style.background="rgba(0,0,0,0)";setTimeout(()=>shade.remove(),185)}
    reset();
  },{passive:true});
  app.addEventListener("touchcancel",()=>{if(shade)closeDrawer();reset()},{passive:true});
}
function attachDrawerCloseSwipe(drawer){
  if(!drawer||drawer.dataset.closeSwipe==="1")return;drawer.dataset.closeSwipe="1";
  let start=null,active=false,width=0,shade=drawer.closest(".drawer-shade");
  const reset=()=>{start=null;active=false;width=0};
  drawer.addEventListener("touchstart",e=>{if(e.touches?.length!==1)return;start=gesturePoint(e);width=drawer.getBoundingClientRect().width},{passive:true});
  drawer.addEventListener("touchmove",e=>{
    if(!start||e.touches?.length!==1)return;const p=gesturePoint(e),dx=p.x-start.x,dy=p.y-start.y;
    if(!active){
      if(dx>0||Math.abs(dy)>18&&Math.abs(dy)>=Math.abs(dx)){reset();return}
      if(Math.abs(dx)<8||Math.abs(dx)<=Math.abs(dy)*1.15)return;
      active=true;drawer.style.transition="none";shade.style.transition="none";
    }
    e.preventDefault();const shown=Math.max(-width,Math.min(0,dx)),progress=1-Math.abs(shown)/width;
    drawer.style.transform=`translate3d(${shown}px,0,0)`;shade.style.background=`rgba(0,0,0,${.45*progress})`;
  },{passive:false});
  drawer.addEventListener("touchend",e=>{
    if(!active||!start){reset();return}const p=gesturePoint(e),dx=p.x-start.x,dt=Math.max(1,p.time-start.time),vx=dx/dt;
    const commit=Math.abs(dx)>width*.25||vx<-.65;
    drawer.style.transition="transform 170ms cubic-bezier(.2,.75,.25,1)";shade.style.transition="background 170ms ease";
    if(commit){drawer.style.transform=`translate3d(-${width}px,0,0)`;shade.style.background="rgba(0,0,0,0)";setTimeout(()=>shade.remove(),185)}
    else{drawer.style.transform="translate3d(0,0,0)";shade.style.background="rgba(0,0,0,.45)"}
    reset();
  },{passive:true});
  drawer.addEventListener("touchcancel",()=>{drawer.style.transform="translate3d(0,0,0)";shade.style.background="rgba(0,0,0,.45)";reset()},{passive:true});
}
function attachInteractiveProfileSwipe(pager){
  if(!pager||pager.dataset.profileSwipe==="1")return;pager.dataset.profileSwipe="1";
  const track=pager.querySelector("[data-profile-track]"),tabs=document.querySelector("[data-profile-tabs]");
  if(!track||!tabs)return;
  const modes=profileModes();let start=null,active=false,width=0,startIndex=0,lastDx=0;
  const indicator=tabs.querySelector(".profile-tab-indicator");
  const settle=(index,animate=true)=>{
    const mode=modes[Math.max(0,Math.min(modes.length-1,index))];state.profileMode=mode;state.profileReplies=mode==="replies";
    syncProfilePagerUi(mode,animate);
  };
  pager.addEventListener("touchstart",e=>{
    if(e.touches?.length!==1)return;const p=gesturePoint(e);start=p;active=false;lastDx=0;width=Math.max(1,pager.clientWidth);startIndex=Math.max(0,modes.indexOf(state.profileMode||"posts"));
    track.style.transition="none";if(indicator)indicator.style.transition="none";
  },{passive:true});
  pager.addEventListener("touchmove",e=>{
    if(!start||e.touches?.length!==1)return;const p=gesturePoint(e),dx=p.x-start.x,dy=p.y-start.y;
    if(!active){
      if(Math.abs(dy)>12&&Math.abs(dy)>=Math.abs(dx)){start=null;return}
      if(Math.abs(dx)<6||Math.abs(dx)<=Math.abs(dy))return;
      active=true;
    }
    e.preventDefault();
    let shown=dx;if((startIndex===0&&dx>0)||(startIndex===modes.length-1&&dx<0))shown=dx*.22;
    lastDx=shown;
    track.style.transform="translate3d("+(-startIndex*width+shown)+"px,0,0)";
    const frac=Math.max(0,Math.min(modes.length-1,startIndex-shown/width)),tabW=tabs.clientWidth/modes.length;
    if(indicator)indicator.style.transform="translate3d("+(frac*tabW+(tabW-36)/2)+"px,0,0)";
  },{passive:false});
  pager.addEventListener("touchend",e=>{
    if(!start){return}const p=gesturePoint(e),endDx=p.x-start.x;
    const rawDx=Math.abs(lastDx)>Math.abs(endDx)?lastDx:endDx,dt=Math.max(1,p.time-start.time),vx=rawDx/dt;
    if(!active){start=null;return}
    let target=startIndex;
    if(rawDx<0&&startIndex<modes.length-1&&(Math.abs(rawDx)>width*.12||vx<-.28))target=startIndex+1;
    else if(rawDx>0&&startIndex>0&&(Math.abs(rawDx)>width*.12||vx>.28))target=startIndex-1;
    start=null;active=false;lastDx=0;settle(target,true);
  },{passive:true});
  pager.addEventListener("touchcancel",()=>{if(start){start=null;active=false;settle(startIndex,true)}},{passive:true});
}
function attachStandaloneBackSwipe(page){
  if(!page||page.dataset.backSwipe==="1")return;page.dataset.backSwipe="1";
  let start=null,active=false,width=0;
  const clean=()=>{page.style.transition="";page.style.transform="";page.style.boxShadow="";start=null;active=false};
  page.addEventListener("touchstart",e=>{if(e.touches?.length!==1)return;const p=gesturePoint(e);if(p.x>26)return;start=p;width=window.innerWidth||document.documentElement.clientWidth;active=false},{passive:true});
  page.addEventListener("touchmove",e=>{if(!start||e.touches?.length!==1)return;const p=gesturePoint(e),dx=p.x-start.x,dy=p.y-start.y;if(dx<=0)return;if(!active){if(Math.abs(dy)>16&&Math.abs(dy)>=Math.abs(dx)){clean();return}if(dx<10||dx<=Math.abs(dy)*1.15)return;active=true;page.style.transition="none";page.style.boxShadow="-10px 0 24px rgba(0,0,0,.14)"}if(active){e.preventDefault();page.style.transform=`translate3d(${Math.min(width,dx)}px,0,0)`}},{passive:false});
  page.addEventListener("touchend",e=>{if(!start){clean();return}const p=gesturePoint(e),dx=p.x-start.x,dt=Math.max(1,p.time-start.time),vx=dx/dt;if(!active){clean();return}if(dx>width*.22||vx>.65){page.style.transition="transform 180ms cubic-bezier(.2,.75,.25,1)";page.style.transform=`translate3d(${width}px,0,0)`;setTimeout(()=>{clean();goBackScreen()},190)}else{page.style.transition="transform 160ms cubic-bezier(.2,.75,.25,1)";page.style.transform="translate3d(0,0,0)";setTimeout(clean,175)}},{passive:true});
  page.addEventListener("touchcancel",clean,{passive:true});
}
function attachHomePullToRefresh(){
  const main=document.querySelector(".app.lenton-view-home .main"),pager=document.querySelector("[data-home-pager]");
  if(!main||!pager||main.dataset.pullRefresh==="1")return;
  main.dataset.pullRefresh="1";
  let startY=0,startX=0,drag=0,active=false,indicator=null;
  const top=()=>Math.max(window.scrollY||0,document.documentElement.scrollTop||0,main.scrollTop||0)<=2;
  const cleanup=()=>{indicator?.remove();indicator=null;drag=0;active=false;main.style.transform="";main.style.transition=""};
  main.addEventListener("touchstart",e=>{
    if(e.touches?.length!==1||!top())return;
    startY=e.touches[0].clientY;startX=e.touches[0].clientX;drag=0;active=false;
  },{passive:true});
  main.addEventListener("touchmove",e=>{
    if(!startY||e.touches?.length!==1)return;
    const dy=e.touches[0].clientY-startY,dx=e.touches[0].clientX-startX;
    if(dy<=0||Math.abs(dx)>Math.abs(dy)){if(active)cleanup();return}
    if(!active&&dy<10)return;
    active=true;e.preventDefault();drag=Math.min(96,dy*.46);
    if(!indicator){indicator=document.createElement("div");indicator.className="pull-refresh-indicator";indicator.innerHTML='<span>↻</span>';main.prepend(indicator)}
    indicator.style.transform="translate3d(-50%,"+Math.min(54,drag-44)+"px,0) rotate("+Math.min(220,drag*3)+"deg)";
    main.style.transform="translate3d(0,"+drag+"px,0)";
  },{passive:false});
  main.addEventListener("touchend",async()=>{
    if(!active){startY=0;return}
    const should=drag>=58;startY=0;
    main.style.transition="transform 160ms ease";main.style.transform="translate3d(0,0,0)";
    if(should){
      if(indicator)indicator.classList.add("loading");
      try{await homeView({silent:true,forceFresh:true})}finally{setTimeout(cleanup,120)}
    }else setTimeout(cleanup,170);
  },{passive:true});
  main.addEventListener("touchcancel",cleanup,{passive:true});
}
function attachLentonGestures(){
  const bottom=document.querySelector(".bottom");
  attachInteractiveMainSwipe(bottom);

  const app=document.querySelector(".app");
  attachEdgeDrawerSwipe(app);

  const drawer=document.querySelector(".drawer");
  attachDrawerCloseSwipe(drawer);

  if(state.view==="home"){attachInteractiveHomeSwipe(document.querySelector("[data-home-pager]"));attachHomePullToRefresh()}

  attachStandaloneBackSwipe(document.querySelector(".standalone-page"));
  const profilePager=document.querySelector("[data-profile-pager]");
  if(profilePager)attachInteractiveProfileSwipe(profilePager);
}

function bind(){
  document.querySelectorAll("[data-profile]").forEach(b=>b.onclick=e=>{e.stopPropagation();pushNavSnapshot();openProfile(b.dataset.profile,"posts",true)});
  document.querySelectorAll("[data-connections-kind]").forEach(b=>b.onclick=e=>{e.stopPropagation();pushNavSnapshot();profileConnectionsScreen(b.dataset.connectionsAccount,b.dataset.connectionsKind)});
  document.querySelectorAll("[data-connection-follow]").forEach(b=>b.onclick=e=>{e.stopPropagation();toggleConnectionFollow(b)});
  document.querySelectorAll("[data-mention-acct]").forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();openMentionProfile(b.dataset.mentionAcct,b.dataset.mentionHref||"")});
  document.querySelectorAll("[data-open-list]").forEach(b=>b.onclick=()=>{state.view="home";state.listId=b.dataset.openList;render()});
  document.querySelectorAll("[data-list-manage]").forEach(b=>b.onclick=()=>{pushNavSnapshot();listManageScreen(b.dataset.listManage)});
  document.querySelectorAll("[data-list-visible]").forEach(b=>b.onclick=()=>{const id=b.dataset.listVisible;setListHidden(id,!hiddenListIds().has(id));listsScreen()});
  document.querySelectorAll("[data-list-save]").forEach(b=>b.onclick=()=>saveListSettings(b.dataset.listSave));
  document.querySelectorAll("[data-list-delete]").forEach(b=>b.onclick=()=>deleteList(b.dataset.listDelete));
  document.querySelectorAll("[data-layout-up]").forEach(b=>b.onclick=()=>mutateLayout(b.dataset.layoutUp,-1));
  document.querySelectorAll("[data-layout-down]").forEach(b=>b.onclick=()=>mutateLayout(b.dataset.layoutDown,1));
  document.querySelectorAll("[data-layout-toggle]").forEach(b=>b.onclick=()=>mutateLayout(b.dataset.layoutToggle,0));
  document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{
    const target=b.dataset.view,wasCurrent=target===state.view;
    rememberScroll();
    if(target==="home"&&wasCurrent){
      state.listId=null;
      window.scrollTo({top:0,left:0,behavior:"auto"});
      setTimeout(()=>homeView({silent:true,forceFresh:true}),0);
      return;
    }
    state.view=target;state.listId=null;
    const cached=state.pageCache[target]||"";
    if(cached.includes("lenton-view-"+target)){
      $("#app").innerHTML=cached;
      clearGestureBindingMarks($("#app"));
      bind();
      requestAnimationFrame(()=>attachLentonGestures());
      if(target==="home")setTimeout(()=>homeView({silent:true,forceFresh:true}),0);
      else if(target==="notifications")setTimeout(()=>notificationsView(false,true),0);
      else if(target==="dm")setTimeout(()=>dmView(true),0);
      return;
    }
    render();
  });
  document.querySelectorAll("[data-action]").forEach(b=>b.onclick=async e=>{
    if(b.closest(".lenton-actions,.status-more,.cw,.compose-tools"))e.stopPropagation();
    const a=b.dataset.action;
    if(a==="settings"){state.view="settings";render()}
    else if(a==="drawer")openDrawer()
    else if(a==="compose")compose()
    else if(a==="newdm"){pushNavSnapshot();newDmScreen()}
    else if(a==="backScreen"||a==="backMain")goBackScreen()
    else if(a==="accountManager"){pushNavSnapshot();accountManagerScreen()}
    else if(a==="accountSettings"){pushNavSnapshot();accountSettingsScreen()}
    else if(a==="accountNotificationSettings"){pushNavSnapshot();accountNotificationSettingsScreen()}
    else if(a==="followedTagsSettings"){pushNavSnapshot();followedTagsSettingsScreen()}
    else if(a==="mutedAccountsSettings"){pushNavSnapshot();managedAccountsSettingsScreen("mute")}
    else if(a==="blockedAccountsSettings"){pushNavSnapshot();managedAccountsSettingsScreen("block")}
    else if(a==="domainBlocksSettings"){pushNavSnapshot();domainBlocksSettingsScreen()}
    else if(a==="filtersSettings"){pushNavSnapshot();filtersSettingsScreen()}
    else if(a==="privacySettings"){pushNavSnapshot();accountChoiceScreen("privacy")}
    else if(a==="replyVisibilitySettings"){pushNavSnapshot();accountChoiceScreen("reply")}
    else if(a==="quotePolicySettings"){pushNavSnapshot();accountChoiceScreen("quote")}
    else if(a==="languageSettings"){pushNavSnapshot();accountChoiceScreen("language")}
    else if(a==="loginEmailSettings")openLoginEmailSettings()
    else if(a==="addAccount")addAccountFlow()
    else if(a==="inquiry"){pushNavSnapshot();inquiryScreen(b.dataset.inquiryType||"")}
    else if(a==="sendInquiry")sendInquiry()
    else if(a==="updateHistory"){pushNavSnapshot();updateHistoryScreen()}
    else if(a==="currentReleaseNotes"){pushNavSnapshot();showCurrentReleaseNotes()}
    else if(a==="checkPwaUpdate")checkPwaUpdate()
    else if(a==="layoutSettings"){pushNavSnapshot();screenLayoutEditor()}
    else if(a==="reload")render()
    else if(a==="logout")logout()
    else if(a==="enablepush")enablePush()
    else if(a==="disablepush")setCurrentPushEnabled(false)
    else if(a==="clearNotifications"){try{await api("/api/v1/notifications/clear",{method:"POST",form:{}});notificationsView(false)}catch(e){toast(e.message)}}
    else if(a==="share"){const u=b.dataset.url||"";try{if(navigator.share)await navigator.share({url:u});else{await navigator.clipboard.writeText(u);toast("링크를 복사했어요.")}}catch{}}
    else if(a==="topmenu")openDrawer()
    else if(a==="notificationMenu")openNotificationMenu()
    else if(a==="searchMenu")openSearchMenu()
    else if(a==="statusmenu")openStatusMenu(b.dataset.id)
    else if(a==="newlist")newList()
    else if(a==="resetLayout")resetMainTabLayout()
    else if(a==="loadmorehome"){const m=b.dataset.homeLoadMode;if(m&&homeModes().includes(m))setHomePagerMode(m,false);loadMoreHome()}
    else if(a==="saveProfileEdit")saveProfileEdit()
    else if(a==="runsearch")runSearch()
    else if(a==="togglecw"){const body=b.closest(".status-main").querySelector("[data-cwbody]");body.style.display=body.style.display==="none"?"block":"none"}
    else if(a==="reply")replyById(b.dataset.id)
    else if(a==="fav"||a==="boost"||a==="bookmark")statusAction(b.dataset.id,a)
    else if(a==="replydm"){if(state.currentConversation?.last_status)compose(state.currentConversation.last_status,"direct")}
    else if(a==="profileReplies")setProfilePagerMode("replies",true)
    else if(a==="profilePosts")setProfilePagerMode("posts",true)
    else if(a==="profilePinned")setProfilePagerMode("pinned",true)
    else if(a==="profileMedia")setProfilePagerMode("media",true)
    else if(a==="profileEditOwn"){pushNavSnapshot();profileEditScreen()}
    else if(a==="profileMenu")openProfilePopup()
    else if(a==="editPrivateNote")editPrivateNote()
    else if(a==="profileMessage"){const p=state.profileAccount;if(p)compose(null,"direct",[p])}
    else if(a==="profileNotify")toggleProfileNotify()
    else if(a==="followProfile")toggleFollowProfile()
  });
  document.querySelectorAll("[data-search-mode]").forEach(b=>b.onclick=()=>setSearchMode(b.dataset.searchMode));
  document.querySelectorAll(".private-note-card[data-action='editPrivateNote']").forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();editPrivateNote()});
  document.querySelectorAll("[data-account-choice]").forEach(b=>b.onclick=()=>applyAccountChoice(b.dataset.accountChoice,b.dataset.value||""));
    document.querySelectorAll("[data-home-mode]").forEach(b=>b.onclick=()=>{if(document.querySelector("[data-home-pager]"))setHomePagerMode(b.dataset.homeMode,true);else{state.homeMode=b.dataset.homeMode;state.listId=null;render()}});
  document.querySelectorAll("[data-list]").forEach(b=>b.onclick=()=>{state.listId=state.listId===b.dataset.list?null:b.dataset.list;render()});
  document.querySelectorAll("[data-conv]").forEach(b=>b.onclick=()=>{pushNavSnapshot();openConversation(b.dataset.conv)});
  document.querySelectorAll("[data-dm-previous]").forEach(b=>b.onclick=()=>{pushNavSnapshot();openConversation(b.dataset.dmPrevious)});
  document.querySelectorAll("[data-media-url]").forEach(b=>b.onclick=e=>{e.stopPropagation();openMediaViewer(b.dataset.mediaUrl,b.dataset.mediaAlt||"")});
  document.querySelectorAll("[data-profile-media-status]").forEach(b=>b.onclick=e=>{e.stopPropagation();pushNavSnapshot();openProfileMediaDetail(b.dataset.profileMediaStatus,Number(b.dataset.profileMediaIndex||0))});
  document.querySelectorAll("[data-media-thread]").forEach(b=>b.onclick=()=>{const id=b.dataset.mediaThread;pushNavSnapshot();openThread(id)});
  document.querySelectorAll(".status[data-status-id]").forEach(card=>card.onclick=e=>{if(e.target.closest("button,a,video,audio"))return;pushNavSnapshot();openThread(card.dataset.statusId)});
  document.querySelectorAll("[data-thread-older]").forEach(b=>b.onclick=()=>openThread(b.dataset.threadOlder,true));
  document.querySelectorAll("[data-notify]").forEach(b=>b.onclick=()=>notificationsView(b.dataset.notify==="mention"));
  document.querySelectorAll("[data-notify-status]").forEach(card=>card.onclick=e=>{if(e.target.closest("[data-profile]"))return;pushNavSnapshot();openThread(card.dataset.notifyStatus)});
  document.querySelectorAll("[data-follow-accept]").forEach(b=>b.onclick=()=>decideFollowRequest(b.dataset.followAccept,true));
  document.querySelectorAll("[data-follow-reject]").forEach(b=>b.onclick=()=>decideFollowRequest(b.dataset.followReject,false));
  document.querySelectorAll("[data-account-switch]").forEach(b=>b.onclick=()=>switchSavedAccount(Number(b.dataset.accountSwitch)));
  document.querySelectorAll("[data-account-remove]").forEach(b=>b.onclick=()=>removeSavedAccount(Number(b.dataset.accountRemove)));
  $("#searchInput")?.addEventListener("keydown",e=>{if(e.key==="Enter")runSearch()});
  $("#themeSel")?.addEventListener("change",e=>{state.theme=e.target.value;store.set("lenton_theme",state.theme);if(state.theme==="system")delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=state.theme});
  const applyAccent=value=>{state.accent=value;store.set("lenton_accent",state.accent);document.documentElement.style.setProperty("--accent",state.accent);document.querySelectorAll("[data-accent-preset]").forEach(b=>b.classList.toggle("selected",b.dataset.accentPreset.toLowerCase()===state.accent.toLowerCase()))};
  $("#accentSel")?.addEventListener("input",e=>applyAccent(e.target.value));
  document.querySelectorAll("[data-accent-preset]").forEach(b=>b.onclick=()=>{applyAccent(b.dataset.accentPreset);const input=$("#accentSel");if(input)input.value=b.dataset.accentPreset});
  $("#uiScaleRange")?.addEventListener("input",e=>{state.uiScale=Math.max(.8,Math.min(1.2,Number(e.target.value||100)/100));store.set("lenton_ui_scale",state.uiScale);const label=$("#uiScaleValue");if(label)label.textContent=Math.round(state.uiScale*100)+"%";applyAndroidSpecMetrics()});
  document.querySelectorAll("[data-push-pref]").forEach(x=>x.onchange=async()=>{const p=pushAlertPrefs();p[x.dataset.pushPref]=x.checked;savePushAlertPrefs(p);const ok=await syncPushPreferences({quiet:true});toast(ok?"알림 설정을 저장했어요.":"알림 종류를 저장했어요. 알림을 켜면 적용됩니다.")});
  const appRoot=document.querySelector("#app>.app");
  if(appRoot){
    appRoot.classList.remove("refreshing");
    if(appRoot.classList.contains("lenton-view-"+state.view))state.pageCache[state.view]=$("#app").innerHTML;
  }
  if(state.view==="home"&&document.querySelector(".main"))state.homeCache[state.homeMode]=document.querySelector(".main").innerHTML;
  if(document.querySelector(".profile-info")&&document.querySelector(".main")){
    const pid=state.profileAccount?.id||state.me?.id||"me";
    state.profileCache[pid+":"+(state.profileMode||"posts")]=document.querySelector(".main").innerHTML;
  }
  attachLentonGestures();
  restoreScroll();
  attachLayoutEditorDrag();
}


function currentPwaToken(){
  try{
    const src=document.querySelector('script[src*="app.js"]')?.src||"";
    if(src)return new URL(src,location.href).searchParams.get("v")||"";
  }catch{}
  return "";
}
let pendingAutomaticUpdate=false;
function composeIsOpen(){return !!document.querySelector(".modal .sheet")}
function hasUnsavedLentonWork(){
  const compose=document.querySelector(".compose-modal textarea,.compose-modal input[type='text']");
  if(compose&&String(compose.value||"").trim())return true;
  const dm=document.querySelector("#dmInlineInput");
  if(dm&&String(dm.value||"").trim())return true;
  return false;
}
async function activateLatestPwaNow(){
  try{
    const reg=await navigator.serviceWorker.getRegistration("./");
    await reg?.update().catch(()=>{});
    if(reg?.waiting)reg.waiting.postMessage?.({type:"SKIP_WAITING"});
  }catch{}
  const u=new URL(location.href);
  u.searchParams.set("__lenton_refresh",Date.now().toString());
  location.replace(u.toString());
}
async function applyAutomaticUpdate(){
  try{
    const r=await fetch("./build.json?ts="+Date.now(),{cache:"no-store"});if(!r.ok)return;
    const remote=await r.json();state.buildInfo=remote;
    const current=currentPwaToken(),next=String(remote?.cacheToken||"");
    if(!next||!current||current===next){state.updateAvailable=null;return}
    state.updateAvailable=remote;
    const reg=await navigator.serviceWorker.getRegistration("./");await reg?.update().catch(()=>{});
    const noticeKey="lenton_update_notice_"+next;
    if(hasUnsavedLentonWork()){
      pendingAutomaticUpdate=true;
      if(!store.get(noticeKey,false)){store.set(noticeKey,true);toast("새 렌톤 버전이 준비됐어요. 작성 중인 내용을 보존하기 위해 나중에 적용됩니다.")}
      return;
    }
    if(document.visibilityState==="visible"){
      await activateLatestPwaNow();
      return;
    }
    if(!store.get(noticeKey,false)){store.set(noticeKey,true);toast("새 렌톤 버전이 준비됐어요.")}
  }catch{}
}
async function registerSW(){
  if("serviceWorker"in navigator){
    const reg=await navigator.serviceWorker.register("./sw.js",{scope:"./",updateViaCache:"none"});
    navigator.serviceWorker.addEventListener("message",async e=>{
      if(e.data?.type!=="push")return;
      await syncSavedAccountsToPushMeta();
      const current=currentAccountKey();
      if(e.data?.accountKey&&e.data.accountKey===current){
        state.notificationUnread=accountNotificationUnreadFor({key:current});
        state.dmUnread=accountDmUnreadFor({key:current});
      }
      const sameAccount=!e.data?.accountKey||e.data.accountKey===current;
      if(state.view==="notifications"&&sameAccount&&e.data?.kind!=="dm")notificationsView(false);
      else if(state.view==="dm"&&document.querySelector("#app>.app.lenton-view-dm")&&sameAccount&&e.data?.kind==="dm")dmView();
      else{
        refreshNotificationBadgeDom();
        showForegroundPushBanner(e.data);
        if(sameAccount)setTimeout(()=>refreshUnreadNotificationCount({bootstrap:false}),120);
      }
    });
    navigator.serviceWorker.addEventListener("controllerchange",()=>{
      if(window.__lentonControllerReloading)return;
      window.__lentonControllerReloading=true;
      const u=new URL(location.href);
      u.searchParams.set("__sw_refresh",Date.now().toString());
      location.replace(u.toString());
    });
    reg.update().catch(()=>{});
  }
}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){applyAutomaticUpdate();refreshUnreadNotificationCount()}});
window.addEventListener("focus",()=>{applyAutomaticUpdate();refreshUnreadNotificationCount()});
setInterval(()=>{if(document.visibilityState==="visible"){applyAutomaticUpdate();refreshUnreadNotificationCount()}},30000);
window.addEventListener("beforeinstallprompt",e=>e.preventDefault());
window.addEventListener("popstate",()=>{
  const modal=document.querySelector(".compose-modal");
  if(modal){
    if(window.__lentonComposeBypass){window.__lentonComposeBypass=false;window.__lentonComposeClose?.();return}
    const ok=window.__lentonComposeGuard?window.__lentonComposeGuard():true;
    if(ok)window.__lentonComposeClose?.();
    else history.pushState({...history.state,lentonCompose:true},"",location.href);
    return;
  }
  if(document.querySelector(".standalone-page")&&state.navStack.length)goBackScreen();
});
window.addEventListener("beforeunload",e=>{
  if(document.querySelector(".compose-modal")&&window.__lentonComposeGuard){
    e.preventDefault();e.returnValue="";
  }
});
(async()=>{
  try{await registerSW();await finishOAuth()}catch(e){toast(e.message)}
  const q=new URLSearchParams(location.search),notificationId=q.get("notification_id"),accountSlot=q.get("account_slot"),deep=q.get("view");
  if(accountSlot!==null){
    const entry=savedAccounts().find(x=>String(x.pushSlot)===String(accountSlot));
    if(entry?.session){state.session=entry.session;store.set("lenton_session",state.session);resetAccountState()}
  }
  if(state.session){try{state.me=await api("/api/v1/accounts/verify_credentials")}catch{store.del("lenton_session");state.session=null}}
  await syncSavedAccountsToPushMeta();
  if(state.session){
    const current={key:currentAccountKey()};
    state.notificationUnread=accountNotificationUnreadFor(current);
    state.dmUnread=accountDmUnreadFor(current);
  }
  if(["home","notifications","dm","profile","settings"].includes(deep))state.view=deep;
  render();refreshNotificationBadgeDom();
  if(state.session){
    loadCustomEmojis().catch(()=>{});
    saveCurrentAccount().catch(()=>{});
    setTimeout(()=>refreshUnreadNotificationCount(),80);
  }
  if(("Notification"in window)&&Notification.permission==="granted")setTimeout(()=>ensureAllAccountPushSubscriptions({quiet:true}),650);
  if(notificationId&&state.session)setTimeout(()=>openNotificationDeepLink(notificationId),0);
  applyAutomaticUpdate();
})();
