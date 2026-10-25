'use client'

import { useTranslations } from 'next-intl'

import { Skeleton, SkeletonLine } from '@/components/states/skeleton'

/**
 * An app's page while it loads (「空状态与加载状态」board): breadcrumb, then the header (logo, name,
 * tagline, facts, buttons) beside the screenshot, then the first tab, in the page's own layout so
 * nothing moves when it arrives. A client component: `loading.tsx` gets no locale, and
 * translating there on the server would stop the app pages being static.
 */
export function AppDetailSkeleton() {
  const t = useTranslations('states')
  return (
    <div role="status" aria-label={t('loadingPage')} className="flex flex-col gap-7">
      <SkeletonLine text="text-meta" width="200px" />
      <div className="flex flex-wrap items-stretch gap-x-10 gap-y-7">
        <div className="flex max-w-190 min-w-0 flex-[999_1_460px] flex-col gap-3.5 md:gap-4">
          <div className="flex items-center gap-3.5 md:gap-4">
            <Skeleton className="size-16 flex-none rounded-card md:size-18" />
            <div className="flex min-w-0 flex-1 flex-col gap-1 md:gap-1.5">
              <SkeletonLine text="text-h2 md:text-h1" width="50%" bar="h-6 md:h-7" />
              <SkeletonLine text="text-meta" width="35%" />
            </div>
          </div>
          <SkeletonLine text="text-body" width="80%" bar="h-3.5" />
          <div className="flex flex-col gap-2">
            {['60%', '45%', '55%', '40%'].map((width) => (
              <SkeletonLine key={width} text="text-meta" width={width} />
            ))}
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-6.5 w-16 rounded-pill" />
            <Skeleton className="h-6.5 w-20 rounded-pill" />
            <Skeleton className="h-6.5 w-14 rounded-pill" />
          </div>
          <div className="hidden gap-2 pt-1 md:flex">
            <Skeleton className="h-10 w-28 rounded-btn" />
            <Skeleton className="h-10 w-20 rounded-btn" />
            <Skeleton className="h-10 w-20 rounded-btn" />
          </div>
        </div>
        <Skeleton className="hidden min-h-72 min-w-0 flex-[1_1_380px] rounded-hero md:block md:max-w-130" />
      </div>
      <div className="flex flex-col gap-5">
        <div className="flex gap-6 border-b border-line pb-3">
          {['w-12', 'w-16', 'w-14', 'w-16'].map((width, index) => (
            <Skeleton key={index} className={`h-4 ${width}`} />
          ))}
        </div>
        {['92%', '84%', '88%', '60%'].map((width) => (
          <SkeletonLine key={width} text="text-body" width={width} bar="h-3.5" />
        ))}
      </div>
    </div>
  )
}
