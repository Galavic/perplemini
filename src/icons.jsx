// Local Central Icons; provenance and separate license: assets/central-icons/README.md.
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
export const ArrowLeft = centralIcon('arrow-left');
export const ArrowUp = centralIcon('arrow-up');
export const ArrowUpRight = centralIcon('arrow-up-right');
export const ClockCounterClockwise = centralIcon('restart');
export const FolderSimple = centralIcon('folder');
export const Plus = centralIcon('plus');
export const MagnifyingGlass = centralIcon('magnifer');
export const Compass = centralIcon('global');
export const Books = centralIcon('folder-with-files');
export const GearSix = centralIcon('settings');
export const SidebarSimple = centralIcon('sidebar-minimalistic-left');
export const GlobeHemisphereWest = centralIcon('globe');
export const Feather = centralIcon('pen');
export const GraduationCap = centralIcon('document');
export const Paperclip = centralIcon('paperclip');
export const X = centralIcon('close');
export const Check = centralIcon('check');
export const Copy = centralIcon('copy');
export const DownloadSimple = centralIcon('arrow-down');
export const Trash = centralIcon('trash-bin-minimalistic');
export const BookmarkSimple = centralIcon('pin');
export const Stop = centralIcon('stop');
export const CaretDown = centralIcon('alt-arrow-down');
export const ArrowClockwise = centralIcon('refresh');
export const Sun = centralIcon('sun');
export const Moon = centralIcon('moon');
export const Sparkle = centralIcon('magic-stick-3');
export const Lightning = centralIcon('fast-tier');
export const Code = centralIcon('file-code');
export const Plant = centralIcon('global');
export const Atom = centralIcon('widget');
export const ChatCircle = centralIcon('chat-round-line');
