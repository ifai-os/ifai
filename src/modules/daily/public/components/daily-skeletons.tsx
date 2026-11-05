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
    <div role="status" aria-label={t('loadingList')} className="flex flex-col">
      <div className="flex items-center gap-3 pt-2 pb-4">
        <Skeleton className="h-10.5 w-10 rounded-thumb" />
        <SkeletonLine text="text-h3" width="120px" bar="h-5" />
      </div>
      <div>
        {Array.from({ length: count }, (_, index) => {
          const width = widths[index % widths.length]
          return (
            <div key={index} className="flex items-start gap-4 border-t border-hairline py-4 md:gap-7 md:py-6">
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <SkeletonLine text="text-meta" width="30%" />
                <SkeletonLine text="text-title md:text-h3" width={width.title} bar="h-4" />
                <div>
                  <SkeletonLine text="text-body" width={width.summary} bar="h-3" />
                  <SkeletonLine text="text-body" width={width.more} bar="h-3" />
                </div>
              </div>
              {index % 2 === 0 && <Skeleton className="hidden aspect-[10/7] w-40 flex-none rounded-thumb md:block" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** A topic or category page's stories while another page loads: a day above every third, then cards shaped like `StoryCard`. */
export function StoryCardsSkeleton({ count }: { count: number }) {
  const t = useTranslations('states')
  return (
    <div role="status" aria-label={t('loadingList')} className="flex flex-col gap-7">
      {Array.from({ length: count }, (_, index) => {
        const width = widths[index % widths.length]
        return (
          <div key={index} className="flex flex-col gap-2.5">
            {index % 3 === 0 && <SkeletonLine text="text-body" width="120px" />}
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
