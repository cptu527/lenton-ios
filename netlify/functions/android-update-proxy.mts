const APK_URL = "https://raw.githubusercontent.com/cptu527/lenton-updates/main/Lenton-v0.27.03-test.apk";

export default async (req: Request) => {
  const upstream = await fetch(APK_URL, {
    headers: {
      "User-Agent": "Lenton-Updater-Proxy/1.0",
      "Accept": "application/vnd.android.package-archive,application/octet-stream,*/*"
    },
    redirect: "follow"
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("APK upstream fetch failed", { status: 502 });
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/vnd.android.package-archive");
  headers.set("Content-Disposition", 'attachment; filename="Lenton-v0.27.03-test.apk"');
  headers.set("Cache-Control", "public, max-age=300");

  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);

  return new Response(upstream.body, {
    status: 200,
    headers
  });
};

export const config = {
  path: "/android-update/Lenton-v0.27.03-test.apk"
};
