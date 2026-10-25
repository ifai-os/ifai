import { randomBytes } from 'node:crypto'

import { convertMarkdownToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'
import type { RichTextField } from 'payload'

import { codeLanguages, type RichNode, type RichText } from './rules'
import type { MarkdownPart } from './writing'

/**
 * A reader's Markdown as the article body (docs/specs/recommend.md rule 13): the same Lexical
 * JSON the back office writes, made with the body field's own editor, so pages and the admin
 * read readers' articles as they read the site owner's.
 */

/** Common names for code languages, to the ones the back office lists. */
const languageAliases: Record<string, string> = {
  py: 'python',
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  console: 'shell',
  yml: 'yaml',
  md: 'markdown',
  htm: 'html',
  golang: 'go',
  rs: 'rust',
  text: 'plaintext',
  txt: 'plaintext',
}

/** A code block's language as one the back office lists, plain text when it is none of them. */
export function codeLanguage(value: unknown): string {
  const name = typeof value === 'string' ? value.trim().toLowerCase() : ''
  const known = languageAliases[name] ?? name
  return known in codeLanguages ? known : 'plaintext'
}

/** Code blocks with a language the body field accepts; it would refuse to save any other. */
function tidy(nodes: RichNode[]): RichNode[] {
  return nodes.map((node) => {
    if (node.type === 'block' && node.fields?.blockType === 'Code') return { ...node, fields: { ...node.fields, language: codeLanguage(node.fields.language) } }
    return node.children ? { ...node, children: tidy(node.children) } : node
  })
}

/**
 * The body field's editor, from the config as this module's own bundle built it. Not the running
 * Payload's: that one may have been started by another route (the admin, say), whose bundle has
 * its own copy of Lexical, and Lexical refuses nodes made by another copy.
 */
async function editorConfig() {
  // Imported here, so that what else this file has needs no config (the unit tests).
  const { default: config } = await import('@payload-config')
  const articles = (await config).collections.find((collection) => collection.slug === 'articles')
  const field = articles?.fields.find((candidate) => 'name' in candidate && candidate.name === 'body')
  if (!field || field.type !== 'richText') throw new Error('articles has no body field')
  return editorConfigFactory.fromField({ field: field as RichTextField })
}

/**
 * The body for these parts (`splitMarkdown`); `images` holds the article-images id of each
 * picture's file name. A picture whose file is missing is left out.
 */
export async function partsToBody(parts: MarkdownPart[], images: Map<string, number>): Promise<RichText> {
  const config = await editorConfig()
  const children: RichNode[] = []
  for (const part of parts) {
    if (part.kind === 'image') {
      const value = images.get(part.file)
      if (value) {
        children.push({
          type: 'upload',
          version: 3,
          format: '',
          id: randomBytes(12).toString('hex'),
          relationTo: 'article-images',
          value,
          fields: { caption: part.caption },
        })
      }
      continue
    }
    const converted = convertMarkdownToLexical({ editorConfig: config, markdown: part.text }) as { root?: RichNode }
    children.push(...tidy(converted.root?.children ?? []))
  }
  return { root: { type: 'root', children, direction: 'ltr', format: '', indent: 0, version: 1 } }
}
