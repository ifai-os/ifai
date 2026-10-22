import { describe, expect, it } from 'vitest'

import { buildMagicLinkEmail, localeFromMagicLink } from '@/lib/auth/email'

const link = (callback: string) =>
  `https://ifai.example/api/auth/magic-link/verify?token=abc&callbackURL=${encodeURIComponent(callback)}`

describe('magic link email', () => {
  it('picks the language from the callback path', () => {
    expect(localeFromMagicLink(link('/zh-hans'))).toBe('zh-Hans')
    expect(localeFromMagicLink(link('/zh-hant/apps'))).toBe('zh-Hant')
    expect(localeFromMagicLink(link('https://ifai.example/ja'))).toBe('ja')
    expect(localeFromMagicLink(link('/'))).toBe('en')
    expect(localeFromMagicLink('not a url')).toBe('en')
  })

  it('writes the email in that language and escapes the link', async () => {
    const url = `${link('/zh-hans')}&x="<b>"`
    const email = await buildMagicLinkEmail(url)
    expect(email.locale).toBe('zh-Hans')
    expect(email.subject).toBe('你的 IFAI 登录链接')
    expect(email.html).toContain('lang="zh-Hans"')
    expect(email.html).not.toContain('"<b>"')
    expect(email.html).toContain('&quot;&lt;b&gt;&quot;')
    expect(email.text).toContain(url)
  })
})
