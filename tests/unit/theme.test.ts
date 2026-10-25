import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseTheme, THEME_COOKIE, themeFromCookie, themeScript } from '@/lib/theme'

describe('theme cookie', () => {
  it('reads light and dark, and treats anything else as following the system', () => {
    expect(themeFromCookie(`${THEME_COOKIE}=dark`)).toBe('dark')
    expect(themeFromCookie(`IFAI_LOCALE=ja; ${THEME_COOKIE}=light; other=1`)).toBe('light')
    expect(themeFromCookie(`${THEME_COOKIE}=sepia`)).toBe('system')
    expect(themeFromCookie('X_IFAI_THEME=dark')).toBe('system')
    expect(themeFromCookie('')).toBe('system')
    expect(parseTheme(undefined)).toBe('system')
  })

  it('applies the same pick in the inline script before paint', () => {
    const run = (cookie: string) => {
      const dataset: Record<string, string> = {}
      new Function('document', themeScript)({ cookie, documentElement: { dataset } })
      return dataset.theme
    }
    expect(run(`a=1; ${THEME_COOKIE}=dark`)).toBe('dark')
    expect(run(`${THEME_COOKIE}=light`)).toBe('light')
    expect(run(`${THEME_COOKIE}=darker`)).toBeUndefined()
    expect(run('')).toBeUndefined()
  })
})

/** The dark theme only swaps variables, so a few class pairs read wrong in it. Catch them in new code. */
describe('classes that break in dark mode', () => {
  const root = path.resolve(import.meta.dirname, '../../src')
  const files = (readdirSync(root, { recursive: true }) as string[])
    .filter((file) => /\.tsx?$/.test(file) && !file.startsWith('app/(payload)') && !file.includes('/admin/') && !file.startsWith('admin/'))
    .map((file) => ({ file, lines: readFileSync(path.join(root, file), 'utf8').split('\n') }))

  const offending = (test: (line: string) => boolean) =>
    files.flatMap(({ file, lines }) => lines.flatMap((line, i) => (test(line) ? [`${file}:${i + 1}`] : [])))

  it('uses accent-ink, not accent, for red text', () => {
    expect(offending((line) => /(?<![\w-])text-accent(?![\w-])/.test(line))).toEqual([])
  })

  it('puts text-bg, not text-white, on bg-ink', () => {
    expect(offending((line) => /(?<![\w-])bg-ink(?![\w-])/.test(line) && /(?<![\w-])text-white(?![\w/-])/.test(line))).toEqual([])
  })

  it('floats menus and dialogs on overlay, not bg', () => {
    expect(
      offending((line) => /(?<![\w-])shadow-float(?![\w-])/.test(line) && /(?<![\w:-])bg-bg(?![\w-])/.test(line) && !line.includes('rounded-card')),
    ).toEqual([])
  })
})
