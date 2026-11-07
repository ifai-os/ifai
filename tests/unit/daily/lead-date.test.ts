import { describe, expect, it } from 'vitest'

import { dropLeadDate, dropLeadDates } from '@/modules/daily/lead-date'

const at = '2026-11-06T18:00:00.000Z'

describe('dropLeadDate', () => {
  it('drops an opening date that is the publish day', () => {
    expect(dropLeadDate('11 月 6 日，Meta 在 Muse 中上线 Spaces 功能。', at)).toBe('Meta 在 Muse 中上线 Spaces 功能。')
    expect(dropLeadDate('11 月 6 日，Meta 在 Muse 中上線 Spaces 功能。', at)).toBe('Meta 在 Muse 中上線 Spaces 功能。')
    expect(dropLeadDate('11月6日、MetaはMuseアプリ内に新機能を追加した。', at)).toBe('MetaはMuseアプリ内に新機能を追加した。')
    expect(dropLeadDate("11월 6일, 메타가 뮤즈(Muse) 앱에 '스페이스'를 출시했다.", at)).toBe("메타가 뮤즈(Muse) 앱에 '스페이스'를 출시했다.")
    expect(dropLeadDate('11월 6일 OpenAI는 Ligo와 협력했다.', at)).toBe('OpenAI는 Ligo와 협력했다.')
    expect(dropLeadDate('On Nov. 6, Meta launched Spaces.', at)).toBe('Meta launched Spaces.')
    expect(dropLeadDate('2026 年 11 月 6 日，OpenAI 宣布……', at)).toBe('OpenAI 宣布……')
    expect(dropLeadDate('当地时间 11 月 6 日，OpenAI 宣布……', at)).toBe('OpenAI 宣布……')
    expect(dropLeadDate('11月7日、OpenAIは発表した。', at)).toBe('OpenAIは発表した。')
  })

  it('leaves every other text as it is', () => {
    expect(dropLeadDate('11 月 20 日起，新规正式生效。', at)).toBe('11 月 20 日起，新规正式生效。')
    expect(dropLeadDate('11 月 3 日，OpenAI 宣布……', at)).toBe('11 月 3 日，OpenAI 宣布……')
    expect(dropLeadDate('2025 年 11 月 6 日，OpenAI 宣布……', at)).toBe('2025 年 11 月 6 日，OpenAI 宣布……')
    expect(dropLeadDate('11 月 6 日发布的模型……', at)).toBe('11 月 6 日发布的模型……')
    expect(dropLeadDate('Meta 于 11 月 6 日上线。', at)).toBe('Meta 于 11 月 6 日上线。')
    expect(dropLeadDate('Meta just launched Spaces.', at)).toBe('Meta just launched Spaces.')
    expect(dropLeadDate('11 月 6 日，', at)).toBe('11 月 6 日，')
    expect(dropLeadDate('11 月 6 日，Meta', null)).toBe('11 月 6 日，Meta')
  })
})

describe('dropLeadDates', () => {
  it('drops the date at the start of each paragraph, not in subheadings or mid-sentence', () => {
    const body = '很多人手机里都有构思。\n\n## 11 月 6 日，上线\n\n11 月 6 日，Meta 正式推出 Spaces。\n\n目前在 11 月 6 日已开放。'
    expect(dropLeadDates(body, at)).toBe('很多人手机里都有构思。\n\n## 11 月 6 日，上线\n\nMeta 正式推出 Spaces。\n\n目前在 11 月 6 日已开放。')
  })
})
