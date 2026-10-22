import { describe, expect, it } from 'vitest'

import { frontmatterLicense, frontmatterProblems, frontmatterVersion, parseSkillMd } from '@/modules/resources/package/frontmatter'

describe('parseSkillMd', () => {
  it('splits header and body', () => {
    const parsed = parseSkillMd('---\nname: hello\ndescription: Says hi\nlicense: MIT\nmetadata:\n  version: 1.2.0\n---\n\n# Hello\n')
    expect(parsed.frontmatter).toEqual({ name: 'hello', description: 'Says hi', license: 'MIT', metadata: { version: '1.2.0' } })
    expect(parsed.body).toBe('\n# Hello\n')
    expect(frontmatterProblems(parsed)).toEqual([])
    expect(frontmatterVersion(parsed.frontmatter)).toBe('1.2.0')
    expect(frontmatterLicense(parsed.frontmatter)).toBe('MIT')
  })

  it('reports a missing header, bad YAML and missing required keys', () => {
    expect(frontmatterProblems(parseSkillMd('# No header\n'))).toEqual(['SKILL.md has no frontmatter block (--- … ---)'])
    expect(frontmatterProblems(parseSkillMd('---\nname: [unclosed\n---\n'))[0]).toMatch(/not valid YAML/)
    expect(frontmatterProblems(parseSkillMd('---\n- a list\n---\n'))).toEqual(['Frontmatter is not a key: value mapping'])
    expect(frontmatterProblems(parseSkillMd('---\nname: ""\n---\n'))).toEqual(['Frontmatter is missing "name"', 'Frontmatter is missing "description"'])
  })

  it('does not turn YAML timestamps into dates and tolerates a BOM and CRLF', () => {
    const parsed = parseSkillMd('﻿---\r\nname: x\r\ndescription: y\r\nupdated: 2026-10-22\r\n---\r\nbody')
    expect(parsed.frontmatter).toEqual({ name: 'x', description: 'y', updated: '2026-10-22' })
    expect(parsed.body).toBe('body')
  })
})
