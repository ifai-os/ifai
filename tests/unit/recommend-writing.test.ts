import { describe, expect, it } from 'vitest'

import { codeLanguage } from '@/modules/recommend/markdown'
import { fitWithin, uploadPlan } from '@/modules/recommend/prepare-image'
import { cleanMarkdown, imageFileName, imageFiles, imageMarkdown, parseArticleInput, parseReportInput, splitMarkdown, writeRules } from '@/modules/recommend/writing'

const picture = (name: string, caption = '') => imageMarkdown(`/api/article-images/file/${name}`, caption)
const input = (fields: Record<string, unknown> = {}) => ({ title: 'How I use RAG', channel: 'agents', markdown: 'Some words.', ...fields })

describe('parseArticleInput', () => {
  it('tidies the title, summary and tags, and keeps the Markdown as written', () => {
    const parsed = parseArticleInput(input({ title: '  How I\nuse RAG ', summary: ' One line ', tags: 'RAG, agents，RAG', markdown: 'Line\r\n\r\n    code\r\n\n\n' }))
    expect(parsed).toEqual({
      ok: true,
      value: { title: 'How I use RAG', summary: 'One line', channel: 'agents', tags: ['RAG', 'agents'], markdown: 'Line\n\n    code', cover: null, publish: false },
    })
  })

  it('needs a title and a channel always, and a body only to publish', () => {
    expect(parseArticleInput(input({ title: '  ' }))).toEqual({ ok: false, error: 'title-empty' })
    expect(parseArticleInput(input({ title: 'x'.repeat(81) }))).toEqual({ ok: false, error: 'title-too-long' })
    expect(parseArticleInput(input({ summary: 'x'.repeat(141) }))).toEqual({ ok: false, error: 'summary-too-long' })
    expect(parseArticleInput(input({ channel: 'news' }))).toEqual({ ok: false, error: 'invalid-channel' })
    expect(parseArticleInput(input({ markdown: ' \n ' })).ok).toBe(true)
    expect(parseArticleInput(input({ markdown: ' \n ', publish: true }))).toEqual({ ok: false, error: 'body-empty' })
    expect(parseArticleInput(input({ markdown: 'x'.repeat(writeRules.maxMarkdown + 1) }))).toEqual({ ok: false, error: 'body-too-long' })
  })

  it('takes a cover by its id', () => {
    expect(parseArticleInput(input({ cover: 12 }))).toMatchObject({ ok: true, value: { cover: 12 } })
    expect(parseArticleInput(input({ cover: 'abc' }))).toEqual({ ok: false, error: 'invalid-request' })
  })
})

describe('parseReportInput', () => {
  it('needs an article id and one of the reasons', () => {
    expect(parseReportInput({ article: 5, reason: 'spam' })).toEqual({ article: 5, reason: 'spam' })
    expect(parseReportInput({ article: 5, reason: 'boring' })).toBeNull()
    expect(parseReportInput({ article: 0, reason: 'spam' })).toBeNull()
  })
})

describe('cleanMarkdown', () => {
  it('drops invisible characters but keeps tabs and indentation', () => {
    expect(cleanMarkdown('a​‮b\n\tc  ')).toBe('ab\n\tc')
  })
})

describe('imageFileName', () => {
  it('finds the file of IFAI’s article pictures, however the address is written', () => {
    expect(imageFileName('/api/article-images/file/a1b2.webp')).toBe('a1b2.webp')
    expect(imageFileName('https://ifai.ai/api/article-images/file/a%20b.webp?2024')).toBe('a b.webp')
    expect(imageFileName('https://example.com/cat.png')).toBeNull()
    expect(imageFileName('/api/media/file/a1b2.webp')).toBeNull()
  })
})

describe('splitMarkdown', () => {
  it('cuts the prose around pictures on their own lines', () => {
    const result = splitMarkdown(['Intro', '', picture('one.webp', 'A [chart]'), '', 'After', picture('two.webp'), picture('one.webp')].join('\n'))
    expect(result).toEqual({
      ok: true,
      parts: [
        { kind: 'markdown', text: 'Intro\n' },
        { kind: 'image', caption: 'A chart', file: 'one.webp' },
        { kind: 'markdown', text: '\nAfter' },
        { kind: 'image', caption: '', file: 'two.webp' },
        { kind: 'image', caption: '', file: 'one.webp' },
      ],
    })
    expect(result.ok && imageFiles(result.parts)).toEqual(['one.webp', 'two.webp'])
  })

  it('turns headings into the two sizes the body has, and two-space lists into nested ones', () => {
    const result = splitMarkdown('# Title\n#### Small\n- a\n  - b\n#hashtag')
    expect(result).toEqual({ ok: true, parts: [{ kind: 'markdown', text: '## Title\n### Small\n- a\n    - b\n#hashtag' }] })
  })

  it('leaves code blocks alone, pictures and headings in them too', () => {
    const code = '```md\n# Not a heading\n![x](https://example.com/x.png)\n```'
    expect(splitMarkdown(code)).toEqual({ ok: true, parts: [{ kind: 'markdown', text: code }] })
    expect(splitMarkdown('Use `![alt](url)` to add a picture')).toMatchObject({ ok: true })
  })

  it('refuses pictures from elsewhere and pictures inside a line', () => {
    expect(splitMarkdown('![cat](https://example.com/cat.png)')).toEqual({ ok: false, error: 'image-source' })
    expect(splitMarkdown(`See ${picture('one.webp')} here`)).toEqual({ ok: false, error: 'image-line' })
  })
})

describe('codeLanguage', () => {
  it('maps common names to the languages the back office lists, else plain text', () => {
    expect(codeLanguage('py')).toBe('python')
    expect(codeLanguage(' TypeScript ')).toBe('typescript')
    expect(codeLanguage('brainfuck')).toBe('plaintext')
    expect(codeLanguage(undefined)).toBe('plaintext')
  })
})

describe('uploadPlan', () => {
  const big = { width: 4000, height: 3000 }
  it('sends small pictures as they are, shrinks the rest, and turns down what it cannot open', () => {
    expect(uploadPlan({ type: 'image/png', size: 1000 }, { width: 800, height: 600 })).toBe('send')
    expect(uploadPlan({ type: 'image/jpeg', size: 1000 }, big)).toBe('shrink')
    expect(uploadPlan({ type: 'image/heic', size: 1000 }, { width: 800, height: 600 })).toBe('shrink')
    expect(uploadPlan({ type: 'image/heic', size: 1000 }, null)).toBe('type')
    expect(uploadPlan({ type: 'image/jpeg', size: writeRules.maxPickedBytes + 1 }, big)).toBe('too-big')
  })

  it('sends a GIF as it is, or not at all', () => {
    expect(uploadPlan({ type: 'image/gif', size: 1000 }, null)).toBe('send')
    expect(uploadPlan({ type: 'image/gif', size: writeRules.maxUploadBytes + 1 }, null)).toBe('too-big')
  })

  it('fits the long side within 2048 px, never enlarging', () => {
    expect(fitWithin(4096, 1024)).toEqual({ width: 2048, height: 512 })
    expect(fitWithin(300, 200)).toEqual({ width: 300, height: 200 })
  })
})
