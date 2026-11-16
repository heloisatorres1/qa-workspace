// Appearance preference: follow the operating system, or force light/dark.
// Stored per browser; the page still renders correctly if storage is blocked.

export type ThemePref = 'system' | 'light' | 'dark';
export const THEME_KEY = 'qa-workspace.theme';
export const THEME_ORDER: ThemePref[] = ['system', 'light', 'dark'];

export function readTheme(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === 'system') delete root.dataset.theme;
  else root.dataset.theme = pref;
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, pref);
  } catch {
    // Preference just won't persist.
  }
}

export function nextTheme(pref: ThemePref): ThemePref {
  return THEME_ORDER[(THEME_ORDER.indexOf(pref) + 1) % THEME_ORDER.length];
}
