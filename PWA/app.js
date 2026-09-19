const ANDROID = window.LENTON_ANDROID_SPEC || {};
const $ = (s, r=document) => r.querySelector(s);
const esc = (s="") => String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));
const plain = (html="") => { const d=document.createElement("div"); d.innerHTML=html; return d.textContent||""; };
const fmtTime = (v) => { try { const sec=Math.max(0,Math.floor((Date.now()-new Date(v).getTime())/1000)); if(sec<60)return "지금"; if(sec<3600)return Math.floor(sec/60)+"분"; if(sec<86400)return Math.floor(sec/3600)+"시간"; if(sec<604800)return Math.floor(sec/86400)+"일"; const d=new Date(v); return (d.getMonth()+1)+"월 "+d.getDate()+"일"; } catch { return ""; } };
const store = {
  get(k,d=null){try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},
  set(k,v){localStorage.setItem(k,JSON.stringify(v))},
  del(k){localStorage.removeItem(k)}
};
const state = {
  session: store.get("lenton_session"),
  me:null, view:"home", homeMode:"home", listId:null, lists:[], busy:false,
  theme:store.get("lenton_theme","system"), accent:store.get("lenton_accent",ANDROID?.theme?.accent||"#1d9bf0"),
  pushError:"", toast:"", currentConversation:null, profileReplies:false, profileAccount:null, profileRelationship:null, returnView:"home"
};
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

function androidNavItems(){
  const items=ANDROID?.renderer?.bottomNavItems;
  return Array.isArray(items)&&items.length?items:[
    {id:"home",glyph:"⌂"},{id:"search",glyph:"⌕"},{id:"notifications",glyph:"♢"},{id:"dm",glyph:"✉"}
  ];
}
function navIcon(v){
  const item=androidNavItems().find(x=>x.id===v);
  return `<span class="android-glyph" aria-hidden="true">${esc(item?.glyph||"○")}</span>`;
}
function shell(title,body,opts={}){
  const av=state.me?.avatar_static||state.me?.avatar||"";
  const avatar=av
    ? `<img src="${esc(av)}" alt="">`
    : '<span class="fallback">○</span>';
  return `<div class="app">
    <header class="topbar">
      <button class="topbar-avatar" data-action="drawer">${avatar}</button>
      <h1>${esc(title)}</h1>
      <button class="top-icon search" data-view="search" aria-label="검색"><span class="android-glyph">⌕</span></button>
      <button class="top-icon" data-action="settings" aria-label="설정"><span class="android-glyph">⋮</span></button>
    </header>
    <main class="main">${body}</main>
    <nav class="bottom">
      ${navBar()}
    </nav>
    ${opts.fab?'<button class="fab" data-action="compose">✎</button>':""}
  </div>`;
}
function nav(v){return `<button data-view="${v}" class="${state.view===v?"active":""}" aria-label="${v}">${navIcon(v)}</button>`}
function navBar(){return androidNavItems().map(x=>nav(x.id)).join("")}

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

function statusCard(raw){
  const st=raw.reblog||raw, boosted=!!raw.reblog, a=st.account||{};
  const boostLine=boosted?`<div class="boosted">↻ ${esc(raw.account?.display_name||raw.account?.username||"")}님이 부스트</div>`:"";
  const cw=st.spoiler_text? `<div class="cw">CW · ${esc(st.spoiler_text)} <button class="pill" data-action="togglecw">보기</button></div>`:"";
  const hidden=st.spoiler_text?' style="display:none" data-cwbody':"";
  const media=Array.isArray(st.media_attachments)&&st.media_attachments.length
    ? `<img class="media" src="${esc(st.media_attachments[0].preview_url||st.media_attachments[0].url||"")}" alt="">`
    :"";
  return `<article class="status" data-status-id="${st.id}">
    ${boostLine}
    <div class="status-head">
      <img class="avatar" src="${esc(a.avatar_static||a.avatar||"")}" alt="">
      <div class="status-main">
        <div class="author-line" data-profile="${esc(a.id||"")}"><span class="name">${esc(a.display_name||a.username||"")}</span><span class="acctline">&nbsp;@${esc(a.acct||"")} · ${fmtTime(st.created_at)}</span></div>
        ${cw}<div class="content"${hidden}>${esc(plain(st.content||""))}</div>
        ${media}
        <div class="actions">
          ${(()=>{const x=ANDROID?.renderer?.actions||{};return `
          <button data-action="reply" data-id="${st.id}">${esc(x.reply||"○")} <span class="count">${st.replies_count||""}</span></button>
          <button class="boost ${st.reblogged?"on":""}" data-action="boost" data-id="${st.id}">${esc(x.boost||"↻")} <span class="count">${st.reblogs_count||""}</span></button>
          <button class="fav ${st.favourited?"on":""}" data-action="fav" data-id="${st.id}">${esc(st.favourited?(x.favouriteOn||"♥"):(x.favouriteOff||"♡"))} <span class="count">${st.favourites_count||""}</span></button>
          <button class="bookmark ${st.bookmarked?"on":""}" data-action="bookmark" data-id="${st.id}">${esc(st.bookmarked?(x.bookmarkOn||"▣"):(x.bookmarkOff||"▢"))}</button>`})()}
        </div>
      </div>
    </div>
  </article>`;
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
    const chips=state.lists.length?`<div class="chips">${state.lists.map(x=>`<button class="chip ${state.listId===x.id?"active":""}" data-list="${x.id}">${esc(x.title)}</button>`).join("")}<button class="chip" data-action="newlist">＋ 리스트</button></div>`:"";
    $("#app").innerHTML=shell(state.listId?(state.lists.find(x=>x.id===state.listId)?.title||"리스트"):"홈",tabs+chips+(data.length?data.map(statusCard).join(""):'<div class="center">표시할 게시물이 없어요.</div>'),{fab:true});
  }catch(e){$("#app").innerHTML=shell("홈",`<div class="center">타임라인을 불러오지 못했어요.<br><br>${esc(e.message)}<br><br><button class="primary" data-action="reload">다시 시도</button></div>`,{fab:true})}
  state.busy=false; bind();
}

function renderLoadingShell(title){$("#app").innerHTML=shell(title,'<div class="center">불러오는 중…</div>',{fab:title==="홈"});bind()}

async function notificationsView(mentionsOnly=false){
  renderLoadingShell("알림");
  try{
    const query={limit:"40"}; if(mentionsOnly) query["types[]"]="mention";
    const n=await api("/api/v1/notifications",{query});
    const labels={update:"게시물을 수정했어요",...(ANDROID?.renderer?.notificationLabels||{})};
    const glyphs=ANDROID?.renderer?.notificationGlyphs||{};
    const tabs=`<div class="notify-tabs"><button data-notify="all" class="${mentionsOnly?"":"active"}">전체</button><button data-notify="mention" class="${mentionsOnly?"active":""}">멘션</button></div>`;
    const rows=n.length?n.map(x=>{
      const glyph=glyphs[x.type]||glyphs.default||"♢";
      return `<div class="row"><div class="notification-mark ${esc(x.type)}">${glyph}</div><div class="grow"><div class="row-title"><img class="avatar" style="width:36px;height:36px" src="${esc(x.account?.avatar_static||x.account?.avatar||"")}" alt=""><b>${esc(x.account?.display_name||x.account?.username||"알림")} · ${esc(labels[x.type]||x.type)}</b></div>${x.status?`<div class="content" style="color:var(--sub);font-size:15px;max-height:88px;overflow:hidden">${esc(plain(x.status.content||""))}</div>`:""}</div></div>`;
    }).join(""):'<div class="center">새 알림이 없어요.</div>';
    $("#app").innerHTML=shell("알림",tabs+rows);bind()
  }catch(e){$("#app").innerHTML=shell("알림",`<div class="center">${esc(e.message)}</div>`);bind()}
}

async function dmView(){
  renderLoadingShell("메시지");
  try{
    const cs=await api("/api/v1/conversations",{query:{limit:"30"}});
    const body=cs.length?cs.map(c=>{const a=c.accounts?.[0],txt=c.last_status?plain(c.last_status.content):"";return `<button class="row" data-conv="${c.id}"><img class="avatar" style="width:48px;height:48px" src="${esc(a?.avatar_static||a?.avatar||"")}" alt=""><div class="grow"><div class="row-title"><b>${esc(a?.display_name||a?.username||"대화")}</b></div><div style="color:var(--sub);font-size:15px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(txt)}</div></div>${c.unread?'<span class="badge"></span>':""}</button>`}).join(""):'<div class="center">대화가 없어요.</div>';
    $("#app").innerHTML=shell("메시지",body);bind(); state._conversations=cs;
  }catch(e){$("#app").innerHTML=shell("메시지",`<div class="center">${esc(e.message)}</div>`);bind()}
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
  const note=relationship?.note||"";
  const noteColor=accentTextColor();
  const controls=own?"":`<button class="outline-btn" data-action="followProfile">${relationship?.following?"팔로잉":"팔로우"}</button>`;
  const privateNote=own?"":`<div class="private-note-card" data-action="editPrivateNote" style="color:${noteColor}"><div class="label">비밀 메모</div><div class="note">${esc(note.trim()?note:"메모를 추가하려면 탭하세요.")}</div></div>`;
  return `<div class="profile-hero"><img class="profile-header" src="${esc(a.header_static||a.header||"")}" alt=""><img class="profile-avatar" src="${esc(a.avatar_static||a.avatar||"")}" alt=""></div>
    <div class="profile-info"><div class="profile-name-row"><div class="profile-names"><h2>${esc(a.display_name||a.username)}</h2><div class="profile-handle">@${esc(a.acct)}</div></div>${controls}</div><div class="profile-bio">${esc(plain(a.note||""))}</div>${privateNote}<div class="profile-counts"><b style="color:var(--fg)">${a.following_count||0}</b> 팔로잉&nbsp;&nbsp;&nbsp;<b style="color:var(--fg)">${a.followers_count||0}</b> 팔로워</div></div>
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
  if(!id)return;
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
    const more='<button class="profile-more" data-action="profileMenu" aria-label="프로필 관리">⋮</button>';
    $("#app").innerHTML=standaloneShell("프로필",profileMarkup(a,{own:false,replies:state.profileReplies,relationship})+(statuses.length?statuses.map(statusCard).join(""):'<div class="center">게시물이 없어요.</div>'),more);bind();
  }catch(e){$("#app").innerHTML=standaloneShell("프로필",`<div class="center">${esc(e.message)}</div>`);bind()}
}
function closePopup(){document.querySelector(".android-popup-shade")?.remove()}
function openProfilePopup(){
  closePopup(); const a=state.profileAccount,rel=state.profileRelationship||{}; if(!a)return;
  const shade=document.createElement("div");shade.className="android-popup-shade";
  shade.innerHTML=`<div class="android-popup">
    <button data-pm="lists">리스트 관리</button>
    <button data-pm="mute">${rel.muting?"뮤트 해제":"뮤트"}</button>
    <button data-pm="block">${rel.blocking?"차단 해제":"차단"}</button>
    <button data-pm="report">신고</button>
    <button data-pm="copy">프로필 링크 복사</button>
  </div>`;
  document.body.append(shade);shade.onclick=e=>{if(e.target===shade)closePopup()};
  shade.querySelectorAll("[data-pm]").forEach(b=>b.onclick=async()=>{const x=b.dataset.pm;closePopup();if(x==="lists")await showProfileListManager();else if(x==="mute")await toggleProfileRelation(rel.muting?"unmute":"mute");else if(x==="block")await toggleProfileRelation(rel.blocking?"unblock":"block");else if(x==="report")await reportProfile();else if(x==="copy"){try{await navigator.clipboard.writeText(a.url||"");toast("프로필 링크를 복사했어요.")}catch{toast("프로필 링크를 복사하지 못했어요.")}}});
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
    if(r.accounts?.length){html+=`<div class="section-title">사람</div>`+r.accounts.map(a=>`<div class="row"><img class="avatar" style="width:48px;height:48px" src="${esc(a.avatar_static||a.avatar||"")}" alt=""><div class="grow"><b>${esc(a.display_name||a.username)}</b><div class="muted">@${esc(a.acct)}</div></div></div>`).join("")}
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

function openDrawer(){
  closeDrawer();
  const m=state.me||{}, shade=document.createElement("div");
  const rows=Array.isArray(ANDROID?.renderer?.drawerRows)&&ANDROID.renderer.drawerRows.length
    ? ANDROID.renderer.drawerRows
    : [
      {id:"profile",label:"프로필",glyph:"♙"},{id:"bookmarks",label:"북마크",glyph:"▢"},
      {id:"lists",label:"리스트",glyph:"☷"},{id:"followrequests",label:"팔로우 요청",glyph:"♧"},
      {id:"settings",label:"설정",glyph:"⚙"},{id:"theme",labelLight:"다크 모드",labelDark:"라이트 모드",glyphLight:"◐",glyphDark:"☀"}
    ];
  const rowHtml=rows.map(r=>{
    const dark=state.theme==="dark";
    const label=r.id==="theme"?(dark?(r.labelDark||"라이트 모드"):(r.labelLight||"다크 모드")):(r.label||r.id);
    const glyph=r.id==="theme"?(dark?(r.glyphDark||"☀"):(r.glyphLight||"◐")):(r.glyph||"");
    return `<button class="drawer-row" data-drawer="${esc(r.id)}"><span class="glyph android-glyph">${esc(glyph)}</span>${esc(label)}</button>`;
  }).join("");
  shade.className="drawer-shade";
  shade.innerHTML=`<aside class="drawer">
    <img class="drawer-avatar" src="${esc(m.avatar_static||m.avatar||"")}" alt="">
    <div class="drawer-name">${esc(m.display_name||m.username||"렌톤")}</div>
    <div class="drawer-handle">@${esc(m.acct||state.session?.host||"")}</div>
    <div class="drawer-counts"><b>${m.following_count||0}</b> 팔로잉&nbsp;&nbsp;&nbsp;<b>${m.followers_count||0}</b> 팔로워</div>
    <div class="drawer-divider"></div>
    ${rowHtml}
  </aside>`;
  document.body.append(shade);
  shade.addEventListener("click",e=>{if(e.target===shade)closeDrawer()});
  shade.querySelectorAll("[data-drawer]").forEach(b=>b.onclick=async()=>{
    const v=b.dataset.drawer;
    if(v==="profile"){closeDrawer();state.view="profile";render()}
    else if(v==="bookmarks")bookmarksView();
    else if(v==="lists"){closeDrawer();listsScreen()}
    else if(v==="followrequests"){closeDrawer();followRequestsScreen()}
    else if(v==="settings"){closeDrawer();state.view="settings";render()}
    else if(v==="theme"){state.theme=state.theme==="dark"?"light":"dark";store.set("lenton_theme",state.theme);document.documentElement.dataset.theme=state.theme;closeDrawer();render()}
  });
}

async function listsScreen(){
  closeDrawer();$("#app").innerHTML=standaloneShell("리스트",'<div class="center">불러오는 중…</div>');bind();
  try{const lists=await api("/api/v1/lists");const rows=lists.length?lists.map(x=>`<button class="row" data-open-list="${esc(x.id)}"><div class="grow"><div class="row-title"><b>${esc(x.title||"리스트")}</b></div></div></button>`).join(""):'<div class="center">리스트가 없어요.</div>';$("#app").innerHTML=standaloneShell("리스트",rows);bind()}catch(e){toast(e.message)}
}
async function followRequestsScreen(){
  closeDrawer();$("#app").innerHTML=standaloneShell("팔로우 요청",'<div class="center">불러오는 중…</div>');bind();
  try{const a=await api("/api/v1/follow_requests",{query:{limit:"40"}});const rows=a.length?a.map(x=>`<div class="row"><img class="avatar" data-profile="${esc(x.id||"")}" style="width:48px;height:48px" src="${esc(x.avatar_static||x.avatar||"")}" alt=""><div class="grow"><b>${esc(x.display_name||x.username)}</b><div class="muted">@${esc(x.acct)}</div></div></div>`).join(""):'<div class="center">팔로우 요청이 없어요.</div>';$("#app").innerHTML=standaloneShell("팔로우 요청",rows);bind()}catch(e){toast(e.message)}
}

function closeDrawer(){document.querySelector(".drawer-shade")?.remove()}

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

function render(){
  if(!state.session){$("#app").innerHTML=loginView();$("#loginBtn")?.addEventListener("click",beginLogin);renderToast();return}
  if(state.view==="home")homeView();
  else if(state.view==="search")searchView();
  else if(state.view==="notifications")notificationsView(false);
  else if(state.view==="dm")dmView();
  else if(state.view==="profile")profileView();
  else settingsView();
}

async function statusAction(id,kind){
  try{
    const map={fav:"favourite",boost:"reblog",bookmark:"bookmark"};
    await api(`/api/v1/statuses/${id}/${map[kind]}`,{method:"POST",form:{}});
    toast(kind==="fav"?"좋아요 완료":kind==="boost"?"부스트 완료":"북마크 완료");
    if(state.view==="home")render();
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
    const ct=ANDROID?.renderer?.compose||{};m.innerHTML=`<div class="sheet"><div class="sheet-head"><button class="iconbtn" id="closeCompose">×</button><h2>${reply?(ct.replyTitle||"답글"):(ct.newTitle||"새 게시물")}</h2><button class="primary" id="sendCompose">${reply?(ct.replyButton||"답글"):(ct.postButton||"게시")}</button></div>
      ${recips.length?`<div class="recips">${recips.map((r,i)=>`<button data-r="${i}" class="${r.on?"":"off"}">@${esc(r.acct)}</button>`).join("")}</div>`:""}
      <div id="parts">${parts.map((p,i)=>`<div class="part" data-p="${i}"><div class="part-head"><b>게시물 ${i+1}</b><label><input type="checkbox" data-cw="${i}" ${p.cw?"checked":""}> CW</label></div><div class="part-body"><img class="avatar" src="${esc(state.me?.avatar_static||state.me?.avatar||"")}" alt=""><div class="part-fields">${p.cw?`<input type="text" data-sp="${i}" placeholder="내용 경고" value="${esc(p.spoiler)}">`:""}<textarea data-t="${i}" placeholder="${reply?"답글을 입력하세요":"무슨 일이 일어나고 있나요?"}">${esc(p.text)}</textarea></div></div></div>`).join("")}</div>
      <div class="compose-tools"><button type="button">▧</button><button type="button" class="gif">GIF</button><button type="button">☷</button><button type="button">⌖</button><button type="button" class="part-add" id="addPart">＋ 타래</button></div></div>`;
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


function bind(){
  document.querySelectorAll("[data-profile]").forEach(b=>b.onclick=e=>{e.stopPropagation();openProfile(b.dataset.profile)});
  document.querySelectorAll("[data-open-list]").forEach(b=>b.onclick=()=>{state.view="home";state.listId=b.dataset.openList;render()});
  document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{state.view=b.dataset.view;state.listId=null;render()});
  document.querySelectorAll("[data-action]").forEach(b=>b.onclick=async()=>{
    const a=b.dataset.action;
    if(a==="settings"){state.view="settings";render()}
    else if(a==="drawer")openDrawer()
    else if(a==="compose")compose()
    else if(a==="reload")render()
    else if(a==="logout")logout()
    else if(a==="enablepush")enablePush()
    else if(a==="newlist")newList()
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
  document.querySelectorAll("[data-notify]").forEach(b=>b.onclick=()=>notificationsView(b.dataset.notify==="mention"));
  $("#searchInput")?.addEventListener("keydown",e=>{if(e.key==="Enter")runSearch()});
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
