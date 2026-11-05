import { describe, expect, it } from 'vitest'

import { SHARE_IMAGE_SIZE, storyShareImagePath } from '@/modules/daily/public/list-params'
import { shareTitleSize } from '@/modules/daily/public/share-image'

describe('story share picture', () => {
  it('lives next to the story, under its language', () => {
    expect(storyShareImagePath('zh-Hans', 'openai-ships-x')).toBe('/zh-hans/news/openai-ships-x/share.png')
    expect(storyShareImagePath('en', 'openai-ships-x')).toBe('/en/news/openai-ships-x/share.png')
    expect(SHARE_IMAGE_SIZE).toEqual({ width: 1200, height: 630 })
  })

  it('draws short titles bigger, counting CJK characters double', () => {
    expect(shareTitleSize('OpenAI ships a thing')).toBe(68)
    expect(shareTitleSize('Sample: Strider Robotics shows a warehouse robot that learns by watching')).toBe(52)
    expect(shareTitleSize('示例：Orbit Notes 发布新的摘要基准测试')).toBe(60)
  })
})
