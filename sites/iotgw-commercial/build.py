#!/usr/bin/env python3
"""Build the multilingual static site.

Source of truth is Catalan: src/pages/*.html. Spanish and English come from
i18n/<lang>.json, a map "Catalan text -> translation" for every visible text
fragment and translatable attribute. Output goes to dist/ (the hosting root):

    dist/index.html          language router (saved choice > IP geolocation > browser)
    dist/{ca,es,en}/*.html   one copy of every page per language
    dist/assets, styles.css, app.js   shared

Usage:
    python3 build.py            build dist/ (fails on any missing translation)
    python3 build.py --extract  write i18n/strings.ca.json (all source strings)
"""
import html
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC, DIST, I18N = ROOT / 'src', ROOT / 'dist', ROOT / 'i18n'
LANGS = ['ca', 'es', 'en']
DEFAULT = 'ca'
LOCALE = {'ca': 'ca_ES', 'es': 'es_ES', 'en': 'en_GB'}
LABEL = {'ca': 'Català', 'es': 'Castellano', 'en': 'English'}
SWITCH_LABEL = {'ca': 'Idioma', 'es': 'Idioma', 'en': 'Language'}
ATTRS = ('alt', 'aria-label', 'title', 'placeholder', 'content')
NON_TEXT_META = ('charset', 'viewport', 'theme-color', 'og:type', 'og:locale', 'og:image')

TEXT_RE = re.compile(r'>([^<>]+)<')
ATTR_RE = re.compile(r'\b(' + '|'.join(ATTRS) + r')="([^"]*)"')
SKIP_BLOCK_RE = re.compile(r'<(script|style)\b.*?</\1>', re.S)


def pages():
    return sorted(SRC.glob('pages/*.html'))


def translatable(text):
    t = html.unescape(text).strip()
    return t if t and re.search(r'[A-Za-zÀ-ÿ]', t) else None


def meta_is_text(tag_prefix):
    return not any(f'"{m}"' in tag_prefix for m in NON_TEXT_META)


def collect(source):
    found = []
    body = SKIP_BLOCK_RE.sub('', source)
    for m in TEXT_RE.finditer(body):
        t = translatable(m.group(1))
        if t:
            found.append(t)
    for m in ATTR_RE.finditer(body):
        if m.group(1) == 'content':
            tag_start = body.rfind('<', 0, m.start())
            if not meta_is_text(body[tag_start:m.start()]):
                continue
        t = translatable(m.group(2))
        if t:
            found.append(t)
    return found


def extract():
    seen, order = set(), []
    for page in pages():
        for t in collect(page.read_text(encoding='utf-8')):
            if t not in seen:
                seen.add(t)
                order.append(t)
    I18N.mkdir(exist_ok=True)
    out = I18N / 'strings.ca.json'
    out.write_text(json.dumps(order, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'{len(order)} strings -> {out.relative_to(ROOT)}')


def translate(source, table, lang, missing):
    if lang == DEFAULT:
        return source

    def tr(raw):
        t = translatable(raw)
        if not t:
            return raw
        if t not in table:
            missing.add(t)
            return raw
        lead = raw[:len(raw) - len(raw.lstrip())]
        trail = raw[len(raw.rstrip()):]
        return lead + html.escape(table[t], quote=False) + trail

    # protect script/style blocks
    blocks = []

    def stash(m):
        blocks.append(m.group(0))
        return f'\x00{len(blocks) - 1}\x00'

    s = SKIP_BLOCK_RE.sub(stash, source)
    s = TEXT_RE.sub(lambda m: '>' + tr(m.group(1)) + '<', s)

    def attr(m):
        if m.group(1) == 'content':
            tag_start = s.rfind('<', 0, m.start())
            if not meta_is_text(s[tag_start:m.start()]):
                return m.group(0)
        value = tr(html.unescape(m.group(2)))
        return f'{m.group(1)}="{html.escape(value, quote=True)}"'

    s = ATTR_RE.sub(attr, s)
    return re.sub(r'\x00(\d+)\x00', lambda m: blocks[int(m.group(1))], s)


def localise(page_html, name, lang):
    s = page_html.replace('<html lang="ca">', f'<html lang="{lang}">', 1)
    s = s.replace('content="ca_ES"', f'content="{LOCALE[lang]}"')
    # shared files live one level up (poster= too, for <video>)
    s = re.sub(r'(href|src|poster)="(styles\.css|app\.js|assets/)', r'\1="../\2', s)
    # Localised video: use this language's renditions when they exist, else keep the Catalan ones.
    if lang != DEFAULT and (SRC / 'assets' / 'video' / f'plataforma.{lang}.720.mp4').exists():
        s = s.replace(f'plataforma.{DEFAULT}.', f'plataforma.{lang}.')
    alternates = ''.join(f'<link rel="alternate" hreflang="{l}" href="../{l}/{name}">' for l in LANGS)
    alternates += f'<link rel="alternate" hreflang="x-default" href="../">'
    s = s.replace('</head>', alternates + '\n</head>', 1)
    switch = (f'<div class="lang-switch" role="group" aria-label="{SWITCH_LABEL[lang]}">' + ''.join(
        f'<a href="../{l}/{name}" hreflang="{l}" lang="{l}" data-lang="{l}" title="{LABEL[l]}"'
        + (' aria-current="true"' if l == lang else '') + f'>{l.upper()}</a>' for l in LANGS) + '</div>')
    s = s.replace('<button id="menu-toggle"', switch + '<button id="menu-toggle"', 1)
    return s


ROUTER = '''<!doctype html>
<html lang="ca">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>IoT Gateway NG</title>
<meta name="robots" content="noindex">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
__ALTERNATES__
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:Ubuntu,Arial,sans-serif;background:#13162b;color:#fff}.spinner{width:44px;height:44px;border-radius:50%;border:3px solid #ffffff26;border-top-color:#ff6600;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.spinner{animation-duration:2s}}nav{display:flex;gap:18px}a{color:#fff;border:1px solid #ffffff40;border-radius:999px;padding:10px 18px;text-decoration:none}a:hover{border-color:#ff6600;color:#ff6600}</style>
<script>
// Language choice: saved choice (localStorage) > IP geolocation > browser language > English.
(function () {
  var KEY = 'iotgw-lang', LANGS = ['ca', 'es', 'en'];
  var CA_REGIONS = ['CT', 'IB', 'VC'];
  var ES_COUNTRIES = ['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'VE', 'EC', 'GT', 'CU', 'BO', 'DO', 'HN', 'PY', 'SV', 'NI', 'CR', 'PA', 'UY', 'PR', 'GQ'];
  var done = false;
  function go(lang) {
    if (done) return;
    done = true;
    location.replace(lang + '/' + location.search + location.hash);
  }
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
  if (LANGS.indexOf(saved) !== -1) return go(saved);

  function fromBrowser() {
    var list = navigator.languages || [navigator.language || ''];
    for (var i = 0; i < list.length; i++) {
      var code = String(list[i]).slice(0, 2).toLowerCase();
      if (LANGS.indexOf(code) !== -1) return code;
    }
    return 'en';
  }
  function fromGeo(data) {
    var d = data && data.Data;
    var country = d && d.Country && d.Country.IsoCode;
    if (!country) return null;
    var regions = (d.Subdivisions || []).map(function (s) { return s.IsoCode; });
    if (country === 'AD') return 'ca';
    if (country === 'ES') return regions.some(function (r) { return CA_REGIONS.indexOf(r) !== -1; }) ? 'ca' : 'es';
    if (ES_COUNTRIES.indexOf(country) !== -1) return 'es';
    return 'en';
  }
  function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise(function (_, reject) { setTimeout(reject, ms); })]);
  }
  function text(url) {
    return withTimeout(fetch(url, { cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : Promise.reject(); }), 2000);
  }
  // Safety net: never leave the visitor on this page.
  setTimeout(function () { go(fromBrowser()); }, 4500);
  if (!window.fetch || !window.Promise) return go(fromBrowser());
  text('https://ip.joor.net/')
    .catch(function () { return text('https://api.ipify.org/'); })
    .then(function (ip) { return text('https://geoip.joor.net/' + encodeURIComponent(ip.trim())); })
    .then(function (body) { return fromGeo(JSON.parse(body)) || fromBrowser(); })
    .catch(fromBrowser)
    .then(go);
})();
</script>
</head>
<body>
<div class="spinner" role="status" aria-label="Carregant · Cargando · Loading"></div>
<noscript><nav aria-label="Idioma · Idioma · Language"><a href="ca/" hreflang="ca" lang="ca">Català</a><a href="es/" hreflang="es" lang="es">Castellano</a><a href="en/" hreflang="en" lang="en">English</a></nav></noscript>
</body>
</html>
'''


def build():
    tables = {DEFAULT: {}}
    for lang in LANGS:
        if lang != DEFAULT:
            tables[lang] = json.loads((I18N / f'{lang}.json').read_text(encoding='utf-8'))
    # Empty dist/ in place (keeps the directory itself, so a running preview server keeps working).
    DIST.mkdir(exist_ok=True)
    for child in DIST.iterdir():
        shutil.rmtree(child) if child.is_dir() else child.unlink()
    shutil.copytree(SRC / 'assets', DIST / 'assets')
    for f in ('styles.css', 'app.js'):
        shutil.copy2(SRC / f, DIST / f)
    missing = {}
    for lang in LANGS:
        (DIST / lang).mkdir()
        miss = set()
        for page in pages():
            out = translate(page.read_text(encoding='utf-8'), tables[lang], lang, miss)
            (DIST / lang / page.name).write_text(localise(out, page.name, lang), encoding='utf-8')
        if miss:
            missing[lang] = sorted(miss)
    alternates = ''.join(f'<link rel="alternate" hreflang="{l}" href="{l}/">' for l in LANGS)
    (DIST / 'index.html').write_text(ROUTER.replace('__ALTERNATES__', alternates), encoding='utf-8')
    if missing:
        for lang, items in missing.items():
            print(f'[{lang}] {len(items)} missing translations:', file=sys.stderr)
            for t in items[:40]:
                print('   ', t, file=sys.stderr)
        sys.exit(1)
    print(f'built {len(pages())} pages x {len(LANGS)} languages -> {DIST.relative_to(ROOT)}/')


if __name__ == '__main__':
    extract() if '--extract' in sys.argv else build()
