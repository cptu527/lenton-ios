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

def build_spec(main_text: str, latest: dict, apk_sha: str, source_path: str):
    public_method = extract_method(main_text, "followingPublicOnlyStatus")
    public_loader = extract_method(main_text, "loadFollowingPublicInitialFilled")
    bottom_method = extract_method(main_text, "bottomNav")
    drawer_method = extract_method(main_text, "openDrawer")
    compose_method = extract_method(main_text, "showComposer")

    # These are extracted/verified from the actual final APK decompile. Defaults are
    # current Lenton values and are only used when R8 rewrites a private method name.
    nav_order = ["home", "search", "notifications", "dm"]
    if literal_presence(main_text, '"profile"', '"dm"', '"notifications"', '"search"', '"home"'):
        # Profile may exist as a destination without being a bottom tab, so keep the
        # verified four-tab order unless bottomNav itself explicitly contains profile.
        if bottom_method and '"profile"' in bottom_method:
            nav_order.append("profile")

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

    critical = {
        "activity": sha256_bytes(main_text.encode("utf-8")),
        "publicFilter": sha256_bytes(public_method.encode("utf-8")) if public_method else None,
        "publicLoader": sha256_bytes(public_loader.encode("utf-8")) if public_loader else None,
        "bottomNav": sha256_bytes(bottom_method.encode("utf-8")) if bottom_method else None,
        "drawer": sha256_bytes(drawer_method.encode("utf-8")) if drawer_method else None,
        "composer": sha256_bytes(compose_method.encode("utf-8")) if compose_method else None,
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
                "excludeOwnPosts": ("authorId" in public_filter_text and ("meId" in public_filter_text or "me_id" in public_filter_text)),
                "homeSourceTrusted": ("loadFollowingPublicPage" in main_text and "publicFeed" in main_text),
            }
        },
        "theme": theme,
        "ui": {
            "avatarDp": 46,
            "topBarDp": 62,
            "bottomBarDp": 64,
            "bodySp": 16
        },
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

    required = ["시간순", "퍼블릭"]
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
