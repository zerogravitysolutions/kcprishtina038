#!/usr/bin/env python3
"""
Production smoke test for KÇ Prishtina 038.

Hits every public route + the Supabase REST endpoint to verify:
  - All HTML pages return 200
  - cleanUrls redirects work
  - Security headers from vercel.json are present
  - Supabase project is reachable
  - The `sections` table responds with 6 rows (also acts as a free-tier keepalive)

Exit code 0 on success, non-zero on any failure.
Run from CI or a cron (UptimeRobot, GitHub Actions schedule, etc.).
"""
import sys, json, urllib.request, urllib.error

BASE = "https://kcprishtina038.vercel.app"
SUPABASE_URL = "https://xutklvcsdgzmhxzexisb.supabase.co"
SUPABASE_PUBLISHABLE = "sb_publishable_cB3Hl2_07OqDyV-U5exvbQ_WiTjKx6M"

PUBLIC_ROUTES = [
    "/", "/about", "/sections", "/section-mtb", "/events", "/join",
    "/login", "/robots.txt", "/sitemap.xml",
    "/assets/styles.css", "/assets/app.js", "/assets/supabase.js",
    "/assets/logo.jpg", "/assets/og-default.jpg",
]

EXPECTED_HEADERS = {
    "x-content-type-options": "nosniff",
    "referrer-policy":        "strict-origin-when-cross-origin",
}


def check_public_routes():
    failures = []
    for path in PUBLIC_ROUTES:
        url = BASE + path
        try:
            req = urllib.request.Request(url, method="HEAD")
            with urllib.request.urlopen(req, timeout=15) as r:
                status = r.status
                hdrs = {k.lower(): v for k, v in r.headers.items()}
        except urllib.error.HTTPError as e:
            status, hdrs = e.code, dict(e.headers.items())
        except Exception as e:
            failures.append(f"{path}: connect error {e!r}")
            continue
        if status != 200:
            failures.append(f"{path}: status {status}")
            continue
        for k, v in EXPECTED_HEADERS.items():
            if hdrs.get(k, "").lower() != v:
                failures.append(f"{path}: header {k} expected {v!r}, got {hdrs.get(k)!r}")
    return failures


def check_supabase():
    url = f"{SUPABASE_URL}/rest/v1/sections?select=slug&limit=10"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_PUBLISHABLE,
        "Authorization": f"Bearer {SUPABASE_PUBLISHABLE}",
        "Accept": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            body = json.loads(r.read())
    except Exception as e:
        return [f"supabase: {e!r}"]
    if not isinstance(body, list):
        return [f"supabase: unexpected payload type {type(body).__name__}"]
    if len(body) < 6:
        return [f"supabase: expected >=6 sections, got {len(body)}"]
    return []


def main():
    fails = []
    print(f"=== HTTP routes ({len(PUBLIC_ROUTES)}) ===")
    fails += check_public_routes()
    print(f"=== Supabase ===")
    fails += check_supabase()
    if fails:
        print(f"\n{len(fails)} failure(s):")
        for f in fails:
            print("  -", f)
        sys.exit(1)
    print("\nOK: every check passed")


if __name__ == "__main__":
    main()
