import { describe, expect, it } from 'vitest'

import { legalDocuments, legalSections, parseLegalBody } from '@/modules/legal/documents'

import en from '../../messages/en.json'

describe('parseLegalBody', () => {
  it('reads "- " lines as list items and every other line as a paragraph', () => {
    expect(parseLegalBody('Intro:\n- one\n-  two\n\nAfter.\n- three')).toEqual([
      { type: 'paragraph', text: 'Intro:' },
      { type: 'list', items: ['one', 'two'] },
      { type: 'paragraph', text: 'After.' },
      { type: 'list', items: ['three'] },
    ])
  })
})

describe('legal messages', () => {
  it('has a title and body for every section, and nothing left over', () => {
    for (const document of legalDocuments) {
      const sections = en.legal[document].sections as Record<string, { title: string; body: string }>
      expect(Object.keys(sections).sort()).toEqual([...legalSections[document]].sort())
      for (const key of legalSections[document]) {
        expect(sections[key].title.trim()).not.toBe('')
        expect(sections[key].body.trim()).not.toBe('')
      }
    }
  })
})
