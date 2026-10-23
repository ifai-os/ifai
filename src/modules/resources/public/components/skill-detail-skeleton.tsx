'use client'

import { useTranslations } from 'next-intl'

import { Skeleton, SkeletonLine } from '@/components/states/skeleton'

/**
 * A Skill's page while it loads (「空状态与加载状态」board): breadcrumb, header, install panel and
 * the first tab in the page's own grid, so nothing moves when the page arrives. Phones get the
 * page's order: header, install panel, tabs.
 *
 * A client component: `loading.tsx` gets no locale to hand to `setRequestLocale`, so translating
 * on the server there would read the request headers and stop the Skill's pages being static.
 */
export function SkillDetailSkeleton() {
  const t = useTranslations('states')
  return (
    <div role="status" aria-label={t('loadingPage')} className="flex flex-col gap-6 md:gap-8">
      <SkeletonLine text="text-meta" width="240px" />

      <div className="grid gap-x-10 gap-y-6 md:grid-cols-[minmax(0,1fr)_340px] md:grid-rows-[auto_1fr]">
        <div className="flex min-w-0 flex-col gap-3.5 md:col-start-1">
          <div className="flex items-center gap-4">
            <Skeleton className="size-16 flex-none rounded-card md:size-18 md:rounded-dialog" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <SkeletonLine text="text-h2 md:text-h1" width="60%" bar="h-6 md:h-7" />
              <SkeletonLine text="text-meta" width="40%" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20 rounded-tag" />
            <Skeleton className="h-6 w-24 rounded-tag" />
          </div>
          <SkeletonLine text="text-body" width="75%" bar="h-3.5" />
          <SkeletonLine text="text-meta" width="50%" />
          <div className="flex gap-2">
            <Skeleton className="h-6.5 w-24 rounded-pill" />
            <Skeleton className="h-6.5 w-14 rounded-pill" />
          </div>
          <div className="hidden gap-2 pt-1 md:flex">
            <Skeleton className="h-10 w-24 rounded-btn" />
            <Skeleton className="h-10 w-24 rounded-btn" />
          </div>
        </div>

        <Skeleton className="h-120 rounded-hero md:col-start-2 md:row-span-2 md:row-start-1 md:h-145" />

        <div className="flex min-w-0 flex-col gap-5 md:col-start-1">
          <div className="flex gap-6 border-b border-line pb-3">
            {['w-10', 'w-12', 'w-16', 'w-16'].map((width, index) => (
              <Skeleton key={index} className={`h-4 ${width}`} />
            ))}
          </div>
          <SkeletonLine text="text-h3" width="30%" bar="h-5" />
          {['92%', '84%', '88%', '60%'].map((width) => (
            <SkeletonLine key={width} text="text-body" width={width} bar="h-3.5" />
          ))}
          <SkeletonLine text="text-h3" width="25%" bar="h-5" />
          <Skeleton className="h-12 rounded-thumb" />
        </div>
      </div>
    </div>
  )
}
