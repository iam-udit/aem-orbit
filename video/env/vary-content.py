#!/usr/bin/env python3
"""Give the magazine teaser a different headline + hero image on Dev / Stage / Prod, so an environment switch is visible on screen.

Usage:  ORBIT_ADMIN_PW=... python3 video/env/vary-content.py

Local (4502/4503) is never touched: it keeps the original "Camping in Western Australia" teaser.
The password is read from ORBIT_ADMIN_PW and is never written to disk. Talks to 127.0.0.1 only.
"""
import base64, json, os, sys, urllib.error, urllib.parse, urllib.request

PW = os.environ.get("ORBIT_ADMIN_PW")
if not PW:
    sys.exit("Set ORBIT_ADMIN_PW")
AUTH = "Basic " + base64.b64encode(f"admin:{PW}".encode()).decode()
PAGE = "/content/wknd/us/en/magazine"
TEASER = f"{PAGE}/jcr:content/root/container/teaser_main"
DAM = "/content/dam/wknd-shared/en/magazine"

ENVS = {  # env -> (author port, headline, image)
    "dev": (4512, "Alaskan Adventure", f"{DAM}/alaska-adventure/alaskan-grizzly.jpg"),
    "stage": (4522, "Fly Fishing the Amazon", f"{DAM}/fly-fishing-amazon/amazon-river-01.jpg"),
    "prod": (4532, "Camp Under the Alaskan Sky", f"{DAM}/alaska-adventure/camp-alaska.jpg"),
}

_tok = {}


def post(port, path, data):
    if port not in _tok:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/libs/granite/csrf/token.json", headers={"Authorization": AUTH})
        _tok[port] = json.load(urllib.request.urlopen(req, timeout=30))["token"]
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}{path}", data=urllib.parse.urlencode(data).encode(), method="POST",
        headers={"Authorization": AUTH, "Content-Type": "application/x-www-form-urlencoded", "CSRF-Token": _tok[port]})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return e.code


for env, (port, title, image) in ENVS.items():
    st = post(port, TEASER, {"jcr:title": title, "fileReference": image, "titleFromPage": "false"})
    rp = post(port, "/bin/replicate.json", {"cmd": "Activate", "path": PAGE})
    print(f"{env:6} teaser -> {title!r} [{st}]  publish [{rp}]")
