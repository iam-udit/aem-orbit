#!/usr/bin/env python3
"""Create (or reset) Chapter 5 demo content:
1. /content/wknd/us/en/orbit-demo/sync-demo on Dev (4512) and Local (4502) with differing properties.
2. /content/wknd/us/en/expedition on Prod (4532), published to Prod publisher (4533) -> https://www.wknd.com/expedition.
3. Ensures /content/wknd/us/en/expedition does NOT exist on Local (4502) -> 404 for pre-stage demo.

Usage: ORBIT_ADMIN_PW=admin python3 video/env/ch5-content.py
"""
import base64, json, os, urllib.error, urllib.parse, urllib.request

PW = os.environ.get('ORBIT_ADMIN_PW', 'admin')
AUTH = 'Basic ' + base64.b64encode(f'admin:{PW}'.encode()).decode()
HOSTS = {'local': 'http://127.0.0.1:4502', 'dev': 'http://127.0.0.1:4512', 'prod': 'http://127.0.0.1:4532'}
PARENT = '/content/wknd/us/en/orbit-demo'
SYNC_PAGE = f'{PARENT}/sync-demo'
EXPEDITION_PAGE = '/content/wknd/us/en/expedition'
TEMPLATE = '/conf/wknd/settings/wcm/templates/content-page-template'

DEV_IMG = '/content/dam/wknd-shared/en/magazine/western-australia/adobestock-156407519.jpeg'
LOCAL_IMG = '/content/dam/wknd-shared/en/magazine/alaska-adventure/alaskan-grizzly.jpg'


def call(host, path, data=None, method='POST'):
    body = urllib.parse.urlencode(data, doseq=True).encode() if data is not None else None
    req = urllib.request.Request(host + path, data=body, headers={'Authorization': AUTH}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def exists(host, path):
    return call(host, f'{path}.json', method='GET')[0] == 200


def create_page(host, parent, name, title):
    if exists(host, f'{parent}/{name}'):
        return
    s, _ = call(host, '/bin/wcmcommand', {'cmd': 'createPage', 'parentPath': parent, 'title': title, 'label': name,
                                          'template': TEMPLATE, '_charset_': 'utf-8'})
    if s != 200:
        raise SystemExit(f'createPage {parent}/{name} on {host} -> {s}')


def fill(host, page, node):
    s, _ = call(host, f'{page}/jcr:content/root/container', {':operation': 'import', ':contentType': 'json', ':replace': 'true',
                                                            ':replaceProperties': 'true', ':content': json.dumps(node)})
    if s not in (200, 201):
        raise SystemExit(f'fill {page} on {host} -> {s}')


def delete_page(host, page):
    if exists(host, page):
        call(host, page, {':operation': 'delete'})


def replicate(host, cmd, path):
    return call(host, '/bin/replicate.json', {'cmd': cmd, 'path': path, '_charset_': 'utf-8'})[0]


def main():
    # 1. Setup sync-demo on Dev and Local
    for name in ['local', 'dev']:
        host = HOSTS[name]
        if not exists(host, PARENT):
            create_page(host, '/content/wknd/us/en', 'orbit-demo', 'Orbit Demo')
        create_page(host, PARENT, 'sync-demo', 'Sync Demo')

    # Fill Dev sync-demo
    dev_content = {
        'jcr:primaryType': 'nt:unstructured',
        'sling:resourceType': 'wknd/components/container',
        'layout': 'responsiveGrid',
        'title': {
            'jcr:primaryType': 'nt:unstructured',
            'sling:resourceType': 'wknd/components/title',
            'jcr:title': 'Dev: Alpine Backcountry',
            'type': 'h1',
        },
        'teaser': {
            'jcr:primaryType': 'nt:unstructured',
            'sling:resourceType': 'wknd/components/teaser',
            'jcr:title': 'Ski the Powder',
            'jcr:description': 'Trek through alpine bowls and deep powder.',
            'fileReference': DEV_IMG,
            'titleType': 'h2',
        },
        'badge': {
            'jcr:primaryType': 'nt:unstructured',
            'sling:resourceType': 'wknd/components/title',
            'jcr:title': 'Expert Guides Only',
            'type': 'h3',
        },
    }
    fill(HOSTS['dev'], SYNC_PAGE, dev_content)
    print(f'Dev populated: {SYNC_PAGE}')

    # Fill Local sync-demo
    local_content = {
        'jcr:primaryType': 'nt:unstructured',
        'sling:resourceType': 'wknd/components/container',
        'layout': 'responsiveGrid',
        'title': {
            'jcr:primaryType': 'nt:unstructured',
            'sling:resourceType': 'wknd/components/title',
            'jcr:title': 'Local: Mountain Trails',
            'type': 'h1',
        },
        'teaser': {
            'jcr:primaryType': 'nt:unstructured',
            'sling:resourceType': 'wknd/components/teaser',
            'jcr:title': 'Winter Adventures',
            'jcr:description': 'Explore marked resort trails and sunny viewpoints.',
            'fileReference': LOCAL_IMG,
            'titleType': 'h2',
        },
        'notes': {
            'jcr:primaryType': 'nt:unstructured',
            'sling:resourceType': 'wknd/components/title',
            'jcr:title': 'Draft Review in Progress',
            'type': 'h3',
        },
    }
    fill(HOSTS['local'], SYNC_PAGE, local_content)
    print(f'Local populated: {SYNC_PAGE}')

    # 2. Setup expedition on Prod (and ensure deleted on Local)
    delete_page(HOSTS['local'], EXPEDITION_PAGE)
    print(f'Local cleaned: {EXPEDITION_PAGE} (does not exist, 404)')

    create_page(HOSTS['prod'], '/content/wknd/us/en', 'expedition', 'Himalayan Expedition')
    expedition_content = {
        'jcr:primaryType': 'nt:unstructured',
        'sling:resourceType': 'wknd/components/container',
        'layout': 'responsiveGrid',
        'title': {
            'jcr:primaryType': 'nt:unstructured',
            'sling:resourceType': 'wknd/components/title',
            'jcr:title': 'Prod: Himalayan Expedition',
            'type': 'h1',
        },
        'teaser': {
            'jcr:primaryType': 'nt:unstructured',
            'sling:resourceType': 'wknd/components/teaser',
            'jcr:title': 'High Altitude Trekking',
            'jcr:description': 'A journey through the high passes and remote villages.',
            'fileReference': DEV_IMG,
            'titleType': 'h2',
        },
    }
    fill(HOSTS['prod'], EXPEDITION_PAGE, expedition_content)
    replicate(HOSTS['prod'], 'Activate', EXPEDITION_PAGE)
    print(f'Prod populated and activated: {EXPEDITION_PAGE}')


if __name__ == '__main__':
    main()
