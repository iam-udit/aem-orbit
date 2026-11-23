#!/usr/bin/env python3
"""Create (or reset) the Chapter 3 demo content: /content/wknd/us/en/orbit-demo/authoring/*.
Idempotent: every run deletes the subtree (unpublishing it first) and rebuilds it, so the chapter can be re-recorded.

  Dev  (127.0.0.1:4512): publish-demo, preview-demo, preflight-demo (references an UNPUBLISHED asset), lock-demo,
                         delete-target + delete-source (source links to target), delete-free,
                         tree-demo/{a,b,c,c/c1,d}  (d was published and unpublished on purpose -> skipped by tree publish),
                         bulk/p01..p50
  Prod (127.0.0.1:4532): guard-demo, bulk/p01..p03   (Prod Guard)

Usage: ORBIT_ADMIN_PW=admin python3 video/env/ch3-content.py        (the password is only read from the environment)
"""
import base64, json, os, time, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

PW = os.environ['ORBIT_ADMIN_PW']
AUTH = 'Basic ' + base64.b64encode(f'admin:{PW}'.encode()).decode()
ENVS = {'dev': 'http://127.0.0.1:4512', 'prod': 'http://127.0.0.1:4532'}
EN = '/content/wknd/us/en'
DEMO = f'{EN}/orbit-demo'
BASE = f'{DEMO}/authoring'
TEMPLATE = '/conf/wknd/settings/wcm/templates/content-page-template'
PUBLISHED_IMG = '/content/dam/wknd-shared/en/magazine/alaska-adventure/alaskan-grizzly.jpg'      # published on Dev
UNPUBLISHED_IMG = '/content/dam/wknd-shared/en/magazine/alaska-adventure/bear-path.jpg'         # never published on Dev


def call(host, path, data=None, method='POST', ok=(200, 201, 202)):
    body = urllib.parse.urlencode(data, doseq=True).encode() if data is not None else None
    req = urllib.request.Request(host + path, data=body, headers={'Authorization': AUTH}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def exists(host, path):
    return call(host, f'{path}.json', method='GET')[0] == 200


def create(host, parent, name, title):
    if exists(host, f'{parent}/{name}'):
        return
    s, _ = call(host, '/bin/wcmcommand', {'cmd': 'createPage', 'parentPath': parent, 'title': title, 'label': name,
                                          'template': TEMPLATE, '_charset_': 'utf-8'})
    if s != 200:
        raise SystemExit(f'createPage {parent}/{name} -> {s}')


def fill(host, page, heading, lead, img=None, extra=None):
    node = {
        'jcr:primaryType': 'nt:unstructured', 'sling:resourceType': 'wknd/components/container', 'layout': 'responsiveGrid',
        'title': {'jcr:primaryType': 'nt:unstructured', 'sling:resourceType': 'wknd/components/title', 'jcr:title': heading, 'type': 'h1'},
        'text': {'jcr:primaryType': 'nt:unstructured', 'sling:resourceType': 'wknd/components/text', 'textIsRich': 'true',
                 'text': f'<p>{lead}</p><p>This page exists only for the AEM Orbit walkthrough.</p>' + (extra or '')},
    }
    if img:
        node['teaser'] = {'jcr:primaryType': 'nt:unstructured', 'sling:resourceType': 'wknd/components/teaser',
                          'jcr:title': 'Alaskan Adventure', 'jcr:description': 'Trek through the backcountry.',
                          'fileReference': img, 'titleType': 'h2'}
    s, _ = call(host, f'{page}/jcr:content/root/container', {':operation': 'import', ':contentType': 'json', ':replace': 'true',
                                                              ':replaceProperties': 'true', ':content': json.dumps(node)})
    if s not in (200, 201):
        raise SystemExit(f'fill {page} -> {s}')


def replicate(host, cmd, paths, agent=None):
    data = {'cmd': cmd, 'path': paths, '_charset_': 'utf-8'}
    if agent:
        data['agentId'] = agent
    return call(host, '/bin/replicate.json', data)[0]


def publish_references(host, page):
    """Publish whatever the page references (template, configs, clientlibs, images) so the pre-flight stays clean."""
    for _ in range(3):
        s, b = call(host, f'/libs/wcm/core/content/reference.json?path={urllib.parse.quote(page)}', method='GET')
        if s != 200:
            return
        d = json.loads(b)
        todo = [r['path'] for k in ('assets', 'pages') for r in d.get(k, []) if r.get('path') != page and not r.get('published')]
        if not todo:
            return
        replicate(host, 'Activate', todo)
        time.sleep(1)


def reset(host):
    if not exists(host, BASE):
        return
    s, b = call(host, f'/bin/querybuilder.json?path={BASE}&type=cq:Page&p.limit=500&p.hits=selective&p.properties=jcr:path', method='GET')
    paths = [h['jcr:path'] for h in json.loads(b).get('hits', [])] if s == 200 else []
    for i in range(0, len(paths), 50):
        replicate(host, 'Deactivate', paths[i:i + 50])
        replicate(host, 'Deactivate', paths[i:i + 50], 'preview')
    call(host, BASE, {':operation': 'delete'})


def dev():
    h = ENVS['dev']
    reset(h)
    create(h, DEMO, 'authoring', 'Authoring Demo')
    singles = {
        'publish-demo': ('Publish Demo', 'A page to publish and unpublish with one click.', PUBLISHED_IMG),
        'preview-demo': ('Preview Demo', 'A page to publish to the Preview tier only.', PUBLISHED_IMG),
        'preflight-demo': ('Pre-flight Demo', 'This page uses an image that has never been published.', UNPUBLISHED_IMG),
        'lock-demo': ('Lock Demo', 'A page to lock and unlock.', PUBLISHED_IMG),
        'delete-target': ('Delete Target', 'Other content links to this page, so it cannot be deleted.', None),
        'delete-free': ('Delete Free', 'Nothing links to this page, so it can be deleted.', None),
    }
    for name, (title, lead, img) in singles.items():
        create(h, BASE, name, title)
        fill(h, f'{BASE}/{name}', title, lead, img)
    create(h, BASE, 'delete-source', 'Delete Source')
    fill(h, f'{BASE}/delete-source', 'Delete Source', 'This page links to the delete target.',
         extra=f'<p><a href="{BASE}/delete-target.html">Go to the delete target</a></p>')

    create(h, BASE, 'tree-demo', 'Tree Demo')
    fill(h, f'{BASE}/tree-demo', 'Tree Demo', 'The root of a small page tree.', PUBLISHED_IMG)
    for name in ('a', 'b', 'c', 'd'):
        create(h, f'{BASE}/tree-demo', name, f'Tree {name.upper()}')
        fill(h, f'{BASE}/tree-demo/{name}', f'Tree {name.upper()}', 'A child page.')
    create(h, f'{BASE}/tree-demo/c', 'c1', 'Tree C1')
    fill(h, f'{BASE}/tree-demo/c/c1', 'Tree C1', 'A grandchild page.')

    create(h, BASE, 'bulk', 'Bulk Pages')
    nums = [f'p{i:02d}' for i in range(1, 51)]
    with ThreadPoolExecutor(8) as pool:
        list(pool.map(lambda n: create(h, f'{BASE}/bulk', n, f'Bulk Page {n[1:]}'), nums))

    clean = [f'{BASE}/{n}' for n in ('publish-demo', 'preview-demo', 'lock-demo', 'tree-demo')] + [f'{BASE}/tree-demo/{n}' for n in 'abcd'] \
        + [f'{BASE}/tree-demo/c/c1'] + [f'{BASE}/bulk/{n}' for n in nums[:1]]
    for p in clean:
        publish_references(h, p)
    # "d" is unpublished on purpose: a tree publish skips pages whose last action was Deactivate
    d = f'{BASE}/tree-demo/d'
    print('d activate', replicate(h, 'Activate', [d]), 'deactivate', replicate(h, 'Deactivate', [d]))
    print('dev ready:', BASE)


def prod():
    h = ENVS['prod']
    reset(h)
    create(h, EN, 'orbit-demo', 'Orbit Demo') if not exists(h, DEMO) else None
    create(h, DEMO, 'authoring', 'Authoring Demo')
    create(h, BASE, 'guard-demo', 'Guard Demo')
    fill(h, f'{BASE}/guard-demo', 'Guard Demo', 'A page on the protected Prod environment.')
    create(h, BASE, 'bulk', 'Bulk Pages')
    for n in ('p01', 'p02', 'p03'):
        create(h, f'{BASE}/bulk', n, f'Bulk Page {n[1:]}')
    for p in (f'{BASE}/guard-demo', f'{BASE}/bulk/p01'):
        publish_references(h, p)
    print('prod ready:', BASE)


if __name__ == '__main__':
    dev()
    prod()
