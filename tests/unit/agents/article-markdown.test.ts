import { describe, expect, it } from 'vitest'

import { articleMarkdown } from '@/modules/recommend/markdown'
import type { RichNode } from '@/modules/recommend/rules'

const text = (value: string, format = 0): RichNode => ({ type: 'text', text: value, format })
const body = (...children: RichNode[]) => ({ root: { type: 'root', children } })

describe('articleMarkdown', () => {
  it('writes headings, emphasis and code as Markdown', () => {
    expect(
      articleMarkdown(
        body(
          { type: 'heading', tag: 'h2', children: [text('Why')] },
          { type: 'heading', tag: 'h3', children: [text('Details')] },
          { type: 'paragraph', children: [text('Plain '), text('bold', 1), text(', '), text(' slanted ', 2), text('and '), text('a`b', 16), text('both', 3), text('gone', 4)] },
          { type: 'paragraph', children: [text('one'), { type: 'linebreak' }, text('two')] },
          { type: 'paragraph', children: [] },
        ),
        'https://ifai.io',
      ),
    ).toBe('## Why\n\n### Details\n\nPlain **bold**,  *slanted* and `aˋb`***both***~~gone~~\n\none  \ntwo')
  })

  it('keeps web links and drops other ones to their text', () => {
    expect(
      articleMarkdown(
        body({
          type: 'paragraph',
          children: [
            { type: 'link', fields: { url: 'https://example.com/a' }, children: [text('a link')] },
            text(' and '),
            { type: 'link', fields: { url: 'javascript:alert(1)' }, children: [text('a trap')] },
          ],
        }),
        'https://ifai.io',
      ),
    ).toBe('[a link](https://example.com/a) and a trap')
  })

  it('numbers lists and indents the nested ones', () => {
    expect(
      articleMarkdown(
        body(
          {
            type: 'list',
            tag: 'ol',
            start: 1,
            children: [
              { type: 'listitem', children: [text('one')] },
              { type: 'listitem', children: [text('two')] },
              { type: 'listitem', children: [{ type: 'list', tag: 'ul', children: [{ type: 'listitem', children: [text('inner')] }] }] },
              { type: 'listitem', children: [text('three')] },
            ],
          },
          { type: 'quote', children: [text('said'), { type: 'linebreak' }, text('twice')] },
          { type: 'horizontalrule' },
        ),
        'https://ifai.io',
      ),
    ).toBe('1. one\n2. two\n   - inner\n3. three\n\n> said  \n> twice\n\n---')
  })

  it('gives pictures full addresses and keeps code as written', () => {
    const code = 'def a():\n    pass\n\n\ndef b():\n    pass\n'
    expect(
      articleMarkdown(
        body(
          { type: 'upload', value: { url: '/api/media/file/flow.png', alt: 'A [flow]\nchart' }, fields: { caption: ' The flow ' } },
          { type: 'upload', value: 7 },
          { type: 'block', fields: { blockType: 'Code', code, language: 'python' } },
          { type: 'block', fields: { blockType: 'Code', code: 'echo ```', language: 'plaintext' } },
        ),
        'https://ifai.io',
      ),
    ).toBe('![A flow chart](https://ifai.io/api/media/file/flow.png)\n*The flow*\n\n```python\ndef a():\n    pass\n\n\ndef b():\n    pass\n```\n\n~~~~\necho ```\n~~~~')
  })

  it('is empty for an empty body', () => {
    expect(articleMarkdown(null, 'https://ifai.io')).toBe('')
    expect(articleMarkdown({ root: { type: 'root', children: [] } }, 'https://ifai.io')).toBe('')
  })
})
