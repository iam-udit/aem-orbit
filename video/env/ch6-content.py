#!/usr/bin/env python3
"""Create (or reset) Chapter 6 demo content:
1. /content/wknd/us/en/orbit-demo/seo/good-page (healthy SEO, a11y, valid links -> high quality score)
2. /content/wknd/us/en/orbit-demo/seo/bad-page  (short title/desc, noindex, skipped headings, missing alt, unnamed button, unlabelled input, broken link)

Usage: ORBIT_ADMIN_PW=admin python3 video/env/ch6-content.py
"""
import base64, json, os, urllib.error, urllib.parse, urllib.request

PW = os.environ.get('ORBIT_ADMIN_PW', 'admin')
AUTH = 'Basic ' + base64.b64encode(f'admin:{PW}'.encode()).decode()
HOST = 'http://127.0.0.1:4512'
PARENT = '/content/wknd/us/en/orbit-demo'
SEO_ROOT = f'{PARENT}/seo'
TEMPLATE = '/conf/wknd/settings/wcm/templates/content-page-template'
PUBLISHED_IMG = '/content/dam/wknd-shared/en/magazine/alaska-adventure/alaskan-grizzly.jpg'


def call(path, data=None, method='POST'):
    body = urllib.parse.urlencode(data, doseq=True).encode() if data is not None else None
    req = urllib.request.Request(HOST + path, data=body, headers={'Authorization': AUTH}, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def disable_linkchecker():
    """Disable AEM LinkChecker stripping so client-side audit can detect 404 links."""
    call('/system/console/configMgr/com.day.cq.rewriter.linkchecker.impl.LinkCheckerTransformerFactory', {
        'apply': 'true',
        'propertylist': 'linkcheckertransformer.disableChecking',
        'linkcheckertransformer.disableChecking': 'true',
        '$location': ''
    })


def delete_page(path):
    call('/bin/wcmcommand', {'cmd': 'deletePage', 'path': path, 'force': 'true', '_charset_': 'utf-8'})


def create_page(parent, name, title):
    s, _ = call('/bin/wcmcommand', {'cmd': 'createPage', 'parentPath': parent, 'title': title, 'label': name,
                                    'template': TEMPLATE, '_charset_': 'utf-8'})
    if s not in (200, 201):
        raise SystemExit(f'createPage {parent}/{name} -> {s}')


def set_props(path, props):
    s, _ = call(f'{path}/jcr:content', props)
    if s not in (200, 201):
        raise SystemExit(f'set_props {path} -> {s}')


def set_content(path, node):
    s, _ = call(f'{path}/jcr:content/root/container', {
        ':operation': 'import', ':contentType': 'json', ':replace': 'true',
        ':replaceProperties': 'true', ':content': json.dumps(node)
    })
    if s not in (200, 201):
        raise SystemExit(f'set_content {path} -> {s}')


def build():
    disable_linkchecker()

    # 0. Clean & recreate parent
    delete_page(SEO_ROOT)
    create_page(PARENT, 'seo', 'SEO & Accessibility Audits')

    # 1. Good Page: Healthy SEO, accessibility, valid internal links
    create_page(SEO_ROOT, 'good-page', 'Alaskan Wilderness & Wildlife Guide | WKND Magazine')
    set_props(f'{SEO_ROOT}/good-page', {
        'jcr:description': 'Discover the pristine wilderness of Alaska with our expert guides. Plan multi-day hiking expeditions, wildlife photography tours, and backcountry trips.',
        'canonicalUrl': 'https://dev-cloud-author.com/content/wknd/us/en/orbit-demo/seo/good-page.html',
    })
    good_container = {
        'jcr:primaryType': 'nt:unstructured',
        'sling:resourceType': 'wknd/components/container',
        'layout': 'responsiveGrid',
        'title': {
            'jcr:primaryType': 'nt:unstructured',
            'sling:resourceType': 'wknd/components/title',
            'jcr:title': 'Alaskan Wilderness Expeditions',
            'type': 'h1'
        },
        'text_lead': {
            'jcr:primaryType': 'nt:unstructured',
            'sling:resourceType': 'wknd/components/text',
            'text': '<p class="cmp-text__paragraph">Explore untouched tundra, coastal fjords, and alpine ridges with experienced naturalists.</p>',
            'textIsRich': 'true'
        },
        'heading_trails': {
            'jcr:primaryType': 'nt:unstructured',
            'sling:resourceType': 'wknd/components/title',
            'jcr:title': 'Backcountry Hiking Trails',
            'type': 'h2'
        },
        'heading_denali': {
            'jcr:primaryType': 'nt:unstructured',
            'sling:resourceType': 'wknd/components/title',
            'jcr:title': 'Denali Basecamp & Glacier Passes',
            'type': 'h3'
        },
        'teaser_main': {
            'jcr:primaryType': 'nt:unstructured',
            'sling:resourceType': 'wknd/components/teaser',
            'jcr:title': 'Wildlife Photography Expedition',
            'jcr:description': '<p>Join award-winning photographers capturing brown bears, moose, and bald eagles in their natural habitats.</p>',
            'fileReference': PUBLISHED_IMG,
            'alt': 'Brown bear fishing in Alaskan mountain river',
            'actionsEnabled': 'true',
            'actions': {
                'jcr:primaryType': 'nt:unstructured',
                'item0': {
                    'jcr:primaryType': 'nt:unstructured',
                    'title': 'Explore Magazine Stories',
                    'linkURL': '/content/wknd/us/en/magazine.html'
                },
                'item1': {
                    'jcr:primaryType': 'nt:unstructured',
                    'title': 'View All Adventures',
                    'linkURL': '/content/wknd/us/en/adventures.html'
                }
            }
        }
    }
    set_content(f'{SEO_ROOT}/good-page', good_container)

    # 2. Bad Page: Issues across SEO, Accessibility, and Link Health
    create_page(SEO_ROOT, 'bad-page', 'Bad')
    set_props(f'{SEO_ROOT}/bad-page', {
        'jcr:title': 'Bad',
        'jcr:description': 'Too short',
        'cq:robotsTags': ['noindex', 'nofollow'],
    })
    bad_container = {
        'jcr:primaryType': 'nt:unstructured',
        'sling:resourceType': 'wknd/components/container',
        'layout': 'responsiveGrid',
        'title_extra_1': {
            'jcr:primaryType': 'nt:unstructured',
            'sling:resourceType': 'wknd/components/title',
            'jcr:title': 'First Heading One',
            'type': 'h1'
        },
        'title_extra_2': {
            'jcr:primaryType': 'nt:unstructured',
            'sling:resourceType': 'wknd/components/title',
            'jcr:title': 'Second Duplicate Heading One',
            'type': 'h1'
        },
        'heading_h2': {
            'jcr:primaryType': 'nt:unstructured',
            'sling:resourceType': 'wknd/components/title',
            'jcr:title': 'Section Heading Two',
            'type': 'h2'
        },
        'heading_h4_skipped': {
            'jcr:primaryType': 'nt:unstructured',
            'sling:resourceType': 'wknd/components/title',
            'jcr:title': 'Skipped Directly to Heading Four',
            'type': 'h4'
        },
        'raw_html_issues': {
            'jcr:primaryType': 'nt:unstructured',
            'sling:resourceType': 'wknd/components/text',
            'text': (
                '<div class="audit-bad-elements">'
                '  <p><img src="' + PUBLISHED_IMG + '" /></p>'
                '  <p><button class="cmp-button" type="button"></button></p>'
                '  <p><input type="text" name="unlabelled-input" placeholder="No label" /></p>'
                '  <p><a href="/content/wknd/us/en/orbit-demo/seo/non-existing-broken-link.html">Broken Internal Link (404)</a></p>'
                '</div>'
            ),
            'textIsRich': 'true'
        }
    }
    set_content(f'{SEO_ROOT}/bad-page', bad_container)
    print('ch6 demo content ready: /content/wknd/us/en/orbit-demo/seo/{good-page,bad-page}')


if __name__ == '__main__':
    build()
