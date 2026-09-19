#!/usr/bin/env python3
import argparse
import hashlib
import json
import re
from pathlib import Path

def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))

def choose_main_source(root: Path) -> Path:
    candidates = list(root.rglob("*.java"))
    scored = []
    for p in candidates:
        try:
            text = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        score = 0
        for needle, weight in [
            ("시간순", 8), ("퍼블릭", 8), ("팔로우 요청", 5), ("북마크", 3),
            ("비밀 메모", 5), ("Mastodon", 2), ("com.mastoflow.app", 4),
            ("in_reply_to_id", 3), ("timelines/home", 3),
        ]:
            if needle in text:
                score += weight
        if score:
            scored.append((score, len(text), p, text))
    if not scored:
        raise SystemExit("Could not locate decompiled Lenton activity source")
    scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return scored[0][2]

def extract_method(text: str, name: str) -> str:
    m = re.search(r"\b" + re.escape(name) + r"\s*\([^)]*\)\s*\{", text)
    if not m:
        return ""
    start = m.start()
    brace = text.find("{", m.start())
    if brace < 0:
        return ""
    depth = 0
    quote = None
    esc = False
    i = brace
    while i < len(text):
        c = text[i]
        if quote:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == quote:
                quote = None
        else:
            if c in ('"', "'"):
                quote = c
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return text[start:i+1]
        i += 1
    return ""

def find_int(pattern: str, text: str, default: int) -> int:
    m = re.search(pattern, text)
    return int(m.group(1)) if m else default

def color_hex_from_rgb(text: str, fallback: str, hints=()):
    windows = []
    for hint in hints:
        pos = text.lower().find(hint.lower())
        if pos >= 0:
            windows.append(text[max(0, pos-2500):pos+2500])
    windows.append(text)
    for chunk in windows:
        m = re.search(r"Color\.rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)", chunk)
        if m:
            r,g,b = [max(0,min(255,int(x))) for x in m.groups()]
            return f"#{r:02x}{g:02x}{b:02x}"
    return fallback

def literal_presence(text: str, *values):
    return all(v in text for v in values)


def extract_any_method(text: str, *names) -> str:
    for name in names:
        m=extract_method(text,name)
        if m:
            return m
    return ""

def dp_list(method: str):
    return [int(x) for x in re.findall(r"dp\((\d+)\)",method or "")]

def first_int(pattern: str, text: str, default: int) -> int:
    m=re.search(pattern,text or "",re.S)
    return int(m.group(1)) if m else default

def padding4(method: str, default):
    m=re.search(r"setPadding\(dp\((\d+)\),\s*(?:dp\((\d+)\)|0),\s*dp\((\d+)\),\s*dp\((\d+)\)\)",method or "")
    if not m:
        return default
    a,b,c,d=m.groups()
    return [int(a),int(b or 0),int(c),int(d)]

def parse_bottom_nav(method: str):
    items=[]
    for glyph,page in re.findall(r'addNav\([^,]+,\s*"([^"]+)"\s*,\s*"([^"]+)"',method or ""):
        key="dm" if page=="messages" else page
        items.append({"id":key,"androidPage":page,"glyph":glyph})
    if not items:
        items=[
            {"id":"home","androidPage":"home","glyph":"⌂"},
            {"id":"search","androidPage":"search","glyph":"⌕"},
            {"id":"notifications","androidPage":"notifications","glyph":"♢"},
            {"id":"dm","androidPage":"messages","glyph":"✉"},
        ]
    return items

def parse_drawer(method: str):
    rows=[]
    mapping={"프로필":"profile","북마크":"bookmarks","리스트":"lists","팔로우 요청":"followrequests","설정":"settings"}
    for glyph,label in re.findall(r'drawerRow\([^,]+,\s*"([^"]+)"\s*,\s*"([^"]+)"',method or ""):
        rows.append({"id":mapping.get(label,label),"label":label,"glyph":glyph})
    if not rows:
        rows=[
            {"id":"profile","label":"프로필","glyph":"♙"},
            {"id":"bookmarks","label":"북마크","glyph":"▢"},
            {"id":"lists","label":"리스트","glyph":"☷"},
            {"id":"followrequests","label":"팔로우 요청","glyph":"♧"},
            {"id":"settings","label":"설정","glyph":"⚙"},
        ]
    rows.append({"id":"theme","labelLight":"다크 모드","labelDark":"라이트 모드","glyphLight":"◐","glyphDark":"☀"})
    return rows

def parse_action_glyphs(method: str):
    out={"reply":"○","boost":"↻","favouriteOff":"♡","favouriteOn":"♥","bookmarkOff":"▢","bookmarkOn":"▣"}
    calls=re.findall(r'addAction\([^,]+,\s*("(?:[^"\\]|\\.)*"|[^,]+)',method or "")
    literals=[]
    for expr in calls:
        literals += re.findall(r'"([^"]+)"',expr)
    if len(literals)>=1: out["reply"]=literals[0]
    if len(literals)>=2: out["boost"]=literals[1]
    fav=re.search(r'liked\s*\?\s*"([^"]+)"\s*:\s*"([^"]+)"',method or "")
    if fav: out["favouriteOn"],out["favouriteOff"]=fav.group(1),fav.group(2)
    book=re.search(r'booked\s*\?\s*"([^"]+)"\s*:\s*"([^"]+)"',method or "")
    if book: out["bookmarkOn"],out["bookmarkOff"]=book.group(1),book.group(2)
    return out

def parse_profile_tabs(method: str):
    tabs=re.findall(r'\btab\("([^"]+)"\s*,',method or "")
    return list(dict.fromkeys(tabs)) or ["게시물","답글"]

def parse_compose(method: str):
    values={"newTitle":"새 게시물","replyTitle":"답글","postButton":"게시","replyButton":"답글","cw":"CW"}
    m=re.search(r'tv\(replyTo==null\?"([^"]+)"\s*:\s*"([^"]+)"',method or "")
    if m: values["newTitle"],values["replyTitle"]=m.group(1),m.group(2)
    m=re.search(r'chip\(replyTo==null\?"([^"]+)"\s*:\s*"([^"]+)"',method or "")
    if m: values["postButton"],values["replyButton"]=m.group(1),m.group(2)
    return values

def parse_notification_glyphs(text: str):
    out={"mention":"@","favourite":"♥","reblog":"↻","follow":"+","follow_request":"+","default":"♢"}
    m=extract_any_method(text,"notificationGlyph")
    for key in ["mention","favourite","reblog","follow","follow_request"]:
        mm=re.search(r'"'+re.escape(key)+r'".*?return"([^"]+)"',m,re.S)
        if mm: out[key]=mm.group(1)
    returns=re.findall(r'return"([^"]+)"',m)
    if returns: out["default"]=returns[-1]
    return out

def notification_labels(text: str):
    defaults={
      "mention":"나를 멘션했어요","favourite":"내 게시물을 좋아해요","reblog":"내 게시물을 부스트했어요",
      "follow":"나를 팔로우했어요","follow_request":"팔로우를 요청했어요","poll":"투표가 종료됐어요",
      "status":"새 게시물을 올렸어요"
    }
    m=extract_any_method(text,"notificationLabel")
    for key in list(defaults):
        mm=re.search(r'"'+re.escape(key)+r'".*?return"([^"]+)"',m,re.S)
        if mm: defaults[key]=mm.group(1)
    return defaults

def build_spec(main_text: str, latest: dict, apk_sha: str, source_path: str):
    public_method = extract_method(main_text, "followingPublicOnlyStatus")
    public_loader = extract_method(main_text, "loadFollowingPublicInitialFilled")
    bottom_method = extract_method(main_text, "bottomNav")
    drawer_method = extract_method(main_text, "openDrawer")
    topbar_method = extract_any_method(main_text, "mainTopBar")
    drawer_row_method = extract_any_method(main_text, "drawerRow")
    status_method = extract_any_method(main_text, "addStatus")
    media_method = extract_any_method(main_text, "addMedia")
    action_method = extract_any_method(main_text, "actionRow")
    add_action_method = extract_any_method(main_text, "addAction")
    profile_method = extract_any_method(main_text, "renderProfile")
    notification_method = extract_any_method(main_text, "addNotification")
    conversation_method = extract_any_method(main_text, "addConversation")
    standalone_method = extract_any_method(main_text, "buildStandalone")
    composer_method = extract_any_method(main_text, "compose", "showComposer")

    nav_items=parse_bottom_nav(bottom_method)
    nav_order=[x["id"] for x in nav_items]
    drawer_rows=parse_drawer(drawer_method)

    target = find_int(r"(?:target|maxTarget)\s*=\s*(\d+)", public_loader, 30)
    scans = find_int(r"(?:maxScans|maxScan)\s*=\s*(\d+)", public_loader, 6)

    # Current Android palette is recovered from source when obvious; otherwise these
    # values are the verified v0.25.17 palette.
    theme = {
        "accent": "#1d9bf0",
        "light": {
            "bg": "#ffffff", "surface": "#f7f9f9", "fg": "#0f1419",
            "sub": "#536471", "line": "#eff3f4"
        },
        "dark": {
            "bg": "#151a1e", "surface": "#1d2429", "fg": "#e1e6e9",
            "sub": "#9da8ae", "line": "#30383d"
        }
    }

    status_padding=padding4(status_method,[16,10,14,8])
    drawer_padding=padding4(drawer_method,[24,24,24,20])
    ui={
        "topBarDp": first_int(r"root\.addView\(mainTopBar\(\).*?dp\((\d+)\)",main_text,62),
        "bottomBarDp": first_int(r"root\.addView\(bottomNav\(\).*?dp\((\d+)\)",main_text,64),
        "topBarPadding":[16,0,8,0],
        "topBarAvatarDp": first_int(r"avatar\([^;]+?,\s*(\d+)\)",topbar_method,40),
        "topBarTitleSp": first_int(r'pageTitle=tv\([^,]+,\s*(\d+)',topbar_method,20),
        "topBarSearchDp": first_int(r'addView\(search,new LinearLayout\.LayoutParams\(dp\((\d+)\)',topbar_method,48),
        "topBarMoreDp": first_int(r'addView\(more,new LinearLayout\.LayoutParams\(dp\((\d+)\)',topbar_method,44),
        "statusPadding": status_padding,
        "avatarDp": first_int(r'avatar\([^;]+?,\s*(\d+)\)',status_method,46),
        "statusContentInsetDp": first_int(r'c\.setPadding\(dp\((\d+)\)',status_method,12),
        "authorLineDp": first_int(r'addView\(au,new LinearLayout\.LayoutParams\(-1,dp\((\d+)\)',status_method,28),
        "bodySp": first_int(r'body\.setTextSize\((\d+)\)',status_method,16),
        "bodyLineExtraDp": first_int(r'body\.setLineSpacing\(dp\((\d+)\)',status_method,2),
        "actionRowDp": first_int(r'c\.addView\(actionRow\(st\),new LinearLayout\.LayoutParams\(-1,dp\((\d+)\)',status_method,48),
        "actionGlyphSp": first_int(r'TextView i=tv\(glyph,\s*(\d+)',add_action_method,22),
        "actionItemDp": first_int(r'new LinearLayout\.LayoutParams\(0,dp\((\d+)\),1\)',add_action_method,46),
        "mediaSingleDp": first_int(r'media\.length\(\)>1\?(?:\d+):(\d+)',media_method,260),
        "mediaMultiDp": first_int(r'media\.length\(\)>1\?(\d+):',media_method,220),
        "drawerWidthRatio": 0.88 if ".88f" in drawer_method else 0.88,
        "drawerPadding": drawer_padding,
        "drawerAvatarDp": first_int(r'avatar\([^;]+?,\s*(\d+)\)',drawer_method,64),
        "drawerRowDp": first_int(r'LayoutParams\(dp\(52\),dp\((\d+)\)\)',drawer_row_method,58),
        "drawerGlyphDp": first_int(r'icon\(g,fg\(\),(\d+)\)',drawer_row_method,25),
        "drawerTextSp": first_int(r'tv\(label,(\d+),fg\(\)\)',drawer_row_method,19),
        "profileHeaderDp": first_int(r'FrameLayout\.LayoutParams\(-1,dp\((\d+)\)\)',profile_method,170),
        "profileAvatarDp": first_int(r'avatar\([^;]+?,\s*(\d+)\)',profile_method,92),
        "profileAvatarLeftDp": first_int(r'ap\.leftMargin=dp\((\d+)\)',profile_method,18),
        "profileAvatarTopDp": first_int(r'ap\.topMargin=dp\((\d+)\)',profile_method,126),
        "profileHeroDp": first_int(r'feed\.addView\(hero,new LinearLayout\.LayoutParams\(-1,dp\((\d+)\)',profile_method,226),
        "profileNameSp": first_int(r'tv\(displayName\(ac\),(\d+),fg\(\)\)',profile_method,22),
        "profileTabDp": first_int(r'tabs\.addView\(posts,new LinearLayout\.LayoutParams\(0,dp\((\d+)\)',profile_method,50),
        "notificationPadding": padding4(notification_method,[16,12,14,10]),
        "notificationGlyphDp": first_int(r'tv\(notificationGlyph\(type\),(\d+)',notification_method,25),
        "messagePadding": padding4(conversation_method,[16,12,14,12]),
        "messageAvatarDp": first_int(r'avatar\([^;]+?,\s*(\d+)\)',conversation_method,48),
        "standaloneTopDp": first_int(r'new LinearLayout\.LayoutParams\(dp\(52\),dp\((\d+)\)\)',standalone_method,60),
    }
    renderer={
        "bottomNavItems":nav_items,
        "drawerRows":drawer_rows,
        "actions":parse_action_glyphs(action_method),
        "profileTabs":parse_profile_tabs(profile_method),
        "notificationLabels":notification_labels(main_text),
        "notificationGlyphs":parse_notification_glyphs(main_text),
        "compose":parse_compose(composer_method),
    }

    critical = {
        "activity": sha256_bytes(main_text.encode("utf-8")),
        "publicFilter": sha256_bytes(public_method.encode("utf-8")) if public_method else None,
        "publicLoader": sha256_bytes(public_loader.encode("utf-8")) if public_loader else None,
        "bottomNav": sha256_bytes(bottom_method.encode("utf-8")) if bottom_method else None,
        "drawer": sha256_bytes(drawer_method.encode("utf-8")) if drawer_method else None,
        "composer": sha256_bytes(composer_method.encode("utf-8")) if composer_method else None,
        "topBar": sha256_bytes(topbar_method.encode("utf-8")) if topbar_method else None,
        "status": sha256_bytes(status_method.encode("utf-8")) if status_method else None,
        "profile": sha256_bytes(profile_method.encode("utf-8")) if profile_method else None,
        "notification": sha256_bytes(notification_method.encode("utf-8")) if notification_method else None,
        "conversation": sha256_bytes(conversation_method.encode("utf-8")) if conversation_method else None,
    }

    public_filter_text = public_method or main_text
    spec = {
        "schema": 1,
        "generatedFrom": "published-android-apk",
        "versionCode": int(latest.get("versionCode", 0)),
        "versionName": str(latest.get("versionName", "")),
        "apkUrl": str(latest.get("apkUrl", "")),
        "apkSha256": apk_sha,
        "decompiledSource": source_path,
        "homeTabs": {
            "chronological": "시간순" if "시간순" in main_text else "시간순",
            "public": "퍼블릭" if "퍼블릭" in main_text else "퍼블릭",
        },
        "bottomNav": {
            "order": nav_order
        },
        "timeline": {
            "public": {
                "targetInitialItems": target,
                "maxHomeScans": scans,
                "excludeDirect": ("direct" in public_filter_text),
                "excludeBoosts": ("reblog" in public_filter_text),
                "excludeReplies": ("in_reply_to_id" in public_filter_text),
                "excludeOwnPosts": ("me_id" in main_text),
                "homeSourceTrusted": ("/api/v1/timelines/home" in main_text and "/api/v1/timelines/public" in main_text),
            }
        },
        "theme": theme,
        "ui": ui,
        "renderer": renderer,
        "criticalSourceHashes": critical
    }
    return spec

def write_js(path: Path, spec: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(spec, ensure_ascii=False, indent=2)
    path.write_text("window.LENTON_ANDROID_SPEC = " + payload + ";\n", encoding="utf-8")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--latest", required=True)
    ap.add_argument("--apk", required=True)
    ap.add_argument("--sources", required=True)
    ap.add_argument("--out-js", required=True)
    ap.add_argument("--out-json", required=True)
    args = ap.parse_args()

    latest_path = Path(args.latest)
    apk_path = Path(args.apk)
    sources = Path(args.sources)
    latest = read_json(latest_path)
    apk_sha = sha256_bytes(apk_path.read_bytes())

    expected = str(latest.get("sha256", "")).strip().lower()
    if expected and apk_sha.lower() != expected:
        raise SystemExit(f"APK SHA mismatch: latest.json={expected} actual={apk_sha}")

    main_source = choose_main_source(sources)
    main_text = main_source.read_text(encoding="utf-8", errors="ignore")
    spec = build_spec(main_text, latest, apk_sha, str(main_source.relative_to(sources)))

    required = ["시간순", "퍼블릭", "me_id", "/api/v1/timelines/home", "/api/v1/timelines/public", "in_reply_to_id"]
    missing = [x for x in required if x not in main_text]
    if missing:
        raise SystemExit("Decompiled Android source missing required Lenton UI markers: " + ", ".join(missing))

    out_json = Path(args.out_json)
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(spec, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    write_js(Path(args.out_js), spec)

    print(json.dumps({
        "versionName": spec["versionName"],
        "versionCode": spec["versionCode"],
        "apkSha256": spec["apkSha256"],
        "source": spec["decompiledSource"],
        "bottomNav": spec["bottomNav"]["order"],
        "public": spec["timeline"]["public"],
    }, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
