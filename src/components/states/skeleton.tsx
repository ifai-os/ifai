import { useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'

/** Line widths cycle so the rows read as content rather than a table (from the「空状态与加载状态」board). */
const rowWidths = [72, 58, 80, 64] as const
const cardWidths = [
  [92, 70],
  [86, 58],
] as const

export function skeletonRow(index: number): { title: string; meta: string } {
  const title = rowWidths[index % rowWidths.length]
  return { title: `${title}%`, meta: `${title - 22}%` }
}

export function skeletonCard(index: number): { first: string; second: string } {
  const [first, second] = cardWidths[index % cardWidths.length]
  return { first: `${first}%`, second: `${second}%` }
}

type SkeletonProps = { className?: string; style?: CSSProperties }

/** One shimmering block. Decorative on its own — the containing list carries `role="status"`. */
export function Skeleton({ className, style }: SkeletonProps) {
  return <span aria-hidden="true" className={className ? `skeleton ${className}` : 'skeleton'} style={style} />
}

/** One line of text as a bar, in a box as tall as that text's line (`text` is its type class), so the page keeps its height. */
export function SkeletonLine({ text, width, bar = 'h-3' }: { text: string; width: string; bar?: string }) {
  return (
    <span className={`flex h-lh items-center ${text}`}>
      <Skeleton className={bar} style={{ width }} />
    </span>
  )
}

/** Rows shaped like the app, Skill and story lists: a 44px tile, two lines, a count on the right. Match `rows` to the real list so nothing jumps when it arrives. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  const t = useTranslations('states')
  return (
    <div role="status" aria-label={t('loadingList')} className="rounded-tile bg-bg px-4 py-1">
      {Array.from({ length: rows }, (_, index) => {
        const { title, meta } = skeletonRow(index)
        return (
          <div
            key={index}
            className={`grid grid-cols-[44px_minmax(0,1fr)_36px] items-center gap-3 py-3.5 ${index > 0 ? 'border-t border-surface-2' : ''}`}
          >
            <Skeleton className="size-11 rounded-tile" />
            <span className="flex flex-col gap-2">
              <Skeleton className="h-3" style={{ width: title }} />
              <Skeleton className="h-2.5" style={{ width: meta }} />
            </span>
            <Skeleton className="h-4 w-9" />
          </div>
        )
      })}
    </div>
  )
}

/** Cards with a 16:9 image placeholder, for the home page grids and related items. */
export function CardSkeleton({ count = 2 }: { count?: number }) {
  const t = useTranslations('states')
  return (
    <div
      role="status"
      aria-label={t('loadingCards')}
      className="grid grid-cols-[repeat(auto-fill,minmax(min(250px,100%),1fr))] gap-3"
    >
      {Array.from({ length: count }, (_, index) => {
        const { first, second } = skeletonCard(index)
        return (
          <div key={index} className="flex flex-col overflow-hidden rounded-card border border-surface-2 bg-bg">
            <Skeleton className="aspect-video rounded-none" />
            <span className="flex flex-col gap-2 p-3.5">
              <Skeleton className="h-2.5 w-2/5" />
              <Skeleton className="h-3.25" style={{ width: first }} />
              <Skeleton className="h-3.25" style={{ width: second }} />
              <Skeleton className="mt-1.5 h-2.5 w-[55%]" />
            </span>
          </div>
        )
      })}
    </div>
  )
}
