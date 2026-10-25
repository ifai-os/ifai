'use client'

import { useTranslations } from 'next-intl'

import { Skeleton, SkeletonLine, skeletonRow } from '@/components/states/skeleton'

/**
 * The list while another tab, channel, tag or page loads (「空状态与加载状态」board): `count` rows
 * shaped like `ArticleRow`. A client component, so the page carries the count rather than the markup.
 */
export function ArticleListSkeleton({ count }: { count: number }) {
  const t = useTranslations('states')
  return (
    <div role="status" aria-label={t('loadingList')} className="flex flex-col">
      {Array.from({ length: count }, (_, index) => {
        const width = skeletonRow(index)
        return (
          <div key={index} className="flex gap-4 border-b border-hairline py-5 md:gap-6">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <SkeletonLine text="text-title" width={width.title} bar="h-4" />
              <SkeletonLine text="text-ui" width="88%" />
              <SkeletonLine text="text-meta" width={width.meta} />
            </div>
            {index % 2 === 0 && <Skeleton className="h-16 w-24 flex-none self-center rounded-thumb md:h-20 md:w-30" />}
          </div>
        )
      })}
    </div>
  )
}
