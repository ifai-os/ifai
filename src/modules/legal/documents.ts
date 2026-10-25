/**
 * The two legal pages (docs/specs/legal.md). The words live in messages/*.json under `legal`;
 * this file keeps what is not translated: the order of the sections, when the text last
 * changed and where to write to.
 */
export const legalDocuments = ['privacy', 'terms'] as const
export type LegalDocument = (typeof legalDocuments)[number]

export const legalHref: Record<LegalDocument, `/${string}`> = {
  privacy: '/privacy',
  terms: '/terms',
}

/** Change the date whenever the text changes (rule 3). */
export const legalUpdatedAt: Record<LegalDocument, string> = {
  privacy: '2026-10-25',
  terms: '2026-10-23',
}

/** Data requests, account deletion for readers who cannot sign in, and copyright complaints go here (rule 4). */
export const legalContactEmail = 'hello@ifai.io'

export const legalSections = {
  privacy: ['collect', 'cookies', 'use', 'share', 'keep', 'choices', 'children', 'changes', 'contact'],
  terms: ['account', 'content', 'skills', 'yours', 'conduct', 'ours', 'copyright', 'liability', 'ending', 'changes', 'contact'],
} as const

export type LegalBlock = { type: 'paragraph'; text: string } | { type: 'list'; items: string[] }

/**
 * A section body as written in the messages: lines starting with "- " are list items, runs of
 * them make one list, and every other line is a paragraph. Blank lines only space things out.
 */
export function parseLegalBody(body: string): LegalBlock[] {
  const blocks: LegalBlock[] = []
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('- ')) {
      const last = blocks.at(-1)
      if (last?.type === 'list') last.items.push(line.slice(2).trim())
      else blocks.push({ type: 'list', items: [line.slice(2).trim()] })
    } else {
      blocks.push({ type: 'paragraph', text: line })
    }
  }
  return blocks
}
