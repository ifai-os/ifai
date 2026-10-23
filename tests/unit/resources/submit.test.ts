import { describe, expect, it } from 'vitest'

import { emailHtml, emailText } from '@/lib/email/layout'
import { nextSubmissionSequence, shanghaiDay, submissionCode } from '@/modules/resources/normalize'
import { buildSubmissionEmail } from '@/modules/resources/submit/email'
import { normalizeRepository, parseSubmissionInput, repositoryParts, reviewDeadline, submissionRules } from '@/modules/resources/submit/rules'

describe('the submitted repository address', () => {
  it('keeps a repository, or the folder and ref when one was given', () => {
    expect(normalizeRepository('https://github.com/acme/skills')).toBe('https://github.com/acme/skills')
    expect(normalizeRepository(' http://www.github.com/acme/skills.git/ ')).toBe('https://github.com/acme/skills')
    expect(normalizeRepository('https://github.com/acme/skills/tree/main/skills/release-notes')).toBe(
      'https://github.com/acme/skills/tree/main/skills/release-notes',
    )
  })

  it('takes what the address bar shows: no scheme, a tab or an anchor', () => {
    expect(normalizeRepository('github.com/acme/skills')).toBe('https://github.com/acme/skills')
    expect(normalizeRepository('https://github.com/acme/skills?tab=readme-ov-file')).toBe('https://github.com/acme/skills')
    expect(normalizeRepository('https://github.com/acme/skills#readme')).toBe('https://github.com/acme/skills')
  })

  it('points a link to SKILL.md at its folder and encodes each part once', () => {
    expect(normalizeRepository('https://github.com/acme/skills/blob/main/skills/notes/SKILL.md')).toBe(
      'https://github.com/acme/skills/tree/main/skills/notes',
    )
    expect(normalizeRepository('https://github.com/acme/skills/blob/v2/SKILL.md')).toBe('https://github.com/acme/skills/tree/v2')
    expect(normalizeRepository('https://github.com/acme/skills/tree/main/my%20skill')).toBe('https://github.com/acme/skills/tree/main/my%20skill')
  })

  it('turns down anything that is not a GitHub repository', () => {
    for (const value of ['', 'acme/skills', 'https://gitlab.com/acme/skills', 'https://github.com/acme', 'javascript:alert(1)', 'github.com/acme/skills/tree/main/%zz']) {
      expect(normalizeRepository(value), value).toBeNull()
    }
  })
})

describe('the submission form input', () => {
  it('tidies a good submission', () => {
    const parsed = parseSubmissionInput({
      repository: 'github.com/acme/skills',
      note: '  Turns merged pull requests\n into   release notes ',
      email: ' dev@example.com ',
      locale: 'zh-Hans',
    })
    expect(parsed).toEqual({
      ok: true,
      value: {
        repository: 'https://github.com/acme/skills',
        note: 'Turns merged pull requests into release notes',
        email: 'dev@example.com',
        locale: 'zh-Hans',
      },
    })
  })

  it('names every field that is not right', () => {
    expect(parseSubmissionInput({ repository: 'nope', note: ' ', email: 'dev@' })).toEqual({ ok: false, fields: ['repository', 'note', 'email'] })
    expect(parseSubmissionInput(null)).toEqual({ ok: false, fields: ['repository', 'note', 'email'] })
  })

  it('counts the note in characters, Chinese and emoji included', () => {
    const base = { repository: 'https://github.com/acme/skills', email: 'dev@example.com' }
    expect(parseSubmissionInput({ ...base, note: '写'.repeat(submissionRules.maxNote) }).ok).toBe(true)
    expect(parseSubmissionInput({ ...base, note: '写'.repeat(submissionRules.maxNote + 1) })).toEqual({ ok: false, fields: ['note'] })
    expect(parseSubmissionInput({ ...base, note: '🙂'.repeat(submissionRules.maxNote) }).ok).toBe(true)
  })

  it('falls back to English for an unknown language', () => {
    const parsed = parseSubmissionInput({ repository: 'https://github.com/acme/skills', note: 'Notes', email: 'dev@example.com', locale: 'xx' })
    expect(parsed.ok && parsed.value.locale).toBe('en')
  })
})

describe('submission numbers', () => {
  it('continue after the highest number on that date, whatever was deleted before it', () => {
    expect(nextSubmissionSequence([])).toBe(1)
    expect(nextSubmissionSequence(['S-1022-01', 'S-1022-03', null])).toBe(4)
    expect(nextSubmissionSequence(['S-1022-09', 'S-1022-10'])).toBe(11)
    expect(nextSubmissionSequence(['not a code', undefined])).toBe(1)
  })

  it('use the Shanghai date', () => {
    expect(submissionCode(new Date('2026-10-22T16:30:00Z'), 7)).toBe('S-1023-07')
    expect(submissionCode(new Date('2026-10-22T15:30:00Z'), 112)).toBe('S-1022-112')
  })
})

describe('what the page says once a Skill is sent', () => {
  it('expects the review two Shanghai working days later', () => {
    const by = (sent: string) => shanghaiDay(reviewDeadline(new Date(sent)))
    expect(by('2026-10-21T06:52:00+08:00')).toBe('2026-10-23') // Wednesday → Friday
    expect(by('2026-10-23T10:00:00+08:00')).toBe('2026-10-27') // Friday → Tuesday
    expect(by('2026-10-24T10:00:00+08:00')).toBe('2026-10-27') // Saturday → Tuesday
    expect(by('2026-10-22T17:30:00Z')).toBe('2026-10-27') // already Friday in Shanghai
  })

  it('names the repository and the folder that were sent', () => {
    expect(repositoryParts('https://github.com/acme/skills')).toEqual({ name: 'acme/skills', folder: undefined })
    expect(repositoryParts('https://github.com/acme/skills/tree/main/skills/my%20notes')).toEqual({ name: 'acme/skills', folder: 'skills/my notes' })
  })
})

describe('submission emails', () => {
  const base = { code: 'S-1022-07', repository: 'https://github.com/acme/skills' }

  it('confirms a new submission in its language', async () => {
    const email = await buildSubmissionEmail({ ...base, status: 'pending', locale: 'zh-Hans' })
    expect(email.subject).toBe('已收到你的 Skill 投稿（S-1022-07）')
    expect(email.html).toContain('lang="zh-Hans"')
    expect(email.text).toContain('https://github.com/acme/skills')
    expect(email.text).toContain('投稿编号 S-1022-07')
  })

  it('links a listed Skill’s page and quotes the owner’s note', async () => {
    const email = await buildSubmissionEmail({ ...base, status: 'accepted', locale: 'ja', skillSlug: 'release-notes', reply: 'Nice <b>work</b>' })
    expect(email.subject).toContain('S-1022-07')
    expect(email.html).toMatch(/href="https?:\/\/[^"]+\/ja\/resources\/skills\/release-notes"/)
    expect(email.html).toContain('Nice &lt;b&gt;work&lt;/b&gt;')
    expect(email.html).not.toContain('<b>work</b>')

    const unlinked = await buildSubmissionEmail({ ...base, status: 'accepted', locale: 'en', skillSlug: null })
    expect(unlinked.html).not.toContain('/resources/skills/')
  })

  it('lists what a blocking scan found, ten at most', async () => {
    const findings = Array.from({ length: 12 }, (_, index) => `scripts/run.sh:${index + 1} — Reads ~/.ssh`)
    const email = await buildSubmissionEmail({ ...base, status: 'rejected', locale: 'en', findings })
    expect(email.text).toContain('What the security check found:')
    expect(email.text).toContain('- scripts/run.sh:10 — Reads ~/.ssh')
    expect(email.text).not.toContain('scripts/run.sh:11')
    expect(email.text).toContain('…and 2 more')
    expect(email.html.match(/<li /g)).toHaveLength(11)
  })
})

describe('the email layout', () => {
  it('escapes every part and keeps line breaks in the owner’s words', () => {
    const content = {
      locale: 'en',
      heading: 'Hi <you>',
      paragraphs: ['A & B'],
      details: [{ label: 'Repository', value: '"x"' }],
      quote: { caption: 'Note', text: 'line one\nline <two>' },
      button: { label: 'Open', href: 'https://ifai.example/a?b=1&c="2"' },
      footer: 'Bye',
    }
    const html = emailHtml(content)
    expect(html).toContain('Hi &lt;you&gt;')
    expect(html).toContain('A &amp; B')
    expect(html).toContain('&quot;x&quot;')
    expect(html).toContain('line one<br>line &lt;two&gt;')
    expect(html).toContain('href="https://ifai.example/a?b=1&amp;c=&quot;2&quot;"')
    expect(emailText(content)).toBe(
      'Hi <you>\n\nA & B\n\nRepository: "x"\n\nNote\nline one\nline <two>\n\nhttps://ifai.example/a?b=1&c="2"\n\nBye\n',
    )
  })
})
