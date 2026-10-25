import { describe, expect, it } from 'vitest'

import { freeSlug, sameSource, skillSeed } from '@/modules/resources/submit/convert'

describe('skillSeed', () => {
  it('starts from the folder that holds SKILL.md, else the repository', () => {
    expect(skillSeed('https://github.com/anthropics/skills/tree/main/skills/pdf-tools')).toEqual({
      name: 'Pdf Tools',
      slug: 'pdf-tools',
      author: { name: 'anthropics', url: 'https://github.com/anthropics' },
    })
    expect(skillSeed('https://github.com/acme/meeting_notes')).toMatchObject({ name: 'Meeting Notes', slug: 'meeting-notes' })
    expect(skillSeed('https://github.com/acme/kit/blob/main/writer/SKILL.md')).toMatchObject({ name: 'Writer', slug: 'writer' })
  })

  it('falls back when the folder has no Latin letters', () => {
    expect(skillSeed('https://github.com/acme/kit/tree/main/写作')).toMatchObject({ slug: 'kit' })
  })

  it('is null for anything that is not a GitHub repository', () => {
    expect(skillSeed('https://gitlab.com/acme/kit')).toBeNull()
  })
})

describe('sameSource', () => {
  it('matches the same repository and folder on any branch, ignoring case', () => {
    expect(sameSource('https://github.com/Acme/Kit', 'https://github.com/acme/kit/tree/v2')).toBe(true)
    expect(sameSource('https://github.com/acme/kit/tree/main/pdf', 'https://github.com/acme/kit/blob/dev/pdf/SKILL.md')).toBe(true)
  })

  it('tells folders and repositories apart', () => {
    expect(sameSource('https://github.com/acme/kit/tree/main/pdf', 'https://github.com/acme/kit')).toBe(false)
    expect(sameSource('https://github.com/acme/kit', 'https://github.com/acme/kit2')).toBe(false)
    expect(sameSource('https://gitlab.com/acme/kit', 'https://gitlab.com/acme/kit')).toBe(false)
  })
})

describe('freeSlug', () => {
  it('adds the first free number', () => {
    expect(freeSlug('pdf', [])).toBe('pdf')
    expect(freeSlug('pdf', ['pdf', 'pdf-2', 'pdf-tools'])).toBe('pdf-3')
  })

  it('stays within 64 characters', () => {
    const base = 'a'.repeat(64)
    expect(freeSlug(base, [base])).toBe(`${'a'.repeat(62)}-2`)
  })
})
