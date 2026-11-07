import { describe, expect, it } from 'vitest'

import { brandLogoOf } from '@/modules/daily/brand-logos'
import { entityKey } from '@/modules/daily/entities'

describe('brandLogoOf', () => {
  it('finds the common companies and products by their entity key', () => {
    expect(brandLogoOf(entityKey('OpenAI'))?.title).toBe('OpenAI')
    expect(brandLogoOf(entityKey('ChatGPT'))?.title).toBe('OpenAI')
    expect(brandLogoOf(entityKey('Claude Code'))?.title).toBe('Claude Code')
    expect(brandLogoOf(entityKey('Google DeepMind'))?.title).toBe('DeepMind')
    expect(brandLogoOf(entityKey('Mistral AI'))?.title).toBe('Mistral AI')
    expect(brandLogoOf(entityKey('字节跳动'))?.title).toBe('ByteDance')
  })

  it('leaves the rest to their initial', () => {
    expect(brandLogoOf(entityKey('MotionSites'))).toBeNull()
    expect(brandLogoOf('constructor')).toBeNull()
    expect(brandLogoOf('toString')).toBeNull()
  })

  it('has one plain path per logo', () => {
    for (const key of ['openai', 'anthropic', 'gemini', 'nvidia']) {
      const logo = brandLogoOf(key)
      expect(logo?.hex).toMatch(/^[0-9A-F]{6}$/)
      expect(logo?.path).toMatch(/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/)
    }
  })
})
