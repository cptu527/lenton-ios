const $ = (s, r=document) => r.querySelector(s);
const esc = (s="") => String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
const plain = (html="") => { const d=document.createElement("div"); d.innerHTML=html; return d.textContent||""; };
const fmtTime = (v) => { try { return new Intl.DateTimeFormat("ko-KR",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(v)); } catch { return ""; } };
const store = {
  get(k,d=null){try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},
  set(k,v){localStorage.setItem(k,JSON.stringify(v))},
  del(k){localStorage.removeItem(k)}
};
const state = {
  session: store.get("lenton_session"),
  me:null, view:"home", homeMode:"home", listId:null, lists:[], busy:false,
  theme:store.get("lenton_theme","system"), accent:store.get("lenton_accent","#1d9bf0"),
  pushError:"", toast:"", currentConversation:null
};
const REDIRECT_URI = location.origin + location.pathname;
document.documentElement.style.setProperty("--accent",state.accent);
if(state.theme!=="system") document.documentElement.dataset.theme=state.theme;

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
  if(form){h["Content-Type"]="application/x-www-form-urlencoded;charset=UTF-8";o.body=new URLSearchParams(form)}
  const res=await fetch(url,o); const txt=await res.text(); let data=null; try{data=txt?JSON.parse(txt):null}catch{data=txt}
  if(!res.ok) throw new Error((data&&data.error)||`HTTP ${res.status}`);
  return data;
}

async function beginLogin(){
  const input=$("#server"); const host=normalizeHost(input?.value||"");
  if(!host||!host.includes(".")){toast("서버 주소를 확인해주세요.");return}
  state.busy=true; render();
  try{
    const scopes="read write push";
    const body=new URLSearchParams({client_name:"Lenton Web",redirect_uris:REDIRECT_URI,scopes,website:location.origin});
    const reg=await rawFetch(host,"/api/v1/apps",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body});
    let pkce=false;
    try{
      const meta=await rawFetch(host,"/.well-known/oauth-authorization-server");
      pkce=Array.isArray(meta.code_challenge_methods_supported)&&meta.code_challenge_methods_supported.includes("S256");
    }catch{}
    const verifier=pkce?randB64(48):null;
    const stateToken=randB64(24);
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

function logout(){ if(!confirm("로그아웃할까요?"))return; store.del("lenton_session");state.session=null;state.me=null;render() }
function standalone(){return matchMedia("(display-mode: standalone)").matches||navigator.standalone===true}

function shell(title,body,opts={}){
  return `<div class="app">
    <header class="topbar"><h1>${esc(title)}</h1>${opts.gear!==false?'<button class="iconbtn" data-action="settings">⚙︎</button>':""}</header>
    <main class="main">${body}</main>
    <nav class="bottom">
      ${nav("home","⌂","홈")}${nav("notifications","♢","알림")}${nav("dm","✉","DM")}${nav("profile","○","프로필")}
    </nav>
    ${opts.fab?'<button class="fab" data-action="compose">✎</button>':""}
  </div>`;
}
function nav(v,icon,label){return `<button data-view="${v}" class="${state.view===v?"active":""}"><span>${icon}</span>${label}</button>`}

function loginView(){
  const install=!standalone()?'<div class="install-card"><b>아이폰/아이패드 설치</b><p>Safari의 공유 버튼을 누른 뒤 <b>홈 화면에 추가</b> → <b>웹 앱으로 열기</b>를 켜주세요.</p></div>':"";
  return `<div class="login">
    <img class="logo" src="./icon-1024.png" alt="렌톤">
    <h1>렌톤</h1><p>빠른 알림을 지원하는 Mastodon 웹앱 프리뷰입니다.</p>
    ${install}
    <input id="server" class="field" inputmode="url" autocapitalize="none" placeholder="예: occm.cc">
    <button id="loginBtn" class="primary" ${state.busy?"disabled":""}>${state.busy?"연결 중…":"Mastodon으로 로그인"}</button>
    <p class="muted">로그인 토큰은 이 기기 브라우저에만 저장합니다.</p>
  </div>`;
}

function statusCard(raw){
  const s=raw.reblog||raw, boosted=!!raw.reblog;
  const cw=s.spoiler_text? `<div class="cw">CW · ${esc(s.spoiler_text)} <button class="pill" data-action="togglecw">보기</button></div>`:"";
  const hidden=s.spoiler_text?" style=\"display:none\" data-cwbody":"";
  return `<article class="status" data-status-id="${s.id}">
    ${boosted?'<div class="muted">부스트됨</div>':""}
    <div class="status-head">
      <img class="avatar" src="${esc(s.account.avatar_static||s.account.avatar)}" alt="">
      <div class="status-main"><div><span class="name">${esc(s.account.display_name||s.account.username)}</span> <span class="acct">@${esc(s.account.acct)}</span></div><div class="time">${fmtTime(s.created_at)}</div>
      ${cw}<div class="content"${hidden}>${esc(plain(s.content))}</div>
      <div class="actions"><button data-action="reply" data-id="${s.id}">↩ ${s.replies_count||0}</button><button data-action="boost" data-id="${s.id}">↻ ${s.reblogs_count||0}</button><button data-action="fav" data-id="${s.id}">♡ ${s.favourites_count||0}</button></div>
      </div>
    </div>
  </article>`;
}

async function loadLists(){try{state.lists=await api("/api/v1/lists")}catch{state.lists=[]}}
async function homeView(){
  let data=[]; state.busy=true;renderLoadingShell("홈");
  try{
    if(!state.lists.length) await loadLists();
    if(state.listId) data=await api(`/api/v1/timelines/list/${state.listId}`,{query:{limit:"30"}});
    else data=await api(state.homeMode==="public"?"/api/v1/timelines/public":"/api/v1/timelines/home",{query:{limit:"30"}});
    const seg=`<div class="segment"><button data-home-mode="home" class="${state.homeMode==="home"&&!state.listId?"active":""}">시간순</button><button data-home-mode="public" class="${state.homeMode==="public"&&!state.listId?"active":""}">퍼블릭</button></div>`;
    const chips=state.lists.length?`<div class="chips">${state.lists.map(x=>`<button class="chip ${state.listId===x.id?"active":""}" data-list="${x.id}">${esc(x.title)}</button>`).join("")}<button class="chip" data-action="newlist">＋ 리스트</button></div>`:"";
    $("#app").innerHTML=shell(state.listId?(state.lists.find(x=>x.id===state.listId)?.title||"리스트"):"홈",seg+chips+(data.length?data.map(statusCard).join(""):'<div class="center">게시물이 없습니다.</div>'),{fab:true});
  }catch(e){$("#app").innerHTML=shell("홈",`<div class="center">불러오지 못했어요.<br>${esc(e.message)}<br><br><button class="primary" data-action="reload">다시 시도</button></div>`,{fab:true})}
  state.busy=false; bind();
}
function renderLoadingShell(title){$("#app").innerHTML=shell(title,'<div class="center">불러오는 중…</div>',{fab:title==="홈"});bind()}

async function notificationsView(){
  renderLoadingShell("알림");
  try{
    const n=await api("/api/v1/notifications",{query:{limit:"40"}});
    const labels={mention:"멘션",follow:"팔로우",favourite:"좋아요",reblog:"부스트",poll:"투표",status:"새 게시물",update:"수정"};
    const body=n.length?n.map(x=>`<div class="row"><img class="avatar" src="${esc(x.account?.avatar_static||x.account?.avatar||"")}" alt=""><div class="grow"><b>${esc(x.account?.display_name||x.account?.username||"알림")}</b><div class="muted">${labels[x.type]||esc(x.type)} · ${fmtTime(x.created_at)}</div>${x.status?`<div>${esc(plain(x.status.content)).slice(0,180)}</div>`:""}</div></div>`).join(""):'<div class="center">알림이 없습니다.</div>';
    $("#app").innerHTML=shell("알림",body);bind()
  }catch(e){$("#app").innerHTML=shell("알림",`<div class="center">${esc(e.message)}</div>`);bind()}
}

async function dmView(){
  renderLoadingShell("DM");
  try{
    const cs=await api("/api/v1/conversations",{query:{limit:"40"}});
    const body=cs.length?cs.map(c=>{const a=c.accounts?.[0],txt=c.last_status?plain(c.last_status.content):"";return `<button class="row" data-conv="${c.id}" style="width:100%;text-align:left;border-left:0;border-right:0;border-top:0"><img class="avatar" src="${esc(a?.avatar_static||a?.avatar||"")}" alt=""><div class="grow"><b>${esc(a?.display_name||a?.username||"대화")}</b><div class="muted">${esc(txt).slice(0,100)}</div></div>${c.unread?'<span class="badge"></span>':""}</button>`}).join(""):'<div class="center">DM이 없습니다.</div>';
    $("#app").innerHTML=shell("DM",body);bind(); state._conversations=cs;
  }catch(e){$("#app").innerHTML=shell("DM",`<div class="center">${esc(e.message)}</div>`);bind()}
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
async function profileView(){
  renderLoadingShell("프로필");
  try{
    if(!state.me) state.me=await api("/api/v1/accounts/verify_credentials");
    const s=await api(`/api/v1/accounts/${state.me.id}/statuses`,{query:{limit:"30",exclude_replies:"false"}});
    const a=state.me;
    const head=`<div class="profile-head"><img src="${esc(a.header_static||a.header)}" alt=""></div><div class="profile-body"><img class="profile-avatar" src="${esc(a.avatar_static||a.avatar)}" alt=""><h2>${esc(a.display_name||a.username)}</h2><div class="muted">@${esc(a.acct)}</div><p>${esc(plain(a.note))}</p><div class="muted">${a.statuses_count} 게시물 · ${a.following_count} 팔로잉 · ${a.followers_count} 팔로워</div></div>`;
    $("#app").innerHTML=shell("프로필",head+s.map(statusCard).join(""));bind()
  }catch(e){$("#app").innerHTML=shell("프로필",`<div class="center">${esc(e.message)}</div>`);bind()}
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
      <p><button class="primary" data-action="enablepush">빠른 알림 켜기 / 재등록</button></p>
    </div>
    <div class="section"><h3>화면</h3>
      <label>모드 <select id="themeSel" class="field"><option value="system">시스템</option><option value="light">라이트</option><option value="dark">다크</option></select></label>
      <br><br><label>강조색 <input id="accentSel" type="color" value="${esc(state.accent)}"></label>
    </div>
    <div class="section"><h3>계정</h3><div class="card">${state.me?"@"+esc(state.me.acct):esc(state.session.host)}</div><button class="danger" data-action="logout">로그아웃</button></div>
    <div class="section"><h3>버전</h3><div class="muted">Lenton Web · PWA preview 0.1</div></div>
  </div>`;
  $("#app").innerHTML=shell("설정",body,{gear:false});
  $("#themeSel").value=state.theme; bind();
}

function render(){
  if(!state.session){$("#app").innerHTML=loginView();$("#loginBtn")?.addEventListener("click",beginLogin);renderToast();return}
  if(state.view==="home")homeView(); else if(state.view==="notifications")notificationsView(); else if(state.view==="dm")dmView(); else if(state.view==="profile")profileView(); else settingsView();
}

async function statusAction(id,kind){
  const el=document.querySelector(`[data-status-id="${id}"]`); 
  try{
    const map={fav:"favourite",boost:"reblog"};await api(`/api/v1/statuses/${id}/${map[kind]}`,{method:"POST",form:{}});toast(kind==="fav"?"좋아요 했어요.":"부스트했어요.")
  }catch(e){toast(e.message)}
}
async function newList(){
  const title=prompt("새 리스트 이름");if(!title)return;
  try{await api("/api/v1/lists",{method:"POST",form:{title}});await loadLists();render()}catch(e){toast(e.message)}
}
function compose(reply=null,forcedVisibility=null){
  let parts=[{text:"",cw:!!reply?.spoiler_text,spoiler:reply?.spoiler_text||""}];
  const recips=[];
  if(reply){const add=(a)=>{if(a&&a.id!==state.me?.id&&!recips.some(x=>x.id===a.id))recips.push({...a,on:true})};add(reply.account);(reply.mentions||[]).forEach(add)}
  const draw=()=>{
    let old=$(".modal");if(old)old.remove();
    const m=document.createElement("div");m.className="modal";
    m.innerHTML=`<div class="sheet"><div class="sheet-head"><button class="iconbtn" id="closeCompose">닫기</button><h2>${reply?"답글":"새 게시물"}</h2><button class="primary" id="sendCompose">게시</button></div>
      ${recips.length?`<div class="recips">${recips.map((r,i)=>`<button data-r="${i}" class="${r.on?"":"off"}">@${esc(r.acct)}</button>`).join("")}</div>`:""}
      <div id="parts">${parts.map((p,i)=>`<div class="part" data-p="${i}"><div><b>게시물 ${i+1}</b> <label style="float:right"><input type="checkbox" data-cw="${i}" ${p.cw?"checked":""}> CW</label></div>${p.cw?`<input data-sp="${i}" placeholder="내용 경고" value="${esc(p.spoiler)}">`:""}<textarea data-t="${i}" placeholder="내용을 입력하세요">${esc(p.text)}</textarea></div>`).join("")}</div>
      <button class="pill" id="addPart">＋ 다른 게시물 추가</button></div>`;
    document.body.append(m);
    m.querySelectorAll("[data-t]").forEach(x=>x.addEventListener("input",e=>parts[+e.target.dataset.t].text=e.target.value));
    m.querySelectorAll("[data-sp]").forEach(x=>x.addEventListener("input",e=>parts[+e.target.dataset.sp].spoiler=e.target.value));
    m.querySelectorAll("[data-cw]").forEach(x=>x.addEventListener("change",e=>{parts[+e.target.dataset.cw].cw=e.target.checked;draw()}));
    m.querySelectorAll("[data-r]").forEach(x=>x.addEventListener("click",e=>{recips[+e.target.dataset.r].on=!recips[+e.target.dataset.r].on;draw()}));
    $("#addPart",m).onclick=()=>{parts.push({text:"",cw:!!reply?.spoiler_text,spoiler:reply?.spoiler_text||""});draw()};
    $("#closeCompose",m).onclick=()=>{if(parts.some(p=>p.text.trim())&&!confirm("작성 중인 내용을 버릴까요?"))return;m.remove()};
    $("#sendCompose",m).onclick=async()=>{
      const valid=parts.filter(p=>p.text.trim());if(!valid.length){toast("내용을 입력해주세요.");return}
      const btn=$("#sendCompose",m);btn.disabled=true;btn.textContent="게시 중…";
      try{
        let replyId=reply?.id||null, prefix=recips.filter(x=>x.on).map(x=>"@"+x.acct).join(" ");
        for(let i=0;i<valid.length;i++){
          const p=valid[i], form={status:(i===0&&prefix?prefix+" ":"")+p.text.trim(),visibility:forcedVisibility||reply?.visibility||"public",spoiler_text:p.cw?p.spoiler.trim():""};
          if(replyId)form.in_reply_to_id=replyId;
          const posted=await api("/api/v1/statuses",{method:"POST",form});replyId=posted.id;
        }
        m.remove();toast("게시했어요.");if(state.view==="home")render()
      }catch(e){toast(e.message);btn.disabled=false;btn.textContent="게시"}
    };
  };draw();
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
    await api("/api/v1/push/subscription",{method:"POST",form});
    toast("빠른 알림을 켰어요.");settingsView();
  }catch(e){state.pushError=e.message;toast("알림 설정 실패");settingsView()}
}
function urlBase64ToUint8Array(s){const p="=".repeat((4-s.length%4)%4),b=(s+p).replace(/-/g,"+").replace(/_/g,"/"),raw=atob(b),a=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)a[i]=raw.charCodeAt(i);return a}

function bind(){
  document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{state.view=b.dataset.view;state.listId=null;render()});
  document.querySelectorAll("[data-action]").forEach(b=>b.onclick=async()=>{
    const a=b.dataset.action;
    if(a==="settings"){state.view="settings";render()}
    else if(a==="compose")compose()
    else if(a==="reload")render()
    else if(a==="logout")logout()
    else if(a==="enablepush")enablePush()
    else if(a==="newlist")newList()
    else if(a==="togglecw"){const body=b.closest(".status-main").querySelector("[data-cwbody]");body.style.display=body.style.display==="none"?"block":"none"}
    else if(a==="reply")replyById(b.dataset.id)
    else if(a==="fav"||a==="boost")statusAction(b.dataset.id,a)
    else if(a==="replydm"){if(state.currentConversation?.last_status)compose(state.currentConversation.last_status,"direct")}
  });
  document.querySelectorAll("[data-home-mode]").forEach(b=>b.onclick=()=>{state.homeMode=b.dataset.homeMode;state.listId=null;render()});
  document.querySelectorAll("[data-list]").forEach(b=>b.onclick=()=>{state.listId=state.listId===b.dataset.list?null:b.dataset.list;render()});
  document.querySelectorAll("[data-conv]").forEach(b=>b.onclick=()=>openConversation(b.dataset.conv));
  $("#themeSel")?.addEventListener("change",e=>{state.theme=e.target.value;store.set("lenton_theme",state.theme);if(state.theme==="system")delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=state.theme});
  $("#accentSel")?.addEventListener("input",e=>{state.accent=e.target.value;store.set("lenton_accent",state.accent);document.documentElement.style.setProperty("--accent",state.accent)});
}

async function registerSW(){
  if("serviceWorker"in navigator){
    const reg=await navigator.serviceWorker.register("./sw.js",{scope:"./"});
    navigator.serviceWorker.addEventListener("message",e=>{if(e.data?.type==="push"){toast("새 알림이 도착했어요.");if(state.view==="notifications")notificationsView()}});
    reg.addEventListener("updatefound",()=>{const w=reg.installing;if(w)w.addEventListener("statechange",()=>{if(w.state==="installed"&&navigator.serviceWorker.controller){toast("새 버전이 준비됐어요. 다음 실행에 적용됩니다.")}})});
  }
}
window.addEventListener("beforeinstallprompt",e=>e.preventDefault());
window.addEventListener("popstate",()=>{});
(async()=>{
  try{await registerSW();await finishOAuth()}catch(e){toast(e.message)}
  if(state.session){try{state.me=await api("/api/v1/accounts/verify_credentials")}catch{store.del("lenton_session");state.session=null}}
  const q=new URLSearchParams(location.search);const deep=q.get("view");if(["home","notifications","dm","profile","settings"].includes(deep))state.view=deep;
  render();
})();
