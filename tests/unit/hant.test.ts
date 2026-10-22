import { describe, expect, it } from 'vitest'

import { toHant } from '@/lib/i18n/hant'

describe('toHant (OpenCC cn → twp)', () => {
  it('converts characters', () => {
    expect(toHant('简体中文')).toBe('簡體中文')
    expect(toHant('热门应用')).toBe('熱門應用')
  })

  it('replaces mainland phrases with Taiwan usage', () => {
    expect(toHant('自行车')).toBe('腳踏車')
    expect(toHant('软件')).toBe('軟體')
    expect(toHant('视频')).toBe('影片')
  })

  it('leaves ICU placeholders and Latin text alone', () => {
    expect(toHant('另有 {count} 家媒体 · AI Agent')).toBe('另有 {count} 家媒體 · AI Agent')
  })
})
