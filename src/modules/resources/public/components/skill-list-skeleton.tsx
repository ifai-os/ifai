'use client'

import { useTranslations } from 'next-intl'

import { Skeleton, SkeletonLine } from '@/components/states/skeleton'

/** Bar widths in turn, so the rows read as content rather than a table. `card` is the name in the grid's card header. */
const widths = [
  { name: '34%', card: '72%', tagline: '86%', meta: '52%' },
  { name: '26%', card: '58%', tagline: '72%', meta: '60%' },
  { name: '40%', card: '80%', tagline: '92%', meta: '46%' },
  { name: '30%', card: '64%', tagline: '68%', meta: '56%' },
] as const

/**
 * The results of the Skills list while another view of it loads: the count line, then `count`
 * Skills shaped like `SkillItem`, as rows or as cards after the surrounding `ViewSwitch`. A client
 * component, so the page carries the count rather than the skeleton's markup.
 */
export function SkillListSkeleton({ count }: { count: number }) {
  const t = useTranslations('states')
  return (
    <div role="status" aria-label={t('loadingList')} className="flex flex-col gap-3">
      <SkeletonLine text="text-meta" width="180px" />
      <div className="flex flex-col border-t border-surface-2 group-data-[view=grid]/view:grid group-data-[view=grid]/view:grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))] group-data-[view=grid]/view:gap-4 group-data-[view=grid]/view:border-t-0">
        {Array.from({ length: count }, (_, index) => {
          const width = widths[index % widths.length]
          return (
            <div
              key={index}
              className="flex gap-3.5 border-b border-surface-2 py-4 group-data-[view=grid]/view:flex-col group-data-[view=grid]/view:gap-3 group-data-[view=grid]/view:rounded-card group-data-[view=grid]/view:border group-data-[view=grid]/view:p-4.5 md:gap-4"
            >
              <div className="flex gap-3.5 md:gap-4 group-data-[view=grid]/view:items-center group-data-[view=grid]/view:gap-3">
                <Skeleton className="size-11 flex-none rounded-tile" />
                <div className="hidden min-w-0 flex-1 flex-col gap-0.5 group-data-[view=grid]/view:flex">
                  <SkeletonLine text="text-body" width={width.card} bar="h-3.5" />
                  <SkeletonLine text="text-small" width="50%" bar="h-2.5" />
                </div>
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex h-lh items-center gap-2 text-title group-data-[view=grid]/view:hidden">
                  <Skeleton className="h-4" style={{ width: width.name }} />
                  <Skeleton className="h-6 w-16 flex-none rounded-tag" />
                </div>
                <div className="flex flex-col group-data-[view=grid]/view:flex-1">
                  <SkeletonLine text="text-ui" width={width.tagline} />
                  {/* Cards, and rows on phones, give the tagline two lines. */}
                  <span className="hidden max-md:block group-data-[view=grid]/view:block">
                    <SkeletonLine text="text-ui" width="55%" />
                  </span>
                </div>
                {/* Installs, author and date (two lines on phones), then the security check badge, which seldom fits beside them. */}
                <div className="flex flex-col gap-1">
                  <SkeletonLine text="text-small" width={width.meta} bar="h-2.5" />
                  <span className="hidden max-md:block">
                    <SkeletonLine text="text-small" width="40%" bar="h-2.5" />
                  </span>
                  <Skeleton className="h-6 w-36 rounded-tag" />
                </div>
              </div>

              <Skeleton className="h-8 w-18 flex-none self-start rounded-pill group-data-[view=grid]/view:self-end" />
            </div>
          )
        })}
      </div>
    </div>
  )
}
