import { RichText, type JSXConverters, type JSXConvertersFunction } from '@payloadcms/richtext-lexical/react'

import type { Media } from '@/payload-types'

import { headingAnchor, type RichNode, type RichText as Body } from '../rules'

type Rendered = { node: RichNode; childIndex: number; parent: { type?: string }; nodesToJSX: (args: { nodes: never[] }) => React.ReactNode[] }

const children = ({ node, nodesToJSX }: Rendered) => nodesToJSX({ nodes: (node.children ?? []) as never[] })

/** Only web and mail addresses become links; anything else (`javascript:`, a bare word) stays text. */
export function safeHref(url: unknown): string | null {
  if (typeof url !== 'string') return null
  try {
    const parsed = new URL(url.trim())
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:' ? parsed.href : null
  } catch {
    return null
  }
}

/** Anchors of the second-level headings, by their place among the body's top-level blocks. */
function converters(anchors: Map<number, string>): JSXConvertersFunction {
  return ({ defaultConverters }) =>
    ({
      ...defaultConverters,
      paragraph: (args: Rendered) => <p className="mb-8 last:mb-0">{children(args)}</p>,
      heading: (args: Rendered) =>
        args.node.tag === 'h2' ? (
          <h2 id={args.parent?.type === 'root' ? anchors.get(args.childIndex) : undefined} className="mb-8 scroll-mt-20 pt-6 text-h2 wrap-anywhere md:text-h1 md:leading-[1.4]">
            {children(args)}
          </h2>
        ) : (
          <h3 className="mb-6 pt-4 text-h3 font-semibold wrap-anywhere md:text-h2">{children(args)}</h3>
        ),
      list: (args: Rendered) => {
        const ordered = args.node.tag === 'ol'
        const List = ordered ? 'ol' : 'ul'
        return <List className={`mb-8 pl-5 ${ordered ? 'list-decimal' : 'list-disc'} [&_ol]:mb-0 [&_ul]:mb-0`}>{children(args)}</List>
      },
      listitem: (args: Rendered) => {
        const nested = (args.node.children ?? []).some((child) => child.type === 'list')
        return <li className={nested ? 'list-none' : 'my-2 pl-1'}>{children(args)}</li>
      },
      quote: (args: Rendered) => <blockquote className="mb-8 border-l-3 border-line pl-5 text-ink-3">{children(args)}</blockquote>,
      horizontalrule: <hr className="mb-8 border-line" />,
      link: (args: Rendered) => {
        const href = safeHref((args.node.fields as { url?: unknown } | undefined)?.url)
        if (!href) return <>{children(args)}</>
        return (
          <a href={href} target="_blank" rel="noopener" className="text-link hover:underline">
            {children(args)}
          </a>
        )
      },
      upload: ({ node }: Rendered) => {
        const media = node.value as Media | number | undefined
        if (!media || typeof media !== 'object' || !media.url) return null
        const caption = typeof node.fields?.caption === 'string' ? node.fields.caption.trim() : ''
        const image = media.sizes?.card?.url && (media.width ?? 0) > 1400 ? media.sizes.card : media
        return (
          <figure className="mb-8 flex flex-col items-center">
            {/* An editor's own upload, served as it is: R2 or ./media, not through the image optimizer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url ?? media.url}
              alt={media.alt ?? ''}
              width={image.width ?? undefined}
              height={image.height ?? undefined}
              loading="lazy"
              className="h-auto w-full rounded-tag border border-hairline"
            />
            {caption && <figcaption className="mt-2 px-6 text-center text-meta leading-[1.8] text-ink-4">{caption}</figcaption>}
          </figure>
        )
      },
      blocks: {
        Code: ({ node }: Rendered) => {
          const code = typeof node.fields?.code === 'string' ? node.fields.code : ''
          if (!code.trim()) return null
          return (
            // Code keeps its own direction and language: it is not the article's prose.
            <pre dir="ltr" translate="no" className="mb-8 overflow-x-auto rounded-thumb border border-surface-2 bg-surface px-5 py-4 font-mono text-ui leading-[1.7] text-ink-2">
              <code>{code}</code>
            </pre>
          )
        },
      },
    }) as JSXConverters
}

/**
 * An article's body (「文章详情页」board): 17 px at 1.8, 32 px between blocks, headings, lists,
 * quotes, figures with captions and code blocks. Second-level headings get the anchors the table
 * of contents links to (`#s1` …).
 */
export function ArticleBody({ body, lang }: { body: Body; lang: string }) {
  if (!body?.root) return null
  const anchors = new Map<number, string>()
  for (const [index, node] of (body.root.children ?? []).entries()) {
    if (node.type === 'heading' && node.tag === 'h2') anchors.set(index, headingAnchor(anchors.size))
  }

  return (
    // The article's language, which may not be the page's.
    <div
      lang={lang}
      className="text-body-article wrap-anywhere [&_code]:rounded-tag [&_code]:bg-surface [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.9em] [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[1em] [&_strong]:font-bold"
    >
      {/* RichText's types want Lexical's own editor state; ours is the same JSON, read loosely. */}
      <RichText data={body as never} converters={converters(anchors)} disableContainer disableIndent disableTextAlign />
    </div>
  )
}
