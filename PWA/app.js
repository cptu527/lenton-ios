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
const BACKGROUND_THEME_DB="lenton-local-theme-v1",BACKGROUND_THEME_STORE="assets",BACKGROUND_THEME_KEY="background";
let backgroundActiveObjectUrl="",backgroundEditorObjectUrl="";
function backgroundAccountScope(){
  if(state?.session&&state?.me?.id)return String(state.session.host||"")+"|"+String(state.me.id);
  return "anonymous";
}
function backgroundConfigKey(scope=backgroundAccountScope()){return "lenton_background_theme_account_"+scope}
function backgroundBlobStorageKey(scope=backgroundAccountScope()){return BACKGROUND_THEME_KEY+"::"+scope}
function normalizeBackgroundSettings(raw={}){
  const fitV2=raw.framing==="fit-v2";
  return {
    enabled:raw.enabled===true,
    opacity:Math.max(0,Math.min(100,Number(raw.opacity??24)||0)),
    zoom:Math.max(100,Math.min(fitV2?1600:220,Number(raw.zoom??100)||100)),
    x:Math.max(0,Math.min(100,Number(raw.x??50)||50)),
    y:Math.max(0,Math.min(100,Number(raw.y??50)||50)),
    framing:fitV2?"fit-v2":"legacy",
    offsetX:Math.max(-3200,Math.min(3200,Number(raw.offsetX??0)||0)),
    offsetY:Math.max(-3200,Math.min(3200,Number(raw.offsetY??0)||0))
  };
}
function backgroundThemeSettings(){
  const scope=backgroundAccountScope(),key=backgroundConfigKey(scope);
  let raw=store.get(key,null);
  if(!raw&&scope!=="anonymous"){
    const legacy=store.get("lenton_background_theme",null),owner=String(store.get("lenton_background_legacy_owner","")||"");
    if(legacy&&(!owner||owner===scope)){
      if(!owner)store.set("lenton_background_legacy_owner",scope);
      raw={...legacy,_claimLegacy:true};
      store.set(key,raw);
    }
  }
  return normalizeBackgroundSettings(raw||{});
}
function saveBackgroundThemeSettings(settings){
  store.set(backgroundConfigKey(),normalizeBackgroundSettings(settings||{}));
}
function openBackgroundThemeDb(){
  if(!("indexedDB" in window))return Promise.reject(new Error("이 기기에서는 배경 이미지 저장을 사용할 수 없어요."));
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(BACKGROUND_THEME_DB,1);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(BACKGROUND_THEME_STORE))db.createObjectStore(BACKGROUND_THEME_STORE)};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error("배경 저장소를 열지 못했어요."));
  });
}
async function backgroundDbGet(key){
  const db=await openBackgroundThemeDb();
  try{return await new Promise((resolve,reject)=>{const req=db.transaction(BACKGROUND_THEME_STORE,"readonly").objectStore(BACKGROUND_THEME_STORE).get(key);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)})}finally{db.close()}
}
async function backgroundDbPut(key,value){
  const db=await openBackgroundThemeDb();
  try{await new Promise((resolve,reject)=>{const tx=db.transaction(BACKGROUND_THEME_STORE,"readwrite");tx.objectStore(BACKGROUND_THEME_STORE).put(value,key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error("배경 이미지를 저장하지 못했어요."))})}finally{db.close()}
}
async function backgroundDbDelete(key){
  const db=await openBackgroundThemeDb();
  try{await new Promise((resolve,reject)=>{const tx=db.transaction(BACKGROUND_THEME_STORE,"readwrite");tx.objectStore(BACKGROUND_THEME_STORE).delete(key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error("배경 이미지를 삭제하지 못했어요."))})}finally{db.close()}
}
async function backgroundBlobRead(){
  const scope=backgroundAccountScope(),key=backgroundBlobStorageKey(scope);
  let blob=await backgroundDbGet(key);
  if(blob||scope==="anonymous")return blob;
  const configKey=backgroundConfigKey(scope),raw=store.get(configKey,null);
  if(raw?._claimLegacy){
    const legacy=await backgroundDbGet(BACKGROUND_THEME_KEY);
    if(legacy){
      await backgroundDbPut(key,legacy);
      blob=legacy;
    }
    const next={...raw};delete next._claimLegacy;store.set(configKey,next);
  }
  return blob;
}
async function backgroundBlobWrite(blob){await backgroundDbPut(backgroundBlobStorageKey(),blob)}
async function backgroundBlobDelete(){await backgroundDbDelete(backgroundBlobStorageKey())}
function ensureLocalBackgroundLayer(){
  let layer=document.getElementById("lentonLocalBackground");
  if(!layer){
    layer=document.createElement("div");layer.id="lentonLocalBackground";layer.className="lenton-local-background";layer.setAttribute("aria-hidden","true");
    const img=document.createElement("img");img.className="lenton-local-background-image";img.alt="";layer.append(img);document.body.prepend(layer);
  }
  let img=layer.querySelector(".lenton-local-background-image");
  if(!img){img=document.createElement("img");img.className="lenton-local-background-image";img.alt="";layer.append(img)}
  return {layer,img};
}
function backgroundFrameMetrics(img,cfg){
  const host=img?.parentElement,rect=host?.getBoundingClientRect?.();
  const cw=Math.max(1,rect?.width||host?.clientWidth||0),ch=Math.max(1,rect?.height||host?.clientHeight||0);
  const nw=Math.max(1,img?.naturalWidth||0),nh=Math.max(1,img?.naturalHeight||0);
  if(!cw||!ch||!nw||!nh)return null;
  if(cfg?.framing==="fit-v2"){
    const zoom=Math.max(1,Math.min(16,Number(cfg?.zoom||100)/100));
    const fit=Math.min(cw/nw,ch/nh);
    const width=nw*fit*zoom,height=nh*fit*zoom;
    const offsetX=cw*Math.max(-3200,Math.min(3200,Number(cfg?.offsetX||0)))/220;
    const offsetY=ch*Math.max(-3200,Math.min(3200,Number(cfg?.offsetY||0)))/220;
    return {cw,ch,width,height,maxX:Infinity,maxY:Infinity,offsetX,offsetY};
  }
  const zoom=Math.max(1,Math.min(2.2,Number(cfg?.zoom||100)/100));
  const cover=Math.max(cw/nw,ch/nh);
  const width=nw*cover*zoom,height=nh*cover*zoom;
  const maxX=Math.max(0,(width-cw)/2),maxY=Math.max(0,(height-ch)/2);
  const x=Math.max(0,Math.min(100,Number(cfg?.x??50))),y=Math.max(0,Math.min(100,Number(cfg?.y??50)));
  const offsetX=maxX?((50-x)/50)*maxX:0,offsetY=maxY?((50-y)/50)*maxY:0;
  return {cw,ch,width,height,maxX,maxY,offsetX,offsetY};
}
function applyBackgroundImageFraming(img,cfg){
  if(!img)return;
  if(!(img.naturalWidth>0&&img.naturalHeight>0)){
    img.addEventListener("load",()=>applyBackgroundImageFraming(img,cfg),{once:true});
    return;
  }
  const m=backgroundFrameMetrics(img,cfg);if(!m)return;
  img.style.width=m.width+"px";
  img.style.height=m.height+"px";
  img.style.left="50%";
  img.style.top="50%";
  img.style.right="auto";
  img.style.bottom="auto";
  img.style.objectPosition="50% 50%";
  img.style.transform="translate(-50%,-50%) translate3d("+m.offsetX+"px,"+m.offsetY+"px,0)";
  img.style.transformOrigin="50% 50%";
}
async function applySavedBackgroundTheme(){
  const cfg=backgroundThemeSettings(),parts=ensureLocalBackgroundLayer(),layer=parts.layer,img=parts.img;
  let blob=null;
  if(cfg.enabled){try{blob=await backgroundBlobRead()}catch{blob=null}}
  if(backgroundActiveObjectUrl){URL.revokeObjectURL(backgroundActiveObjectUrl);backgroundActiveObjectUrl=""}
  layer.style.backgroundImage="";
  if(blob){
    backgroundActiveObjectUrl=URL.createObjectURL(blob);
    img.src=backgroundActiveObjectUrl;img.hidden=false;applyBackgroundImageFraming(img,cfg);
    layer.style.opacity=String(cfg.opacity/100);
    document.documentElement.classList.add("has-local-background");
  }else{
    img.removeAttribute("src");img.hidden=true;layer.style.opacity="0";document.documentElement.classList.remove("has-local-background");
  }
}
function setBackgroundEditorPreview(src,cfg){
  const preview=$("#backgroundPreview"),img=$("#backgroundPreviewImage"),empty=$("#backgroundPreviewEmpty");
  if(!preview||!img||!empty)return;
  if(src){
    img.src=src;img.hidden=false;img.style.opacity=String(cfg.opacity/100);applyBackgroundImageFraming(img,cfg);
    empty.hidden=true;preview.classList.add("has-image");
  }else{
    img.removeAttribute("src");img.hidden=true;empty.hidden=false;preview.classList.remove("has-image");
  }
}
function backgroundEditorDraftSettings(){
  const base=backgroundThemeSettings();
  return normalizeBackgroundSettings({
    enabled:true,
    opacity:Number($("#backgroundOpacity")?.value??base.opacity),
    zoom:Number($("#backgroundZoom")?.value??base.zoom),
    x:Number($("#backgroundPositionX")?.value??base.x),
    y:Number($("#backgroundPositionY")?.value??base.y)
  });
}
function refreshBackgroundEditorLabels(cfg){
  const pairs=[
    ["#backgroundOpacityValue",cfg.opacity+"%"],
    ["#backgroundZoomValue",cfg.zoom+"%"],
    ["#backgroundPositionXValue",cfg.x+"%"],
    ["#backgroundPositionYValue",cfg.y+"%"]
  ];
  for(const [selector,value] of pairs){const el=$(selector);if(el)el.textContent=value}
}
function syncBackgroundEditorPreview(){
  const cfg=backgroundEditorDraftSettings();refreshBackgroundEditorLabels(cfg);
  const img=$("#backgroundPreviewImage");
  if(img&&!img.hidden){img.style.opacity=String(cfg.opacity/100);applyBackgroundImageFraming(img,cfg)}
}
async function hydrateBackgroundEditor(){
  const opacity=$("#backgroundOpacity");if(!opacity)return;
  const cfg=backgroundThemeSettings();
  opacity.value=String(cfg.opacity);
  const zoom=$("#backgroundZoom"),x=$("#backgroundPositionX"),y=$("#backgroundPositionY");
  if(zoom)zoom.value=String(cfg.zoom);if(x)x.value=String(cfg.x);if(y)y.value=String(cfg.y);
  refreshBackgroundEditorLabels(cfg);
  if(backgroundEditorObjectUrl){URL.revokeObjectURL(backgroundEditorObjectUrl);backgroundEditorObjectUrl=""}
  let blob=null;try{blob=await backgroundBlobRead()}catch{}
  if(blob&&cfg.enabled){backgroundEditorObjectUrl=URL.createObjectURL(blob);setBackgroundEditorPreview(backgroundEditorObjectUrl,cfg)}
  else setBackgroundEditorPreview("",cfg);
  state.backgroundDraftRemove=false;
}
function openBackgroundFullPreview(){
  const source=$("#backgroundPreview");if(!source)return;
  document.querySelector(".background-full-preview-shade")?.remove();
  const shade=document.createElement("div");shade.className="background-full-preview-shade";
  const close=document.createElement("button");close.type="button";close.className="background-full-preview-close";close.textContent="닫기";
  const clone=source.cloneNode(true);clone.removeAttribute("id");clone.classList.add("background-preview-full");
  clone.querySelectorAll("[id]").forEach(el=>el.removeAttribute("id"));
  shade.append(close,clone);document.body.append(shade);
  requestAnimationFrame(()=>{const img=clone.querySelector("img");if(img&&!img.hidden)applyBackgroundImageFraming(img,backgroundEditorDraftSettings())});
  const done=()=>shade.remove();close.onclick=done;shade.onclick=e=>{if(e.target===shade)done()};
}
function openAndroidVideoBackgroundEditor(src,{file=null,isNew=false,revokeOnClose=false}={}){
  if(!src)return;
  document.querySelector(".ios-bg-position-shade")?.remove();
  const saved=backgroundThemeSettings();
  let zoom=isNew||saved.framing!=="fit-v2"?100:saved.zoom;
  let offsetX=isNew||saved.framing!=="fit-v2"?0:saved.offsetX;
  let offsetY=isNew||saved.framing!=="fit-v2"?0:saved.offsetY;

  const shade=document.createElement("div");shade.className="ios-bg-position-shade";
  const panel=document.createElement("div");panel.className="ios-bg-position-dialog";
  panel.innerHTML=`
    <div class="ios-bg-position-title">배경 이미지 위치 맞추기</div>
    <div class="ios-bg-position-hint">원본 전체에서 원하는 위치를 잡으세요 · 한 손가락 이동 · 두 손가락 확대/축소</div>
    <div class="ios-bg-position-stage"><img alt="배경 이미지 편집"></div>
    <div class="ios-bg-position-actions">
      <button type="button" data-bg-reset>초기화</button>
      <button type="button" data-bg-cancel>취소</button>
      <button type="button" class="apply" data-bg-apply>적용</button>
    </div>`;
  shade.append(panel);document.body.append(shade);

  const stage=panel.querySelector(".ios-bg-position-stage"),img=stage.querySelector("img");
  const vw=Math.max(1,window.innerWidth||390),vh=Math.max(1,window.innerHeight||844);
  const maxStageH=Math.max(360,Math.min(570,window.innerHeight-220));
  const maxStageW=Math.max(220,window.innerWidth-56);
  let stageH=maxStageH,stageW=Math.max(1,Math.round(stageH*(vw/vh)));
  if(stageW>maxStageW){stageW=maxStageW;stageH=Math.max(1,Math.round(stageW*(vh/vw)))}
  if(stageW<180){stageW=180;stageH=Math.max(1,Math.round(stageW*(vh/vw)))}
  stage.style.width=stageW+"px";stage.style.height=stageH+"px";

  let tx=stageW*offsetX/220,ty=stageH*offsetY/220;
  const fitScale=()=>Math.min(stage.clientWidth/Math.max(1,img.naturalWidth),stage.clientHeight/Math.max(1,img.naturalHeight));
  const constrain=()=>{
    if(!(img.naturalWidth>0&&img.naturalHeight>0))return;
    const scale=fitScale()*(zoom/100),w=img.naturalWidth*scale,h=img.naturalHeight*scale;
    const minVisible=Math.max(48,Math.min(stage.clientWidth,stage.clientHeight)*.12);
    let left=stage.clientWidth/2+tx-w/2,right=left+w,top=stage.clientHeight/2+ty-h/2,bottom=top+h;
    if(right<minVisible)tx+=minVisible-right;
    else if(left>stage.clientWidth-minVisible)tx+=(stage.clientWidth-minVisible)-left;
    left=stage.clientWidth/2+tx-w/2;right=left+w;
    if(bottom<minVisible)ty+=minVisible-bottom;
    else if(top>stage.clientHeight-minVisible)ty+=(stage.clientHeight-minVisible)-top;
  };
  const render=()=>{
    if(!(img.naturalWidth>0&&img.naturalHeight>0))return;
    constrain();
    const scale=fitScale()*(zoom/100);
    img.style.width=(img.naturalWidth*scale)+"px";
    img.style.height=(img.naturalHeight*scale)+"px";
    img.style.transform="translate(-50%,-50%) translate3d("+tx+"px,"+ty+"px,0)";
  };

  img.src=src;
  if(img.complete)requestAnimationFrame(render);
  else img.addEventListener("load",()=>requestAnimationFrame(render),{once:true});

  const pointers=new Map();
  let dragId=null,lastX=0,lastY=0,pinch=null;
  const localFocus=()=>{
    const pts=[...pointers.values()].slice(0,2),rect=stage.getBoundingClientRect();
    return {x:(pts[0].x+pts[1].x)/2-rect.left,y:(pts[0].y+pts[1].y)/2-rect.top};
  };
  const beginPinch=()=>{
    if(pointers.size<2)return;
    const pts=[...pointers.values()].slice(0,2),f=localFocus();
    pinch={
      distance:Math.max(1,Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)),
      zoom,tx,ty,focusX:f.x,focusY:f.y
    };
    dragId=null;
  };
  stage.addEventListener("pointerdown",e=>{
    e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    try{stage.setPointerCapture(e.pointerId)}catch{}
    if(pointers.size===1){dragId=e.pointerId;lastX=e.clientX;lastY=e.clientY;pinch=null}
    else if(pointers.size===2)beginPinch();
  });
  stage.addEventListener("pointermove",e=>{
    if(!pointers.has(e.pointerId))return;
    e.preventDefault();pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(pointers.size>=2){
      if(!pinch)beginPinch();
      const pts=[...pointers.values()].slice(0,2),f=localFocus();
      const distance=Math.max(1,Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y));
      const desired=Math.max(100,Math.min(1600,pinch.zoom*(distance/pinch.distance)));
      const factor=desired/Math.max(1,pinch.zoom);
      const cx0=stage.clientWidth/2+pinch.tx,cy0=stage.clientHeight/2+pinch.ty;
      const cx=f.x+factor*(cx0-pinch.focusX),cy=f.y+factor*(cy0-pinch.focusY);
      zoom=desired;tx=cx-stage.clientWidth/2;ty=cy-stage.clientHeight/2;render();return;
    }
    if(pointers.size===1){
      const p=[...pointers.entries()][0],id=p[0],pt=p[1];
      if(dragId!==id){dragId=id;lastX=pt.x;lastY=pt.y;return}
      const dx=pt.x-lastX,dy=pt.y-lastY;lastX=pt.x;lastY=pt.y;
      tx+=dx;ty+=dy;render();
    }
  });
  const endPointer=e=>{
    if(!pointers.has(e.pointerId))return;
    pointers.delete(e.pointerId);try{stage.releasePointerCapture(e.pointerId)}catch{}
    if(pointers.size===0){dragId=null;pinch=null}
    else if(pointers.size===1){
      const [id,p]=[...pointers.entries()][0];dragId=id;lastX=p.x;lastY=p.y;pinch=null;
    }else beginPinch();
  };
  stage.addEventListener("pointerup",endPointer);stage.addEventListener("pointercancel",endPointer);

  const close=()=>{shade.remove();if(revokeOnClose)try{URL.revokeObjectURL(src)}catch{}};
  panel.querySelector("[data-bg-cancel]").onclick=close;
  panel.querySelector("[data-bg-reset]").onclick=()=>{zoom=100;tx=0;ty=0;render()};
  panel.querySelector("[data-bg-apply]").onclick=async()=>{
    const btn=panel.querySelector("[data-bg-apply]");btn.disabled=true;btn.textContent="적용 중…";
    try{
      if(file)await backgroundBlobWrite(file);
      const opacity=Math.max(0,Math.min(100,Number($("#backgroundOpacity")?.value??saved.opacity)||0));
      offsetX=Math.max(-3200,Math.min(3200,stage.clientWidth?tx*220/stage.clientWidth:0));
      offsetY=Math.max(-3200,Math.min(3200,stage.clientHeight?ty*220/stage.clientHeight:0));
      saveBackgroundThemeSettings({...saved,enabled:true,opacity,framing:"fit-v2",zoom,offsetX,offsetY});
      await applySavedBackgroundTheme();
      close();screenLayoutEditor("background");toast("배경 이미지 위치를 적용했어요.");
    }catch(e){btn.disabled=false;btn.textContent="적용";toast(e?.message||"배경 이미지를 적용하지 못했어요.")}
  };
}

function bindBackgroundEditor(){
  const input=$("#backgroundImageInput"),pick=$("#pickBackgroundImage"),edit=$("#editBackgroundImage"),remove=$("#removeBackgroundImage"),apply=$("#applyBackgroundTheme"),opacity=$("#backgroundOpacity");
  pick?.addEventListener("click",()=>input?.click());
  input?.addEventListener("change",()=>{
    const file=input.files?.[0];if(!file)return;
    if(file.type&&file.type.toLowerCase().includes("gif")){toast("GIF 배경은 지원하지 않아요.");input.value="";return}
    const url=URL.createObjectURL(file);
    openAndroidVideoBackgroundEditor(url,{file,isNew:true,revokeOnClose:true});
    input.value="";
  });
  edit?.addEventListener("click",async()=>{
    try{
      const blob=await backgroundBlobRead();
      if(!blob){toast("먼저 배경 이미지를 선택해 주세요.");return}
      const url=URL.createObjectURL(blob);
      openAndroidVideoBackgroundEditor(url,{isNew:false,revokeOnClose:true});
    }catch{toast("배경 이미지를 불러오지 못했어요.")}
  });
  remove?.addEventListener("click",async()=>{
    try{
      await backgroundBlobDelete();
      const cfg=backgroundThemeSettings();saveBackgroundThemeSettings({...cfg,enabled:false});
      await applySavedBackgroundTheme();screenLayoutEditor("background");toast("이 계정의 배경을 삭제했어요.");
    }catch(e){toast(e?.message||"배경 이미지를 삭제하지 못했어요.")}
  });
  opacity?.addEventListener("input",()=>{
    const n=Math.max(0,Math.min(100,Number(opacity.value)||0));
    const label=$("#backgroundOpacityValue");if(label)label.textContent=n+"%";
    syncBackgroundEditorPreview();
  });
  apply?.addEventListener("click",()=>applyBackgroundEditorSettings());
}
async function applyBackgroundEditorSettings(){
  const button=$("#applyBackgroundTheme"),cfg=backgroundThemeSettings(),opacity=Math.max(0,Math.min(100,Number($("#backgroundOpacity")?.value??cfg.opacity)||0));
  if(button){button.disabled=true;button.textContent="적용 중…"}
  try{
    const blob=await backgroundBlobRead();
    saveBackgroundThemeSettings({...cfg,opacity,enabled:!!blob&&cfg.enabled});
    await applySavedBackgroundTheme();toast("이 계정의 배경 설정을 적용했어요.");
  }catch(e){toast(e?.message||"배경 설정을 저장하지 못했어요.")}
  finally{if(button){button.disabled=false;button.textContent="적용"}}
}

const state = {
  session: store.get("lenton_session"),
  me:null, view:"home", homeMode:"home", listId:null, lists:[], busy:false,
  theme:store.get("lenton_theme","system"), accent:store.get("lenton_accent",ANDROID?.theme?.accent||"#1d9bf0"),
  uiScale:Math.max(.6,Math.min(1.2,Number(store.get("lenton_ui_scale",1))||1)),
  pushError:"", toast:"", notificationUnread:0, notificationUnreadOverflow:false, dmUnread:0, accountUnread:{}, accountNotificationUnread:{}, accountDmUnread:{}, currentConversation:null, profileReplies:false, profileMode:"posts", profileAccount:null, profileRelationship:null, returnView:"home", customEmojis:null, timelineItems:[], timelineLoadingMore:false, scrolls:{}, pageCache:{}, homeCache:{}, profileCache:{}, profilePagerData:{}, homePagerData:{}, navStack:[], dmDraftRecipients:[], searchResults:null, searchQuery:"", searchMode:"posts", notificationMode:"all", notificationAllItems:[], replyNeededItems:[], updateAvailable:null, buildInfo:null, layoutEditorMode:"layout", backgroundDraftRemove:false
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
  const ui=ANDROID?.ui||{}, root=document.documentElement,scale=Math.max(.6,Math.min(1.2,Number(state.uiScale)||1));
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
function renderToast(){ const old=$(".toast"); if(old) old.remove(); if(state.toast){const x=document.createElement("div");x.className="toast";x.setAttribute("role","status");x.setAttribute("aria-live","polite");x.textContent=state.toast;document.body.append(x)}}
function normalizeHost(v){ return v.trim().replace(/^https?:\/\//i,"").split("/")[0].replace(/\/+$/,""); }
function loginHostLooksValid(host){return !!host&&host.includes(".")&&!/\\s/.test(host)&&host.length<=253}
function loginFailureText(error){const msg=String(error?.message||"").trim();if(!msg||/failed to fetch|networkerror|load failed|network request failed|internet connection appears to be offline/i.test(msg))return "해당 서버에 연결할 수 없습니다. 서버 주소를 확인해주세요.";if(/^HTTP (400|404|405|410|422)\\b/i.test(msg))return "해당 주소에서 Mastodon 서버를 확인할 수 없습니다.";return "로그인 준비에 실패했습니다. 서버 주소를 확인해주세요."}
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
  if(!host){toast("서버 주소를 입력해주세요.");return}
  if(!loginHostLooksValid(host)){toast("올바른 Mastodon 서버 주소를 입력해주세요.");return}
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
    console.warn("[Lenton login] failed to prepare OAuth",host,e);
    toast(loginFailureText(e));state.busy=false;
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
  stopForegroundRealtime();
  state.realtimeStreamingHost="";state.realtimeStreamingBase="";state.realtimeAuthMode="protocol";
  state.lists=[];state.timelineItems=[];state.pageCache={};state.homeCache={};state.profileAccount=null;state.profileRelationship=null;state.profileMode="posts";state.profileReplies=false;state.currentConversation=null;state.customEmojis=null;state.listId=null;state.listOrderDirty=false;state.homeMode="home";state.scrolls={};state.navStack=[];state.dmDraftRecipients=[];state.searchResults=null;state.searchQuery="";state.searchMode="posts";state.searchFollowingIds=null;state.notificationUnread=0;state.notificationUnreadOverflow=false;state.dmUnread=0;state.notificationMode="all";state.notificationAllItems=[];state.replyNeededItems=[];
}
async function switchSavedAccount(index){
  const list=savedAccounts(),entry=list[index];if(!entry?.session)return;
  rememberScroll();state.session=entry.session;store.set("lenton_session",state.session);resetAccountState();state.me=null;
  try{state.me=await api("/api/v1/accounts/verify_credentials");state.customEmojis=null;await loadCustomEmojis();await saveCurrentAccount();await applySavedBackgroundTheme();state.notificationUnread=accountNotificationUnreadFor(entry);state.dmUnread=accountDmUnreadFor(entry);state.view="home";render();refreshNotificationBadgeDom();setTimeout(()=>refreshUnreadNotificationCount(),80);setTimeout(()=>startForegroundRealtime(),120);toast("계정을 전환했어요.")}
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
  stopForegroundRealtime();
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
    right="";
  }else if(view==="settings"){
    right="";
  }else if(view==="notifications"){
    right=`<button class="top-icon" data-action="notificationMenu" aria-label="알림 메뉴">${lentonIcon("more")}</button>`;
  }
  const left=view==="settings"
    ?`<button class="topbar-back" data-action="backMain" aria-label="뒤로가기">${lentonIcon("back")}</button>`
    :`<button class="topbar-avatar" data-action="drawer">${avatar}</button>`;
  return `<div class="app lenton-view-${esc(view)}">
    <header class="topbar lenton-topbar">
      ${left}
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
          <div class="author-line"><button class="name author-name-button" data-profile="${esc(a.id||"")}">${renderEmojiText(a.display_name||a.username||"",a.emojis||[])}</button><span class="acctline">&nbsp;@${esc(a.acct||"")} · ${fmtTime(st.created_at)}</span></div>
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
function listOrderIds(){return (store.get(scopedKey("list_order_v1"),[])||[]).map(String)}
function orderedLists(items=[]){
  const source=(Array.isArray(items)?items:[]).filter(x=>x?.id);
  const map=new Map(source.map(x=>[String(x.id),x])),serverIds=source.map(x=>String(x.id));
  const saved=listOrderIds().filter(id=>map.has(id)),seen=new Set(saved);
  const order=[...saved,...serverIds.filter(id=>!seen.has(id))];
  if(JSON.stringify(order)!==JSON.stringify(listOrderIds()))store.set(scopedKey("list_order_v1"),order);
  return order.map(id=>map.get(id)).filter(Boolean);
}
function saveListOrder(ids=[]){
  const available=new Map((state.lists||[]).filter(x=>x?.id).map(x=>[String(x.id),x]));
  const order=[],seen=new Set();
  for(const raw of ids||[]){const id=String(raw||"");if(id&&available.has(id)&&!seen.has(id)){seen.add(id);order.push(id)}}
  for(const x of state.lists||[]){const id=String(x?.id||"");if(id&&!seen.has(id)){seen.add(id);order.push(id)}}
  store.set(scopedKey("list_order_v1"),order);
  state.lists=order.map(id=>available.get(id)).filter(Boolean);
  state.listOrderDirty=true;
  if(state.pageCache)state.pageCache.home="";
  state.homeCache={};
}
async function loadLists(){try{state.lists=orderedLists(await api("/api/v1/lists"))}catch{state.lists=[]}}
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
function statusCreatedAtMs(raw){
  const t=Date.parse(raw?.created_at||"");
  return Number.isFinite(t)?t:0;
}
function mergeNewestTimeline(fresh=[],existing=[],limit=80){
  const out=[],seen=new Set();
  for(const raw of [...fresh,...existing]){
    if(!raw)continue;
    const id=String(statusId(raw)||"");
    if(id&&seen.has(id))continue;
    if(id)seen.add(id);
    out.push(raw);
  }
  out.sort((a,b)=>statusCreatedAtMs(b)-statusCreatedAtMs(a));
  return out.slice(0,limit);
}
function recentMentionStatus(raw,days=30){
  if(!raw||!nonDirect(raw))return false;
  const t=statusCreatedAtMs(raw);
  return !!t&&t>=Date.now()-days*86400000;
}
function settleWithin(promise,ms,fallback){
  return Promise.race([
    Promise.resolve(promise).catch(()=>fallback),
    new Promise(resolve=>setTimeout(()=>resolve(fallback),ms))
  ]);
}
async function loadRecentMentionStatuses(){
  try{
    const notes=await settleWithin(
      api("/api/v1/notifications",{query:{limit:"80","types[]":"mention"}}),
      3500,
      []
    );
    const out=[];
    for(const n of Array.isArray(notes)?notes:[]){
      const st=n?.status;
      if(String(n?.type||"")==="mention"&&st&&recentMentionStatus(st))out.push(st);
    }
    return out;
  }catch{return[]}
}
async function loadHomeFeed({maxId="",limit=40,maxScans=1}={}){
  let cursor=maxId||"",items=[];
  const scans=Math.max(1,Number(maxScans)||1);
  for(let scan=0;scan<scans;scan++){
    const query={limit:String(limit)};
    if(cursor)query.max_id=cursor;

    const page=scan===0
      ? await api("/api/v1/timelines/home",{query})
      : await settleWithin(api("/api/v1/timelines/home",{query}),8000,[]);

    if(!Array.isArray(page)||!page.length)break;
    items=mergeNewestTimeline(page,items,160);
    const next=String(page[page.length-1]?.id||"");
    if(!next||next===cursor||page.length<Number(limit))break;
    cursor=next;
  }
  return items;
}
async function loadChronologicalHome(opts={}){
  return loadHomeFeed(opts);
}
function publicHomeStatus(raw){
  if(!raw)return false;
  const status=raw?.reblog||raw;
  const replyId=status?.in_reply_to_id;
  return replyId===null||replyId===undefined||String(replyId)==="";
}
function publicFromHome(items=[]){
  // 퍼블릭 = 시간순 홈 원본 그대로 + 실제 답글만 전부 숨김.
  // 작성자/멘션 대상/공개글 여부에는 예외를 두지 않는다.
  return (Array.isArray(items)?items:[]).filter(publicHomeStatus);
}
function mergeTimelineUnlimited(fresh=[],existing=[]){
  const out=[],seen=new Set();
  for(const raw of [...fresh,...existing]){
    if(!raw)continue;
    const id=String(statusId(raw)||"");
    if(id&&seen.has(id))continue;
    if(id)seen.add(id);
    out.push(raw);
  }
  out.sort((a,b)=>statusCreatedAtMs(b)-statusCreatedAtMs(a));
  return out;
}
async function loadPublicFromHome({maxId="",limit=40,onPage=null,targetVisible=0,stopAtCreatedAt=0,maxPages=0}={}){
  let cursor=maxId||"",items=[],scan=0;
  for(;;){
    const query={limit:String(limit)};
    if(cursor)query.max_id=cursor;

    const page=await api("/api/v1/timelines/home",{query});
    if(!Array.isArray(page)||!page.length)break;
    scan++;

    const visible=page.filter(publicHomeStatus);
    items=mergeTimelineUnlimited(visible,items);

    if(typeof onPage==="function"){
      try{onPage(items,visible,page)}catch{}
    }

    const times=page.map(statusCreatedAtMs).filter(x=>Number(x)>0);
    const pageOldest=times.length?Math.min(...times):0;
    if(Number(stopAtCreatedAt)>0&&pageOldest>0&&pageOldest<=Number(stopAtCreatedAt))break;
    if(Number(targetVisible)>0&&items.length>=Number(targetVisible))break;
    if(Number(maxPages)>0&&scan>=Number(maxPages))break;

    const next=String(page[page.length-1]?.id||"");
    if(!next||next===cursor||page.length<Number(limit))break;
    cursor=next;
  }
  return items;
}
async function expandHomeTimelineInBackground(){
  if(state.homeBackgroundFillPromise)return state.homeBackgroundFillPromise;
  state.homeBackgroundFillPromise=(async()=>{
    const items=await loadChronologicalHome({limit:40,maxScans:3});
    if(!items.length)return;
    const current=state.homePagerData?.home||[];
    const merged=mergeNewestTimeline(items,current,160);
    updateHomeTimelinePage(merged,{preserveScroll:true});
  })().finally(()=>{state.homeBackgroundFillPromise=null});
  return state.homeBackgroundFillPromise;
}
async function expandPublicTimelineInBackground(){
  if(state.publicRefreshPromise)return state.publicRefreshPromise;
  if(state.publicBackgroundFillPromise)return state.publicBackgroundFillPromise;
  const generation=Number(state.publicLoadGeneration||0)+1;
  state.publicLoadGeneration=generation;
  const existing=Array.isArray(state.homePagerData?.public)?[...state.homePagerData.public]:[];
  const existingTimes=existing.map(statusCreatedAtMs).filter(x=>Number(x)>0);
  const stopAtCreatedAt=existingTimes.length?Math.min(...existingTimes):0;
  state.publicBackgroundFillPromise=(async()=>{
    let lastPaint=0;
    const items=await loadPublicFromHome({
      limit:40,
      stopAtCreatedAt,
      targetVisible:existing.length?0:40,
      maxPages:24,
      onPage:all=>{
        if(Number(state.publicLoadGeneration||0)!==generation)return;
        const now=Date.now();
        if(now-lastPaint<120)return;
        lastPaint=now;
        updatePublicTimelinePage(mergeTimelineUnlimited(all,existing),{preserveScroll:true});
      }
    });
    const merged=mergeTimelineUnlimited(items,existing);
    if(Number(state.publicLoadGeneration||0)!==generation)return merged;
    updatePublicTimelinePage(merged,{preserveScroll:true});
    state.publicFilledAt=Date.now();
    return merged;
  })().finally(()=>{state.publicBackgroundFillPromise=null});
  return state.publicBackgroundFillPromise;
}

function homeSnapshotRead(){
  const snap=store.get(scopedKey("home_snapshot_v16"),null);
  if(!snap?.at||Date.now()-Number(snap.at)>7*24*60*60*1000)return null;
  const data=snap.data;
  return data&&Array.isArray(data.home)&&Array.isArray(data.public)?data:null;
}
function homeSnapshotWrite(data){
  try{
    if(data&&Array.isArray(data.home)&&Array.isArray(data.public)){
      store.set(scopedKey("home_snapshot_v16"),{at:Date.now(),data});
    }
  }catch{}
}
function renderHomePagerData(data,{preserveScroll=false}={}){
  if(!data)return;
  const y=preserveScroll?(window.scrollY||document.documentElement.scrollTop||0):null;
  const chronologicalLabel=ANDROID?.homeTabs?.chronological||"시간순",publicLabel=ANDROID?.homeTabs?.public||"퍼블릭";
  state.homePagerData={
    home:Array.isArray(data.home)?data.home:[],
    public:Array.isArray(data.public)?data.public:[]
  };
  state.timelineItems=state.homePagerData[state.homeMode]||state.homePagerData.home;
  const tabs='<div class="home-tabs" data-home-tabs><button data-home-mode="home" class="'+(state.homeMode==="home"?"active":"")+'">'+esc(chronologicalLabel)+'</button><button data-home-mode="public" class="'+(state.homeMode==="public"?"active":"")+'">'+esc(publicLabel)+'</button><span class="home-tab-indicator" aria-hidden="true"></span></div>';
  const visibleLists=state.lists.filter(x=>!hiddenListIds().has(x.id));
  const chips=(visibleLists.length||state.lists.length)?'<div class="chips">'+visibleLists.map(x=>'<button class="chip" data-list="'+x.id+'">'+esc(x.title)+'</button>').join("")+'<button class="chip" data-action="newlist">＋ 리스트</button></div>':"";
  renderMainStable("홈",tabs+chips+buildHomePager(state.homeMode,state.homePagerData),{view:"home",fab:true});
  requestAnimationFrame(()=>{
    syncHomePagerUi(state.homeMode,false);
    if(y!==null)window.scrollTo(0,y);
  });
}
function updateHomeTimelinePage(items,{preserveScroll=true}={}){
  const data=state.homePagerData||{home:[],public:[]};
  data.home=Array.isArray(items)?items:[];
  state.homePagerData=data;
  homeSnapshotWrite(data);
  if(state.homeMode==="home")state.timelineItems=data.home;
  const page=document.querySelector('[data-home-page="home"]');
  if(!page||state.view!=="home"||state.listId)return;
  const y=preserveScroll?(window.scrollY||document.documentElement.scrollTop||0):null;
  page.innerHTML=homePageHtml(data.home,"home");
  bind();
  requestAnimationFrame(()=>{
    syncHomePagerUi(state.homeMode,false);
    if(y!==null)window.scrollTo(0,y);
  });
}
function updatePublicTimelinePage(items,{preserveScroll=true}={}){
  const data=state.homePagerData||{home:[],public:[]};
  data.public=Array.isArray(items)?items:[];
  state.homePagerData=data;
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
async function refreshHomeIncremental(){
  if(state.homeRefreshPromise)return state.homeRefreshPromise;
  state.homeRefreshPromise=(async()=>{
    const items=await loadChronologicalHome({limit:40,maxScans:1});
    if(items.length)updateHomeTimelinePage(items,{preserveScroll:true});
    setTimeout(()=>expandHomeTimelineInBackground().catch(()=>{}),0);
    return items;
  })().finally(()=>{state.homeRefreshPromise=null});
  return state.homeRefreshPromise;
}
async function ensurePublicTimelineFilled({fresh=false}={}){
  const stale=!state.publicFilledAt||Date.now()-Number(state.publicFilledAt)>60000;
  if(!fresh&&!stale&&(state.homePagerData?.public||[]).length>=20)return state.homePagerData.public;
  return refreshPublicTimeline();
}
async function refreshPublicLatestPage({fillBackground=false}={}){
  if(state.publicRefreshPromise)return state.publicRefreshPromise;
  const generation=Number(state.publicLoadGeneration||0)+1;
  state.publicLoadGeneration=generation;
  state.publicRefreshPromise=(async()=>{
    const page=await api("/api/v1/timelines/home",{query:{limit:"40"}});
    if(!Array.isArray(page)||!page.length)return state.homePagerData?.public||[];
    if(Number(state.publicLoadGeneration||0)!==generation)return state.homePagerData?.public||[];

    // 최신 한 페이지를 먼저 즉시 보여준다. 기존 퍼블릭의 과거 항목은 유지한다.
    const latest=page.filter(publicHomeStatus);
    const current=Array.isArray(state.homePagerData?.public)?state.homePagerData.public:[];
    const items=mergeTimelineUnlimited(latest,current);
    updatePublicTimelinePage(items,{preserveScroll:true});
    state.publicFilledAt=Date.now();

    if(fillBackground){
      setTimeout(()=>expandPublicTimelineInBackground().catch(()=>{}),0);
    }
    return items;
  })().finally(()=>{state.publicRefreshPromise=null});
  return state.publicRefreshPromise;
}
async function refreshPublicTimeline(){
  return refreshPublicLatestPage({fillBackground:true});
}
async function refreshHomeAfterPost(){
  try{await refreshHomeIncremental()}catch{}
  state.publicFilledAt=0;
  if(state.homeMode==="public"){
    try{await refreshPublicTimeline()}catch{}
  }
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
function syncHomePagerHeight(){
  const pager=document.querySelector("[data-home-pager]");
  const track=document.querySelector("[data-home-track]");
  if(!pager||!track)return;
  const page=track.querySelector('[data-home-page="'+state.homeMode+'"]');
  if(!page)return;
  const height=Math.max(1,Math.ceil(page.scrollHeight),Math.ceil(page.getBoundingClientRect().height));
  pager.style.height=height+"px";
}
function watchHomePagerHeight(){
  const track=document.querySelector("[data-home-track]");
  if(!track)return;
  const page=track.querySelector('[data-home-page="'+state.homeMode+'"]');
  if(!page)return;
  if(state.homePagerObservedPage===page)return;
  try{state.homePagerResizeObserver?.disconnect()}catch{}
  state.homePagerObservedPage=page;
  if("ResizeObserver" in window){
    state.homePagerResizeObserver=new ResizeObserver(()=>requestAnimationFrame(syncHomePagerHeight));
    state.homePagerResizeObserver.observe(page);
  }
  page.querySelectorAll("img,video").forEach(el=>{
    if(el.complete)return;
    el.addEventListener("load",syncHomePagerHeight,{once:true});
    el.addEventListener("loadedmetadata",syncHomePagerHeight,{once:true});
  });
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
  requestAnimationFrame(()=>{
    syncHomePagerHeight();
    watchHomePagerHeight();
  });
}
function setHomePagerMode(mode,animate=true){
  if(!homeModes().includes(mode))mode="home";
  const changed=state.homeMode!==mode;
  state.homeMode=mode;
  state.listId=null;
  state.timelineItems=state.homePagerData?.[mode]||[];
  syncHomePagerUi(mode,animate);
  requestAnimationFrame(()=>attachHomeInfiniteScroll());
  if(mode==="public"&&changed){
    const immediate=publicFromHome(state.homePagerData?.home||[]);
    const existing=Array.isArray(state.homePagerData?.public)?state.homePagerData.public:[];
    const visible=existing.length?mergeTimelineUnlimited(immediate,existing):immediate;
    state.homePagerData.public=visible;
    state.timelineItems=visible;
    updatePublicTimelinePage(visible,{preserveScroll:true});
    setTimeout(()=>refreshPublicLatestPage({fillBackground:true}).catch(()=>{}),0);
  }
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
      renderMainStable(state.lists.find(x=>x.id===state.listId)?.title||"리스트",chips+homePageHtml(data,"list"),{view:"home",fab:false});
      return;
    }

    const cached=state.homePagerData?.home?.length?state.homePagerData:homeSnapshotRead();
    if(cached){
      renderHomePagerData(cached);
    }else if(!silent){
      renderLoadingShell("홈");
    }

    const listsPromise=state.lists.length?Promise.resolve():loadLists();
    listsPromise.catch(()=>{});

    if(forceFresh){
      if(state.homeMode==="public")await refreshPublicTimeline();
      else await refreshHomeIncremental();
      return;
    }

    if(!cached){
      const home=await loadChronologicalHome({limit:40,maxScans:1});
      if(!home.length)throw new Error("홈 타임라인이 비어 있습니다.");
      const data={home,public:publicFromHome(home)};
      renderHomePagerData(data);
      homeSnapshotWrite(data);
      setTimeout(()=>expandHomeTimelineInBackground().catch(()=>{}),0);
      setTimeout(()=>expandPublicTimelineInBackground().catch(()=>{}),0);
    }else{
      const derived=publicFromHome(cached.home);
      if(!(cached.public||[]).length){
        updatePublicTimelinePage(derived,{preserveScroll:true});
      }
      setTimeout(()=>expandHomeTimelineInBackground().catch(()=>{}),0);
      setTimeout(()=>expandPublicTimelineInBackground().catch(()=>{}),0);
    }
  }catch(e){
    if(!state.homePagerData?.home?.length){
      renderMainStable("홈",'<div class="center">타임라인을 불러오지 못했어요.<br><br>'+esc(e.message)+'<br><br><button class="primary" data-action="reload">다시 시도</button></div>',{view:"home",fab:true});
    }
  }finally{
    state.busy=false;
    bind();
  }
}
function attachHomeInfiniteScroll(){
  try{state.homeInfiniteObserver?.disconnect()}catch{}
  state.homeInfiniteObserver=null;
  if(state.view!=="home")return;

  const loadMode=state.listId?"list":state.homeMode;
  let btn=null;
  if(state.listId){
    btn=document.querySelector('[data-action="loadmorehome"][data-home-load-mode="list"]');
  }else{
    btn=document.querySelector('[data-home-page="'+loadMode+'"] [data-action="loadmorehome"][data-home-load-mode="'+loadMode+'"]');
  }
  if(!btn||btn.dataset.exhausted==="1")return;

  if("IntersectionObserver" in window){
    const observer=new IntersectionObserver(entries=>{
      const hit=entries.some(x=>x.isIntersecting);
      if(!hit||state.timelineLoadingMore||btn.dataset.exhausted==="1")return;
      loadMoreHome({automatic:true}).catch(()=>{});
    },{root:null,rootMargin:"1500px 0px 1700px 0px",threshold:.01});
    observer.observe(btn);
    state.homeInfiniteObserver=observer;
  }
}

async function loadMoreHome({automatic=false}={}){
  if(state.timelineLoadingMore)return;
  const last=state.timelineItems[state.timelineItems.length-1],maxId=statusId(last);
  if(!maxId){if(!automatic)toast("더 불러올 게시물이 없어요.");return}
  const loadMode=state.listId?"list":state.homeMode;
  const btn=document.querySelector('[data-action="loadmorehome"][data-home-load-mode="'+loadMode+'"]')
    ||document.querySelector('[data-action="loadmorehome"]');
  state.timelineLoadingMore=true;
  if(btn){btn.disabled=true;btn.textContent="불러오는 중…"}
  try{
    let more=[];
    if(state.listId){
      more=await api(`/api/v1/timelines/list/${state.listId}`,{query:{limit:"40",max_id:maxId}});
    }else if(state.homeMode==="public"){
      // 자동 스크롤에서는 작은 묶음을 빨리 붙이고 곧바로 다음 묶음을 이어 받는다.
      const targetVisible=automatic?12:24;
      more=await loadPublicFromHome({maxId,limit:40,targetVisible});
    }else{
      more=await loadChronologicalHome({maxId,limit:40,maxScans:2});
    }
    const seen=new Set(state.timelineItems.map(x=>String(statusId(x)||"")).filter(Boolean));
    more=(more||[]).filter(x=>{
      const id=String(statusId(x)||"");
      if(!id||seen.has(id))return false;
      seen.add(id);
      return true;
    });
    if(!more.length){
      if(btn){
        btn.disabled=false;
        btn.dataset.exhausted="1";
        btn.textContent="더 불러올 게시물이 없어요.";
      }
      return;
    }
    state.timelineItems.push(...more);
    if(state.homeMode==="home"&&!state.listId)state.homePagerData.home=state.timelineItems;
    if(state.homeMode==="public"&&!state.listId)state.homePagerData.public=state.timelineItems;
    homeSnapshotWrite(state.homePagerData);
    if(btn){
      btn.insertAdjacentHTML("beforebegin",more.map(x=>statusCard(x,{replyCountOverride:visibleReplyCount(x,state.timelineItems)})).join(""));
      delete btn.dataset.exhausted;
      btn.disabled=false;btn.textContent="더 불러오기";
    }
    bind();
    if(!state.listId){
      requestAnimationFrame(()=>{
        syncHomePagerUi(state.homeMode,false);
        syncHomePagerHeight();
      });
      setTimeout(syncHomePagerHeight,120);
      setTimeout(syncHomePagerHeight,450);
    }
  }catch(e){
    if(!automatic)toast(e.message);
    if(btn){btn.disabled=false;btn.textContent="다시 시도"}
  }finally{
    state.timelineLoadingMore=false;
    requestAnimationFrame(()=>attachHomeInfiniteScroll());
  }
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
  const marks=["interactiveSwipe","homeSwipe","lentonSwipe","edgeDrawerSwipe","closeSwipe","profileSwipe","backSwipe","pullRefresh","notificationSwipe","notificationPullRefresh"];
  root.querySelectorAll?.("[data-interactive-swipe],[data-home-swipe],[data-lenton-swipe],[data-edge-drawer-swipe],[data-close-swipe],[data-profile-swipe],[data-back-swipe],[data-pull-refresh],[data-notification-swipe],[data-notification-pull-refresh]").forEach(el=>{
    for(const k of marks)if(k in el.dataset)delete el.dataset[k];
  });
}
function goBackScreen(){
  const snap=state.navStack.pop();
  if(snap){
    state.view=snap.view;state.homeMode=snap.homeMode;state.listId=snap.listId;
    state.profileAccount=snap.profileAccount;state.profileRelationship=snap.profileRelationship;
    state.profileReplies=snap.profileReplies;state.profileMode=snap.profileMode||"posts";state.currentConversation=snap.currentConversation;
    if(state.listOrderDirty&&snap.view==="home"){
      state.listOrderDirty=false;
      render();
      requestAnimationFrame(()=>window.scrollTo(0,snap.scrollY||0));
      return;
    }
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

function replyNeededHandledKey(){return scopedKey("reply_needed_handled_v1")}
function replyNeededHandledIds(){
  const raw=store.get(replyNeededHandledKey(),[])||[];
  return new Set((Array.isArray(raw)?raw:[]).map(String).filter(Boolean));
}
function saveReplyNeededHandledIds(ids){
  const all=[...ids].map(String).filter(Boolean);
  store.set(replyNeededHandledKey(),all.slice(Math.max(0,all.length-500)));
}
function ensureReplyNeededEmptyState(){
  if(state.view!=="notifications")return;
  const page=document.querySelector('[data-notification-page="replyNeeded"]');
  if(!page||page.querySelector(".android-notify-card")||page.querySelector(".reply-needed-empty"))return;
  page.innerHTML='<div class="center reply-needed-empty">답장할 멘션이 없어요.</div>';
  syncNotificationPagerHeight();
}
function syncNotificationOwnReplyCounts(statusIds=[]){
  const ids=new Set((statusIds||[]).map(x=>String(x||"")).filter(Boolean));
  if(!ids.size)return;
  document.querySelectorAll(".android-notify-card[data-notify-status]").forEach(card=>{
    const sid=String(card.dataset.notifyStatus||"");
    if(!ids.has(sid))return;
    const count=card.querySelector("[data-notify-reply-count]");
    if(!count)return;
    const current=Math.max(0,Number(count.textContent||0));
    count.textContent=String(Math.max(1,current));
  });
}
function markReplyNeededHandledMany(statusIds,{removeDom=true}={}){
  const handled=replyNeededHandledIds();
  let changed=false;
  for(const raw of statusIds||[]){
    const id=String(raw||"");if(!id)continue;
    if(!handled.has(id)){handled.add(id);changed=true}
  }
  if(changed)saveReplyNeededHandledIds(handled);
  syncNotificationOwnReplyCounts(statusIds);
  if(Array.isArray(state.replyNeededItems)&&state.replyNeededItems.length){
    const done=new Set([...handled]);
    state.replyNeededItems=state.replyNeededItems.filter(n=>!done.has(String(n?.status?.id||"")));
  }
  state.pageCache.notifications="";
  if(removeDom&&state.view==="notifications"){
    const done=new Set((statusIds||[]).map(x=>String(x||"")).filter(Boolean));
    document.querySelectorAll('[data-notification-page="replyNeeded"] .android-notify-card[data-notify-status]').forEach(card=>{
      if(!done.has(String(card.dataset.notifyStatus||"")))return;
      card.classList.add("reply-needed-resolved");
      setTimeout(()=>{card.remove();ensureReplyNeededEmptyState()},150);
    });
  }
}
function replyNeededCandidates(rawItems=[]){
  const handled=replyNeededHandledIds(),seenStatus=new Set(),out=[];
  for(const n of Array.isArray(rawItems)?rawItems:[]){
    const st=n?.status,sid=String(st?.id||"");
    if(!n||n.type!=="mention"||!st||st.visibility==="direct"||!sid)continue;
    if(handled.has(sid)||seenStatus.has(sid))continue;
    seenStatus.add(sid);
    out.push(n);
  }
  return out;
}
async function reconcileReplyNeededAcrossClients(pending=[]){
  if(!Array.isArray(pending)||!pending.length||!state.me?.id)return pending||[];
  const targets=new Set(),answered=new Set();
  let oldestPendingMs=Infinity;
  for(const n of pending){
    const st=n?.status,sid=String(st?.id||"");if(!sid)continue;
    targets.add(sid);
    const t=Date.parse(st?.created_at||"");if(Number.isFinite(t))oldestPendingMs=Math.min(oldestPendingMs,t);
  }
  if(!targets.size)return [];
  let maxId="";
  try{
    for(let pageNo=0;pageNo<20&&targets.size;pageNo++){
      const query={limit:"40",exclude_reblogs:"true",exclude_replies:"false"};
      if(maxId)query.max_id=maxId;
      const mine=await api("/api/v1/accounts/"+encodeURIComponent(state.me.id)+"/statuses",{query});
      if(!Array.isArray(mine)||!mine.length)break;
      let nextMax="",oldestPageMs=Infinity;
      for(const raw of mine){
        const st=raw?.reblog||raw||{},id=String(st.id||"");
        if(id)nextMax=id;
        const t=Date.parse(st.created_at||"");if(Number.isFinite(t))oldestPageMs=Math.min(oldestPageMs,t);
        const parentId=String(st.in_reply_to_id||"");
        if(parentId&&targets.has(parentId)){
          targets.delete(parentId);
          answered.add(parentId);
        }
      }
      if(!nextMax||nextMax===maxId)break;
      maxId=nextMax;
      if(Number.isFinite(oldestPendingMs)&&Number.isFinite(oldestPageMs)&&oldestPageMs<oldestPendingMs)break;
      if(mine.length<40)break;
    }
  }catch{
    return pending;
  }
  if(answered.size)markReplyNeededHandledMany([...answered],{removeDom:false});
  return pending.filter(n=>!answered.has(String(n?.status?.id||"")));
}
function notificationMentionRowHtml(n,isNew=false){
  const a=n?.account||{},st=n?.status||{};
  const reply=!!String(st.in_reply_to_id||"");
  const boostAllowed=st?.rebloggable!==false&&!["private","direct"].includes(String(st?.visibility||""));
  const answeredByMe=!!String(st.id||"")&&replyNeededHandledIds().has(String(st.id));
  const replyCount=Math.max(Number(st.replies_count||0),answeredByMe?1:0);
  const actions=st?.id?'<div class="actions lenton-actions notify-mention-actions">'+
    '<button data-action="reply" data-id="'+esc(st.id)+'" aria-label="답글">'+lentonIcon("reply")+' <span class="count" data-notify-reply-count>'+((replyCount>0)?replyCount:"")+'</span></button>'+
    '<button class="boost '+(st.reblogged?"on ":"")+(boostAllowed?"":"unavailable")+'" data-action="boost" data-id="'+esc(st.id)+'" aria-label="'+(boostAllowed?"부스트":"부스트할 수 없는 게시물")+'" '+(boostAllowed?"":"disabled")+'>'+((boostAllowed)?lentonIcon("boost"):'<span class="boost-unavailable-mark">×</span>')+' <span class="count">'+(boostAllowed?(st.reblogs_count||""):"")+'</span></button>'+
    '<button class="fav '+(st.favourited?"on":"")+'" data-action="fav" data-id="'+esc(st.id)+'" aria-label="좋아요">'+lentonIcon(st.favourited?"heartFill":"heart")+' <span class="count">'+(st.favourites_count||"")+'</span></button>'+
    '<button class="bookmark '+(st.bookmarked?"on":"")+'" data-action="bookmark" data-id="'+esc(st.id)+'" aria-label="북마크">'+lentonIcon(st.bookmarked?"bookmarkFill":"bookmark")+'</button>'+
    '</div>':"";
  return '<article class="android-notify-card notify-mention mention-post-card '+(isNew?"is-new ":"")+'has-status" data-notify-status="'+esc(st.id||"")+'">'+
    '<button type="button" class="mention-card-avatar" data-profile="'+esc(a.id||"")+'" aria-label="프로필 열기"><img src="'+esc(a.avatar_static||a.avatar||"")+'" alt=""></button>'+
    '<div class="android-notify-main mention-card-main">'+
      '<div class="mention-card-author"><b>'+renderEmojiText(a.display_name||a.username||"알림",a.emojis||[])+'</b><span>@'+esc(a.acct||a.username||"")+' · '+esc(fmtTime(st.created_at))+'</span>'+(isNew?'<i class="notify-new-dot" aria-label="새 알림"></i>':"")+'</div>'+
      '<div class="mention-card-kind">'+(reply?"↳ 답글을 보냈어요":"@ 나를 멘션했어요")+'</div>'+
      '<div class="notify-content">'+renderRichText(st.content||"")+'</div>'+
      actions+
    '</div></article>';
}
function notificationRowsHtml(items=[],replyNeededMode=false){
  const labels=ANDROID?.renderer?.notificationLabels||{};
  const glyphs=ANDROID?.renderer?.notificationGlyphs||{};
  const colors={favourite:"fav",reblog:"boost",mention:"mention",follow:"follow",follow_request:"follow"};
  if(!items.length)return '<div class="center '+(replyNeededMode?"reply-needed-empty":"")+'">'+(replyNeededMode?"답장할 멘션이 없어요.":"새 알림이 없어요.")+'</div>';
  return items.map(n=>{
    const a=n.account||{},st=n.status||null,type=n.type||"";
    const isNew=state.notificationNewIds instanceof Set&&state.notificationNewIds.has(String(n?.id||""));
    if(type==="mention"&&st)return notificationMentionRowHtml(n,isNew);
    const label=labels[type]||type||"새 알림",glyph=glyphs[type]||glyphs.default||"♢";
    const body=st?'<div class="notify-content">'+renderRichText(st.content||"")+'</div>':"";
    const tone=type==="status"?"notify-passive":"notify-neutral";
    return '<article class="android-notify-card '+tone+' '+(isNew?"is-new ":"")+(st?"has-status":"")+'" '+(st?'data-notify-status="'+esc(st.id||"")+'"':"")+'>'+
      '<div class="android-notify-glyph '+(colors[type]||"default")+'">'+esc(glyph)+'</div>'+
      '<div class="android-notify-main">'+
        '<div class="android-notify-person"><button type="button" class="android-notify-avatar" data-profile="'+esc(a.id||"")+'" aria-label="프로필 열기"><img src="'+esc(a.avatar_static||a.avatar||"")+'" alt=""></button><b>'+renderEmojiText(a.display_name||a.username||"알림",a.emojis||[])+' · '+esc(label)+'</b>'+(isNew?'<span class="notify-new-dot" aria-label="새 알림"></span>':"")+'</div>'+
        body+
      '</div></article>';
  }).join("");
}
function notificationModes(){return ["all","replyNeeded"]}
function notificationPageHtml(items=[],mode="all"){
  return notificationRowsHtml(items,mode==="replyNeeded");
}
function buildNotificationPager(mode="all"){
  const modes=notificationModes(),index=Math.max(0,modes.indexOf(mode));
  const data={all:state.notificationAllItems||[],replyNeeded:state.replyNeededItems||[]};
  return '<div class="notification-pager" data-notification-pager><div class="notification-pager-track" data-notification-track style="transform:translate3d(-'+(index*100)+'%,0,0)">'+
    modes.map(modeKey=>'<section class="notification-pager-page" data-notification-page="'+modeKey+'">'+notificationPageHtml(data[modeKey]||[],modeKey)+'</section>').join("")+
    '</div></div>';
}
function syncNotificationPagerHeight(){
  const pager=document.querySelector("[data-notification-pager]");
  const track=document.querySelector("[data-notification-track]");
  if(!pager||!track)return;
  const page=track.querySelector('[data-notification-page="'+(state.notificationMode||"all")+'"]');
  if(!page)return;
  const height=Math.max(1,Math.ceil(page.scrollHeight),Math.ceil(page.getBoundingClientRect().height));
  pager.style.height=height+"px";
}
function watchNotificationPagerHeight(){
  const track=document.querySelector("[data-notification-track]");
  if(!track)return;
  const page=track.querySelector('[data-notification-page="'+(state.notificationMode||"all")+'"]');
  if(!page)return;
  if(state.notificationPagerObservedPage===page)return;
  try{state.notificationPagerResizeObserver?.disconnect()}catch{}
  state.notificationPagerObservedPage=page;
  if("ResizeObserver" in window){
    state.notificationPagerResizeObserver=new ResizeObserver(()=>requestAnimationFrame(syncNotificationPagerHeight));
    state.notificationPagerResizeObserver.observe(page);
  }
  page.querySelectorAll("img,video").forEach(el=>{
    if(el.complete)return;
    el.addEventListener("load",syncNotificationPagerHeight,{once:true});
    el.addEventListener("loadedmetadata",syncNotificationPagerHeight,{once:true});
  });
}
function positionNotificationIndicator(tabs,indicator,frac,modes,animate=false){
  if(!tabs||!indicator||!modes?.length)return;
  const tabW=Math.max(1,tabs.getBoundingClientRect().width/modes.length);
  const indicatorW=Math.max(1,indicator.getBoundingClientRect().width||36);
  const clamped=Math.max(0,Math.min(modes.length-1,Number(frac)||0));
  indicator.style.transition=animate?"transform 190ms cubic-bezier(.2,.75,.25,1)":"none";
  indicator.style.transform="translate3d("+(clamped*tabW+(tabW-indicatorW)/2)+"px,0,0)";
}
function syncNotificationPagerUi(mode,animate=true){
  const modes=notificationModes(),index=Math.max(0,modes.indexOf(mode));
  const pager=document.querySelector("[data-notification-pager]"),track=document.querySelector("[data-notification-track]"),tabs=document.querySelector("[data-notification-tabs]");
  if(!pager||!track||!tabs)return;
  const width=Math.max(1,pager.clientWidth);
  track.style.transition=animate?"transform 190ms cubic-bezier(.2,.75,.25,1)":"none";
  track.style.transform="translate3d("+(-index*width)+"px,0,0)";
  tabs.querySelectorAll("[data-notify]").forEach(b=>b.classList.toggle("active",(b.dataset.notify==="all"?"all":"replyNeeded")===mode));
  positionNotificationIndicator(tabs,tabs.querySelector(".notify-tab-indicator"),index,modes,animate);
  requestAnimationFrame(()=>{syncNotificationPagerHeight();watchNotificationPagerHeight()});
}
function setNotificationPagerMode(mode,animate=true){
  if(!notificationModes().includes(mode))mode="all";
  state.notificationMode=mode;
  syncNotificationPagerUi(mode,animate);
}
function renderNotificationsPager(mode="all"){
  state.notificationMode=notificationModes().includes(mode)?mode:"all";
  const notificationTabs=ANDROID?.renderer?.notificationTabs||[];
  const allLabel=notificationTabs[0]||"전체";
  const replyNeededLabel="답장할 멘션";
  const tabs='<div class="notify-tabs lenton-notify-tabs" data-notification-tabs>'+
    '<button data-notify="all" class="'+(state.notificationMode==="all"?"active":"")+'">'+esc(allLabel)+'</button>'+
    '<button data-notify="mention" class="'+(state.notificationMode==="replyNeeded"?"active":"")+'">'+esc(replyNeededLabel)+'</button>'+
    '<div class="notify-tab-indicator"></div></div>';
  renderMainStable("알림",tabs+buildNotificationPager(state.notificationMode),{view:"notifications",fab:true});
  requestAnimationFrame(()=>syncNotificationPagerUi(state.notificationMode,false));
}
function renderNotificationsData(items=[],replyNeededMode=false){
  if(replyNeededMode)state.replyNeededItems=Array.isArray(items)?items:[];
  else state.notificationAllItems=Array.isArray(items)?items:[];
  renderNotificationsPager(replyNeededMode?"replyNeeded":"all");
}

function applyReplyNeededReconciliation(before=[],after=[]){
  state.replyNeededItems=after;
  if(state.view!=="notifications"||state.notificationMode!=="replyNeeded")return;
  const keep=new Set(after.map(n=>String(n?.status?.id||"")).filter(Boolean));
  const removed=[];
  for(const n of before){
    const sid=String(n?.status?.id||"");
    if(sid&&!keep.has(sid))removed.push(sid);
  }
  if(removed.length){
    const removeSet=new Set(removed);
    document.querySelectorAll('[data-notification-page="replyNeeded"] .android-notify-card[data-notify-status]').forEach(card=>{
      if(!removeSet.has(String(card.dataset.notifyStatus||"")))return;
      card.classList.add("reply-needed-resolved");
      setTimeout(()=>{card.remove();ensureReplyNeededEmptyState()},150);
    });
  }else if(!after.length)ensureReplyNeededEmptyState();
  state.pageCache.notifications="";
}
async function notificationsView(mentionsOnly=false,silent=false){
  const requestedMode=mentionsOnly?"replyNeeded":"all";
  const continuingSession=!!document.querySelector(".lenton-view-notifications [data-notification-pager]");
  if(!silent&&!continuingSession)renderLoadingShell("알림");
  state.notificationMode=requestedMode;
  try{
    const [allLoaded,mentionLoaded,serverMarker]=await Promise.all([
      api("/api/v1/notifications",{query:{limit:"80"}}),
      api("/api/v1/notifications",{query:{limit:"80","types[]":"mention"}}),
      serverNotificationReadId().catch(()=>"")
    ]);
    const rawAll=allLoaded||[],rawMentions=mentionLoaded||[];
    const filter=notificationFilterPrefs();
    const markerBefore=String(serverMarker||localNotificationReadId()||"");
    const unreadIds=new Set();
    if(markerBefore){
      for(const n of rawAll){
        if(String(n?.id||"")===markerBefore)break;
        if(n?.status?.visibility==="direct")continue;
        if(filter[n?.type]===false)continue;
        unreadIds.add(String(n?.id||""));
      }
    }else{
      const sharedUnread=accountNotificationUnreadFor({key:currentAccountKey()});
      const fallbackUnread=Math.max(0,Number(state.notificationUnread)||0,Number(sharedUnread)||0);
      if(fallbackUnread>0){
        for(const n of rawAll){
          if(n?.status?.visibility==="direct"||filter[n?.type]===false)continue;
          const id=String(n?.id||"");if(!id)continue;
          unreadIds.add(id);
          if(unreadIds.size>=fallbackUnread)break;
        }
      }
    }
    if(!continuingSession||!(state.notificationNewIds instanceof Set)){
      state.notificationNewIds=unreadIds;
    }else{
      for(const id of unreadIds)state.notificationNewIds.add(id);
    }

    state.notificationAllItems=rawAll.filter(n=>n?.status?.visibility!=="direct"&&filter[n.type]!==false);
    const pending=replyNeededCandidates(rawMentions);
    state.replyNeededItems=pending;
    renderNotificationsPager(requestedMode);

    if(requestedMode==="all"&&rawAll?.[0]?.id)await markNotificationsRead(rawAll[0].id);

    const reconciled=await reconcileReplyNeededAcrossClients(pending);
    applyReplyNeededReconciliation(pending,reconciled);
    state.replyNeededItems=reconciled;
    syncNotificationPagerHeight();
  }catch(e){
    if(!continuingSession)renderMainStable("알림",'<div class="center">'+esc(e.message)+'</div>',{view:"notifications",fab:true});
  }
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
      return '<button class="message-row '+(c.unread?"unread":"")+'" data-conv="'+esc(c.id)+'" '+(c.unread?'aria-label="읽지 않은 대화"':"")+'>'+
        '<img class="message-avatar" src="'+esc(a?.avatar_static||a?.avatar||"")+'" alt="">'+
        '<div class="message-main"><div class="message-name">'+renderEmojiText(a?.display_name||a?.username||"대화",a?.emojis||[])+thread+'</div>'+
        '<div class="message-handle">@'+esc(a?.acct||"")+'</div><div class="message-preview">'+esc(txt)+'</div></div>'+
        '<div class="message-meta"><time class="message-date">'+fmtDateOnly(c.last_status?.created_at)+'</time>'+(c.unread?'<span class="message-unread-dot" aria-hidden="true"></span>':"")+'</div></button>';
    }).join(""):'<div class="center">대화가 없어요.</div>';
    renderMainStable("메시지",body,{view:"dm",fab:true,fabAction:"newdm"}); state._conversations=cs;
  }catch(e){renderMainStable("메시지",'<div class="center">'+esc(e.message)+'</div>',{view:"dm",fab:true,fabAction:"newdm"})}
}

function markDmConversationReadInSnapshots(id){
  const target=String(id||"");if(!target)return;
  for(let i=state.navStack.length-1;i>=0;i--){
    const snap=state.navStack[i];
    if(snap?.view!=="dm"||!snap?.html)continue;
    const holder=document.createElement("div");holder.innerHTML=snap.html;
    const row=[...holder.querySelectorAll("[data-conv]")].find(el=>String(el.dataset.conv||"")===target);
    if(!row)continue;
    row.classList.remove("unread");
    row.removeAttribute("aria-label");
    row.querySelector(".message-unread-dot")?.remove();
    snap.html=holder.innerHTML;
    break;
  }
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
  document.querySelector(".standalone-page")?.classList.add("dm-new-message-page");
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
  send.disabled=true;send.textContent="…";
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
  }catch(e){toast(e.message);send.textContent="↑";send.disabled=false}
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
        '<button class="dm-tool-btn dm-tool-more" id="dmInlineMore" aria-label="첨부 메뉴" aria-expanded="false">+</button>'+
        '<input id="dmInlineFile" type="file" accept="image/*,video/*" multiple hidden>'+
        '<input id="dmInlineCameraFile" type="file" accept="image/*" capture="environment" hidden>'+
        '<textarea id="dmInlineInput" rows="1" maxlength="'+Number(state.instance?.configuration?.statuses?.max_characters||500)+'" placeholder="메시지 보내기"></textarea>'+
        '<button class="dm-inline-send" id="dmInlineSend" aria-label="보내기" disabled>↑</button>'+
        '<div id="dmMediaPreview" class="dm-media-preview"></div>'+
        '<div class="dm-attach-menu" id="dmInlineAttachMenu" hidden>'+
          '<button type="button" id="dmInlineAttach">'+lentonIcon("photo")+'<span>사진·동영상</span></button>'+
          '<button type="button" id="dmInlineCamera">'+lentonIcon("camera")+'<span>카메라</span></button>'+
        '</div>'+
      '</div>';
    $("#app").innerHTML=standaloneShell(title,body);
    document.querySelector(".standalone-page")?.classList.add("dm-conversation-page");
    bind();
    const input=$("#dmInlineInput"),send=$("#dmInlineSend"),more=$("#dmInlineMore"),menu=$("#dmInlineAttachMenu"),file=$("#dmInlineFile"),camera=$("#dmInlineCameraFile");
    const selectedFiles=()=>[...(file?.files||[]),...(camera?.files||[])].slice(0,4);
    const syncComposerSpace=()=>{
      const page=document.querySelector(".dm-conversation-page"),composer=document.querySelector(".android-dm-compose");
      if(!page||!composer)return;
      page.style.setProperty("--dm-composer-height",Math.ceil(composer.getBoundingClientRect().height)+"px");
    };
    const updateSendState=()=>{if(send)send.disabled=!(String(input?.value||"").trim()||selectedFiles().length)};
    const resizeInput=()=>{
      if(!input)return;
      input.style.height="auto";
      const maxHeight=116,next=Math.max(44,Math.min(maxHeight,input.scrollHeight));
      input.style.height=next+"px";
      input.style.overflowY=input.scrollHeight>maxHeight?"auto":"hidden";
      updateSendState();
      requestAnimationFrame(syncComposerSpace);
    };
    const closeAttachMenu=()=>{if(menu)menu.hidden=true;if(more)more.setAttribute("aria-expanded","false")};
    const previewFiles=()=>{
      const box=$("#dmMediaPreview");if(!box)return;
      box.innerHTML=selectedFiles().map(f=>'<div class="dm-media-chip">'+esc(f.name)+'</div>').join("");
      updateSendState();
      requestAnimationFrame(syncComposerSpace);
    };
    more?.addEventListener("click",e=>{
      e.stopPropagation();
      if(!menu)return;
      menu.hidden=!menu.hidden;
      more.setAttribute("aria-expanded",menu.hidden?"false":"true");
    });
    $("#dmInlineAttach")?.addEventListener("click",()=>{closeAttachMenu();file?.click()});
    $("#dmInlineCamera")?.addEventListener("click",()=>{closeAttachMenu();camera?.click()});
    file?.addEventListener("change",previewFiles);
    camera?.addEventListener("change",previewFiles);
    input?.addEventListener("input",resizeInput);
    input?.addEventListener("focus",closeAttachMenu);
    send?.addEventListener("click",()=>sendInlineDm(c));
    input?.addEventListener("keydown",e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendInlineDm(c)}});
    resizeInput();previewFiles();
    requestAnimationFrame(syncComposerSpace);
    api("/api/v1/conversations/"+id+"/read",{method:"POST",form:{}}).then(async()=>{
      if(c.unread){
        c.unread=false;
        state.dmUnread=Math.max(0,Number(state.dmUnread||0)-1);
        markDmConversationReadInSnapshots(c.id);
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
function standaloneShell(title,body,right="",backAction="backScreen"){
  return `<div class="standalone-page"><header class="standalone-top"><button class="back" data-action="${esc(backAction)}" aria-label="뒤로가기">${lentonIcon("back")}</button><h1>${esc(title)}</h1>${right}</header><main class="main">${body}</main></div>`;
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


function searchFilterBarMarkup(){
  const modes=[["posts","게시물"],["people","사람"],["media","미디어"]];
  const following=searchFollowingOnlyEnabled();
  return '<div class="search-filter-bar">'+
    modes.map(([id,label])=>'<button type="button" data-search-mode="'+id+'" class="'+(state.searchMode===id?"active":"")+'">'+label+'</button>').join("")+
    '<button type="button" data-search-following-toggle class="'+(following?"active":"")+'">'+(following?"✓ ":"")+'팔로잉만</button>'+
  '</div>';
}
function syncSearchFilterBar(){
  document.querySelectorAll("[data-search-mode]").forEach(b=>b.classList.toggle("active",b.dataset.searchMode===state.searchMode));
  const follow=document.querySelector("[data-search-following-toggle]");
  if(follow){const on=searchFollowingOnlyEnabled();follow.classList.toggle("active",on);follow.textContent=(on?"✓ ":"")+"팔로잉만"}
}
function searchFollowingOnlyEnabled(){return !!store.get(scopedKey("search_following_only"),false)}
async function ensureSearchFollowingIds({fresh=false}={}){
  const following=await loadAllFollowing({fresh});
  state.searchFollowingIds=new Set((following||[]).map(a=>String(a?.id||"")).filter(Boolean));
  return state.searchFollowingIds;
}
function searchAllowedByFollowing(accountId){
  if(!searchFollowingOnlyEnabled())return true;
  return state.searchFollowingIds instanceof Set&&state.searchFollowingIds.has(String(accountId||""));
}
function searchPeopleMarkup(items=[]){
  const filtered=(items||[]).filter(a=>searchAllowedByFollowing(a?.id));
  return filtered.length?filtered.map(a=>'<button class="row search-person-row" data-profile="'+esc(a.id||"")+'"><img class="avatar search-person-avatar" src="'+esc(a.avatar_static||a.avatar||"")+'" alt=""><div class="grow"><b>'+renderEmojiText(a.display_name||a.username,a.emojis||[])+'</b><div class="muted">@'+esc(a.acct||"")+'</div><div class="search-person-note">'+esc(plain(a.note||""))+'</div></div></button>').join(""):'<div class="center">'+(searchFollowingOnlyEnabled()?"팔로잉 중인 사람의 검색 결과가 없어요.":"사람 검색 결과가 없어요.")+'</div>';
}
function searchStatusesForMode(mode){
  let statuses=Array.isArray(state.searchResults?.statuses)?state.searchResults.statuses:[];
  statuses=statuses.filter(x=>searchAllowedByFollowing((x?.reblog||x)?.account?.id||x?.account?.id));
  if(mode==="media")return statuses.filter(x=>(x?.reblog||x)?.media_attachments?.length>0);
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
  box.innerHTML='<div class="search-tab-body">'+body+'</div>';
  syncSearchFilterBar();
  bind();
}
function setSearchMode(mode){
  if(!["posts","people","media"].includes(mode)||state.searchMode===mode)return;
  state.searchMode=mode;
  // 탭 버튼의 선택 상태는 즉시 바꾸고, 무거운 결과 렌더는 다음 프레임으로 넘긴다.
  syncSearchFilterBar();
  requestAnimationFrame(()=>renderSearchResults());
}
function closeSearchMenu(){document.querySelector(".android-popup-shade.search-popup")?.remove()}
function openSearchMenu(){
  closeSearchMenu();
  const shade=document.createElement("div");shade.className="android-popup-shade search-popup";
  const followingOnly=searchFollowingOnlyEnabled();
  const items=[["posts","게시물"],["people","사람"],["media","미디어"],["followingOnly",(followingOnly?"✓ ":"")+"팔로잉만 검색"],["clear","검색 초기화"]];
  shade.innerHTML='<div class="android-popup search-popup-menu">'+items.map(([id,label])=>'<button type="button" data-search-menu="'+id+'" class="'+((state.searchMode===id||(id==="followingOnly"&&followingOnly))?"active":"")+'">'+esc(label)+'</button>').join("")+'</div>';
  document.body.append(shade);
  shade.onclick=e=>{if(e.target===shade)closeSearchMenu()};
  shade.querySelectorAll("[data-search-menu]").forEach(b=>b.onclick=async()=>{
    const mode=b.dataset.searchMenu;
    closeSearchMenu();
    if(mode==="clear"){
      state.searchResults=null;state.searchQuery="";state.searchMode="posts";searchView();
    }else if(mode==="followingOnly"){
      const next=!searchFollowingOnlyEnabled();
      store.set(scopedKey("search_following_only"),next);
      if(next){
        try{await ensureSearchFollowingIds()}catch(e){toast(e.message)}
      }
      renderSearchResults();
    }else setSearchMode(mode);
  });
}
async function searchView(){
  const q=state.searchQuery||"";
  $("#app").innerHTML=shell("검색",
    '<div class="search-box"><input id="searchInput" class="field" placeholder="사람, 게시물, 해시태그 검색" value="'+esc(q)+'"><button class="primary" data-action="runsearch">검색</button></div>'+
    searchFilterBarMarkup()+
    '<div id="searchResults" class="'+(state.searchResults?"":"center")+'"></div>'
  );
  bind();
  if(searchFollowingOnlyEnabled()&&!(state.searchFollowingIds instanceof Set)){
    ensureSearchFollowingIds().then(renderSearchResults).catch(()=>renderSearchResults());
  }else renderSearchResults();
}
async function runSearch(){
  const q=$("#searchInput")?.value.trim(); if(!q)return;
  const box=$("#searchResults"); box.className="center"; box.textContent="검색 중…";
  try{
    const [r]=await Promise.all([
      api("/api/v2/search",{query:{q,resolve:"true",limit:"40"}}),
      searchFollowingOnlyEnabled()?ensureSearchFollowingIds():Promise.resolve(null)
    ]);
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
  const iconMap={profile:"profile",profileedit:"edit",favourites:"heart",bookmarks:"bookmark",followrequests:"personAdd",layoutedit:"edit",lists:"list",settings:"settings",theme:"settings"};
  const fallback=[
    {id:"profile",label:"프로필"},{id:"profileedit",label:"프로필 편집"},{id:"favourites",label:"좋아요"},
    {id:"bookmarks",label:"북마크"},{id:"followrequests",label:"팔로우 요청"},{id:"layoutedit",label:"화면 구성 편집"},
    {id:"lists",label:"리스트"},{id:"settings",label:"설정"}
  ];
  let rows=Array.isArray(ANDROID?.renderer?.drawerRows)&&ANDROID.renderer.drawerRows.length?ANDROID.renderer.drawerRows:fallback;
  rows=rows.filter(x=>x?.id&&x.id!=="realtime"&&x.id!=="update"&&x.id!=="history"&&x.id!=="inquiry");
  if(ANDROID?.features?.lists&&!rows.some(x=>x.id==="lists")){
    const settingsIndex=rows.findIndex(x=>x.id==="settings");
    const listRow={id:"lists",label:"리스트"};
    if(settingsIndex>=0)rows=[...rows.slice(0,settingsIndex),listRow,...rows.slice(settingsIndex)];
    else rows=[...rows,listRow];
  }
  const mapped=rows.map(x=>{
    let label=x.label||x.id;
    if(x.id==="theme")label=(state.theme==="dark"?"라이트 모드":"다크 모드");
    return {id:x.id,label,icon:iconMap[x.id]||"more"};
  });
  mapped.push({id:"history",label:"앱 업데이트",icon:"update"});
  mapped.push({id:"inquiry",label:"문의 / 기능 건의",icon:"edit"});
  return mapped;
}
function drawerMenuMarkup(){
  return drawerMenuRows().map((x,i)=>{
    const spacer=x.id==="lists"?'<div class="drawer-spacer" aria-hidden="true"></div>':"";
    const divider=(x.id==="settings"||x.id==="history")?'<div class="drawer-divider"></div>':"";
    return spacer+divider+'<button class="drawer-row '+(x.id==="lists"?"drawer-list-row":"")+'" data-drawer="'+esc(x.id)+'"><span class="glyph">'+lentonIcon(x.icon)+'</span>'+esc(x.label)+'</button>';
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
    <div class="drawer-profile-summary">
      <button class="drawer-profile-main" data-drawer="profile">
        <div class="drawer-name">${renderEmojiText(m.display_name||m.username||"렌톤",m.emojis||[])}</div>
        <div class="drawer-handle">@${esc(m.acct||"")}${m.acct?.includes("@")?"":"@"+esc(state.session?.host||"")}</div>
      </button>
      <div class="drawer-counts" role="group" aria-label="팔로우 정보">
        <button type="button" class="drawer-connection-button" data-drawer-connection="following" data-drawer-connection-account="${esc(m.id||"")}"><b>${m.following_count||0}</b>&nbsp;팔로잉</button>
        <button type="button" class="drawer-connection-button" data-drawer-connection="followers" data-drawer-connection-account="${esc(m.id||"")}"><b>${m.followers_count||0}</b>&nbsp;팔로워</button>
      </div>
    </div>
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
    else if(v==="settings"){pushNavSnapshot();closeDrawer();state.view="settings";render()}
    else if(v==="profileedit"){pushNavSnapshot();closeDrawer();profileEditScreen()}
    else if(v==="layoutedit"){pushNavSnapshot();closeDrawer();screenLayoutEditor()}
    else if(v==="history"){pushNavSnapshot();closeDrawer();updateHistoryScreen()}
    else if(v==="inquiry"){pushNavSnapshot();closeDrawer();inquiryScreen("")}
    else if(v==="theme"){state.theme=state.theme==="dark"?"light":"dark";store.set("lenton_theme",state.theme);document.documentElement.dataset.theme=state.theme;closeDrawer();render()}
    else if(v==="accountswitcher"){closeDrawer();openAccountSwitcher()}
  });
  shade.querySelectorAll("[data-drawer-connection]").forEach(b=>b.onclick=e=>{
    e.stopPropagation();
    const kind=b.dataset.drawerConnection==="followers"?"followers":"following";
    const accountId=b.dataset.drawerConnectionAccount||m.id;
    if(!accountId)return;
    pushNavSnapshot();
    closeDrawer();
    profileConnectionsScreen(accountId,kind);
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
    const lists=orderedLists(await api("/api/v1/lists"));state.lists=lists;
    const hidden=hiddenListIds();
    const rows=lists.map(x=>`<div class="list-manage-row" data-list-row="${esc(x.id)}">
      <span class="list-order-grip" data-list-order-grip="${esc(x.id)}" role="button" tabindex="0" aria-label="${esc(x.title||"리스트")} 순서 변경">☰</span>
      <button class="list-open grow" data-open-list="${esc(x.id)}"><b>${esc(x.title||"리스트")}</b><span>${esc(x.replies_policy||"list")}</span></button>
      <button class="list-eye ${hidden.has(x.id)?"off":""}" data-list-visible="${esc(x.id)}">${hidden.has(x.id)?"숨김":"표시"}</button>
      <button class="list-edit" data-list-manage="${esc(x.id)}" aria-label="리스트 수정" title="리스트 수정">${lentonIcon("edit")}</button>
    </div>`).join("");
    const body=`<div class="list-toolbar"><button class="primary" data-action="newlist">＋ 새 리스트</button><span class="list-order-hint">☰ 를 잡아 순서를 바꿀 수 있어요.</span></div><div class="list-order-container">${rows||'<div class="center">리스트가 없어요.</div>'}</div>`;
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
    <div class="list-members-head">
      <div class="section-title">멤버 ${members?.length||0}</div>
      <button type="button" class="list-member-add-open" data-list-add-member="${esc(id)}">＋ 멤버 추가</button>
    </div>
    ${rows||'<div class="center">멤버가 없어요.</div>'}`;
    $("#app").innerHTML=standaloneShell(list.title||"리스트 관리",body);$("#listRepliesEdit").value=list.replies_policy||"list";bind();
  }catch(e){toast(e.message)}
}
async function listMemberAddScreen(id){
  $("#app").innerHTML=standaloneShell("멤버 추가",'<div class="center">팔로잉 목록을 불러오는 중…</div>');bind();
  try{
    if(!state.me)state.me=await api("/api/v1/accounts/verify_credentials");
    const cacheKey=scopedKey("following_cache_v1"),cached=store.get(cacheKey,null);
    const firstFollowingPromise=api("/api/v1/accounts/"+encodeURIComponent(state.me.id)+"/following",{query:{limit:"80"}}).catch(()=>[]);
    const [list,members]=await Promise.all([
      api(`/api/v1/lists/${id}`),
      api(`/api/v1/lists/${id}/accounts`,{query:{limit:"80"}})
    ]);
    const existing=new Set((members||[]).map(a=>String(a.id||"")).filter(Boolean));
    const mine=String(state.me?.id||"");
    const eligible=items=>(items||[]).filter(a=>a?.id&&String(a.id)!==mine&&!existing.has(String(a.id)));
    let following=eligible(Array.isArray(cached?.items)?cached.items:[]);
    const selected=new Map();
    let shown=[...following],loadingMore=true;

    const body=`<div class="list-member-add-page list-member-add-multi">
      <div class="list-member-add-note"><b>${esc(list.title||"리스트")}</b><span>팔로우 중인 계정을 여러 명 선택한 뒤 한 번에 추가할 수 있어요.</span></div>
      <div class="list-member-search lenton-dm-search">
        <input id="listMemberSearchInput" class="field" type="search" inputmode="search" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="이름 또는 @아이디로 필터">
      </div>
      <div id="listMemberSelected" class="dm-selected dm-selected-lenton"></div>
      <div class="list-member-list-heading">
        <span id="listMemberListHeading">팔로잉</span>
        <button type="button" class="primary list-member-confirm" id="listMemberConfirm" disabled>추가</button>
      </div>
      <div id="listMemberSearchResults" class="dm-results dm-results-lenton">${following.length?"":'<div class="center">팔로잉 목록을 불러오는 중…</div>'}</div>
    </div>`;
    $("#app").innerHTML=standaloneShell("멤버 추가",body);bind();

    const input=$("#listMemberSearchInput"),results=$("#listMemberSearchResults"),heading=$("#listMemberListHeading"),selectedBox=$("#listMemberSelected"),confirm=$("#listMemberConfirm");
    const updateHeading=q=>{
      if(!heading)return;
      const base=q?"검색 결과":"팔로잉";
      heading.textContent=loadingMore?base+" · 불러오는 중…":base;
    };
    const updateConfirm=()=>{
      if(!confirm)return;
      confirm.disabled=selected.size===0;
      confirm.textContent=selected.size?selected.size+"명 추가":"추가";
    };
    const drawSelected=()=>{
      if(!selectedBox)return;
      const values=[...selected.values()];
      selectedBox.innerHTML=values.map(a=>`<button type="button" class="dm-selected-chip" data-list-member-remove="${esc(a.id)}" aria-label="${esc(a.display_name||a.username||a.acct||"선택한 사용자")} 선택 해제">
        <img src="${esc(a.avatar_static||a.avatar||"")}" alt="">
        <span>${renderEmojiText(a.display_name||a.username||a.acct||"",a.emojis||[])}</span>
        <b>×</b>
      </button>`).join("");
      selectedBox.classList.toggle("has-selection",values.length>0);
      selectedBox.querySelectorAll("[data-list-member-remove]").forEach(b=>b.onclick=()=>{
        selected.delete(String(b.dataset.listMemberRemove));
        drawSelected();renderRows(shown);updateConfirm();
      });
      updateConfirm();
    };
    const renderRows=items=>{
      shown=(items||[]).filter(Boolean);
      results.innerHTML=shown.length?shown.map(a=>{
        const key=String(a.id),picked=selected.has(key);
        return `<button type="button" class="dm-person-row lenton-dm-person ${picked?"selected":""}" data-list-member-toggle="${esc(a.id)}" aria-pressed="${picked?"true":"false"}">
          <img class="dm-person-avatar" src="${esc(a.avatar_static||a.avatar||"")}" alt="">
          <span class="dm-person-copy"><b>${renderEmojiText(a.display_name||a.username||a.acct||"",a.emojis||[])}</b><small>@${esc(a.acct||"")}</small></span>
          <span class="dm-person-plus" aria-hidden="true">${picked?"✓":"＋"}</span>
        </button>`;
      }).join(""):(loadingMore?'<div class="center">팔로잉 목록을 불러오는 중…</div>':'<div class="center dm-empty-results">추가할 수 있는 팔로우 계정이 없어요.</div>');
      results.querySelectorAll("[data-list-member-toggle]").forEach(b=>b.onclick=()=>{
        const a=shown.find(x=>String(x.id)===String(b.dataset.listMemberToggle));if(!a)return;
        const key=String(a.id);
        if(selected.has(key))selected.delete(key);else selected.set(key,a);
        drawSelected();renderRows(shown);updateConfirm();
      });
    };
    const filterRows=()=>{
      const q=String(input?.value||"").trim().toLocaleLowerCase();
      updateHeading(q);
      if(!q){renderRows(following);return}
      renderRows(following.filter(a=>{
        const name=String(a.display_name||"").toLocaleLowerCase();
        const username=String(a.username||"").toLocaleLowerCase();
        const acct=String(a.acct||"").toLocaleLowerCase();
        return name.includes(q)||username.includes(q)||acct.includes(q)||("@"+acct).includes(q);
      }));
    };
    input.addEventListener("input",filterRows);
    input.addEventListener("keydown",e=>{if(e.key==="Enter")e.preventDefault()});
    confirm.onclick=async()=>{
      const ids=[...selected.keys()];if(!ids.length)return;
      confirm.disabled=true;confirm.textContent="추가 중…";
      try{
        const form=new URLSearchParams();for(const accountId of ids)form.append("account_ids[]",accountId);
        await api(`/api/v1/lists/${id}/accounts`,{method:"POST",form});
        toast(ids.length+"명을 리스트에 추가했어요.");
        if(state.navStack.length)state.navStack.pop();
        listManageScreen(id);
      }catch(e){
        confirm.disabled=false;updateConfirm();toast("멤버 추가 실패: "+e.message);
      }
    };

    drawSelected();
    if(following.length)filterRows();

    const first=eligible(await firstFollowingPromise);
    if(!results.isConnected)return;
    following=first;
    loadingMore=first.length>=80;
    filterRows();
    if(first.length<80){
      loadingMore=false;
      store.set(cacheKey,{at:Date.now(),items:first});
      filterRows();
      return;
    }

    setTimeout(async()=>{
      try{
        const all=eligible(await loadAllFollowing({fresh:true}));
        if(!results.isConnected)return;
        following=all;
        loadingMore=false;
        filterRows();
      }catch{
        if(!results.isConnected)return;
        loadingMore=false;
        filterRows();
      }
    },0);
  }catch(e){
    $("#app").innerHTML=standaloneShell("멤버 추가",'<div class="center">'+esc(e.message)+'</div>');bind();
  }
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
function invalidateDeletedListNavigation(id){
  const listId=String(id||"");
  if(!listId)return;
  if(String(state.listId||"")===listId)state.listId=null;
  state.navStack=(state.navStack||[]).filter(snap=>{
    if(String(snap?.listId||"")===listId)return false;
    const html=String(snap?.html||"");
    return !html.includes('data-list-manage="'+listId+'"');
  });
  if(state.pageCache)state.pageCache.home="";
  state.homeCache={};
  delete state.scrolls?.["home:"+state.homeMode+":"+listId];
  setListHidden(listId,false);
}
async function deleteList(id){
  if(!confirm("이 리스트를 삭제할까요?"))return;
  try{
    await api(`/api/v1/lists/${id}`,{method:"DELETE"});
    await loadLists();
    invalidateDeletedListNavigation(id);
    toast("리스트를 삭제했어요.");
    listsScreen();
  }catch(e){toast(e.message)}
}

function tabLabel(id){return id==="home"?"홈":id==="search"?"검색":id==="notifications"?"알림":"DM"}
function attachListOrderDrag(){
  const container=document.querySelector(".list-order-container");if(!container||container.dataset.dragReady==="1")return;
  container.dataset.dragReady="1";
  let row=null,timer=null,dragging=false,startY=0,pointerId=null;
  const finish=()=>{
    clearTimeout(timer);timer=null;
    if(!row){dragging=false;pointerId=null;return}
    if(dragging){
      row.classList.remove("dragging");
      saveListOrder([...container.querySelectorAll(".list-manage-row[data-list-row]")].map(x=>x.dataset.listRow));
      toast("리스트 순서를 저장했어요.");
    }
    row=null;dragging=false;pointerId=null;
  };
  container.querySelectorAll("[data-list-order-grip]").forEach(grip=>{
    grip.addEventListener("pointerdown",e=>{
      if(e.button!==undefined&&e.button!==0)return;
      row=grip.closest(".list-manage-row");if(!row)return;
      startY=e.clientY;dragging=false;pointerId=e.pointerId;
      try{grip.setPointerCapture(e.pointerId)}catch{}
      timer=setTimeout(()=>{if(!row)return;dragging=true;row.classList.add("dragging")},140);
    });
    grip.addEventListener("pointermove",e=>{
      if(!row||pointerId!==e.pointerId)return;
      if(!dragging&&Math.abs(e.clientY-startY)>8){clearTimeout(timer);timer=null;row=null;return}
      if(!dragging)return;
      e.preventDefault();
      const rows=[...container.querySelectorAll(".list-manage-row")].filter(x=>x!==row);
      const target=rows.find(x=>e.clientY<x.getBoundingClientRect().top+x.getBoundingClientRect().height/2);
      if(target)container.insertBefore(row,target);else container.appendChild(row);
    });
    grip.addEventListener("pointerup",finish);
    grip.addEventListener("pointercancel",finish);
    grip.addEventListener("keydown",e=>{
      if(e.key!=="ArrowUp"&&e.key!=="ArrowDown")return;
      e.preventDefault();
      const current=grip.closest(".list-manage-row");if(!current)return;
      const rows=[...container.querySelectorAll(".list-manage-row")],index=rows.indexOf(current);
      const targetIndex=e.key==="ArrowUp"?index-1:index+1;if(targetIndex<0||targetIndex>=rows.length)return;
      if(e.key==="ArrowUp")container.insertBefore(current,rows[targetIndex]);
      else container.insertBefore(rows[targetIndex],current);
      saveListOrder([...container.querySelectorAll(".list-manage-row[data-list-row]")].map(x=>x.dataset.listRow));
      grip.focus();
    });
  });
}
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
function screenLayoutEditor(mode=state.layoutEditorMode||"layout"){
  closeDrawer();
  state.layoutEditorMode=mode==="background"?"background":"layout";
  const tabs=`<div class="layout-editor-mode-tabs" role="tablist" aria-label="화면 구성 편집">
    <button type="button" class="${state.layoutEditorMode==="layout"?"active":""}" data-layout-editor-mode="layout">화면 구성</button>
    <button type="button" class="${state.layoutEditorMode==="background"?"active":""}" data-layout-editor-mode="background">배경 설정</button>
  </div>`;
  let body="";
  if(state.layoutEditorMode==="background"){
    const cfg=backgroundThemeSettings(),acct=state.me?.acct||"현재 계정",avatar=state.me?.avatar_static||state.me?.avatar||"";
    body=`<div class="background-theme-editor android-video-bg-settings">
      <div class="background-account-note">
        ${avatar?'<img src="'+esc(avatar)+'" alt="">':""}
        <div><b>이 계정 전용 배경</b><span>@${esc(acct)} · 다른 계정에는 따로 저장됩니다.</span></div>
      </div>
      <div class="layout-guide">사진을 선택하거나 편집하면 안드로이드 렌톤처럼 별도 위치 맞추기 창이 열립니다.</div>
      <input id="backgroundImageInput" type="file" accept="image/jpeg,image/png,image/webp" hidden>
      <input id="backgroundZoom" type="hidden" value="${cfg.zoom}">
      <input id="backgroundPositionX" type="hidden" value="${cfg.x}">
      <input id="backgroundPositionY" type="hidden" value="${cfg.y}">
      <button type="button" class="android-bg-setting-row" id="pickBackgroundImage"><div><b>배경 이미지 선택</b><span>${cfg.enabled?"이미지 선택됨 · JPG / PNG / WEBP":"선택된 이미지 없음 · JPG / PNG / WEBP"}</span></div><span class="chev">›</span></button>
      <button type="button" class="android-bg-setting-row" id="editBackgroundImage"><div><b>배경 이미지 편집</b><span>${cfg.enabled?"원본 전체에서 위치·확대 조정":"먼저 이미지를 선택해 주세요"}</span></div><span class="chev">›</span></button>
      <button type="button" class="android-bg-setting-row danger-row" id="removeBackgroundImage"><div><b>배경 이미지 제거</b><span>${cfg.enabled?"현재 계정의 배경 이미지를 제거합니다":"선택된 이미지 없음"}</span></div><span class="chev">›</span></button>
      <div class="background-preview opacity-live-preview" id="backgroundPreview">
        <img id="backgroundPreviewImage" alt="" hidden>
        <div id="backgroundPreviewEmpty" class="background-preview-empty">배경 이미지를 선택하면 여기서 불투명도를 미리 볼 수 있어요.</div>
      </div>
      <label class="background-slider-row android-bg-opacity"><div><b>배경 불투명도</b><span id="backgroundOpacityValue">${cfg.opacity}%</span></div><input id="backgroundOpacity" type="range" min="0" max="100" step="1" value="${cfg.opacity}"></label>
      <div class="background-apply-row"><button type="button" class="primary" id="applyBackgroundTheme">적용</button></div>
    </div>`;
  }else{
    const cfg=mainTabLayout();
    const rows=cfg.order.map((id,i)=>`<div class="layout-tab-row" data-layout-id="${id}">
      <span class="layout-grip">☰</span><b>${tabLabel(id)}</b>
      <button data-layout-up="${id}" ${i===0?"disabled":""}>↑</button>
      <button data-layout-down="${id}" ${i===cfg.order.length-1?"disabled":""}>↓</button>
      <button class="layout-toggle ${cfg.hidden.has(id)?"off":""}" data-layout-toggle="${id}">${cfg.hidden.has(id)?"숨김":"표시"}</button>
    </div>`).join("");
    body=`<div class="layout-guide">하단 탭의 순서와 표시 여부를 편집할 수 있습니다. 숨긴 탭은 화면과 데이터를 지우지 않고 하단 메뉴와 좌우 스와이프 대상에서만 제외됩니다.</div>
      <div class="section-title">하단 탭</div><div class="layout-tab-rows">${rows}</div>
      <div class="section-title">초기화</div><button class="row reset-layout" data-action="resetLayout">기본값으로 초기화</button>`;
  }
  $("#app").innerHTML=standaloneShell("화면 구성 편집",tabs+body);bind();
  document.querySelectorAll("[data-layout-editor-mode]").forEach(b=>b.addEventListener("click",()=>screenLayoutEditor(b.dataset.layoutEditorMode)));
  if(state.layoutEditorMode==="background"){bindBackgroundEditor();hydrateBackgroundEditor().catch(()=>{})}
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
    '<div class="notice">PWA 빌드, iOS/PWA 환경, 서버 정보가 함께 포함됩니다. 로그인 토큰이나 비밀번호는 포함하지 않습니다.</div>'+
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
    "렌톤 iPhone PWA 빌드 : "+(state.buildInfo?.pwaRevision||String(currentPwaToken()||"unknown")),
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
async function loadPwaChangelog(){
  try{
    const r=await fetch("./changelog.json?ts="+Date.now(),{cache:"no-store"});
    if(!r.ok)return[];
    const data=await r.json();
    return Array.isArray(data)?data:[];
  }catch{return[]}
}
function pwaRevisionLabel(build){
  const rev=String(build?.pwaRevision||"").trim();
  return rev?rev.slice(0,10):(String(currentPwaToken()||"").replace(/^pwa-/,"").split("-")[0]||"unknown");
}
function pwaChangelogMarkup(entries,{latestOnly=false}={}){
  const list=(Array.isArray(entries)?entries:[]).slice(0,latestOnly?1:12);
  if(!list.length)return '<div class="notice">PWA 업데이트 내역이 아직 없어요.</div>';
  return list.map(entry=>{
    const changes=Array.isArray(entry?.changes)?entry.changes:[];
    return '<div class="update-entry pwa-update-entry"><div class="update-head"><b>'+esc(entry?.title||"PWA 업데이트")+'</b><span>'+esc(entry?.date||"")+'</span></div>'+
      (changes.length?'<ul>'+changes.map(v=>'<li>'+esc(v)+'</li>').join("")+'</ul>':"")+'</div>';
  }).join("");
}
async function showCurrentReleaseNotes(){
  const [build,entries]=await Promise.all([
    fetch("./build.json?ts="+Date.now(),{cache:"no-store"}).then(r=>r.ok?r.json():null).catch(()=>null),
    loadPwaChangelog()
  ]);
  const body='<div class="settings pwa-release-screen"><div class="section current-release">'+
    '<div class="update-head"><b>PWA '+esc(pwaRevisionLabel(build))+'</b><span>현재 빌드</span></div>'+
    '</div><div class="section pwa-changelog-list">'+pwaChangelogMarkup(entries)+'</div></div>';
  $("#app").innerHTML=standaloneShell("PWA 업데이트 내역",body);bind();
}
async function checkPwaUpdate(){
  toast("업데이트를 확인하고 있어요.");
  try{
    const r=await fetch("./build.json?ts="+Date.now(),{cache:"no-store"});if(!r.ok)throw new Error("업데이트 정보를 불러오지 못했어요.");
    const remote=await r.json();state.buildInfo=remote;
    const current=currentPwaToken(),next=String(remote?.cacheToken||"");
    if(next&&current&&next!==current){
      state.updateAvailable=remote;
      if(hasUnsavedLentonWork()){toast("새 PWA 빌드가 있지만 작성 중인 내용이 있어 자동 적용하지 않았어요.");return}
      toast("새 PWA 빌드를 적용합니다.");
      setTimeout(()=>activateLatestPwaNow(),250);
      return;
    }
    const entries=await loadPwaChangelog();
    const body='<div class="settings pwa-release-screen"><div class="section current-release">'+
      '<div class="update-head"><b>PWA '+esc(pwaRevisionLabel(remote))+'</b><span>현재 최신 빌드</span></div>'+
      '</div><div class="section pwa-changelog-list">'+pwaChangelogMarkup(entries,{latestOnly:true})+'</div></div>';
    $("#app").innerHTML=standaloneShell("업데이트 확인",body,"","backToUpdateHistory");bind();
  }catch(e){toast(e.message||"업데이트 확인에 실패했어요.")}
}
async function updateHistoryScreen(){
  let build=null;
  try{const r=await fetch("./build.json?ts="+Date.now(),{cache:"no-store"});if(r.ok)build=await r.json()}catch{}
  const info='<div class="section update-settings-group"><h3>현재 버전</h3>'+
    '<div class="kv"><span>PWA 빌드</span><b>'+esc(pwaRevisionLabel(build))+'</b></div>'+
    '<div class="kv"><span>업데이트 방식</span><b>자동 업데이트</b></div></div>';
  const body='<div class="settings update-settings-screen">'+info+
    '<div class="section update-settings-group"><h3>업데이트</h3>'+
      '<button class="settings-link update-settings-link" data-action="checkPwaUpdate"><span><b>업데이트 확인</b><small>iPhone PWA의 최신 빌드를 확인합니다</small></span><span class="settings-chevron">›</span></button>'+
      '<button class="settings-link update-settings-link" data-action="currentReleaseNotes"><span><b>PWA 업데이트 내역</b><small>iPhone PWA에서 바뀐 내용만 확인합니다</small></span><span class="settings-chevron">›</span></button>'+
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
        <div class="ui-scale-control"><span>가</span><input id="uiScaleRange" type="range" min="60" max="120" step="5" value="${Math.round(state.uiScale*100)}"><span class="large">가</span></div>
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
function closeStatusPopup(){
  const shade=document.querySelector(".android-popup-shade.status-popup");
  if(!shade)return;
  try{shade._lentonCleanup?.()}catch{}
  shade.remove();
}
function positionStatusPopup(shade,anchor){
  const popup=shade?.querySelector(".android-popup");
  if(!popup||!anchor?.getBoundingClientRect)return;
  const rect=anchor.getBoundingClientRect(),vv=window.visualViewport;
  const viewLeft=Number(vv?.offsetLeft||0),viewTop=Number(vv?.offsetTop||0);
  const viewWidth=Number(vv?.width||window.innerWidth||document.documentElement.clientWidth||0);
  const viewHeight=Number(vv?.height||window.innerHeight||document.documentElement.clientHeight||0);
  const gap=6,edge=8,pw=popup.offsetWidth||210,ph=popup.offsetHeight||0;
  const viewRight=viewLeft+viewWidth,viewBottom=viewTop+viewHeight;
  let left=rect.right-pw;
  left=Math.max(viewLeft+edge,Math.min(left,viewRight-pw-edge));
  const below=rect.bottom+gap,above=rect.top-ph-gap;
  const top=below+ph<=viewBottom-edge?below:Math.max(viewTop+edge,above);
  popup.style.position="fixed";
  popup.style.left=Math.round(left)+"px";
  popup.style.right="auto";
  popup.style.top=Math.round(top)+"px";
  popup.style.transform="none";
}
async function openStatusMenu(id,anchor){
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
    positionStatusPopup(shade,anchor);
    const closeOnScroll=()=>closeStatusPopup();
    const closeOnViewportChange=()=>closeStatusPopup();
    window.addEventListener("scroll",closeOnScroll,{passive:true,capture:true});
    document.addEventListener("scroll",closeOnScroll,{passive:true,capture:true});
    window.visualViewport?.addEventListener("scroll",closeOnViewportChange,{passive:true});
    window.visualViewport?.addEventListener("resize",closeOnViewportChange,{passive:true});
    shade._lentonCleanup=()=>{
      window.removeEventListener("scroll",closeOnScroll,true);
      document.removeEventListener("scroll",closeOnScroll,true);
      window.visualViewport?.removeEventListener("scroll",closeOnViewportChange);
      window.visualViewport?.removeEventListener("resize",closeOnViewportChange);
    };
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
function threadStatusCard(raw,{connectBottom=false,current=false,replyCountOverride=null}={}){
  const cls=["thread-node",connectBottom?"thread-connect-bottom":"",current?"thread-current":""].filter(Boolean).join(" ");
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
      const cur=raw.reblog||raw,idNow=String(cur.id||"");
      const next=nodes[i+1]?.reblog||nodes[i+1]||null,nextParentId=String(next?.in_reply_to_id||"");
      const connectBottom=!!idNow&&nextParentId===idNow;
      const derivedReplies=allNodes.filter(x=>String((x.reblog||x)?.in_reply_to_id||"")===idNow).length;
      const replyCountOverride=Math.max(Number(cur.replies_count||0),derivedReplies);
      return threadStatusCard(raw,{connectBottom,current:idNow===String(st.id||""),replyCountOverride});
    }).join("");
    $("#app").innerHTML=standaloneShell("게시물",body);bind();
  }catch(e){toast(e.message)}
}

async function newList(){
  pushNavSnapshot();
  const body=`<div class="list-create-editor">
    <label>리스트 이름<input id="newListTitle" class="field" maxlength="100" placeholder="새 리스트 이름"></label>
    <label>답글 표시 범위<select id="newListReplies" class="field">
      <option value="list" selected>리스트 멤버의 답글</option>
      <option value="followed">팔로우 중인 사람의 답글</option>
      <option value="none">답글 숨김</option>
    </select></label>
    <label class="check-row"><input id="newListExclusive" type="checkbox"> 홈 타임라인에서 제외</label>
    <label class="check-row"><input id="newListVisible" type="checkbox" checked> 홈에 리스트 표시</label>
    <div class="list-create-help">만든 뒤 리스트 관리 화면에서 멤버를 여러 명 한 번에 추가할 수 있어요.</div>
    <div class="list-create-actions"><button type="button" class="primary" id="createListConfirm">리스트 만들기</button></div>
  </div>`;
  $("#app").innerHTML=standaloneShell("새 리스트",body);bind();
  const title=$("#newListTitle"),confirm=$("#createListConfirm");
  setTimeout(()=>title?.focus(),40);
  confirm.onclick=async()=>{
    const name=String(title?.value||"").trim();if(!name){toast("리스트 이름을 입력해 주세요.");title?.focus();return}
    const replies_policy=$("#newListReplies")?.value||"list",exclusive=!!$("#newListExclusive")?.checked,visible=!!$("#newListVisible")?.checked;
    confirm.disabled=true;confirm.textContent="만드는 중…";
    try{
      let created;
      try{
        created=await api("/api/v1/lists",{method:"POST",form:{title:name,replies_policy,exclusive:String(exclusive)}});
      }catch{
        created=await api("/api/v1/lists",{method:"POST",form:{title:name,replies_policy}});
      }
      if(created?.id)setListHidden(String(created.id),!visible);
      await loadLists();
      if(state.navStack.length)state.navStack.pop();
      toast("리스트를 만들었어요.");
      listsScreen();
    }catch(e){
      confirm.disabled=false;confirm.textContent="리스트 만들기";toast(e.message);
    }
  };
  title?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();confirm.click()}});
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
    const emojiButton=$("#composeEmoji",m),emojiBox=$("#emojiPicker",m);
    const closeEmojiPicker=(refocus=false)=>{
      if(!emojiBox)return;
      emojiBox.hidden=true;
      if(refocus){
        const textarea=m.querySelector(`[data-t="${activePart}"]`);
        try{textarea?.focus({preventScroll:true})}catch{textarea?.focus()}
      }
    };
    const renderEmojiPicker=async()=>{
      if(!emojiBox)return;
      const textarea=m.querySelector(`[data-t="${activePart}"]`);
      if(!emojiBox.hidden){closeEmojiPicker(true);return}
      try{textarea?.focus({preventScroll:true})}catch{textarea?.focus()}
      emojiBox.hidden=false;
      emojiBox.innerHTML='<div class="emoji-picker-head"><b>서버 이모지</b><button type="button" class="emoji-picker-close" aria-label="이모지 선택 닫기">×</button></div><div class="emoji-picker-loading">이모지 불러오는 중…</div>';
      emojiBox.querySelector(".emoji-picker-close").onclick=()=>closeEmojiPicker(true);
      const emojis=await loadCustomEmojis();
      if(!emojiBox.isConnected||emojiBox.hidden)return;
      emojiBox.innerHTML='<div class="emoji-picker-head"><b>서버 이모지</b><button type="button" class="emoji-picker-close" aria-label="이모지 선택 닫기">×</button></div><div class="emoji-picker-grid">'+(emojis.length?emojis.map(e=>`<button type="button" data-emoji="${esc(e.shortcode)}" title=":${esc(e.shortcode)}:"><img src="${esc(e.static_url||e.url)}" alt=":${esc(e.shortcode)}:"></button>`).join(""):'<div class="emoji-picker-empty">서버 이모지가 없어요.</div>')+'</div>';
      emojiBox.querySelector(".emoji-picker-close").onclick=()=>closeEmojiPicker(true);
      emojiBox.querySelectorAll("[data-emoji]").forEach(b=>b.onclick=()=>{
        const textarea=m.querySelector(`[data-t="${activePart}"]`);if(!textarea)return;
        const ins=":"+b.dataset.emoji+":",start=textarea.selectionStart??textarea.value.length,end=textarea.selectionEnd??start;
        parts[activePart].text=textarea.value.slice(0,start)+ins+textarea.value.slice(end);
        textarea.value=parts[activePart].text;
        closeEmojiPicker(true);
        textarea.setSelectionRange(start+ins.length,start+ins.length);
      });
    };
    if(emojiButton){
      emojiButton.addEventListener("pointerdown",e=>{e.preventDefault();e.stopPropagation();renderEmojiPicker()});
      emojiButton.addEventListener("click",e=>{e.preventDefault();e.stopPropagation()});
      emojiButton.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();renderEmojiPicker()}});
    }
    $("#parts",m)?.addEventListener("pointerdown",()=>{if(emojiBox&&!emojiBox.hidden)closeEmojiPicker(false)},{passive:true});
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
          const posted=await api("/api/v1/statuses",{method:"POST",form});
          if(i===0&&reply){
            const directParent=String(posted?.in_reply_to_id||reply?.id||"");
            if(directParent)markReplyNeededHandledMany([directParent],{removeDom:true});
          }
          replyId=posted.id;
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
function scrollMainViewToTop(view=state.view,{smooth=false}={}){
  const behavior=smooth?"smooth":"auto";
  const apply=()=>{
    try{window.scrollTo({top:0,left:0,behavior})}catch{window.scrollTo(0,0)}
    document.documentElement.scrollTop=0;
    document.body.scrollTop=0;
    const main=document.querySelector(".app.lenton-view-"+view+" .main");
    if(main){
      try{main.scrollTo({top:0,left:0,behavior})}catch{main.scrollTop=0}
      if(!smooth)main.scrollTop=0;
    }
    if(view==="home"){
      const page=document.querySelector('[data-home-page="'+state.homeMode+'"]');
      if(page)page.scrollTop=0;
    }else if(view==="notifications"){
      const page=document.querySelector('[data-notification-page="'+state.notificationMode+'"]');
      if(page)page.scrollTop=0;
    }
  };
  apply();
  requestAnimationFrame(apply);
  setTimeout(apply,smooth?180:40);
}
function scrollHomeToTop(opts={}){scrollMainViewToTop("home",opts)}
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
      try{
        if(state.homeMode==="public"&&!state.listId)await refreshPublicTimeline();
        else await homeView({silent:true,forceFresh:true});
      }finally{setTimeout(cleanup,120)}
    }else setTimeout(cleanup,170);
  },{passive:true});
  main.addEventListener("touchcancel",cleanup,{passive:true});
}
function attachNotificationPullToRefresh(){
  const main=document.querySelector(".app.lenton-view-notifications .main"),pager=document.querySelector("[data-notification-pager]");
  if(!main||!pager||main.dataset.notificationPullRefresh==="1")return;
  main.dataset.notificationPullRefresh="1";
  let startY=0,startX=0,drag=0,active=false,indicator=null;
  const top=()=>Math.max(window.scrollY||0,document.documentElement.scrollTop||0,main.scrollTop||0)<=2;
  const cleanup=()=>{
    indicator?.remove();indicator=null;drag=0;active=false;startY=0;startX=0;
    main.style.transform="";main.style.transition="";
  };
  main.addEventListener("touchstart",e=>{
    if(e.touches?.length!==1||!top())return;
    startY=e.touches[0].clientY;startX=e.touches[0].clientX;drag=0;active=false;
  },{passive:true});
  main.addEventListener("touchmove",e=>{
    if(!startY||e.touches?.length!==1)return;
    const dy=e.touches[0].clientY-startY,dx=e.touches[0].clientX-startX;
    if(dy<=0||Math.abs(dx)>=Math.abs(dy)){
      if(active)cleanup();
      return;
    }
    if(!active&&dy<10)return;
    active=true;
    e.preventDefault();
    drag=Math.min(96,dy*.46);
    if(!indicator){
      indicator=document.createElement("div");
      indicator.className="pull-refresh-indicator";
      indicator.innerHTML="<span>↻</span>";
      main.prepend(indicator);
    }
    indicator.style.transform="translate3d(-50%,"+Math.min(54,drag-44)+"px,0) rotate("+Math.min(220,drag*3)+"deg)";
    main.style.transform="translate3d(0,"+drag+"px,0)";
  },{passive:false});
  main.addEventListener("touchend",async()=>{
    if(!active){startY=0;startX=0;return}
    const should=drag>=58;
    startY=0;startX=0;
    main.style.transition="transform 160ms ease";
    main.style.transform="translate3d(0,0,0)";
    if(should){
      if(indicator)indicator.classList.add("loading");
      try{
        await notificationsView(state.notificationMode==="replyNeeded",true);
      }finally{
        setTimeout(cleanup,120);
      }
    }else{
      setTimeout(cleanup,170);
    }
  },{passive:true});
  main.addEventListener("touchcancel",cleanup,{passive:true});
}

function attachNotificationTabSwipe(){
  const pager=document.querySelector("[data-notification-pager]");
  if(!pager||pager.dataset.notificationSwipe==="1")return;
  pager.dataset.notificationSwipe="1";
  const track=pager.querySelector("[data-notification-track]"),tabs=document.querySelector("[data-notification-tabs]");
  if(!track||!tabs)return;
  const modes=notificationModes();let start=null,active=false,width=0,startIndex=0;
  const indicator=tabs.querySelector(".notify-tab-indicator");
  const settle=(index,animate=true)=>{
    const mode=modes[Math.max(0,Math.min(modes.length-1,index))];
    setNotificationPagerMode(mode,animate);
  };
  pager.addEventListener("touchstart",e=>{
    if(e.touches?.length!==1)return;
    const p=gesturePoint(e);
    start=p;active=false;width=Math.max(1,pager.clientWidth);startIndex=Math.max(0,modes.indexOf(state.notificationMode||"all"));
    track.style.transition="none";if(indicator)indicator.style.transition="none";
  },{passive:true});
  pager.addEventListener("touchmove",e=>{
    if(!start||e.touches?.length!==1)return;
    const p=gesturePoint(e),dx=p.x-start.x,dy=p.y-start.y;
    if(!active){
      if(Math.abs(dy)>12&&Math.abs(dy)>=Math.abs(dx)){start=null;return}
      if(Math.abs(dx)<6||Math.abs(dx)<=Math.abs(dy))return;
      active=true;
    }
    e.preventDefault();
    let shown=dx;
    if((startIndex===0&&dx>0)||(startIndex===modes.length-1&&dx<0))shown=dx*.22;
    track.style.transform="translate3d("+(-startIndex*width+shown)+"px,0,0)";
    const frac=Math.max(0,Math.min(modes.length-1,startIndex-shown/width));
    positionNotificationIndicator(tabs,indicator,frac,modes,false);
  },{passive:false});
  pager.addEventListener("touchend",e=>{
    if(!start)return;
    const p=gesturePoint(e),dx=p.x-start.x,dt=Math.max(1,p.time-start.time),vx=dx/dt;
    if(!active){start=null;return}
    let target=startIndex;
    if(dx<0&&startIndex<modes.length-1&&(Math.abs(dx)>width*.18||vx<-.45))target=startIndex+1;
    else if(dx>0&&startIndex>0&&(Math.abs(dx)>width*.18||vx>.45))target=startIndex-1;
    start=null;active=false;settle(target,true);
  },{passive:true});
  pager.addEventListener("touchcancel",()=>{if(start){start=null;active=false;settle(startIndex,true)}},{passive:true});
}

function attachLentonGestures(){
  const bottom=document.querySelector(".bottom");
  attachInteractiveMainSwipe(bottom);

  const app=document.querySelector(".app");
  attachEdgeDrawerSwipe(app);

  const drawer=document.querySelector(".drawer");
  attachDrawerCloseSwipe(drawer);

  if(state.view==="home"){attachInteractiveHomeSwipe(document.querySelector("[data-home-pager]"));attachHomePullToRefresh()}
  if(state.view==="notifications"){attachNotificationTabSwipe();attachNotificationPullToRefresh()}

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
  document.querySelectorAll("[data-list-add-member]").forEach(b=>b.onclick=()=>{pushNavSnapshot();listMemberAddScreen(b.dataset.listAddMember)});
  document.querySelectorAll("[data-list-visible]").forEach(b=>b.onclick=()=>{const id=b.dataset.listVisible;setListHidden(id,!hiddenListIds().has(id));listsScreen()});
  document.querySelectorAll("[data-list-save]").forEach(b=>b.onclick=()=>saveListSettings(b.dataset.listSave));
  document.querySelectorAll("[data-list-delete]").forEach(b=>b.onclick=()=>deleteList(b.dataset.listDelete));
  document.querySelectorAll("[data-layout-up]").forEach(b=>b.onclick=()=>mutateLayout(b.dataset.layoutUp,-1));
  document.querySelectorAll("[data-layout-down]").forEach(b=>b.onclick=()=>mutateLayout(b.dataset.layoutDown,1));
  document.querySelectorAll("[data-layout-toggle]").forEach(b=>b.onclick=()=>mutateLayout(b.dataset.layoutToggle,0));
  document.querySelectorAll("[data-view]").forEach(b=>b.onclick=()=>{
    const target=b.dataset.view,wasCurrent=target===state.view;
    rememberScroll();
    if(wasCurrent){
      state.listId=null;
      scrollMainViewToTop(target,{smooth:true});
      state.scrolls[scrollKey()]=0;
      if(target==="home"){
        setTimeout(async()=>{
          try{
            if(state.homeMode==="public")await refreshPublicTimeline();
            else await homeView({silent:true,forceFresh:true});
          }finally{
            scrollMainViewToTop("home");
            state.scrolls[scrollKey()]=0;
          }
        },120);
      }
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
    if(a==="settings"){if(state.view!=="settings")pushNavSnapshot();state.view="settings";render()}
    else if(a==="drawer")openDrawer()
    else if(a==="compose")compose()
    else if(a==="newdm"){pushNavSnapshot();newDmScreen()}
    else if(a==="backScreen"||a==="backMain")goBackScreen()
    else if(a==="backToUpdateHistory"){
      const last=state.navStack[state.navStack.length-1];
      if(last?.html?.includes("update-settings-screen"))state.navStack.pop();
      updateHistoryScreen();
    }
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
    else if(a==="checkPwaUpdate"){pushNavSnapshot();checkPwaUpdate()}
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
    else if(a==="statusmenu")openStatusMenu(b.dataset.id,b)
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
  document.querySelectorAll("[data-search-following-toggle]").forEach(b=>b.onclick=async()=>{
    const next=!searchFollowingOnlyEnabled();
    store.set(scopedKey("search_following_only"),next);

    // 버튼은 네트워크 조회를 기다리지 않고 즉시 눌린 상태로 보이게 한다.
    syncSearchFilterBar();

    if(!next){
      requestAnimationFrame(()=>renderSearchResults());
      return;
    }

    try{
      await ensureSearchFollowingIds();
      renderSearchResults();
    }catch(e){
      store.set(scopedKey("search_following_only"),false);
      syncSearchFilterBar();
      toast(e.message);
    }
  });
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
  document.querySelectorAll("[data-notify]").forEach(b=>b.onclick=()=>setNotificationPagerMode(b.dataset.notify==="mention"?"replyNeeded":"all",true));
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
  $("#uiScaleRange")?.addEventListener("input",e=>{state.uiScale=Math.max(.6,Math.min(1.2,Number(e.target.value||100)/100));store.set("lenton_ui_scale",state.uiScale);const label=$("#uiScaleValue");if(label)label.textContent=Math.round(state.uiScale*100)+"%";applyAndroidSpecMetrics()});
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
  requestAnimationFrame(()=>attachHomeInfiniteScroll());
  restoreScroll();
  attachListOrderDrag();
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
function foregroundRealtimeShouldRun(){
  return !!(state.session&&state.me&&document.visibilityState==="visible"&&navigator.onLine!==false&&"WebSocket" in window);
}
function foregroundRealtimeConnected(){
  return !!(state.realtimeSocket&&state.realtimeSocket.readyState===WebSocket.OPEN);
}
function normalizeStreamingBase(raw=""){
  let value=String(raw||"").trim();
  if(!value)value="https://"+String(state.session?.host||"");
  if(!/^[a-z]+:\/\//i.test(value))value="https://"+value.replace(/^\/+/, "");
  const u=new URL(value);
  if(u.protocol==="https:")u.protocol="wss:";
  else if(u.protocol==="http:")u.protocol="ws:";
  else if(u.protocol!=="wss:"&&u.protocol!=="ws:")u.protocol="wss:";
  let path=String(u.pathname||"").replace(/\/+$/,"");
  if(!/\/api\/v1\/streaming$/i.test(path)){
    path=(path&&path!=="/"?path:"")+"/api/v1/streaming";
  }
  u.pathname=path||"/api/v1/streaming";
  u.search="";
  u.hash="";
  return u.toString();
}
async function discoverForegroundStreamingBase(){
  const host=String(state.session?.host||"");
  if(!host)throw new Error("스트리밍 서버 정보가 없습니다.");
  if(state.realtimeStreamingHost===host&&state.realtimeStreamingBase)return state.realtimeStreamingBase;
  let raw="";
  try{
    const inst=await api("/api/v2/instance");
    raw=inst?.configuration?.urls?.streaming||inst?.urls?.streaming_api||"";
  }catch{}
  const base=normalizeStreamingBase(raw||("https://"+host));
  state.realtimeStreamingHost=host;
  state.realtimeStreamingBase=base;
  return base;
}
async function buildForegroundStreamingUrl(authMode="protocol"){
  const base=await discoverForegroundStreamingBase();
  const u=new URL(base);
  u.searchParams.set("stream","user");
  if(authMode==="query")u.searchParams.set("access_token",String(state.session?.token||""));
  return u.toString();
}
function scheduleRealtimeBind(){
  if(state.realtimeBindScheduled)return;
  state.realtimeBindScheduled=true;
  requestAnimationFrame(()=>{
    state.realtimeBindScheduled=false;
    if(state.view==="home")bind();
  });
}
function realtimeCardStatusId(raw){
  return String((raw?.reblog||raw)?.id||"");
}
function prependRealtimeCard(mode,raw){
  if(state.view!=="home"||state.listId)return;
  const page=document.querySelector('[data-home-page="'+mode+'"]');
  if(!page)return;
  const y=window.scrollY||document.documentElement.scrollTop||0;
  const active=state.homeMode===mode;
  const before=active?page.scrollHeight:0;
  const empty=page.querySelector(":scope > .center");
  if(empty)empty.remove();
  const items=state.homePagerData?.[mode]||[];
  const first=page.querySelector(":scope > .status");
  const html=statusCard(raw,{replyCountOverride:visibleReplyCount(raw,items)});
  if(first)first.insertAdjacentHTML("beforebegin",html);
  else page.insertAdjacentHTML("afterbegin",html);
  scheduleRealtimeBind();
  requestAnimationFrame(()=>{
    if(active&&y>96){
      const delta=Math.max(0,page.scrollHeight-before);
      if(delta)window.scrollTo(0,y+delta);
    }
    syncHomePagerHeight();
  });
}
function applyForegroundRealtimeUpdate(raw){
  const st=raw?.reblog||raw;
  if(!st||st.visibility==="direct")return;
  const rawId=String(statusId(raw)||"");
  if(!rawId)return;
  const data=state.homePagerData||{home:[],public:[]};
  const oldHome=Array.isArray(data.home)?data.home:[];
  const oldPublic=Array.isArray(data.public)?data.public:[];
  const homeKnown=oldHome.some(x=>String(statusId(x)||"")===rawId);
  const publicKnown=oldPublic.some(x=>String(statusId(x)||"")===rawId);
  data.home=mergeTimelineUnlimited([raw],oldHome);
  if(publicHomeStatus(raw))data.public=mergeTimelineUnlimited([raw],oldPublic);
  state.homePagerData=data;
  if(state.homeMode==="home")state.timelineItems=data.home;
  else if(state.homeMode==="public")state.timelineItems=data.public;
  homeSnapshotWrite(data);
  if(!homeKnown)prependRealtimeCard("home",raw);
  if(publicHomeStatus(raw)&&!publicKnown)prependRealtimeCard("public",raw);
}
function removeForegroundRealtimeStatus(id){
  const target=String(id||"");if(!target)return;
  const data=state.homePagerData||{home:[],public:[]};
  const removedByMode={home:new Set(),public:new Set()};
  for(const mode of ["home","public"]){
    const source=Array.isArray(data[mode])?data[mode]:[];
    const kept=[];
    for(const raw of source){
      const rawId=String(statusId(raw)||""),cardId=realtimeCardStatusId(raw);
      if(rawId===target||cardId===target)removedByMode[mode].add(cardId);
      else kept.push(raw);
    }
    data[mode]=kept;
  }
  state.homePagerData=data;
  state.timelineItems=data[state.homeMode]||data.home;
  homeSnapshotWrite(data);
  if(state.view==="home"&&!state.listId){
    for(const mode of ["home","public"]){
      const page=document.querySelector('[data-home-page="'+mode+'"]');if(!page)continue;
      for(const cardId of removedByMode[mode]){
        const stillExists=(data[mode]||[]).some(raw=>realtimeCardStatusId(raw)===cardId);
        if(stillExists)continue;
        page.querySelectorAll('[data-status-id="'+CSS.escape(cardId)+'"]').forEach(el=>el.remove());
      }
    }
    requestAnimationFrame(syncHomePagerHeight);
  }
}
function applyForegroundRealtimeStatusUpdate(updated){
  const id=String(updated?.id||"");if(!id)return;
  const data=state.homePagerData||{home:[],public:[]};
  let changed=false;
  for(const mode of ["home","public"]){
    const next=[];
    for(const raw of (Array.isArray(data[mode])?data[mode]:[])){
      const st=raw?.reblog||raw;
      if(String(st?.id||"")!==id){next.push(raw);continue}
      changed=true;
      const patched=raw?.reblog?{...raw,reblog:updated}:updated;
      if(mode==="public"&&!publicHomeStatus(patched))continue;
      next.push(patched);
    }
    data[mode]=next;
  }
  if(!changed)return;
  state.homePagerData=data;
  state.timelineItems=data[state.homeMode]||data.home;
  homeSnapshotWrite(data);
  if(state.view==="home"&&!state.listId){
    for(const mode of ["home","public"]){
      const page=document.querySelector('[data-home-page="'+mode+'"]');if(!page)continue;
      const raw=(data[mode]||[]).find(x=>realtimeCardStatusId(x)===id);
      page.querySelectorAll('[data-status-id="'+CSS.escape(id)+'"]').forEach(card=>{
        if(!raw){card.remove();return}
        const holder=document.createElement("div");
        holder.innerHTML=statusCard(raw,{replyCountOverride:visibleReplyCount(raw,data[mode])});
        const next=holder.firstElementChild;if(next)card.replaceWith(next);
      });
    }
    scheduleRealtimeBind();
    requestAnimationFrame(syncHomePagerHeight);
  }
}
function handleForegroundRealtimeMessage(event){
  let msg=null;
  try{msg=JSON.parse(String(event?.data||""))}catch{return}
  const kind=String(msg?.event||"");
  let payload=msg?.payload;
  if(kind==="delete"){
    removeForegroundRealtimeStatus(payload);
    return;
  }
  if(typeof payload==="string"){
    try{payload=JSON.parse(payload)}catch{return}
  }
  if(kind==="update")applyForegroundRealtimeUpdate(payload);
  else if(kind==="status.update")applyForegroundRealtimeStatusUpdate(payload);
  else if(kind==="filters_changed"&&state.view==="home"){
    refreshHomeIncremental().catch(()=>{});
  }
}
function stopForegroundRealtime(){
  state.realtimeIntent=Number(state.realtimeIntent||0)+1;
  clearTimeout(state.realtimeReconnectTimer);state.realtimeReconnectTimer=null;
  const ws=state.realtimeSocket;state.realtimeSocket=null;state.realtimeConnectionKey="";
  if(ws&&(ws.readyState===WebSocket.OPEN||ws.readyState===WebSocket.CONNECTING)){
    try{ws.close(1000,"pause")}catch{}
  }
}
function scheduleForegroundRealtimeReconnect(intent,delay=0){
  clearTimeout(state.realtimeReconnectTimer);
  if(intent!==state.realtimeIntent||!foregroundRealtimeShouldRun())return;
  const attempt=Math.max(0,Number(state.realtimeReconnectAttempt||0));
  const wait=delay||Math.min(30000,1500*Math.pow(2,attempt));
  state.realtimeReconnectAttempt=Math.min(6,attempt+1);
  state.realtimeReconnectTimer=setTimeout(()=>startForegroundRealtime(),wait);
}
async function startForegroundRealtime(){
  if(!foregroundRealtimeShouldRun()){stopForegroundRealtime();return}
  const key=String(state.session?.host||"")+"|"+String(state.me?.id||"");
  if(state.realtimeSocket&&state.realtimeConnectionKey===key&&(state.realtimeSocket.readyState===WebSocket.OPEN||state.realtimeSocket.readyState===WebSocket.CONNECTING))return;
  stopForegroundRealtime();
  const intent=state.realtimeIntent;
  const authMode=state.realtimeAuthMode==="query"?"query":"protocol";
  let url="";
  try{url=await buildForegroundStreamingUrl(authMode)}catch{
    scheduleForegroundRealtimeReconnect(intent,3000);return;
  }
  if(intent!==state.realtimeIntent||!foregroundRealtimeShouldRun())return;
  let ws=null,opened=false;
  try{
    ws=authMode==="protocol"?new WebSocket(url,String(state.session.token||"")):new WebSocket(url);
  }catch{
    if(authMode==="protocol"){state.realtimeAuthMode="query";scheduleForegroundRealtimeReconnect(intent,200)}
    else scheduleForegroundRealtimeReconnect(intent,3000);
    return;
  }
  state.realtimeSocket=ws;state.realtimeConnectionKey=key;
  ws.onopen=()=>{
    if(intent!==state.realtimeIntent){try{ws.close()}catch{};return}
    opened=true;state.realtimeReconnectAttempt=0;
  };
  ws.onmessage=e=>{if(intent===state.realtimeIntent)handleForegroundRealtimeMessage(e)};
  ws.onerror=()=>{};
  ws.onclose=()=>{
    if(state.realtimeSocket===ws)state.realtimeSocket=null;
    if(intent!==state.realtimeIntent||!foregroundRealtimeShouldRun())return;
    if(!opened&&authMode==="protocol"){
      state.realtimeAuthMode="query";
      scheduleForegroundRealtimeReconnect(intent,200);
      return;
    }
    scheduleForegroundRealtimeReconnect(intent);
  };
}

function refreshVisiblePublicQuickly(){
  if(foregroundRealtimeConnected())return;
  if(document.visibilityState!=="visible"||!state.session)return;
  if(state.view!=="home"||state.homeMode!=="public"||state.listId)return;
  refreshPublicLatestPage({fillBackground:false}).catch(()=>{});
}
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="visible"){
    applyAutomaticUpdate();refreshUnreadNotificationCount();refreshVisiblePublicQuickly();startForegroundRealtime();
  }else stopForegroundRealtime();
});
window.addEventListener("focus",()=>{applyAutomaticUpdate();refreshUnreadNotificationCount();refreshVisiblePublicQuickly();startForegroundRealtime()});
window.addEventListener("online",()=>startForegroundRealtime());
window.addEventListener("offline",()=>stopForegroundRealtime());
setInterval(()=>{if(document.visibilityState==="visible"){applyAutomaticUpdate();refreshUnreadNotificationCount()}},30000);
setInterval(()=>refreshVisiblePublicQuickly(),15000);
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
  await applySavedBackgroundTheme().catch(()=>{});
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
    setTimeout(()=>startForegroundRealtime(),140);
  }
  if(("Notification"in window)&&Notification.permission==="granted")setTimeout(()=>ensureAllAccountPushSubscriptions({quiet:true}),650);
  if(notificationId&&state.session)setTimeout(()=>openNotificationDeepLink(notificationId),0);
  applyAutomaticUpdate();
})();

// Lenton public progressive fill sync v0.25.69
