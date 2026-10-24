'use client'

import { useTranslations } from 'next-intl'

import { Skeleton, SkeletonLine } from '@/components/states/skeleton'

/** Bar widths in turn, so the rows read as content rather than a table. */
const widths = [
  { title: '72%', summary: '92%', more: '64%' },
  { title: '58%', summary: '86%', more: '48%' },
  { title: '80%', summary: '90%', more: '70%' },
  { title: '64%', summary: '82%', more: '56%' },
] as const

/**
 * The daily list's stories while another category or page loads (「空状态与加载状态」board): a day
 * heading, then `count` rows shaped like `StoryRow`. A client component, so the page carries the
 * count rather than the skeleton's markup.
 */
export function DailyFeedSkeleton({ count }: { count: number }) {
  const t = useTranslations('states')
  return (
    <div role="status" aria-label={t('loadingList')} className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Skeleton className="h-13 w-12 rounded-card" />
        <SkeletonLine text="text-h3" width="120px" bar="h-5" />
      </div>
      <div>
        {Array.from({ length: count }, (_, index) => {
          const width = widths[index % widths.length]
          return (
            <div key={index} className="flex items-start gap-4 border-t border-line py-4 md:gap-6 md:py-5">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <SkeletonLine text="text-meta" width="30%" />
                <SkeletonLine text="text-title md:text-h3" width={width.title} bar="h-4" />
                <SkeletonLine text="text-body" width={width.summary} bar="h-3" />
                <SkeletonLine text="text-body" width={width.more} bar="h-3" />
              </div>
              {index % 2 === 0 && <Skeleton className="hidden aspect-video w-50 flex-none rounded-card md:block" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * A story's page while it loads: breadcrumb, then the article (category, title, times, summary,
 * picture, sources) and the column beside it, in the page's own layout so nothing moves when it
 * arrives. A client component: `loading.tsx` gets no locale, and translating there on the server
 * would stop the story pages being static.
 */
export function StoryDetailSkeleton() {
  const t = useTranslations('states')
  return (
    <div role="status" aria-label={t('loadingPage')} className="flex flex-col gap-6 md:gap-8">
      <SkeletonLine text="text-meta" width="240px" />
      <div className="flex flex-col gap-8 md:flex-row md:items-start md:gap-12">
        <div className="flex w-full max-w-read min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-3">
            <SkeletonLine text="text-meta" width="64px" />
            <SkeletonLine text="text-h1 md:text-h1-article" width="90%" bar="h-7 md:h-8" />
            <SkeletonLine text="text-h1 md:text-h1-article" width="55%" bar="h-7 md:h-8" />
            <SkeletonLine text="text-meta" width="40%" />
          </div>
          <div className="flex flex-col">
            {['96%', '92%', '60%'].map((width) => (
              <SkeletonLine key={width} text="text-body-article" width={width} bar="h-3.5" />
            ))}
          </div>
          <Skeleton className="aspect-video w-full rounded-card" />
          <div className="flex flex-col gap-3">
            <SkeletonLine text="text-h3" width="96px" bar="h-5" />
            {['50%', '42%', '46%'].map((width) => (
              <div key={width} className="flex flex-col gap-1 border-t border-surface-2 py-3">
                <SkeletonLine text="text-body" width={width} bar="h-3.5" />
                <SkeletonLine text="text-small" width="36%" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex w-full flex-col gap-6 md:w-80 md:flex-none">
          <Skeleton className="h-28 rounded-tile" />
          <Skeleton className="h-36 rounded-card" />
        </div>
      </div>
    </div>
  )
}

/** A topic or category page's stories while another page loads: a time, then a card shaped like `StoryCard`. */
export function StoryCardsSkeleton({ count }: { count: number }) {
  const t = useTranslations('states')
  return (
    <div role="status" aria-label={t('loadingList')} className="flex flex-col gap-7">
      {Array.from({ length: count }, (_, index) => {
        const width = widths[index % widths.length]
        return (
          <div key={index} className="flex flex-col gap-2.5">
            <SkeletonLine text="text-body" width="120px" />
            <div className="flex flex-col gap-3 rounded-card bg-bg px-5 py-5 md:px-7 md:py-6">
              <SkeletonLine text="text-meta" width="30%" />
              <SkeletonLine text="text-h3" width={width.title} bar="h-4.5" />
              <SkeletonLine text="text-body" width={width.summary} bar="h-3" />
              <SkeletonLine text="text-body" width={width.more} bar="h-3" />
            </div>
          </div>
        )
      })}
    </div>
  )
}
