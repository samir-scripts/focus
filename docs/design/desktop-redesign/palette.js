// User-supplied sRGB bytes: canvas, surface, rail, selected, ink, action, secondary.
const palettes = {
  sage: ['Sage', 'F4F5ED FCFBF4 DBE6D5 C7D9C2 233429 2D583E A33E32', '1D2822 26332B 304035 3A5041 EBF2E4 B7D9A9 ECA38E'],
  cobalt: ['Cobalt', 'F3F5FA FBFCFF E0E7F6 CDD9F5 131C41 233FAD A51C60', '191F32 222A40 2B3550 364563 EDF1FF A7BEFF FF90BF'],
  plum: ['Plum', 'F7F1F5 FDF9FC E9DCE8 DFCBDF 35263A 6D386C 9A4D26', '2A202E 352938 423146 503D53 F5EAF3 E0B5E0 F1AE81'],
  'olive-khaki': ['Olive & Khaki', 'EDE8DB F7F4EA D8CDB7 C4B69A 303329 414D32 795031', '292C25 32362D 3A3D32 47503E EDE8DB C6D3AF DAC09A'],
  'oat-espresso': ['Oat & Espresso', 'F0EEE9 F8F5EF E6DCC8 D3C6B0 3B2E28 664434 4E6158', '29221F 332B27 3B2E28 4B3B33 F0EEE9 E2C2A1 B7CBBD'],
  'cocoa-blush': ['Cocoa & Blush', 'F6EEEA FCF6F2 E6D7D1 D9C4BC 4A3835 784650 67556D', '2C2324 392C2D 463437 584148 F3E7E1 EAB8BC D4C0DB'],
  'graphite-clay': ['Graphite & Clay', 'F9F7F0 FDFBF5 D8D2C2 DBC4AF 373633 78462E 435F52', '282827 313130 3B3A38 49433C F9F7F0 E5AD89 B7CDB9'],
};
const roleNames = ['canvas', 'surface', 'rail', 'selected', 'ink', 'accent', 'secondary'];
function paletteRoles(id, dark) {
  const roles = Object.fromEntries(palettes[id][dark ? 2 : 1].split(' ').map((hex, i) => [roleNames[i], '#' + hex]));
  function mix(pct) {
    return '#' + [1, 3, 5].map(i => Math.round((parseInt(roles.ink.slice(i, i + 2), 16) * pct + parseInt(roles.selected.slice(i, i + 2), 16) * (100 - pct)) / 100).toString(16).padStart(2, '0')).join('');
  }
  return { ...roles, muted: mix(84), edge: mix(70), divider: mix(35), 'on-accent': dark ? roles.canvas : roles.surface };
}
