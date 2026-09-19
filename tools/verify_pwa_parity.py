#!/usr/bin/env python3
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=json.loads((ROOT/"PWA/generated/android-source.json").read_text(encoding="utf-8"))
app=(ROOT/"PWA/app.js").read_text(encoding="utf-8")
css=(ROOT/"PWA/styles.css").read_text(encoding="utf-8")
features=spec.get("features") or {}
fail=[]

def require(feature,*markers):
    if not features.get(feature):
        return
    missing=[m for m in markers if m not in app]
    if missing:
        fail.append(f"{feature}: missing runtime markers {missing}")

require("lists","/api/v1/lists","listsScreen","listManageScreen")
require("profileOverflow","openProfilePopup")
require("privateProfileNote","/note","비밀 메모")
require("screenLayoutEditor","screenLayoutEditor")
require("replyCwInheritance","reply?.spoiler_text")
require("bottomNavSwipe","attachInteractiveMainSwipe")
require("homeSwipe","attachInteractiveHomeSwipe")
require("dmPreviousConversation","data-dm-previous","이전 대화 보기")
require("dmThreadSeparation","_threadLabel","_threadSiblingIds")
require("problemReport","inquiryScreen","sendInquiry","이메일로 보내기")
require("customEmoji","/api/v1/custom_emojis")
require("multiAccount","addAccountFlow","accountManagerScreen","switchSavedAccount")
require("updater","updateHistoryScreen","applyAutomaticUpdate")
require("draftGuard","작성 중인 내용을 버릴까요?")


markers=spec.get("markerPresence") or {}
def require_marker(marker,*runtime_markers):
    if not markers.get(marker):
        return
    missing=[m for m in runtime_markers if m not in app]
    if missing:
        fail.append(f"marker {marker}: missing runtime markers {missing}")

require_marker("프로필 편집","profileEditScreen","profileEditHeaderPreview","profileEditAvatarPreview","saveProfileEdit")
require_marker("고정","profilePinned","q.pinned")
require_marker("미디어","profileMedia","q.only_media")
require_marker("앱 업데이트","currentReleaseNotes","showCurrentReleaseNotes","checkPwaUpdate")
if features.get("bottomNavSwipe") and "main-swipe-preview" not in app:
    fail.append("bottomNavSwipe: main view does not use finger-following preview")
if features.get("homeSwipe") and "home-swipe-preview" not in app:
    fail.append("homeSwipe: home mode does not use finger-following preview")
if 'data-drawer="profile"' not in app or "drawer-profile-avatar-button" not in app:
    fail.append("drawer profile identity is not clickable")
if features.get("dmPreviousConversation") and "data-dm-previous" not in app:
    fail.append("DM previous conversation is not wired")
if "showCurrentReleaseNotes" in app and "build?.notes" not in app:
    fail.append("update details must use current release notes only")

renderer=spec.get("renderer") or {}
compose=renderer.get("compose") or {}
if compose.get("toolOrder"):
    if "composeToolMarkup" not in app:
        fail.append("compose: APK tool order exists but runtime is not spec-driven")
for key,marker in {
    "hasPhoto":"composeAttach","hasCamera":"composeCamera","hasGif":"composeGif",
    "hasPoll":"composePoll","hasThread":"addPart"
}.items():
    if compose.get(key) and marker not in app:
        fail.append(f"compose: APK requires {key}, missing {marker}")

if renderer.get("drawerRows") and "drawerMenuRows" not in app:
    fail.append("drawer: APK rows exist but runtime is not APK-driven")
if renderer.get("notificationTabs") and "notificationTabs" not in app:
    fail.append("notifications: APK tab labels exist but runtime is not APK-driven")
if renderer.get("profileTabs") and "profileLabels" not in app:
    fail.append("profile: APK tab labels exist but runtime is not APK-driven")

ui=spec.get("ui") or {}
metric_markers={
    "topBarDp":"--android-topbar","bottomBarDp":"--android-bottom",
    "statusPadding":"--android-status-padding","avatarDp":"--android-avatar",
    "drawerAvatarDp":"--android-drawer-avatar","drawerRowDp":"--android-drawer-row",
    "messageAvatarDp":"--android-message-avatar","messagePadding":"--android-message-padding",
    "profileHeaderDp":"--android-profile-header","profileAvatarDp":"--android-profile-avatar",
}
for key,var in metric_markers.items():
    if key in ui and var not in app and var not in css:
        fail.append(f"ui: {key} is extracted but {var} is not consumed")


if ".profile-tabs-4{display:none!important}" in css.replace(" ",""):
    fail.append("profile tabs are forcibly hidden by CSS")
if "width:100vw!important" in css.replace(" ",""):
    fail.append("swipe preview is forcibly locked to viewport width instead of content width")
if "profileMetaFields" not in app or "addProfileMeta" not in app:
    fail.append("profile metadata editor must support add/remove rows")
if "업데이트 내용 확인" in app:
    fail.append("update center must expose only 업데이트 확인")

if fail:
    print("APK/PWA parity validation failed:")
    for x in fail: print(" -",x)
    raise SystemExit(1)

print("APK/PWA parity markers verified.")
print("Android",spec.get("versionName"),spec.get("versionCode"))
print("Features:",", ".join(k for k,v in features.items() if v))
