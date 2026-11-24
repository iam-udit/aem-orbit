#!/usr/bin/env python3
"""Fill the Ch2/Ch3 demo pages on Dev with body content (so they are not just header + footer).
Usage: ORBIT_ADMIN_PW=admin python3 video/env/demo-content.py"""
import base64, json, os, urllib.parse, urllib.request

AUTHOR = 'http://127.0.0.1:4512'
BASE = '/content/wknd/us/en/orbit-demo'
PW = os.environ['ORBIT_ADMIN_PW']
AUTH = 'Basic ' + base64.b64encode(f'admin:{PW}'.encode()).decode()
IMG = '/content/dam/wknd-shared/en/magazine/alaska-adventure/alaskan-grizzly.jpg'
IMG2 = '/content/dam/wknd-shared/en/magazine/fly-fishing-amazon/amazon-river-02.jpg'

def teaser(title, desc, img):
    return {'jcr:primaryType': 'nt:unstructured', 'sling:resourceType': 'wknd/components/teaser', 'jcr:title': title,
            'jcr:description': desc, 'fileReference': img, 'titleType': 'h2'}

def body(heading, lead):
    return {
        'jcr:primaryType': 'nt:unstructured', 'sling:resourceType': 'wknd/components/container', 'layout': 'responsiveGrid',
        'title': {'jcr:primaryType': 'nt:unstructured', 'sling:resourceType': 'wknd/components/title', 'jcr:title': heading, 'type': 'h1'},
        'text': {'jcr:primaryType': 'nt:unstructured', 'sling:resourceType': 'wknd/components/text', 'textIsRich': 'true',
                 'text': f'<p>{lead}</p><p>This page exists only for the AEM Orbit walkthrough. It has real body content so the page fills the screen.</p>'},
        'teaser': teaser('Alaskan Adventure', 'Trek through the backcountry and watch the grizzlies fish for salmon.', IMG),
        'separator': {'jcr:primaryType': 'nt:unstructured', 'sling:resourceType': 'wknd/components/separator'},
        'title_more': {'jcr:primaryType': 'nt:unstructured', 'sling:resourceType': 'wknd/components/title', 'jcr:title': 'More to explore', 'type': 'h2'},
        'text_more': {'jcr:primaryType': 'nt:unstructured', 'sling:resourceType': 'wknd/components/text', 'textIsRich': 'true',
                      'text': '<p>Camping, surfing, skiing and fly fishing: every WKND adventure starts with a good plan and the right gear.</p>'},
        'teaser_more': teaser('Fly Fishing the Amazon', 'Cast a line on one of the most biodiverse rivers on earth.', IMG2),
    }

PAGES = {
    'status-demo': ('Status Demo', 'A page with a lock and a publishing schedule.'),
    'toast-demo': ('Toast Demo', 'A page to publish, undo and publish again.'),
    '': ('Orbit Demo', 'Parent of the demo pages.'),
}
for name, (heading, lead) in PAGES.items():
    page = f'{BASE}/{name}' if name else BASE
    data = urllib.parse.urlencode({':operation': 'import', ':contentType': 'json', ':replace': 'true', ':replaceProperties': 'true',
                                   ':content': json.dumps(body(heading, lead))}).encode()
    req = urllib.request.Request(f'{AUTHOR}{page}/jcr:content/root/container', data=data, headers={'Authorization': AUTH}, method='POST')
    with urllib.request.urlopen(req, timeout=30) as r:
        print(page, r.status)

# Ensure toast-demo has no previous replication status so it is always a pristine draft
reset_req = urllib.request.Request(
    f'{AUTHOR}{BASE}/toast-demo/jcr:content',
    data=urllib.parse.urlencode({'cq:lastReplicationAction@Delete': 'true', 'cq:lastReplicated@Delete': 'true'}).encode(),
    headers={'Authorization': AUTH},
    method='POST'
)
with urllib.request.urlopen(reset_req, timeout=30) as r:
    print('toast-demo reset to draft:', r.status)

