export const palettes = { sage: 'Sage', cobalt: 'Cobalt', plum: 'Plum' } as const;

export type Mode = 'system' | 'light' | 'dark';
export type PaletteMode = Exclude<Mode, 'system'>;
export type Palette = keyof typeof palettes;

type Appearance = {
  mode: Mode;
  light: Palette;
  dark: Palette;
  printIllustrations: boolean;
  tonerPaused: boolean;
};

const keys = {
  mode: 'focus.appearance',
  light: 'focus.palette.light',
  dark: 'focus.palette.dark',
  printIllustrations: 'focus.printIllustrations',
  tonerPaused: 'focus.tonerPaused',
} as const;

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readPalette(mode: PaletteMode): Palette {
  const value = read(keys[mode]);
  return value === 'cobalt' || value === 'plum' ? value : 'sage';
}

export function readAppearance(): Appearance {
  const mode = read(keys.mode);
  return {
    mode: mode === 'light' || mode === 'dark' ? mode : 'system',
    light: readPalette('light'),
    dark: readPalette('dark'),
    printIllustrations: read(keys.printIllustrations) !== 'false',
    tonerPaused: read(keys.tonerPaused) === 'true',
  };
}

export function saveAppearance<K extends keyof Appearance>(setting: K, value: Appearance[K]): void {
  try {
    if (setting === 'mode' && value === 'system') window.localStorage.removeItem(keys.mode);
    else window.localStorage.setItem(keys[setting], String(value));
  } catch {
    // The preference still applies in this window if storage is unavailable.
  }
}
