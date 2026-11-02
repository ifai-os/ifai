import type { Media } from '@/payload-types'

import type { RichNode, RichText } from './rules'

/**
 * An article's body (Payload's rich text, Lexical JSON) as Markdown, for agents
 * (docs/specs/agents.md): the same blocks the article page draws in ./components/article-body.tsx
 * — paragraphs, headings, lists, quotes, rules, links, pictures with captions and code blocks.
 * Only web and mail links stay links; pictures get full addresses against `origin`.
 */

// Lexical's text format bits.
const BOLD = 1
const ITALIC = 2
const STRIKETHROUGH = 4
const CODE = 16

function safeHref(url: unknown): string | null {
  if (typeof url !== 'string') return null
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:' ? parsed.href : null
  } catch {
    return null
  }
}

function textOf(node: RichNode): string {
  const text = typeof node.text === 'string' ? node.text : ''
  if (!text) return ''
  const format = typeof node.format === 'number' ? node.format : 0
  if (format & CODE) return `\`${text.replace(/`/g, 'ˋ')}\``
  // Markdown emphasis cannot start or end with a space: keep the spaces outside the marks.
  const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text) ?? ['', '', text, '']
  if (!core) return text
  let out = core
  if (format & STRIKETHROUGH) out = `~~${out}~~`
  if (format & ITALIC) out = `*${out}*`
  if (format & BOLD) out = `**${out}**`
  return `${lead}${out}${trail}`
}

function inline(nodes: RichNode[] | undefined, origin: string): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === 'text') return textOf(node)
      if (node.type === 'linebreak') return '  \n'
      if (node.type === 'tab') return '\t'
      if (node.type === 'link' || node.type === 'autolink') {
        const label = inline(node.children, origin)
        const href = safeHref((node.fields as { url?: unknown } | undefined)?.url)
        return href ? `[${label || href}](${href})` : label
      }
      return inline(node.children, origin)
    })
    .join('')
}

function picture(node: RichNode, origin: string): string | null {
  const media = node.value as Media | number | undefined
  if (!media || typeof media !== 'object' || !media.url) return null
  let url: string
  try {
    url = new URL(media.url, origin).href
  } catch {
    return null
  }
  const alt = (media.alt ?? '').replace(/[[\]]/g, '').replace(/\s+/g, ' ').trim()
  const caption = typeof node.fields?.caption === 'string' ? node.fields.caption.trim() : ''
  return caption ? `![${alt}](${url})\n*${caption.replace(/\s+/g, ' ')}*` : `![${alt}](${url})`
}

function list(node: RichNode, origin: string, depth: number): string {
  const ordered = node.tag === 'ol'
  const indent = '   '.repeat(depth)
  let number = typeof node.start === 'number' ? node.start : 1
  return (node.children ?? [])
    .map((item) => {
      const nested = (item.children ?? []).filter((child) => child.type === 'list')
      const own = inline(
        (item.children ?? []).filter((child) => child.type !== 'list'),
        origin,
      ).trim()
      const sub = nested.map((child) => list(child, origin, depth + 1)).join('\n')
      // A list nested on its own (Lexical's indent) has no text of its own and no marker.
      if (!own) return sub
      const marker = ordered ? `${number++}.` : '-'
      return sub ? `${indent}${marker} ${own}\n${sub}` : `${indent}${marker} ${own}`
    })
    .filter(Boolean)
    .join('\n')
}

function block(node: RichNode, origin: string): string | null {
  switch (node.type) {
    case 'paragraph': {
      const text = inline(node.children, origin).trim()
      return text || null
    }
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(String(node.tag ?? 'h2').slice(1)) || 2))
      const text = inline(node.children, origin).trim()
      return text ? `${'#'.repeat(level)} ${text}` : null
    }
    case 'list':
      return list(node, origin, 0) || null
    case 'quote': {
      const text = inline(node.children, origin).trim()
      return text ? text.split('\n').map((line) => `> ${line}`).join('\n') : null
    }
    case 'horizontalrule':
      return '---'
    case 'upload':
      return picture(node, origin)
    case 'block': {
      const code = typeof node.fields?.code === 'string' ? node.fields.code : ''
      if (!code.trim()) return null
      const language = typeof node.fields?.language === 'string' && node.fields.language !== 'plaintext' ? node.fields.language : ''
      const fence = code.includes('```') ? '~~~~' : '```'
      return `${fence}${language}\n${code.replace(/\n+$/, '')}\n${fence}`
    }
    default: {
      const text = inline(node.children, origin).trim()
      return text || null
    }
  }
}

export function articleMarkdown(body: RichText, origin: string): string {
  return (body?.root?.children ?? [])
    .map((node) => block(node, origin))
    .filter((text): text is string => Boolean(text))
    .join('\n\n')
}
