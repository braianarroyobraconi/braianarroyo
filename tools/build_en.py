#!/usr/bin/env python3
"""Builds the English pages under /en/ and the machine-readable layer for search and AI engines.

AI crawlers read raw HTML and do not run JavaScript, so English has to exist as real HTML.
This script takes every Spanish page, swaps each [data-i18n] element for its English copy
(the same dictionaries the site uses at runtime), rewrites internal links to /en/, and adds:
  - hreflang alternates and canonical URLs on both languages
  - JSON-LD (Person + ProfilePage on the home pages, CreativeWork on case studies)
  - sitemap.xml with language alternates

It also inlines assets/css/site.css into every page (edit the .css file, then rebuild).

Run after tools/build_projects.py:  python3 tools/build_projects.py && python3 tools/build_en.py
"""
import html
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://www.braianarroyo.com'

PAGES = ['/', '/experience/', '/after-hours/', '/projects/pegote/', '/projects/living-lamp/', '/projects/social-monitor/', '/projects/weeklygoals/']

HEAD = {  # per-language title and description for pages whose head is not already right
    '/': {
        'es': ('Braian Arroyo Braconi · UX Manager y líder de diseño',
               'UX Manager en NaranjaX con más de 8 años en Mercado Libre, PedidosYa y NaranjaX. Cultura de diseño, oficio e IA aplicada al proceso de diseño. Córdoba, Argentina.'),
        'en': ('Braian Arroyo Braconi · UX Manager and Design Leader',
               'UX Manager at NaranjaX with 8+ years at Mercado Libre, PedidosYa and NaranjaX. Design culture, craft and AI in the design process. Based in Córdoba, Argentina.'),
    },
    '/experience/': {
        'es': ('Experiencia · Braian Arroyo Braconi', 'Cómo lidera Braian Arroyo Braconi y dónde trabajó: NaranjaX, DesignCore, PedidosYa y Mercado Libre. Proyectos por empresa y charlas.'),
        'en': ('Experience · Braian Arroyo Braconi', 'How Braian Arroyo Braconi leads and where he has worked: NaranjaX, DesignCore, PedidosYa and Mercado Libre. Projects by company and talks.'),
    },
    '/after-hours/': {
        'es': ('After hours · Braian Arroyo Braconi', 'Proyectos propios, micro-interacciones y shaders de Braian Arroyo Braconi. Todo funciona en vivo.'),
        'en': ('After hours · Braian Arroyo Braconi', 'Side projects, coded micro-interactions and shaders by Braian Arroyo Braconi. Everything runs live.'),
    },
}

PERSON = {
    '@type': 'Person',
    '@id': SITE + '/#person',
    'name': 'Braian Arroyo Braconi',
    'givenName': 'Braian', 'familyName': 'Arroyo Braconi',
    'jobTitle': 'UX Manager',
    'description': {
        'es': 'UX Manager y líder de diseño con más de 8 años en Mercado Libre, PedidosYa y NaranjaX. Trabaja sobre la cultura de los equipos de diseño, el oficio y la IA aplicada al proceso de diseño.',
        'en': 'UX Manager and design leader with 8+ years at Mercado Libre, PedidosYa and NaranjaX. Focused on design team culture, craft, and AI in the design process.',
    },
    'worksFor': {'@type': 'Organization', 'name': 'NaranjaX', 'url': 'https://www.naranjax.com'},
    'alumniOf': {'@type': 'CollegeOrUniversity', 'name': 'Universidad Nacional de Córdoba'},
    'hasOccupation': [
        {'@type': 'Occupation', 'name': 'UX Manager', 'occupationLocation': {'@type': 'Country', 'name': 'Argentina'}},
    ],
    'knowsAbout': ['Design leadership', 'UX management', 'Design team culture', 'Product design', 'User experience design',
                   'Design systems', 'AI in the design process', 'Fintech', 'E-commerce', 'Logistics', 'Insurtech', 'Hiring and growing design teams'],
    'knowsLanguage': ['es', 'en'],
    'address': {'@type': 'PostalAddress', 'addressLocality': 'Córdoba', 'addressCountry': 'AR'},
    'email': 'mailto:braianarroyobraconi@gmail.com',
    'image': SITE + '/assets/img/braian.webp',
    'url': SITE + '/',
    'sameAs': ['https://www.linkedin.com/in/braianarroyobraconi', 'https://pegote.club'],
}

ARROW_HOME = {'es': '/', 'en': '/en/'}


def read(path):
    with open(os.path.join(ROOT, path), encoding='utf-8') as f:
        return f.read()


def write(path, text):
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, 'w', encoding='utf-8') as f:
        f.write(text)


def file_for(url):
    return (url.strip('/') + '/index.html').lstrip('/') if url != '/' else 'index.html'


def js_strings(block):
    """Parse 'key': 'value' pairs (single-quoted JS strings, with escapes) from a JS object literal."""
    out = {}
    for m in re.finditer(r"""(['"])([\w.\-]+)\1\s*:\s*(['"])((?:(?!\3)[^\\]|\\.)*)\3""", block):
        out[m.group(2)] = re.sub(r"\\(.)", r"\1", m.group(4))
    return out


def en_dict(page_html):
    common = js_strings(re.search(r"const COMMON_EN = \{(.*?)\n  \};", read('assets/js/site.js'), re.S).group(1))
    m = re.search(r"window\.I18N_EN = \{(.*?)\n    \};", page_html, re.S)
    page = js_strings(m.group(1)) if m else {}
    return {**common, **page}


def translate(page_html, en):
    def repl(m):
        tag, attrs, key = m.group(1), m.group(2), m.group(3)
        if key not in en:
            return m.group(0)
        val = en[key] if 'data-html' in attrs else html.escape(en[key], quote=False)
        return f'<{tag}{attrs}>{val}</{tag}>'
    # elements whose only job is to hold translatable copy (no nested element of the same tag)
    pattern = re.compile(r'<(\w+)((?:\s[^>]*?)?\sdata-i18n="([\w.\-]+)"[^>]*)>(.*?)</\1>', re.S)
    if 'lamp.hint' in en:
        page_html = re.sub(r'(<span[^>]*data-lamp-hint[^>]*>)[^<]*', lambda m: m.group(1) + en['lamp.hint'], page_html)
        page_html = re.sub(r'(<span[^>]*data-lamp-light[^>]*>)luz', r'\1light', page_html)
    if 'rk.idle' in en:
        page_html = re.sub(r'(<span[^>]*data-rocket-read[^>]*>)[^<]*', lambda m: m.group(1) + en['rk.idle'], page_html)
    prev = None
    while prev != page_html:
        prev = page_html
        page_html = pattern.sub(repl, page_html)
    page_html = re.sub(r'(\salt=")[^"]*("[^>]*\sdata-i18n-alt="([\w.\-]+)")', lambda m: m.group(1) + html.escape(en.get(m.group(3), ''), quote=True) + m.group(2) if m.group(3) in en else m.group(0), page_html)
    page_html = re.sub(r'(\saria-label=")[^"]*("[^>]*\sdata-i18n-aria="([\w.\-]+)")', lambda m: m.group(1) + html.escape(en.get(m.group(3), ''), quote=True) + m.group(2) if m.group(3) in en else m.group(0), page_html)
    return page_html


def localize_links(page_html):
    # internal links go to the English tree
    page_html = re.sub(r'href="/(#[^"]*)?"', lambda m: f'href="/en/{m.group(1) or ""}"', page_html)
    page_html = re.sub(r'href="/(after-hours|projects|experience)/', r'href="/en/\1/', page_html)
    return page_html


def set_head(page_html, url, lang):
    alt_es, alt_en = SITE + url, SITE + '/en' + url
    own = alt_en if lang == 'en' else alt_es
    page_html = re.sub(r'<html lang="\w+"[^>]*>', f'<html lang="{lang}" data-page-lang="{lang}" data-alt="{(url if lang == "en" else "/en" + url)}">', page_html, count=1)
    page_html = re.sub(r'\s*<link rel="alternate" hreflang="[^"]+" href="[^"]+"/>', '', page_html)
    page_html = re.sub(r'<link rel="canonical" href="[^"]*"/>',
                       f'<link rel="canonical" href="{own}"/>\n  <link rel="alternate" hreflang="es" href="{alt_es}"/>\n  <link rel="alternate" hreflang="en" href="{alt_en}"/>\n  <link rel="alternate" hreflang="x-default" href="{alt_en}"/>', page_html, count=1)
    page_html = re.sub(r'<meta property="og:url" content="[^"]*"/>', f'<meta property="og:url" content="{own}"/>', page_html, count=1)
    page_html = re.sub(r'<meta property="og:locale" content="[^"]*"/>\n  ', '', page_html)
    page_html = page_html.replace('<meta property="og:type"', f'<meta property="og:locale" content="{"en_US" if lang == "en" else "es_AR"}"/>\n  <meta property="og:type"', 1)
    if url in HEAD:
        title, desc = HEAD[url][lang]
        page_html = re.sub(r'<title>[^<]*</title>', f'<title>{html.escape(title)}</title>', page_html, count=1)
        page_html = re.sub(r'<meta name="description" content="[^"]*"/>', f'<meta name="description" content="{html.escape(desc, quote=True)}"/>', page_html, count=1)
        page_html = re.sub(r'<meta property="og:title" content="[^"]*"/>', f'<meta property="og:title" content="{html.escape(title, quote=True)}"/>', page_html, count=1)
        page_html = re.sub(r'<meta property="og:description" content="[^"]*"/>', f'<meta property="og:description" content="{html.escape(desc, quote=True)}"/>', page_html, count=1)
    return page_html


def json_ld(url, lang, page_html):
    own = SITE + ('/en' if lang == 'en' else '') + url
    person = {k: v for k, v in PERSON.items() if k != 'description'}
    person['description'] = PERSON['description'][lang]
    if url == '/':
        data = {'@context': 'https://schema.org', '@graph': [
            person,
            {'@type': 'ProfilePage', '@id': own + '#page', 'url': own, 'inLanguage': lang, 'mainEntity': {'@id': PERSON['@id']},
             'name': HEAD['/'][lang][0], 'description': HEAD['/'][lang][1]},
        ]}
    elif url.startswith('/projects/'):
        name = re.search(r'<h1[^>]*>(.*?)</h1>', page_html, re.S).group(1)
        name = re.sub(r'<[^>]+>', '', name).strip()
        desc = re.search(r'<meta name="description" content="([^"]*)"', page_html).group(1)
        data = {'@context': 'https://schema.org', '@type': 'CreativeWork', 'name': name, 'url': own, 'inLanguage': lang,
                'description': html.unescape(desc), 'dateCreated': '2026', 'author': {'@id': PERSON['@id'], '@type': 'Person', 'name': PERSON['name'], 'url': SITE + '/'}}
    else:
        data = {'@context': 'https://schema.org', '@type': 'CollectionPage', 'name': HEAD[url][lang][0], 'url': own, 'inLanguage': lang,
                'description': HEAD[url][lang][1], 'author': {'@id': PERSON['@id'], '@type': 'Person', 'name': PERSON['name'], 'url': SITE + '/'}}
    block = '<script type="application/ld+json">' + json.dumps(data, ensure_ascii=False) + '</script>'
    page_html = re.sub(r'\s*<script type="application/ld\+json">.*?</script>', '', page_html, flags=re.S)
    return page_html.replace('</head>', f'  {block}\n</head>', 1)


def inline_css(page_html):
    """Inline site.css (minified) so the first paint does not wait for a stylesheet request.
    assets/css/site.css stays the single source; this re-inlines it on every build."""
    css = read('assets/css/site.css')
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    css = re.sub(r'\s+', ' ', css)
    css = re.sub(r'\s*([{};:,>])\s*', r'\1', css).replace(';}', '}').strip()
    block = f'<style data-inline="site">{css}</style>'
    if '<style data-inline="site">' in page_html:
        return re.sub(r'<style data-inline="site">.*?</style>', lambda m: block, page_html, count=1, flags=re.S)
    return page_html.replace('<link rel="stylesheet" href="/assets/css/site.css"/>', block, 1)


def main():
    urls = []
    for url in PAGES:
        src = file_for(url)
        es = read(src)
        en = en_dict(es)
        es_out = inline_css(json_ld(url, 'es', set_head(es, url, 'es')))
        write(src, es_out)
        en_html = localize_links(translate(es, en))
        en_html = inline_css(json_ld(url, 'en', set_head(en_html, url, 'en')))
        write('en/' + src, en_html)
        urls.append(url)
        print('built', url, '+ /en' + url)
    # sitemap with language alternates
    items = []
    for url in urls:
        for lang in ('es', 'en'):
            loc = SITE + ('/en' if lang == 'en' else '') + url
            items.append(f'''  <url>
    <loc>{loc}</loc>
    <xhtml:link rel="alternate" hreflang="es" href="{SITE + url}"/>
    <xhtml:link rel="alternate" hreflang="en" href="{SITE + '/en' + url}"/>
    <changefreq>monthly</changefreq>
  </url>''')
    write('sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + '\n'.join(items) + '\n</urlset>\n')
    print('built sitemap.xml')


if __name__ == '__main__':
    main()
