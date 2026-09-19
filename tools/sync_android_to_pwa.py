#!/usr/bin/env python3
"""Generate the web-side Lenton contract from the canonical Android source.

Android stays the source of truth. This generator deliberately fails when the
expected Android structures drift, so a new Android release cannot silently
leave the PWA on an old hand-maintained UI contract.
"""
import json,re,sys
from pathlib import Path

src=Path(sys.argv[1]).read_text(encoding="utf-8",errors="replace")
sha=sys.argv[2]
ref=sys.argv[3]

def require(pattern,label):
    m=re.search(pattern,src,re.S)
    if not m:
        raise SystemExit(f"Android source drift: missing {label}")
    return m

# These are structural anchors in the shipped Android renderer, not PWA guesses.
for pat,label in [
    (r'loadFollowingHomePageSync|loadFollowingPublicPage','home timeline renderer'),
    (r'Conversations|conversation','messages renderer'),
    (r'bookmark|Bookmark','bookmark support'),
    (r'notification|Notification','notification support'),
]:
    require(pat,label)

# Pull literal dp/sp/color facts out of the canonical Java so future Android
# changes are visible to the web build instead of being silently duplicated.
dps=sorted({int(x) for x in re.findall(r'\bdp\((\d+)\)',src)})
text_sizes=sorted({float(x) for x in re.findall(r'(?:setTextSize|textSize)\s*\([^\d-]*([0-9]+(?:\.[0-9]+)?)',src)})
colors=sorted({m.group(0) for m in re.finditer(r'Color\.rgb\([^\)]*\)|#[0-9A-Fa-f]{6,8}',src)})

contract={
 "schema":1,
 "android_repository":"cptu527/mastoflow-android",
 "android_ref":ref,
 "android_mainactivity_sha":sha,
 "source_of_truth":"Android MainActivity.java + Android release APK",
 "navigation":["home","search","notifications","messages"],
 "home_tabs":["chronological","public"],
 "dp_literals":dps,
 "text_size_literals":text_sizes,
 "color_literals":colors,
}
out=Path("PWA/generated")
out.mkdir(parents=True,exist_ok=True)
(out/"android-contract.json").write_text(json.dumps(contract,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
(out/"android-contract.js").write_text("window.LENTON_ANDROID_CONTRACT="+json.dumps(contract,ensure_ascii=False,separators=(",",":"))+";\n",encoding="utf-8")
print(json.dumps(contract,ensure_ascii=False,indent=2))
