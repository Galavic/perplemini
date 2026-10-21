import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

// Official package: round outlined icons, radius 2, stroke 1.5.
const packageName = '@central-icons-react/round-outlined-radius-2-stroke-1.5';
const mapping = {
  ArrowLeft: 'IconArrowLeft',
  ArrowUp: 'IconArrowUp',
  ArrowUpRight: 'IconArrowUpRight',
  ClockCounterClockwise: 'IconHistory',
  FolderSimple: 'IconFolder1',
  Plus: 'IconPlusSmall',
  MagnifyingGlass: 'IconMagnifyingGlass',
  Compass: 'IconCompassRound',
  Books: 'IconBooks',
  GearSix: 'IconSettingsGear1',
  SidebarSimple: 'IconSidebarSimpleLeftWide',
  GlobeHemisphereWest: 'IconGlobe',
  Feather: 'IconFeather',
  GraduationCap: 'IconGraduateCap',
  Paperclip: 'IconPaperclip1',
  X: 'IconCrossSmall',
  Check: 'IconCheckmark1',
  Copy: 'IconLayersTwo',
  DownloadSimple: 'IconArrowDownWall',
  Trash: 'IconTrashCanSimple',
  BookmarkSimple: 'IconBookmark',
  Stop: 'IconStop',
  CaretDown: 'IconChevronBottom',
  ArrowClockwise: 'IconArrowRotateClockwise',
  Sun: 'IconSun',
  Moon: 'IconMoon',
  Sparkle: 'IconSparkle',
  Lightning: 'IconLightning',
  Code: 'IconCode',
  Plant: 'IconTree',
  Atom: 'IconAtom',
  ChatCircle: 'IconBubble2',
};

if (!process.env.CENTRAL_LICENSE_KEY?.trim()) {
  console.error('Falta CENTRAL_LICENSE_KEY. Configura tu licencia en .env y vuelve a ejecutar npm run icons:central. La clave no se incluye en el cliente.');
  process.exit(1);
}
if (!process.env.npm_execpath) {
  console.error('Ejecuta este script con npm run icons:central.');
  process.exit(1);
}

const result = spawnSync(process.execPath, [process.env.npm_execpath, 'install', `${packageName}@1.2.17`], {
  cwd: new URL('../', import.meta.url),
  env: process.env,
  stdio: 'inherit',
});
if (result.error || result.status !== 0) {
  console.error('No se pudo instalar Central Icons. Se conservan los iconos anteriores.');
  process.exit(1);
}

// Verify every public export before replacing the working icon module.
for (const name of Object.values(mapping)) {
  const mod = await import(`${packageName}/${name}`);
  if (!mod[name]) throw new Error(`El paquete no exporta ${name}. No se han sustituido los iconos.`);
}
const lines = [
  '// Central Icons assets retain their own license: https://iconists.co/license',
  "import { createElement } from 'react';",
  ...Object.entries(mapping).map(([alias, name]) => `import { ${name} as Central${alias} } from '${packageName}/${name}';`),
  '',
  'function adapt(Icon) {',
  '  return function AppIcon({ weight, ...props }) {',
  "    return createElement(Icon, { ...props, 'data-icon-weight': weight, 'aria-hidden': props['aria-hidden'] ?? true });",
  '  };',
  '}',
  ...Object.keys(mapping).map(alias => `export const ${alias} = adapt(Central${alias});`),
  '',
];
await writeFile(new URL('../src/icons.jsx', import.meta.url), lines.join('\n'));
console.log('Central Icons activado. Ejecuta npm run build para verificar y reinicia el servidor de desarrollo.');
