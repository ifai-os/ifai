import { describe, expect, it } from 'vitest'

import { descriptionRoom, metaDescription, widthOf } from '@/lib/meta-description'

describe('metaDescription', () => {
  it('leaves a short text as it is, spaces collapsed', () => {
    expect(metaDescription(' 一句话\n摘要。 ', 'zh-Hans')).toBe('一句话 摘要。')
  })

  it('ends a long text at its last whole sentence that fits', () => {
    const first = '十月三十一日，DeepSeek 团队提出 Super-agent 架构构想，用 Router 与 Worker 双层设计让 AI 并行干活。'
    const text = `${first}${'它能把一个大任务拆成很多小任务，交给不同的模型同时去做，再把结果合起来。'.repeat(3)}`
    const description = metaDescription(text, 'zh-Hans')
    expect(description.startsWith(first)).toBe(true)
    expect(description.endsWith('。')).toBe(true)
    expect(widthOf(description, 'zh-Hans')).toBeLessThanOrEqual(descriptionRoom['zh-Hans'])
  })

  it('cuts with an ellipsis when no sentence ends early enough, English at a space', () => {
    const zh = metaDescription('长'.repeat(200), 'ja')
    expect(zh.endsWith('…')).toBe(true)
    expect(widthOf(zh, 'ja')).toBeLessThanOrEqual(descriptionRoom.ja)

    const en = metaDescription('word '.repeat(60), 'en')
    expect(en.endsWith('word…')).toBe(true)
    expect(en.length).toBeLessThanOrEqual(160)
  })

  it('does not end a sentence at a decimal point', () => {
    const text = `GPT-5.5 is out. ${'More words follow here. '.repeat(2)}${'x'.repeat(150)}`
    expect(metaDescription(text, 'en')).toBe(`GPT-5.5 is out. ${'More words follow here. '.repeat(2).trim()}`)
  })
})
