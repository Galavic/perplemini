"""Import selected SVG assets already supplied in a local ClyraADE checkout.

Usage: python scripts/import-local-central-icons.py [path/to/assets/central-icons]
Reads static SVG paths only; never executes the original bundle.
"""
import hashlib
import json
from pathlib import Path
import shutil
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / 'ClyraADE/crates/ui/assets/central-icons'
DEST = ROOT / 'src/assets/central-icons'
MAPPING = {
    'ArrowLeft': 'arrow-left', 'ArrowUp': 'arrow-up', 'ArrowUpRight': 'arrow-up-right',
    'ClockCounterClockwise': 'restart', 'FolderSimple': 'folder', 'Plus': 'plus',
    'MagnifyingGlass': 'magnifer', 'Compass': 'global', 'Books': 'folder-with-files',
    'GearSix': 'settings', 'SidebarSimple': 'sidebar-minimalistic-left',
    'GlobeHemisphereWest': 'globe', 'Feather': 'pen', 'GraduationCap': 'document',
    'Paperclip': 'paperclip', 'X': 'close', 'Check': 'check', 'Copy': 'copy',
    'DownloadSimple': 'arrow-down', 'Trash': 'trash-bin-minimalistic',
    'BookmarkSimple': 'pin', 'Stop': 'stop', 'CaretDown': 'alt-arrow-down',
    'ArrowClockwise': 'refresh', 'Sun': 'sun', 'Moon': 'moon',
    'Sparkle': 'magic-stick-3', 'Lightning': 'fast-tier', 'Code': 'file-code',
    'Plant': 'global', 'Atom': 'widget', 'ChatCircle': 'chat-round-line',
}

source_manifest = json.loads((SOURCE / 'manifest.json').read_text(encoding='utf-8'))
source_entries = {i['path']: i for i in source_manifest['icons']}
glyphs = {}
for name in set(MAPPING.values()):
    svg = ET.parse(SOURCE / f'{name}.svg').getroot()
    paths = []
    for element in svg:
        if element.tag.split('}')[-1] != 'path':
            raise ValueError(f'Unsupported SVG element in {name}')
        attributes = {}
        for key, value in element.attrib.items():
            if key not in {'d', 'fill', 'stroke', 'fill-rule', 'clip-rule', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'opacity'}:
                raise ValueError(f'Unsupported SVG attribute {key}')
            if key in {'fill', 'stroke'} and value != 'none':
                value = 'currentColor'
            camel = key.split('-')[0] + ''.join(p.title() for p in key.split('-')[1:])
            attributes[camel] = value
        if not attributes.get('d'):
            raise ValueError(f'Missing path in {name}')
        paths.append(attributes)
    glyphs[name] = {'viewBox': svg.get('viewBox', '0 0 24 24'), 'paths': paths}

# Complete validation before writing or replacing any working app files.
DEST.mkdir(parents=True, exist_ok=True)
entries = []
for name in sorted(glyphs):
    shutil.copy2(SOURCE / f'{name}.svg', DEST / f'{name}.svg')
    entries.append({**source_entries[name], 'sha256': hashlib.sha256((SOURCE / f'{name}.svg').read_bytes()).hexdigest()})
manifest = {k: v for k, v in source_manifest.items() if k != 'icons'}
manifest.update({'imported_from': 'ClyraADE/crates/ui/assets/central-icons', 'icons': entries, 'app_aliases': MAPPING})
(DEST / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
(DEST / 'glyphs.json').write_text(json.dumps(glyphs, separators=(',', ':')) + '\n', encoding='utf-8')
shutil.copy2(SOURCE / 'README.md', DEST / 'SOURCE.md')
module = '''// Local Central Icons; provenance and separate license: assets/central-icons/README.md.
import { createElement } from 'react';
import glyphs from './assets/central-icons/glyphs.json';

function centralIcon(name) {
  return function CentralIcon({ size = 24, weight, color = 'currentColor', ...props }) {
    const glyph = glyphs[name];
    return createElement('svg', {
      width: size, height: size, viewBox: glyph.viewBox, fill: 'none', color,
      'aria-hidden': true, focusable: false, 'data-icon-set': 'central',
      'data-icon-name': name, 'data-icon-weight': weight, ...props,
    }, glyph.paths.map((attributes, key) => createElement('path', { ...attributes, key })));
  };
}
'''
module += '\n'.join(f"export const {alias} = centralIcon('{name}');" for alias, name in MAPPING.items()) + '\n'
(ROOT / 'src/icons.jsx').write_text(module, encoding='utf-8')
print(f'Imported {len(glyphs)} local SVG assets for {len(MAPPING)} icon aliases.')
