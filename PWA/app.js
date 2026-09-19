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
  pushError:"", toast:"", currentConversation:null, profileReplies:false, profileAccount:null, profileRelationship:null, returnView:"home", customEmojis:null, timelineItems:[], timelineLoadingMore:false, scrolls:{}, pageCache:{}, homeCache:{}, profileCache:{}
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
  for(const e of emojis||[]){
    const code=e?.shortcode;if(!code)continue;
    const src=e.static_url||e.url;if(!src)continue;
    const needle=":"+code+":";
    out=out.split(esc(needle)).join('<img class="custom-emoji" src="'+esc(src)+'" alt="'+esc(needle)+'">');
  }
  return out;
}
function renderRichText(html=""){
  const d=document.createElement("div");d.innerHTML=html;
  const walk=node=>{
    if(node.nodeType===Node.TEXT_NODE)return esc(node.nodeValue||"");
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
      const href=node.getAttribute("href")||"";
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
  const ui=ANDROID?.ui||{}, root=document.documentElement;
  const px=(name,value,fallback)=>root.style.setProperty(name,String(value??fallback)+"px");
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
  px("--android-message-avatar",ui.messageAvatarDp,48);
  px("--android-standalone-top",ui.standaloneTopDp,60);
  root.style.setProperty("--android-drawer-width",String(Math.round((ui.drawerWidthRatio||.88)*100))+"vw");
  const sp=ui.statusPadding||[16,10,14,8];
  root.style.setProperty("--android-status-padding",sp.map(x=>String(x)+"px").join(" "));
  const dp=ui.drawerPadding||[24,24,24,20];
  root.style.setProperty("--android-drawer-padding",dp.map(x=>String(x)+"px").join(" "));
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
  state.busy=true;if(!document.querySelector(".drawer-shade"))render();
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
  }catch(e){toast("로그인 준비 실패: "+e.message);state.busy=false;render()}
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
function saveCurrentAccount(){
  if(!state.session||!state.me)return;
  const list=savedAccounts(),key=state.session.host+"|"+state.me.id;
  const entry={key,id:state.me.id,host:state.session.host,acct:state.me.acct,display_name:state.me.display_name||state.me.username,avatar:state.me.avatar_static||state.me.avatar||"",session:state.session};
  const i=list.findIndex(x=>x.key===key);if(i>=0)list[i]=entry;else list.push(entry);
  store.set("lenton_accounts",list);
}
function resetAccountState(){
  state.lists=[];state.timelineItems=[];state.pageCache={};state.homeCache={};state.profileAccount=null;state.profileRelationship=null;state.currentConversation=null;state.customEmojis=null;state.listId=null;state.homeMode="home";state.scrolls={};
}
async function switchSavedAccount(index){
  const list=savedAccounts(),entry=list[index];if(!entry?.session)return;
  rememberScroll();state.session=entry.session;store.set("lenton_session",state.session);resetAccountState();
  try{state.me=await api("/api/v1/accounts/verify_credentials");saveCurrentAccount();state.view="home";render();toast("계정을 전환했어요.")}
  catch(e){toast("계정 전환 실패: "+e.message)}
}
function addAccountFlow(){
  const host=prompt("추가할 Mastodon 서버 주소",state.session?.host||"");if(!host)return;
  beginLoginForHost(host);
}
async function profileEditScreen(){
  closeDrawer();
  try{
    if(!state.me)state.me=await api("/api/v1/accounts/verify_credentials");
    const m=state.me;
    const body=`<div class="profile-editor">
      <label>표시 이름<input id="profileEditName" class="field" value="${esc(m.display_name||"")}"></label>
      <label>소개<textarea id="profileEditNote" class="field">${esc(plain(m.note||""))}</textarea></label>
      <label class="check-row"><input id="profileEditLocked" type="checkbox" ${m.locked?"checked":""}> 팔로우 요청 승인 필요</label>
      <label>프로필 사진<input id="profileEditAvatar" type="file" accept="image/*"></label>
      <label>헤더 이미지<input id="profileEditHeader" type="file" accept="image/*"></label>
      <button class="primary profile-save" data-action="saveProfileEdit">저장</button>
    </div>`;
    $("#app").innerHTML=standaloneShell("프로필 편집",body);bind();
  }catch(e){toast(e.message)}
}
async function saveProfileEdit(){
  const fd=new FormData();
  fd.append("display_name",$("#profileEditName")?.value||"");
  fd.append("note",$("#profileEditNote")?.value||"");
  fd.append("locked",$("#profileEditLocked")?.checked?"true":"false");
  const avatar=$("#profileEditAvatar")?.files?.[0],header=$("#profileEditHeader")?.files?.[0];
  if(avatar)fd.append("avatar",avatar);if(header)fd.append("header",header);
  try{
    state.me=await apiMultipart("/api/v1/accounts/update_credentials",fd,{method:"PATCH"});
    saveCurrentAccount();toast("프로필을 저장했어요.");state.view="profile";render();
  }catch(e){toast(e.message)}
}
function realtimeSettingsScreen(){
  const on=store.get("lenton_realtime_indicator",true)!==false;
  const body=`<div class="settings"><div class="section"><h3>실시간 연결 상태 표시</h3><div class="setting-row toggle-row"><span>상단에 연결 상태 표시</span><label><input id="realtimeToggle" type="checkbox" ${on?"checked":""}></label></div><div class="notice">온라인 상태와 네트워크 연결 여부를 작은 표시로 보여줍니다.</div></div></div>`;
  $("#app").innerHTML=standaloneShell("실시간 연결 상태 표시 설정",body);
  $("#realtimeToggle").onchange=e=>{store.set("lenton_realtime_indicator",e.target.checked);toast("설정을 저장했어요.")};bind();
}

function logout(){ if(!confirm("로그아웃할까요?"))return; store.del("lenton_session");state.session=null;state.me=null;render() }
function standalone(){return matchMedia("(display-mode: standalone)").matches||navigator.standalone===true}

function androidNavItems(){
  const items=ANDROID?.renderer?.bottomNavItems;
  return Array.isArray(items)&&items.length?items:[
    {id:"home",glyph:"⌂"},{id:"search",glyph:"⌕"},{id:"notifications",glyph:"♢"},{id:"dm",glyph:"✉"}
  ];
}
function lentonIcon(name,cls=""){
  const c='class="lenton-icon '+esc(cls)+'" viewBox="0 0 24 24" aria-hidden="true"';
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
  return "";
}
function navIcon(v){return lentonIcon(v,"nav-icon")}
function shell(title,body,opts={}){
  const av=state.me?.avatar_static||state.me?.avatar||"";
  const avatar=av? `<img src="${esc(av)}" alt="">` : '<span class="fallback">○</span>';
  const view=opts.view||state.view;
  let right="";
  if(view==="home"||view==="search"||view==="settings"){
    right=`<button class="top-icon search" data-view="search" aria-label="검색">${lentonIcon("search")}</button><button class="top-icon" data-action="topmenu" aria-label="더보기">${lentonIcon("more")}</button>`;
  }else if(view==="notifications"){
    right=`<button class="top-icon" data-action="topmenu" aria-label="더보기">${lentonIcon("more")}</button>`;
  }
  return `<div class="app lenton-view-${esc(view)}">
    <header class="topbar lenton-topbar">
      <button class="topbar-avatar" data-action="drawer">${avatar}</button>
      <h1>${esc(title)}</h1>
      ${store.get("lenton_realtime_indicator",true)!==false?`<span class="realtime-dot ${navigator.onLine?"online":"offline"}" title="${navigator.onLine?"온라인":"오프라인"}"></span>`:""}<div class="topbar-actions">${right}</div>
    </header>
    <main class="main">${body}</main>
    <nav class="bottom lenton-bottom">${navBar()}</nav>
    ${opts.fab?'<button class="fab lenton-fab" data-action="compose">＋</button>':""}
  </div>`;
}
function nav(v){return `<button data-view="${v}" class="${state.view===v?"active":""}" aria-label="${v}">${navIcon(v)}</button>`}
function navBar(){return visibleNavItems().map(x=>nav(x.id)).join("")}

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
function statusCard(raw){
  const st=raw.reblog||raw, boosted=!!raw.reblog, a=st.account||{};
  const boostLine=boosted?`<div class="boosted">↻ ${renderEmojiText(raw.account?.display_name||raw.account?.username||"",raw.account?.emojis||[])}님이 부스트</div>`:"";
  const cw=st.spoiler_text? `<div class="cw"><span>CW · ${renderEmojiText(st.spoiler_text,st.emojis||[])}</span> <button class="pill" data-action="togglecw">보기</button></div>`:"";
  const hidden=st.spoiler_text?' style="display:none" data-cwbody':"";
  return `<article class="status lenton-status" data-status-id="${st.id}">
    ${boostLine}
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
          <button data-action="reply" data-id="${st.id}" aria-label="답글">${lentonIcon("reply")} <span class="count">${st.replies_count||""}</span></button>
          <button class="boost ${st.reblogged?"on":""}" data-action="boost" data-id="${st.id}" aria-label="부스트">${lentonIcon("boost")} <span class="count">${st.reblogs_count||""}</span></button>
          <button class="fav ${st.favourited?"on":""}" data-action="fav" data-id="${st.id}" aria-label="좋아요">${lentonIcon(st.favourited?"heartFill":"heart")} <span class="count">${st.favourites_count||""}</span></button>
          <button class="bookmark ${st.bookmarked?"on":""}" data-action="bookmark" data-id="${st.id}" aria-label="북마크">${lentonIcon(st.bookmarked?"bookmarkFill":"bookmark")}</button>
          <button data-action="share" data-id="${st.id}" data-url="${esc(st.url||"")}" aria-label="공유">${lentonIcon("share")}</button>
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
async function loadAllFollowing(){
  if(!state.me) state.me=await api("/api/v1/accounts/verify_credentials");
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
  return out;
}
function statusId(raw){return raw?.id||raw?.reblog?.id||""}
function nonDirect(raw){return raw&&raw.visibility!=="direct"}
function lentonPublicStatus(raw){
  if(!raw||!raw.account)return false;
  const cfg=ANDROID?.timeline?.public||{};
  const author=raw.account.id||"",me=state.me?.id||"";
  if(!author)return false;
  if(cfg.excludeOwnPosts!==false&&author===me)return false;
  if(cfg.excludeDirect!==false&&raw.visibility==="direct")return false;
  if(cfg.excludeBoosts!==false&&raw.reblog)return false;
  if(cfg.excludeReplies!==false&&raw.in_reply_to_id!==null&&raw.in_reply_to_id!==undefined&&String(raw.in_reply_to_id)!=="")return false;
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
  const following=await loadAllFollowing(),allowed=new Set(following.map(x=>x.id));
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
async function homeView(){
  let data=[]; state.busy=true;renderLoadingShell("홈");
  try{
    if(!state.lists.length) await loadLists();
    if(state.listId) data=await api(`/api/v1/timelines/list/${state.listId}`,{query:{limit:"30"}});
    else data=await loadLentonHome(state.homeMode!=="public");
    const chronologicalLabel=ANDROID?.homeTabs?.chronological||"시간순", publicLabel=ANDROID?.homeTabs?.public||"퍼블릭";
    const tabs=`<div class="home-tabs"><button data-home-mode="home" class="${state.homeMode==="home"&&!state.listId?"active":""}">${esc(chronologicalLabel)}</button><button data-home-mode="public" class="${state.homeMode==="public"&&!state.listId?"active":""}">${esc(publicLabel)}</button></div>`;
    const visibleLists=state.lists.filter(x=>!hiddenListIds().has(x.id)); const chips=(visibleLists.length||state.lists.length)?`<div class="chips">${visibleLists.map(x=>`<button class="chip ${state.listId===x.id?"active":""}" data-list="${x.id}">${esc(x.title)}</button>`).join("")}<button class="chip" data-action="newlist">＋ 리스트</button></div>`:"";
    state.timelineItems=data; $("#app").innerHTML=shell(state.listId?(state.lists.find(x=>x.id===state.listId)?.title||"리스트"):"홈",tabs+chips+(data.length?data.map(statusCard).join(""):'<div class="center">표시할 게시물이 없어요.</div>')+'<button class="load-more" data-action="loadmorehome">더 불러오기</button>',{fab:true});
  }catch(e){$("#app").innerHTML=shell("홈",`<div class="center">타임라인을 불러오지 못했어요.<br><br>${esc(e.message)}<br><br><button class="primary" data-action="reload">다시 시도</button></div>`,{fab:true})}
  state.busy=false; bind();
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
    }else{
      more=await api("/api/v1/timelines/home",{query:{limit:"40",max_id:maxId}});
      if(state.homeMode==="public")more=more.filter(lentonPublicStatus);
    }
    const seen=new Set(state.timelineItems.map(statusId));
    more=more.filter(x=>{const id=statusId(x);if(!id||seen.has(id))return false;seen.add(id);return true});
    if(!more.length){if(btn)btn.textContent="더 불러올 게시물이 없어요.";return}
    state.timelineItems.push(...more);
    if(btn){btn.insertAdjacentHTML("beforebegin",more.map(statusCard).join(""));btn.disabled=false;btn.textContent="더 불러오기"}
    bind();
  }catch(e){toast(e.message);if(btn){btn.disabled=false;btn.textContent="다시 시도"}}
  finally{state.timelineLoadingMore=false}
}
function scrollKey(){return state.view+(state.view==="home"?":"+state.homeMode+":"+(state.listId||""):"")}
function rememberScroll(){state.scrolls[scrollKey()]=window.scrollY||document.documentElement.scrollTop||0}
function restoreScroll(){const y=state.scrolls[scrollKey()];if(typeof y==="number")requestAnimationFrame(()=>window.scrollTo(0,y))}
function renderLoadingShell(title){$("#app").innerHTML=shell(title,'<div class="center">불러오는 중…</div>',{fab:title==="홈"});bind()}

async function notificationsView(replyMentions=false){
  renderLoadingShell("알림");
  try{
    const query={limit:"40"};
    if(replyMentions) query["types[]"]="mention";
    const n=await api("/api/v1/notifications",{query});
    const tabs=`<div class="notify-tabs lenton-notify-tabs">
      <button data-action="clearNotifications">지우기</button>
      <button data-notify="mention" class="${replyMentions?"active":""}">답장할멘션</button>
    </div>`;
    const seenAt=Number(store.get(scopedKey("notifications_seen_at"),0)||0);
    const newest=n.reduce((m,x)=>Math.max(m,new Date(x.created_at||0).getTime()||0),seenAt);
    const rows=n.length?n.map(x=>{
      const a=x.account||{}, st=x.status||null;
      if(st){
        const replyTarget=state.me?.display_name||state.me?.username||"나"; const replyMeta=st.in_reply_to_id?`<div class="notify-reply-meta">${renderEmojiText(replyTarget,state.me?.emojis||[])}에게 보내는 답글</div>`:"";
        const isNew=(new Date(x.created_at||0).getTime()||0)>seenAt; return `<article class="notify-status ${isNew?"notification-new":""}" data-notification-id="${esc(x.id||"")}">
          <img class="notify-avatar" data-profile="${esc(a.id||"")}" src="${esc(a.avatar_static||a.avatar||"")}" alt="">
          <div class="notify-body">
            <div class="notify-head">
              <div><b>${renderEmojiText(a.display_name||a.username||"알림",a.emojis||[])}</b> <span>@${esc(a.acct||"")} · ${fmtTime(x.created_at)}</span></div>
              <button class="status-more" data-action="statusmenu" data-id="${esc(st.id||"")}">${lentonIcon("more")}</button>
            </div>
            ${replyMeta}
            <div class="notify-content">${renderRichText(st.content||"")}</div>
            <div class="actions lenton-actions notify-actions">
              <button data-action="reply" data-id="${esc(st.id||"")}">${lentonIcon("reply")}</button>
              <button class="boost ${st.reblogged?"on":""}" data-action="boost" data-id="${esc(st.id||"")}">${lentonIcon("boost")} <span class="count">${st.reblogs_count||""}</span></button>
              <button class="fav ${st.favourited?"on":""}" data-action="fav" data-id="${esc(st.id||"")}">${lentonIcon(st.favourited?"heartFill":"heart")} <span class="count">${st.favourites_count||""}</span></button>
              <button class="bookmark ${st.bookmarked?"on":""}" data-action="bookmark" data-id="${esc(st.id||"")}">${lentonIcon(st.bookmarked?"bookmarkFill":"bookmark")}</button>
              <button data-action="share" data-id="${esc(st.id||"")}" data-url="${esc(st.url||"")}">${lentonIcon("share")}</button>
            </div>
          </div>
        </article>`;
      }
      const simpleLabels={follow:"나를 팔로우했습니다",follow_request:"팔로우를 요청했습니다",favourite:"내 게시물을 좋아해요",reblog:"내 게시물을 부스트했어요",poll:"투표가 종료됐어요",status:"새 게시물을 올렸어요",update:"게시물을 수정했어요"}; const label=simpleLabels[x.type]||"새 알림";
      const isNew=(new Date(x.created_at||0).getTime()||0)>seenAt; return `<article class="notify-simple ${isNew?"notification-new":""}">
        <img class="notify-avatar" data-profile="${esc(a.id||"")}" src="${esc(a.avatar_static||a.avatar||"")}" alt="">
        <div><b>${renderEmojiText(a.display_name||a.username||"알림",a.emojis||[])}님이 ${esc(label)}</b><div class="notify-date">${fmtTime(x.created_at)}</div></div>
      </article>`;
    }).join(""):'<div class="center">새 알림이 없어요.</div>';
    $("#app").innerHTML=shell("알림",tabs+rows,{view:"notifications",fab:true});bind();
    store.set(scopedKey("notifications_seen_at"),newest)
  }catch(e){$("#app").innerHTML=shell("알림",`<div class="center">${esc(e.message)}</div>`,{view:"notifications",fab:true});bind()}
}
async function dmView(){
  renderLoadingShell("메시지");
  try{
    const cs=await api("/api/v1/conversations",{query:{limit:"40"}});
    const body=cs.length?cs.map(c=>{
      const a=c.accounts?.[0],txt=c.last_status?plain(c.last_status.content):"";
      return `<button class="message-row ${c.unread?"unread":""}" data-conv="${c.id}">
        <img class="message-avatar" src="${esc(a?.avatar_static||a?.avatar||"")}" alt="">
        <div class="message-main">
          <div class="message-name">${renderEmojiText(a?.display_name||a?.username||"대화",a?.emojis||[])}</div>
          <div class="message-handle">@${esc(a?.acct||"")}</div>
          <div class="message-preview">${esc(txt)}</div>
        </div>
        <time class="message-date">${fmtDateOnly(c.last_status?.created_at)}</time>
      </button>`;
    }).join(""):'<div class="center">대화가 없어요.</div>';
    $("#app").innerHTML=shell("메시지",body,{view:"dm",fab:true});bind(); state._conversations=cs;
  }catch(e){$("#app").innerHTML=shell("메시지",`<div class="center">${esc(e.message)}</div>`,{view:"dm",fab:true});bind()}
}
async function openConversation(id){
  const c=state._conversations?.find(x=>x.id===id); if(!c?.last_status)return;
  state.currentConversation=c; renderLoadingShell("DM");
  try{
    const ctx=await api(`/api/v1/statuses/${c.last_status.id}/context`);
    const all=[...(ctx.ancestors||[]),c.last_status,...(ctx.descendants||[])].filter(s=>s.visibility==="direct");
    const body=all.map(statusCard).join("")+`<div class="card"><button class="primary" data-action="replydm">답장</button></div>`;
    $("#app").innerHTML=shell(c.accounts?.[0]?.display_name||"DM",body);bind();
    api(`/api/v1/conversations/${id}/read`,{method:"POST",form:{}}).catch(()=>{});
  }catch(e){toast(e.message)}
}

function accentTextColor(){
  let h=String(state.accent||"#1d9bf0").replace("#","");
  if(h.length===3) h=h.split("").map(x=>x+x).join("");
  const r=parseInt(h.slice(0,2),16)||0,g=parseInt(h.slice(2,4),16)||0,b=parseInt(h.slice(4,6),16)||0;
  return ((r*299+g*587+b*114)/1000)>=160?"#000":"#fff";
}
function standaloneShell(title,body,right=""){
  return `<div class="standalone-page"><header class="standalone-top"><button class="back" data-action="backMain">‹</button><h1>${esc(title)}</h1>${right}</header><main class="main">${body}</main></div>`;
}
function profileMarkup(a,{own=false,replies=false,relationship=null}={}){
  const note=relationship?.note||"",noteColor=accentTextColor();
  const controls=own?"":`<button class="outline-btn" data-action="followProfile">${relationship?.following?"팔로잉":"팔로우"}</button>`;
  const privateNote=own?"":`<div class="private-note-card" data-action="editPrivateNote" style="color:${noteColor}"><div class="label">비밀 메모</div><div class="note">${esc(note.trim()?note:"메모를 추가하려면 탭하세요.")}</div></div>`;
  const header=a.header_static||a.header||"",avatar=a.avatar_static||a.avatar||"";
  return `<div class="profile-hero">
      ${header?`<button class="profile-header-button" data-media-url="${esc(header)}" data-media-alt="프로필 헤더"><img class="profile-header" src="${esc(header)}" alt=""></button>`:'<div class="profile-header"></div>'}
      ${avatar?`<button class="profile-avatar-button" data-media-url="${esc(avatar)}" data-media-alt="프로필 사진"><img class="profile-avatar" src="${esc(avatar)}" alt=""></button>`:""}
    </div>
    <div class="profile-info"><div class="profile-name-row"><div class="profile-names"><h2>${renderEmojiText(a.display_name||a.username,a.emojis||[])}</h2><div class="profile-handle">@${esc(a.acct)}</div></div>${controls}</div><div class="profile-bio">${renderRichText(a.note||"")}</div>${privateNote}<div class="profile-counts"><b style="color:var(--fg)">${a.following_count||0}</b> 팔로잉&nbsp;&nbsp;&nbsp;<b style="color:var(--fg)">${a.followers_count||0}</b> 팔로워</div></div>
    <div class="home-tabs"><button data-action="profilePosts" class="${replies?"":"active"}">${esc((ANDROID?.renderer?.profileTabs||["게시물","답글"])[0])}</button><button data-action="profileReplies" class="${replies?"active":""}">${esc((ANDROID?.renderer?.profileTabs||["게시물","답글"])[1])}</button></div>`;
}
async function profileView(replies=state.profileReplies){
  state.profileAccount=null; state.profileRelationship=null; state.profileReplies=!!replies;
  renderLoadingShell("프로필");
  try{
    if(!state.me) state.me=await api("/api/v1/accounts/verify_credentials");
    const a=state.me, query={limit:"25"}; if(!state.profileReplies)query.exclude_replies="true";
    const statuses=await api(`/api/v1/accounts/${a.id}/statuses`,{query});
    $("#app").innerHTML=shell("프로필",profileMarkup(a,{own:true,replies:state.profileReplies})+(statuses.length?statuses.map(statusCard).join(""):'<div class="center">게시물이 없어요.</div>'));bind()
  }catch(e){$("#app").innerHTML=shell("프로필",`<div class="center">${esc(e.message)}</div>`);bind()}
}
async function openProfile(id,replies=false){
  if(!id)return;rememberScroll();
  state.returnView=state.view; state.profileReplies=!!replies;
  $("#app").innerHTML=standaloneShell("프로필",'<div class="center">불러오는 중…</div>');bind();
  try{
    const [a,rels]=await Promise.all([
      api(`/api/v1/accounts/${id}`),
      api("/api/v1/accounts/relationships",{query:{"id[]":id}})
    ]);
    const relationship=Array.isArray(rels)?(rels[0]||{}):{};
    const query={limit:"25"}; if(!state.profileReplies)query.exclude_replies="true";
    const statuses=await api(`/api/v1/accounts/${id}/statuses`,{query});
    state.profileAccount=a; state.profileRelationship=relationship;
    const more=`<button class="profile-more" data-action="profileMenu" aria-label="프로필 관리">${lentonIcon("more")}</button>`;
    $("#app").innerHTML=standaloneShell("프로필",profileMarkup(a,{own:false,replies:state.profileReplies,relationship})+(statuses.length?statuses.map(statusCard).join(""):'<div class="center">게시물이 없어요.</div>'),more);bind();
  }catch(e){$("#app").innerHTML=standaloneShell("프로필",`<div class="center">${esc(e.message)}</div>`);bind()}
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
  shade.innerHTML=`<div class="android-dialog"><h3>${esc(title)}</h3>${message?`<p>${esc(message)}</p>`:""}${bodyHtml}</div>`;document.body.append(shade);return shade;
}
async function editPrivateNote(){
  const a=state.profileAccount,rel=state.profileRelationship;if(!a||!rel)return;
  const shade=dialogBox("비밀 메모","상대방에게는 보이지 않습니다. 비워서 저장하면 메모가 삭제됩니다.",`<textarea id="privateNoteInput" placeholder="나만 볼 수 있는 메모">${esc(rel.note||"")}</textarea><div class="android-dialog-actions"><button data-cancel>취소</button><button data-save>저장</button></div>`);
  shade.querySelector("[data-cancel]").onclick=()=>shade.remove();
  shade.querySelector("[data-save]").onclick=async()=>{const btn=shade.querySelector("[data-save]"),value=$("#privateNoteInput",shade).value.trim();btn.disabled=true;try{const r=await api(`/api/v1/accounts/${a.id}/note`,{method:"POST",form:{comment:value}});state.profileRelationship={...rel,...r,note:r?.note??value};shade.remove();toast(value?"비밀 메모를 저장했어요.":"비밀 메모를 삭제했어요.");openProfile(a.id,state.profileReplies)}catch(e){btn.disabled=false;toast(e.message)}};
}
async function toggleProfileRelation(endpoint){
  const a=state.profileAccount;if(!a)return;
  const title=endpoint==="mute"?"뮤트":endpoint==="unmute"?"뮤트 해제":endpoint==="block"?"차단":"차단 해제";
  if(!confirm(endpoint==="block"?"이 계정을 차단할까요?\n\n차단하면 현재 팔로우 중인 상태가 해제될 수 있어요.":`이 계정을 ${title}할까요?`))return;
  try{const r=await api(`/api/v1/accounts/${a.id}/${endpoint}`,{method:"POST",form:{}});state.profileRelationship={...(state.profileRelationship||{}),...r};toast(title+" 완료");openProfile(a.id,state.profileReplies)}catch(e){toast(e.message)}
}
async function toggleFollowProfile(){
  const a=state.profileAccount,rel=state.profileRelationship||{};if(!a)return;
  try{const r=await api(`/api/v1/accounts/${a.id}/${rel.following?"unfollow":"follow"}`,{method:"POST",form:{}});state.profileRelationship={...rel,...r};openProfile(a.id,state.profileReplies)}catch(e){toast(e.message)}
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

async function searchView(){
  $("#app").innerHTML=shell("검색",`<div class="search-box"><input id="searchInput" class="field" placeholder="사람, 게시물, 해시태그 검색"><button class="primary" data-action="runsearch">검색</button></div><div id="searchResults" class="center">검색어를 입력해 주세요.</div>`);bind();
}
async function runSearch(){
  const q=$("#searchInput")?.value.trim(); if(!q)return;
  const box=$("#searchResults"); box.className="center"; box.textContent="검색 중…";
  try{
    const r=await api("/api/v2/search",{query:{q,resolve:"true",limit:"20"}});
    let html="";
    if(r.accounts?.length){html+=`<div class="section-title">사람</div>`+r.accounts.map(a=>`<button class="row" data-profile="${esc(a.id||"")}"><img class="avatar" style="width:48px;height:48px" src="${esc(a.avatar_static||a.avatar||"")}" alt=""><div class="grow"><b>${renderEmojiText(a.display_name||a.username,a.emojis||[])}</b><div class="muted">@${esc(a.acct)}</div></div></button>`).join("")}
    if(r.statuses?.length){html+=`<div class="section-title">게시물</div>`+r.statuses.map(statusCard).join("")}
    box.className="";box.innerHTML=html||'<div class="center">검색 결과가 없어요.</div>';bind();
  }catch(e){box.className="center";box.textContent=e.message}
}

async function bookmarksView(){
  closeDrawer(); renderLoadingShell("북마크");
  try{
    const a=await api("/api/v1/bookmarks",{query:{limit:"30"}});
    $("#app").innerHTML=shell("북마크",a.length?a.map(statusCard).join(""):'<div class="center">북마크가 없어요.</div>');bind();
  }catch(e){toast(e.message)}
}

function buildDrawerElement(){
  const m=state.me||{},shade=document.createElement("div");
  const allAccounts=savedAccounts(),currentKey=state.session?.host+"|"+m.id;const otherAccounts=allAccounts.filter(x=>x&&x.avatar&&x.key!==currentKey).slice(0,3);
  shade.className="drawer-shade";
  shade.innerHTML=`<aside class="drawer lenton-drawer">
    <div class="drawer-account-strip">
      <img class="drawer-avatar" src="${esc(m.avatar_static||m.avatar||"")}" alt="">
      <div class="drawer-switchers">
        ${otherAccounts.map(x=>`<button class="drawer-account-btn" data-switch-account-key="${esc(x.key)}"><img class="drawer-switch-avatar" src="${esc(x.avatar)}" alt=""></button>`).join("")}
        <button class="drawer-add-account" data-drawer="addaccount">＋</button>
      </div>
    </div>
    <div class="drawer-name">${renderEmojiText(m.display_name||m.username||"렌톤",m.emojis||[])}</div>
    <div class="drawer-handle">@${esc(m.acct||"")}${m.acct?.includes("@")?"":"@"+esc(state.session?.host||"")}</div>
    <div class="drawer-counts"><b>${m.following_count||0}</b> 팔로잉&nbsp;&nbsp;&nbsp;<b>${m.followers_count||0}</b> 팔로워</div>
    <div class="drawer-divider"></div>
    <button class="drawer-row" data-drawer="profile"><span class="glyph">♙</span>프로필</button>
    <button class="drawer-row" data-drawer="profileedit"><span class="glyph">✎</span>프로필 편집</button>
    <button class="drawer-row" data-drawer="favourites"><span class="glyph">♡</span>좋아요</button>
    <button class="drawer-row" data-drawer="bookmarks"><span class="glyph">♧</span>북마크</button>
    <button class="drawer-row" data-drawer="followrequests"><span class="glyph">♙+</span>팔로우 요청</button>
    <button class="drawer-row" data-drawer="layoutedit"><span class="glyph">✎</span>화면 구성 편집</button>
    <div class="drawer-spacer"></div>
    <button class="drawer-row drawer-list-row" data-drawer="lists"><span class="glyph"></span>리스트</button>
    <div class="drawer-divider"></div>
    <button class="drawer-row" data-drawer="realtime"><span class="glyph">⚙</span>실시간 연결 상태 표시 설정</button>
    <button class="drawer-row" data-drawer="settings"><span class="glyph">⚙</span>설정</button>
    <button class="drawer-row" data-drawer="update"><span class="glyph">⇩</span>앱 업데이트</button>
  </aside>`;
  document.body.append(shade);
  shade.addEventListener("click",e=>{if(e.target===shade)closeDrawer()});
  shade.querySelectorAll("[data-drawer]").forEach(b=>b.onclick=async()=>{
    const v=b.dataset.drawer;
    if(v==="profile"){closeDrawer();state.view="profile";render()}
    else if(v==="bookmarks")bookmarksView();
    else if(v==="favourites")favouritesView();
    else if(v==="followrequests"){closeDrawer();followRequestsScreen()}
    else if(v==="lists"){closeDrawer();listsScreen()}
    else if(v==="settings"){closeDrawer();state.view="settings";render()}
    else if(v==="profileedit"){closeDrawer();profileEditScreen()}
    else if(v==="layoutedit"){closeDrawer();screenLayoutEditor()}
    else if(v==="realtime"){closeDrawer();realtimeSettingsScreen()}
    else if(v==="update"){closeDrawer();applyAutomaticUpdate();toast("최신 버전을 확인했어요.")}
    else if(v==="addaccount"){closeDrawer();addAccountFlow()}
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
  try{if(supported){const reg=await navigator.serviceWorker.ready;regd=!!(await reg.pushManager.getSubscription())}}
  catch{}
  try{const c=await caches.open("lenton-meta"),r=await c.match("./__lastpush");if(r)last=new Date(Number(await r.text())).toLocaleString("ko-KR")}catch{}
  return {supported,regd,last};
}
async function settingsView(){
  const d=await pushDiagnostics();
  const notif=("Notification"in window)?Notification.permission:"unsupported";
  const body=`<div class="settings">
    ${!standalone()?'<div class="install-card"><b>홈 화면에 설치하기</b><p>Safari 공유 버튼 → 홈 화면에 추가 → 웹 앱으로 열기</p></div>':""}
    <div class="section"><h3>빠른 알림</h3>
      <div class="kv"><span>홈 화면 웹앱</span><b class="${standalone()?"ok":"bad"}">${standalone()?"예":"아니오"}</b></div>
      <div class="kv"><span>Web Push 지원</span><b class="${d.supported?"ok":"bad"}">${d.supported?"지원":"미지원"}</b></div>
      <div class="kv"><span>알림 권한</span><b>${esc(notif)}</b></div>
      <div class="kv"><span>Push 등록</span><b class="${d.regd?"ok":"bad"}">${d.regd?"등록됨":"미등록"}</b></div>
      <div class="kv"><span>마지막 Push 수신</span><b>${esc(d.last)}</b></div>
      ${state.pushError?`<div class="notice bad">${esc(state.pushError)}</div>`:""}
      <div class="setting-row"><button class="primary" data-action="enablepush">빠른 알림 켜기 / 재등록</button></div>
    </div>
    <div class="section"><h3>화면</h3>
      <div class="setting-row"><b>모드</b><select id="themeSel" class="field" style="height:46px;margin-top:8px"><option value="system">시스템</option><option value="light">라이트</option><option value="dark">다크</option></select></div>
      <div class="setting-row"><b>강조색</b><input id="accentSel" type="color" value="${esc(state.accent)}" style="width:54px;height:38px;border:0;background:none;margin-top:8px"></div>
    </div>
    <div class="section"><h3>계정</h3>
      <div class="setting-row"><b>서버</b><span>${esc(state.session.host)}</span></div>
      <div class="setting-row"><button class="danger" data-action="logout">로그아웃</button></div>
    </div>
    <div class="section"><h3>버전</h3><div class="setting-row"><b>Android 원본</b><span>v${esc(ANDROID?.versionName||"?")} · code ${esc(ANDROID?.versionCode||"?")}</span></div><div class="setting-row"><b>웹 생성 기준</b><span>${esc(ANDROID?.generatedFrom||"unknown")}</span></div></div>
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
    const body=older+visibleAnc.map(statusCard).join("")+`<div class="thread-current">${statusCard(st)}</div>`+desc.map(statusCard).join("");
    $("#app").innerHTML=standaloneShell("게시물",body);bind();
  }catch(e){toast(e.message)}
}

async function newList(){
  const title=prompt("새 리스트 이름");if(!title)return;
  try{await api("/api/v1/lists",{method:"POST",form:{title}});await loadLists();render()}catch(e){toast(e.message)}
}
async function loadCustomEmojis(){
  if(Array.isArray(state.customEmojis))return state.customEmojis;
  try{state.customEmojis=await api("/api/v1/custom_emojis");return state.customEmojis}catch{state.customEmojis=[];return []}
}
async function uploadComposerFile(file){
  const fd=new FormData();fd.append("file",file);
  try{return await apiMultipart("/api/v2/media",fd)}
  catch{return await apiMultipart("/api/v1/media",fd)}
}
function compose(reply=null,forcedVisibility=null){
  let historyPushed=false;
  let parts=[{text:"",cw:!!reply?.spoiler_text,spoiler:reply?.spoiler_text||"",media:[]}];
  let visibility=forcedVisibility||reply?.visibility||"public",activePart=0,uploading=false;
  const recips=[];
  if(reply){
    const add=a=>{if(a&&a.id!==state.me?.id&&!recips.some(x=>x.id===a.id))recips.push({...a,on:true})};
    add(reply.account);(reply.mentions||[]).forEach(add);
  }
  const dirty=()=>parts.some(p=>p.text.trim()||p.spoiler.trim()||p.media.length);
  const confirmClose=()=>!dirty()||confirm("작성 중인 내용을 버릴까요?");
  const hydrateRecipients=async()=>{
    for(let i=0;i<recips.length;i++){
      if(recips[i].avatar||!recips[i].id)continue;
      try{const a=await api(`/api/v1/accounts/${recips[i].id}`);recips[i]={...recips[i],avatar:a.avatar_static||a.avatar||"",display_name:a.display_name||a.username||recips[i].acct}}catch{}
    }
    draw(false);
  };
  const draw=(refocus=true)=>{
    let old=$(".modal");if(old)old.remove();
    const m=document.createElement("div");m.className="modal compose-modal";
    const ct=ANDROID?.renderer?.compose||{};
    const visOptions=[["public","공개"],["unlisted","조용히 공개"],["private","팔로워만"],["direct","DM"]];
    m.innerHTML=`<div class="sheet compose-sheet">
      <div class="sheet-head"><button class="iconbtn" id="closeCompose">×</button><h2>${reply?(ct.replyTitle||"답글"):(ct.newTitle||"새 게시물")}</h2><button class="primary" id="sendCompose">${reply?(ct.replyButton||"답글"):(ct.postButton||"게시")}</button></div>
      <div class="compose-meta-row"><select id="composeVisibility" class="compose-visibility">${visOptions.map(x=>`<option value="${x[0]}" ${visibility===x[0]?"selected":""}>${x[1]}</option>`).join("")}</select></div>
      ${recips.length?`<div class="recips">${recips.map((r,i)=>`<button data-r="${i}" class="${r.on?"":"off"}">${r.avatar?`<img src="${esc(r.avatar)}" alt="">`:""}<span>@${esc(r.acct)}</span></button>`).join("")}</div>`:""}
      <div id="parts">${parts.map((p,i)=>`<div class="part ${i===activePart?"active":""}" data-p="${i}">
        <div class="part-head"><b>게시물 ${i+1}</b><label><input type="checkbox" data-cw="${i}" ${p.cw?"checked":""}> CW</label></div>
        <div class="part-body"><img class="avatar" src="${esc(state.me?.avatar_static||state.me?.avatar||"")}" alt=""><div class="part-fields">
          ${p.cw?`<input type="text" data-sp="${i}" placeholder="내용 경고" value="${esc(p.spoiler)}">`:""}
          <textarea data-t="${i}" placeholder="${reply?"답글을 입력하세요":"무슨 일이 일어나고 있나요?"}">${esc(p.text)}</textarea>
          ${p.media.length?`<div class="compose-media">${p.media.map((x,j)=>`<div class="compose-media-item"><img src="${esc(x.preview_url||x.url||"")}" alt=""><button data-remove-media="${i}:${j}">×</button></div>`).join("")}</div>`:""}
        </div></div>
      </div>`).join("")}</div>
      <div class="compose-tools">
        <button type="button" id="composeAttach" aria-label="이미지 첨부">▧</button>
        <button type="button" id="composeEmoji" aria-label="이모지">☺</button>
        <button type="button" class="compose-cw-toggle" id="composeCW">CW</button>
        <button type="button" class="part-add" id="addPart">＋ 타래</button>
        <input id="composeFile" type="file" accept="image/*,video/*" multiple hidden>
      </div>
      <div id="emojiPicker" class="emoji-picker" hidden></div>
    </div>`;
    document.body.append(m);
    if(!historyPushed){history.pushState({...history.state,lentonCompose:true},"",location.href);historyPushed=true}
    window.__lentonComposeGuard=confirmClose;
    window.__lentonComposeClose=()=>{document.querySelector(".compose-modal")?.remove();historyPushed=false;window.__lentonComposeGuard=null;window.__lentonComposeClose=null};
    const ta=m.querySelector(`[data-t="${activePart}"]`);
    if(refocus)requestAnimationFrame(()=>ta?.focus());
    m.querySelectorAll("[data-t]").forEach(x=>{
      x.addEventListener("focus",e=>activePart=+e.target.dataset.t);
      x.addEventListener("input",e=>parts[+e.target.dataset.t].text=e.target.value);
    });
    m.querySelectorAll("[data-sp]").forEach(x=>x.addEventListener("input",e=>parts[+e.target.dataset.sp].spoiler=e.target.value));
    m.querySelectorAll("[data-cw]").forEach(x=>x.addEventListener("change",e=>{parts[+e.target.dataset.cw].cw=e.target.checked;draw(false)}));
    m.querySelectorAll("[data-r]").forEach(x=>x.addEventListener("click",e=>{recips[+e.currentTarget.dataset.r].on=!recips[+e.currentTarget.dataset.r].on;draw(false)}));
    m.querySelectorAll("[data-remove-media]").forEach(x=>x.onclick=e=>{const [pi,mi]=e.currentTarget.dataset.removeMedia.split(":").map(Number);parts[pi].media.splice(mi,1);activePart=pi;draw(false)});
    $("#composeVisibility",m).onchange=e=>visibility=e.target.value;
    $("#addPart",m).onclick=()=>{parts.push({text:"",cw:!!reply?.spoiler_text,spoiler:reply?.spoiler_text||"",media:[]});activePart=parts.length-1;draw()};
    $("#composeCW",m).onclick=()=>{parts[activePart].cw=!parts[activePart].cw;if(parts[activePart].cw&&!parts[activePart].spoiler&&reply?.spoiler_text)parts[activePart].spoiler=reply.spoiler_text;draw()};
    $("#closeCompose",m).onclick=()=>{if(!confirmClose())return;if(historyPushed){window.__lentonComposeBypass=true;history.back()}else window.__lentonComposeClose?.()};
    $("#composeAttach",m).onclick=()=>$("#composeFile",m).click();
    $("#composeFile",m).onchange=async e=>{
      const files=[...e.target.files].slice(0,Math.max(0,4-parts[activePart].media.length));
      if(!files.length)return;uploading=true;$("#sendCompose",m).disabled=true;toast("미디어 업로드 중…");
      try{
        for(const file of files){const media=await uploadComposerFile(file);parts[activePart].media.push(media)}
        toast("첨부했어요.");
      }catch(err){toast("첨부 실패: "+err.message)}
      uploading=false;draw(false);
    };
    $("#composeEmoji",m).onclick=async()=>{
      const box=$("#emojiPicker",m);box.hidden=!box.hidden;if(box.hidden)return;
      box.innerHTML='<div class="center">이모지 불러오는 중…</div>';
      const emojis=await loadCustomEmojis();
      box.innerHTML=emojis.length?emojis.map(e=>`<button data-emoji="${esc(e.shortcode)}" title=":${esc(e.shortcode)}:"><img src="${esc(e.static_url||e.url)}" alt=":${esc(e.shortcode)}:"></button>`).join(""):'<div class="center">서버 이모지가 없어요.</div>';
      box.querySelectorAll("[data-emoji]").forEach(b=>b.onclick=()=>{
        const textarea=m.querySelector(`[data-t="${activePart}"]`);if(!textarea)return;
        const ins=":"+b.dataset.emoji+":",start=textarea.selectionStart??textarea.value.length,end=textarea.selectionEnd??start;
        parts[activePart].text=textarea.value.slice(0,start)+ins+textarea.value.slice(end);
        textarea.value=parts[activePart].text;textarea.focus();textarea.setSelectionRange(start+ins.length,start+ins.length);
      });
    };
    $("#sendCompose",m).onclick=async()=>{
      if(uploading){toast("미디어 업로드가 끝날 때까지 기다려주세요.");return}
      const valid=parts.filter(p=>p.text.trim()||p.media.length);if(!valid.length){toast("내용을 입력해주세요.");return}
      const btn=$("#sendCompose",m);btn.disabled=true;btn.textContent="게시 중…";
      try{
        let replyId=reply?.id||null,prefix=recips.filter(x=>x.on).map(x=>"@"+x.acct).join(" ");
        for(let i=0;i<valid.length;i++){
          const p=valid[i],form=new URLSearchParams();
          form.append("status",(i===0&&prefix?prefix+" ":"")+p.text.trim());
          form.append("visibility",visibility);
          form.append("spoiler_text",p.cw?p.spoiler.trim():"");
          if(replyId)form.append("in_reply_to_id",replyId);
          for(const media of p.media)if(media.id)form.append("media_ids[]",media.id);
          const posted=await api("/api/v1/statuses",{method:"POST",form});replyId=posted.id;
        }
        window.__lentonComposeClose?.();if(historyPushed){window.__lentonComposeBypass=true;history.back()}toast("게시했어요.");if(state.view==="home")render()
      }catch(e){toast(e.message);btn.disabled=false;btn.textContent=reply?"답글":"게시"}
    };
  };
  draw();
  if(recips.some(x=>!x.avatar))hydrateRecipients();
}
async function replyById(id,forced=null){try{const s=await api(`/api/v1/statuses/${id}`);compose(s,forced)}catch(e){toast(e.message)}}

async function enablePush(){
  state.pushError="";
  try{
    if(!standalone() && /iPad|iPhone|iPod/.test(navigator.userAgent)) throw new Error("iPhone/iPad에서는 먼저 Safari 공유 → 홈 화면에 추가로 설치해주세요.");
    if(!("serviceWorker"in navigator)||!("PushManager"in window)||!("Notification"in window)) throw new Error("이 브라우저는 Web Push를 지원하지 않습니다.");
    const perm=await Notification.requestPermission(); if(perm!=="granted") throw new Error("알림 권한이 허용되지 않았습니다.");
    const inst=await api("/api/v2/instance");
    const key=inst?.configuration?.vapid?.public_key||state.session.vapid_key;
    if(!key) throw new Error("이 Mastodon 서버에서 VAPID 공개키를 찾지 못했습니다.");
    const reg=await navigator.serviceWorker.ready;
    const old=await reg.pushManager.getSubscription(); if(old) await old.unsubscribe();
    const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(key)});
    const j=sub.toJSON(), form={
      "subscription[endpoint]":j.endpoint,
      "subscription[keys][p256dh]":j.keys.p256dh,
      "subscription[keys][auth]":j.keys.auth,
      "subscription[standard]":"true",
      "data[alerts][mention]":"true","data[alerts][follow]":"true","data[alerts][follow_request]":"true",
      "data[alerts][favourite]":"true","data[alerts][reblog]":"true","data[alerts][poll]":"true",
      "data[alerts][status]":"false","data[alerts][update]":"true","data[policy]":"all"
    };
    try {
      await api("/api/v1/push/subscription",{method:"POST",form});
    } catch (firstError) {
      const legacy={...form};
      delete legacy["subscription[standard]"];
      try {
        await api("/api/v1/push/subscription",{method:"POST",form:legacy});
      } catch {
        throw firstError;
      }
    }
    toast("빠른 알림을 켰어요.");settingsView();
  }catch(e){state.pushError=e.message;toast("알림 설정 실패");settingsView()}
}
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
function buildSwipePreview(html,className){
  const p=document.createElement("div");p.className=className;
  p.innerHTML=html||'<div class="swipe-empty"></div>';
  document.body.append(p);return p;
}
function previewForMainView(view){
  if(state.pageCache[view])return state.pageCache[view];
  const title=view==="home"?"홈":view==="search"?"검색":view==="notifications"?"알림":"메시지";
  return `<div class="app"><header class="topbar lenton-topbar"><h1>${title}</h1></header><main class="main"><div class="center">불러오는 중…</div></main></div>`;
}
function attachInteractiveMainSwipe(bottom){
  if(!bottom||bottom.dataset.interactiveSwipe==="1")return;
  bottom.dataset.interactiveSwipe="1";
  let start=null,active=false,target=null,preview=null,current=null,width=0,dir=0;
  const cleanup=()=>{
    if(current){current.style.transition="";current.style.transform="";current.classList.remove("swipe-moving")}
    preview?.remove();preview=null;start=null;active=false;target=null;current=null;dir=0;
  };
  bottom.addEventListener("touchstart",e=>{
    if(e.touches?.length!==1)return;
    start=gesturePoint(e);active=false;target=null;current=document.querySelector("#app>.app");width=window.innerWidth||document.documentElement.clientWidth;
  },{passive:true});
  bottom.addEventListener("touchmove",e=>{
    if(!start||e.touches?.length!==1||!current)return;
    const p=gesturePoint(e),dx=p.x-start.x,dy=p.y-start.y;
    if(!active){
      if(Math.abs(dy)>18&&Math.abs(dy)>=Math.abs(dx)){cleanup();return}
      if(Math.abs(dx)<10||Math.abs(dx)<=Math.abs(dy)*1.25)return;
      const order=visibleNavItems().map(x=>x.id),i=order.indexOf(state.view);
      dir=dx<0?1:-1;target=order[i+dir]||null;active=true;
      if(target){
        preview=buildSwipePreview(previewForMainView(target),"main-swipe-preview");
        preview.style.transform=`translate3d(${dir>0?width:-width}px,0,0)`;
      }
      current.classList.add("swipe-moving");current.style.transition="none";
    }
    if(!active)return;
    e.preventDefault();
    const raw=dx,shown=target?raw:raw*.18;
    current.style.transform=`translate3d(${shown}px,0,0)`;
    if(preview)preview.style.transform=`translate3d(${shown+(dir>0?width:-width)}px,0,0)`;
  },{passive:false});
  bottom.addEventListener("touchend",async e=>{
    if(!start||!current){cleanup();return}
    const p=gesturePoint(e),dx=p.x-start.x,dt=Math.max(1,p.time-start.time),vx=dx/dt;
    if(!active){cleanup();return}
    const commit=!!target&&(Math.abs(dx)>width*.22||Math.abs(vx)>.65);
    if(commit){
      current.style.transition="transform 180ms cubic-bezier(.2,.75,.25,1)";
      if(preview)preview.style.transition=current.style.transition;
      requestAnimationFrame(()=>{
        current.style.transform=`translate3d(${dir>0?-width:width}px,0,0)`;
        if(preview)preview.style.transform="translate3d(0,0,0)";
      });
      await new Promise(r=>setTimeout(r,195));
      rememberScroll();const next=target;cleanup();state.view=next;state.listId=null;render();
    }else{
      current.style.transition="transform 160ms cubic-bezier(.2,.75,.25,1)";
      if(preview)preview.style.transition=current.style.transition;
      requestAnimationFrame(()=>{
        current.style.transform="translate3d(0,0,0)";
        if(preview)preview.style.transform=`translate3d(${dir>0?width:-width}px,0,0)`;
      });
      setTimeout(cleanup,180);
    }
  },{passive:true});
  bottom.addEventListener("touchcancel",cleanup,{passive:true});
}
function attachInteractiveHomeSwipe(main){
  if(!main||main.dataset.homeSwipe==="1"||state.listId)return;
  main.dataset.homeSwipe="1";
  let start=null,active=false,target=null,preview=null,width=0,dir=0;
  const cleanup=()=>{main.style.transition="";main.style.transform="";main.classList.remove("swipe-moving");preview?.remove();preview=null;start=null;active=false;target=null};
  main.addEventListener("touchstart",e=>{
    if(e.touches?.length!==1)return;const p=gesturePoint(e);if(p.x<=28)return;
    start=p;width=window.innerWidth||document.documentElement.clientWidth;active=false;
  },{passive:true});
  main.addEventListener("touchmove",e=>{
    if(!start||e.touches?.length!==1)return;
    const p=gesturePoint(e),dx=p.x-start.x,dy=p.y-start.y;
    if(!active){
      if(Math.abs(dy)>18&&Math.abs(dy)>=Math.abs(dx)){cleanup();return}
      if(Math.abs(dx)<10||Math.abs(dx)<=Math.abs(dy)*1.15)return;
      dir=dx<0?1:-1;
      target=dir>0?(state.homeMode==="home"?"public":null):(state.homeMode==="public"?"home":null);
      active=true;main.classList.add("swipe-moving");main.style.transition="none";
      if(target){
        const html=state.homeCache[target]||'<div class="center">불러오는 중…</div>';
        preview=buildSwipePreview(html,"home-swipe-preview");
        preview.style.transform=`translate3d(${dir>0?width:-width}px,0,0)`;
      }
    }
    if(!active)return;e.preventDefault();
    const shown=target?dx:dx*.18;main.style.transform=`translate3d(${shown}px,0,0)`;
    if(preview)preview.style.transform=`translate3d(${shown+(dir>0?width:-width)}px,0,0)`;
  },{passive:false});
  main.addEventListener("touchend",async e=>{
    if(!start){cleanup();return}
    const p=gesturePoint(e),dx=p.x-start.x,dt=Math.max(1,p.time-start.time),vx=dx/dt;
    if(!active){cleanup();return}
    const commit=!!target&&(Math.abs(dx)>width*.20||Math.abs(vx)>.65);
    if(commit){
      main.style.transition="transform 180ms cubic-bezier(.2,.75,.25,1)";
      if(preview)preview.style.transition=main.style.transition;
      requestAnimationFrame(()=>{main.style.transform=`translate3d(${dir>0?-width:width}px,0,0)`;if(preview)preview.style.transform="translate3d(0,0,0)"});
      await new Promise(r=>setTimeout(r,195));
      const mode=target;cleanup();rememberScroll();state.homeMode=mode;render();
    }else{
      main.style.transition="transform 160ms cubic-bezier(.2,.75,.25,1)";
      if(preview)preview.style.transition=main.style.transition;
      requestAnimationFrame(()=>{main.style.transform="translate3d(0,0,0)";if(preview)preview.style.transform=`translate3d(${dir>0?width:-width}px,0,0)`});
      setTimeout(cleanup,180);
    }
  },{passive:true});
  main.addEventListener("touchcancel",cleanup,{passive:true});
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
function attachInteractiveProfileSwipe(host){
  if(!host||host.dataset.profileSwipe==="1")return;host.dataset.profileSwipe="1";
  let start=null,active=false,targetReplies=null,preview=null,width=0,dir=0;
  const accountId=state.profileAccount?.id||state.me?.id||"me";
  const cleanup=()=>{host.style.transition="";host.style.transform="";host.classList.remove("swipe-moving");preview?.remove();preview=null;start=null;active=false;targetReplies=null};
  host.addEventListener("touchstart",e=>{if(e.touches?.length!==1)return;const p=gesturePoint(e);if(p.x<=28)return;start=p;width=window.innerWidth||document.documentElement.clientWidth},{passive:true});
  host.addEventListener("touchmove",e=>{
    if(!start||e.touches?.length!==1)return;const p=gesturePoint(e),dx=p.x-start.x,dy=p.y-start.y;
    if(!active){
      if(Math.abs(dy)>18&&Math.abs(dy)>=Math.abs(dx)){cleanup();return}
      if(Math.abs(dx)<10||Math.abs(dx)<=Math.abs(dy)*1.15)return;
      dir=dx<0?1:-1;targetReplies=dir>0?(state.profileReplies?null:true):(state.profileReplies?false:null);active=true;
      host.classList.add("swipe-moving");host.style.transition="none";
      if(targetReplies!==null){
        const key=accountId+":"+(targetReplies?"replies":"posts"),html=state.profileCache[key]||'<div class="center">불러오는 중…</div>';
        preview=buildSwipePreview(html,"profile-swipe-preview");preview.style.transform=`translate3d(${dir>0?width:-width}px,0,0)`;
      }
    }
    if(!active)return;e.preventDefault();const shown=targetReplies!==null?dx:dx*.18;
    host.style.transform=`translate3d(${shown}px,0,0)`;if(preview)preview.style.transform=`translate3d(${shown+(dir>0?width:-width)}px,0,0)`;
  },{passive:false});
  host.addEventListener("touchend",async e=>{
    if(!start){cleanup();return}const p=gesturePoint(e),dx=p.x-start.x,dt=Math.max(1,p.time-start.time),vx=dx/dt;
    if(!active){cleanup();return}const commit=targetReplies!==null&&(Math.abs(dx)>width*.20||Math.abs(vx)>.65);
    if(commit){
      host.style.transition="transform 180ms cubic-bezier(.2,.75,.25,1)";if(preview)preview.style.transition=host.style.transition;
      requestAnimationFrame(()=>{host.style.transform=`translate3d(${dir>0?-width:width}px,0,0)`;if(preview)preview.style.transform="translate3d(0,0,0)"});
      await new Promise(r=>setTimeout(r,195));const target=targetReplies;cleanup();
      if(state.profileAccount)openProfile(state.profileAccount.id,target);else profileView(target);
    }else{
      host.style.transition="transform 160ms cubic-bezier(.2,.75,.25,1)";if(preview)preview.style.transition=host.style.transition;
      requestAnimationFrame(()=>{host.style.transform="translate3d(0,0,0)";if(preview)preview.style.transform=`translate3d(${dir>0?width:-width}px,0,0)`});
      setTimeout(cleanup,180);
    }
  },{passive:true});
  host.addEventListener("touchcancel",cleanup,{passive:true});
}
function attachLentonGestures(){
  const bottom=document.querySelector(".bottom");
  attachInteractiveMainSwipe(bottom);

  const app=document.querySelector(".app");
  attachEdgeDrawerSwipe(app);

  const drawer=document.querySelector(".drawer");
  attachDrawerCloseSwipe(drawer);

  if(state.view==="home")attachInteractiveHomeSwipe(document.querySelector(".main"));

  const profileTabs=document.querySelector(".profile-info + .home-tabs,.profile-hero ~ .home-tabs");
  if(profileTabs){
    const host=document.querySelector(".standalone-page .main")||document.querySelector(".app .main");
    attachInteractiveProfileSwipe(host);
  }
}

function bind(){
  document.querySelectorAll("[data-profile]").forEach(b=>b.onclick=e=>{e.stopPropagation();openProfile(b.dataset.profile)});
  document.querySelectorAll("[data-open-list]").forEach(b=>b.onclick=()=>{state.view="home";state.listId=b.dataset.openList;render()});
  document.querySelectorAll("[data-list-manage]").forEach(b=>b.onclick=()=>listManageScreen(b.dataset.listManage));
  document.querySelectorAll("[data-list-visible]").forEach(b=>b.onclick=()=>{const id=b.dataset.listVisible;setListHidden(id,!hiddenListIds().has(id));listsScreen()});
  document.querySelectorAll("[data-list-save]").forEach(b=>b.onclick=()=>saveListSettings(b.dataset.listSave));
  document.querySelectorAll("[data-list-delete]").forEach(b=>b.onclick=()=>deleteList(b.dataset.listDelete));
  document.querySelectorAll("[data-layout-up]").forEach(b=>b.onclick=()=>mutateLayout(b.dataset.layoutUp,-1));
  document.querySelectorAll("[data-layout-down]").forEach(b=>b.onclick=()=>mutateLayout(b.dataset.layoutDown,1));
  document.querySelectorAll("[data-layout-toggle]").forEach(b=>b.onclick=()=>mutateLayout(b.dataset.layoutToggle,0));
  document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{rememberScroll();state.view=b.dataset.view;state.listId=null;render()});
  document.querySelectorAll("[data-action]").forEach(b=>b.onclick=async()=>{
    const a=b.dataset.action;
    if(a==="settings"){state.view="settings";render()}
    else if(a==="drawer")openDrawer()
    else if(a==="compose")compose()
    else if(a==="reload")render()
    else if(a==="logout")logout()
    else if(a==="enablepush")enablePush()
    else if(a==="clearNotifications"){try{await api("/api/v1/notifications/clear",{method:"POST",form:{}});notificationsView(false)}catch(e){toast(e.message)}}
    else if(a==="share"){const u=b.dataset.url||"";try{if(navigator.share)await navigator.share({url:u});else{await navigator.clipboard.writeText(u);toast("링크를 복사했어요.")}}catch{}}
    else if(a==="topmenu")openDrawer()
    else if(a==="statusmenu")openStatusMenu(b.dataset.id)
    else if(a==="newlist")newList()
    else if(a==="resetLayout")resetMainTabLayout()
    else if(a==="loadmorehome")loadMoreHome()
    else if(a==="saveProfileEdit")saveProfileEdit()
    else if(a==="runsearch")runSearch()
    else if(a==="togglecw"){const body=b.closest(".status-main").querySelector("[data-cwbody]");body.style.display=body.style.display==="none"?"block":"none"}
    else if(a==="reply")replyById(b.dataset.id)
    else if(a==="fav"||a==="boost"||a==="bookmark")statusAction(b.dataset.id,a)
    else if(a==="replydm"){if(state.currentConversation?.last_status)compose(state.currentConversation.last_status,"direct")}
    else if(a==="profileReplies"){if(state.profileAccount)openProfile(state.profileAccount.id,true);else profileView(true)}
    else if(a==="profilePosts"){if(state.profileAccount)openProfile(state.profileAccount.id,false);else profileView(false)}
    else if(a==="profileMenu")openProfilePopup()
    else if(a==="editPrivateNote")editPrivateNote()
    else if(a==="followProfile")toggleFollowProfile()
    else if(a==="backMain"){state.profileAccount=null;state.profileRelationship=null;render()}
  });
  document.querySelectorAll("[data-home-mode]").forEach(b=>b.onclick=()=>{state.homeMode=b.dataset.homeMode;state.listId=null;render()});
  document.querySelectorAll("[data-list]").forEach(b=>b.onclick=()=>{state.listId=state.listId===b.dataset.list?null:b.dataset.list;render()});
  document.querySelectorAll("[data-conv]").forEach(b=>b.onclick=()=>openConversation(b.dataset.conv));
  document.querySelectorAll("[data-media-url]").forEach(b=>b.onclick=e=>{e.stopPropagation();openMediaViewer(b.dataset.mediaUrl,b.dataset.mediaAlt||"")});
  document.querySelectorAll(".status[data-status-id]").forEach(card=>card.onclick=e=>{if(e.target.closest("button,a,video,audio"))return;openThread(card.dataset.statusId)});
  document.querySelectorAll("[data-thread-older]").forEach(b=>b.onclick=()=>openThread(b.dataset.threadOlder,true));
  document.querySelectorAll("[data-notify]").forEach(b=>b.onclick=()=>notificationsView(b.dataset.notify==="mention"));
  document.querySelectorAll("[data-follow-accept]").forEach(b=>b.onclick=()=>decideFollowRequest(b.dataset.followAccept,true));
  document.querySelectorAll("[data-follow-reject]").forEach(b=>b.onclick=()=>decideFollowRequest(b.dataset.followReject,false));
  $("#searchInput")?.addEventListener("keydown",e=>{if(e.key==="Enter")runSearch()});
  $("#themeSel")?.addEventListener("change",e=>{state.theme=e.target.value;store.set("lenton_theme",state.theme);if(state.theme==="system")delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=state.theme});
  $("#accentSel")?.addEventListener("input",e=>{state.accent=e.target.value;store.set("lenton_accent",state.accent);document.documentElement.style.setProperty("--accent",state.accent)});
  const appRoot=document.querySelector("#app>.app");
  if(appRoot)state.pageCache[state.view]=$("#app").innerHTML;
  if(state.view==="home"&&document.querySelector(".main"))state.homeCache[state.homeMode]=document.querySelector(".main").innerHTML;
  if(document.querySelector(".profile-info")&&document.querySelector(".main")){
    const pid=state.profileAccount?.id||state.me?.id||"me";
    state.profileCache[pid+":"+(state.profileReplies?"replies":"posts")]=document.querySelector(".main").innerHTML;
  }
  attachLentonGestures();
  restoreScroll();
  attachLayoutEditorDrag();
}

let pendingAutomaticUpdate=false;
function composeIsOpen(){return !!document.querySelector(".modal .sheet")}
async function applyAutomaticUpdate(){
  try{
    const current=String(ANDROID?.apkSha256||"").toLowerCase();
    const r=await fetch("./build.json?ts="+Date.now(),{cache:"no-store"});
    if(!r.ok)return;
    const remote=await r.json();
    const next=String(remote?.apkSha256||"").toLowerCase();
    if(!current||!next||current===next)return;
    if(composeIsOpen()){pendingAutomaticUpdate=true;return}
    const key="lenton_reload_"+next;
    if(sessionStorage.getItem(key))return;
    sessionStorage.setItem(key,"1");
    const reg=await navigator.serviceWorker.getRegistration("./");
    await reg?.update().catch(()=>{});
    location.reload();
  }catch{}
}
async function registerSW(){
  if("serviceWorker"in navigator){
    const reg=await navigator.serviceWorker.register("./sw.js",{scope:"./",updateViaCache:"none"});
    navigator.serviceWorker.addEventListener("message",e=>{if(e.data?.type==="push"){toast("새 알림이 도착했어요.");if(state.view==="notifications")notificationsView()}});
    await reg.update().catch(()=>{});
  }
}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")applyAutomaticUpdate()});
window.addEventListener("focus",applyAutomaticUpdate);
setInterval(()=>{if(document.visibilityState==="visible")applyAutomaticUpdate()},60000);
window.addEventListener("beforeinstallprompt",e=>e.preventDefault());
window.addEventListener("popstate",()=>{
  const modal=document.querySelector(".compose-modal");
  if(!modal)return;
  if(window.__lentonComposeBypass){window.__lentonComposeBypass=false;window.__lentonComposeClose?.();return}
  const ok=window.__lentonComposeGuard?window.__lentonComposeGuard():true;
  if(ok)window.__lentonComposeClose?.();
  else history.pushState({...history.state,lentonCompose:true},"",location.href);
});
window.addEventListener("beforeunload",e=>{
  if(document.querySelector(".compose-modal")&&window.__lentonComposeGuard){
    e.preventDefault();e.returnValue="";
  }
});
(async()=>{
  try{await registerSW();await finishOAuth()}catch(e){toast(e.message)}
  if(state.session){try{state.me=await api("/api/v1/accounts/verify_credentials");saveCurrentAccount()}catch{store.del("lenton_session");state.session=null}}
  const q=new URLSearchParams(location.search),notificationId=q.get("notification_id"),deep=q.get("view");if(["home","notifications","dm","profile","settings"].includes(deep))state.view=deep;
  render();
  if(notificationId&&state.session)setTimeout(()=>openNotificationDeepLink(notificationId),0);
  applyAutomaticUpdate();
})();
