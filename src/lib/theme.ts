/**
 * Light / dark theme. The default follows the system; a reader's pick is kept in the
 * IFAI_THEME cookie and written to <html data-theme> before first paint, so pages stay
 * static and never flash white. The colors themselves live in globals.css.
 */
export const themes = ['system', 'light', 'dark'] as const
export type Theme = (typeof themes)[number]

export const THEME_COOKIE = 'IFAI_THEME'
const maxAge = 60 * 60 * 24 * 365

/** Page background per theme, for the browser's theme-color. Matches --color-bg. */
export const themeColors = { light: '#ffffff', dark: '#1f1f22' } as const

export function parseTheme(value: string | null | undefined): Theme {
  return value === 'light' || value === 'dark' ? value : 'system'
}

export function themeFromCookie(cookie: string): Theme {
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=([^;]*)`))
  return parseTheme(match?.[1])
}

/** Runs inline in <head>, before the body paints. Kept tiny and dependency-free. */
export const themeScript = `try{var m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=(light|dark)(?:;|$)/);if(m)document.documentElement.dataset.theme=m[1]}catch(e){}`

/** Client only: remember the pick and apply it right away. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') {
    delete root.dataset.theme
    document.cookie = `${THEME_COOKIE}=; path=/; max-age=0; samesite=lax`
  } else {
    root.dataset.theme = theme
    document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${maxAge}; samesite=lax`
  }
}
