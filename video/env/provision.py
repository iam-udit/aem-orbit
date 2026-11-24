#!/usr/bin/env python3
"""Provision the AEM Orbit demo environments (Dev / Stage / Prod authors) and seed WKND pages.

Usage:  ORBIT_ADMIN_PW=... python3 video/env/provision.py [agents] [pages] [--local-pages]

  agents        point each author's `publish` agent at its own publisher, enable the `flush` agent
                (-> local dispatcher simulation) and create a `preview` agent
  pages         create /content/wknd/us/en/homepage, /content/wknd/de/de/homepage and
                /content/wknd/de/de/magazine on Dev/Stage/Prod and publish them
  --local-pages also do `pages` on the Local author (4502 -> 4503). Agents on 4502 are never changed.

The admin password is read from ORBIT_ADMIN_PW and is never written to disk.
"""
import base64, json, os, sys, urllib.error, urllib.parse, urllib.request

PW = os.environ.get("ORBIT_ADMIN_PW")
if not PW:
    sys.exit("Set ORBIT_ADMIN_PW")
AUTH = "Basic " + base64.b64encode(f"admin:{PW}".encode()).decode()

ENVS = {  # name -> (author, publisher)
    "dev": (4512, 4513), "stage": (4522, 4523), "prod": (4532, 4533),
}
LOCAL = (4502, 4503)
FLUSH_URI = "http://127.0.0.1:8480/dispatcher/invalidate.cache"

PAGES = [  # parent, name, title, template
    ("/content/wknd/us/en", "homepage", "WKND Home", "landing-page-template"),
    ("/content/wknd/de/de", "homepage", "WKND Startseite", "landing-page-template"),
    ("/content/wknd/de/de", "magazine", "WKND Magazin", "content-page-template"),
]


def post(port, path, data):
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=body, method="POST",
                                 headers={"Authorization": AUTH, "Content-Type": "application/x-www-form-urlencoded",
                                          "CSRF-Token": csrf(port)})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


_tok = {}
def csrf(port):
    if port not in _tok:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/libs/granite/csrf/token.json", headers={"Authorization": AUTH})
        _tok[port] = json.load(urllib.request.urlopen(req, timeout=30))["token"]
    return _tok[port]


def exists(port, path):
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}.json", headers={"Authorization": AUTH})
    try:
        urllib.request.urlopen(req, timeout=30)
        return True
    except urllib.error.HTTPError:
        return False


def agents(author, publisher):
    base = "/etc/replication/agents.author"
    pub_uri = f"http://127.0.0.1:{publisher}/bin/receive?sling:authRequestLogin=1"
    st, _ = post(author, f"{base}/publish/jcr:content", {
        "transportUri": pub_uri, "transportUser": "admin", "transportPassword": PW, "userId": "admin", "enabled": "true"})
    print(f"  publish agent -> :{publisher}  [{st}]")
    st, _ = post(author, f"{base}/flush/jcr:content", {
        "transportUri": FLUSH_URI, "enabled": "true", "userId": "admin", "transportUser": "", "transportPassword": ""})
    print(f"  flush agent   -> {FLUSH_URI}  [{st}]")
    if not exists(author, f"{base}/preview"):
        post(author, f"{base}/publish", {":operation": "copy", ":dest": f"{base}/preview"})
    st, _ = post(author, f"{base}/preview/jcr:content", {
        "jcr:title": "Preview Agent", "jcr:description": "Replicates to the preview tier",
        "transportUri": pub_uri, "transportUser": "admin", "transportPassword": PW, "userId": "admin", "enabled": "true"})
    print(f"  preview agent -> :{publisher}  [{st}]")


def pages(author, publisher):
    for parent, name, title, tpl in PAGES:
        path = f"{parent}/{name}"
        if exists(author, path):
            print(f"  exists  {path}")
        else:
            st, body = post(author, "/bin/wcmcommand", {
                "cmd": "createPage", "parentPath": parent, "title": title, "label": name,
                "template": f"/conf/wknd/settings/wcm/templates/{tpl}", "_charset_": "utf-8"})
            print(f"  create  {path}  [{st}]")
        st, _ = post(author, "/bin/replicate.json", {"cmd": "Activate", "path": path})
        print(f"  publish {path}  [{st}]")


def main(argv):
    do_agents, do_pages = "agents" in argv, "pages" in argv
    for name, (a, p) in ENVS.items():
        print(f"== {name} (author {a} / publish {p})")
        if do_agents:
            agents(a, p)
        if do_pages:
            pages(a, p)
    if "--local-pages" in argv:
        print(f"== local (author {LOCAL[0]} / publish {LOCAL[1]})")
        pages(*LOCAL)


main(sys.argv[1:])
