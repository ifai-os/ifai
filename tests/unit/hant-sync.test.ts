import { describe, expect, it } from 'vitest'

import { toHantDeep } from '@/lib/i18n/hant-sync'

describe('toHantDeep', () => {
  it('converts text, hasMany text and array rows', () => {
    expect(toHantDeep('一句话生成演示文稿')).toBe('一句話生成簡報')
    expect(toHantDeep(['演示文稿', '办公软件'])).toEqual(['簡報', '辦公軟體'])
    expect(toHantDeep([{ id: 'abc', title: '视频剪辑', detail: null }])).toEqual([{ title: '影片剪輯', detail: null }])
  })

  it('drops array row ids so zh-Hant gets rows of its own', () => {
    const rows = toHantDeep([{ id: '1', question: '支持中文吗？', answer: '支持。' }]) as Record<string, unknown>[]
    expect(rows[0]).not.toHaveProperty('id')
  })

  it('keeps empty values empty, so zh-Hant falls back to English like zh-Hans', () => {
    expect(toHantDeep(null)).toBeNull()
    expect(toHantDeep(undefined)).toBeUndefined()
    expect(toHantDeep(3)).toBe(3)
  })
})
