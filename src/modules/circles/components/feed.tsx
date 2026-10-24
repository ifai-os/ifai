'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState, type KeyboardEvent } from 'react'

import { Button, buttonClass } from '@/components/button'
import { LoadFailed } from '@/components/states/load-failed'
import { Skeleton } from '@/components/states/skeleton'
import { StateShell } from '@/components/states/state-shell'
import { skeletonDelayMs } from '@/components/states/timing'
import { Link } from '@/i18n/navigation'

import { feedTabs, type FeedTab, type PostView } from '../rules'
import { useCircles } from './circles-provider'
import { PostItem } from './post-item'
import { ReportDialog } from './report-dialog'

/** 「推荐 / 最新 / 我的圈子」and the posts under them, 20 at a time. */
export function Feed() {
  const t = useTranslations('circles')
  const { tab, setTab, circle, status, posts, hasMore, loadingMore, moreFailed, loadMore, retry } = useCircles()
  const [reporting, setReporting] = useState<PostView | null>(null)
  const [reported, setReported] = useState<ReadonlySet<number>>(new Set())
  // 我的圈子 is every circle the reader joined; inside one circle there is no such tab.
  const tabs = circle ? feedTabs.filter((item) => item !== 'mine') : feedTabs

  // Arrow keys move between the tabs, as in an app's page (src/modules/apps/components/detail-tabs.tsx).
  function onKeyDown(event: KeyboardEvent, index: number) {
    const moves: Record<string, number> = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: tabs.length - 1 }
    if (!(event.key in moves)) return
    event.preventDefault()
    const next = tabs[(moves[event.key] + tabs.length) % tabs.length]
    setTab(next)
    document.getElementById(tabId(next))?.focus()
  }

  return (
    <section aria-labelledby="circles-feed" className="flex flex-col">
      <h2 id="circles-feed" className="sr-only">
        {t('feedLabel')}
      </h2>
      {circle && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-2">
          <p className="text-title font-semibold"># {circle.name}</p>
          <Link href="/circles" scroll={false} className="text-meta text-link hover:underline">
            {t('showAll')}
          </Link>
        </div>
      )}
      <div role="tablist" aria-label={t('feedLabel')} className="flex gap-7 border-b border-line">
        {tabs.map((item, index) => (
          <TabButton key={item} tab={item} selected={item === tab} onSelect={setTab} onKeyDown={(event) => onKeyDown(event, index)} />
        ))}
      </div>

      <div role="tabpanel" id={panelId} aria-labelledby={tabId(tab)} className="flex flex-col">
        {status === 'loading' && <FeedSkeleton />}
        {status === 'failed' && (
          <div className="pt-4">
            <LoadFailed onRetry={retry} title={t('failed')} />
          </div>
        )}
        {status === 'ready' && posts.length === 0 && <EmptyFeed />}
        {status === 'ready' && posts.length > 0 && (
          <ul className="flex flex-col">
            {posts.map((post) => (
              <PostItem key={post.id} post={post} reported={reported.has(post.id)} onReport={() => setReporting(post)} />
            ))}
          </ul>
        )}
        {status === 'ready' && (hasMore || moreFailed) && (
          <div className="flex flex-wrap items-center gap-3 pt-5">
            {hasMore && (
              <button type="button" onClick={loadMore} disabled={loadingMore} className={buttonClass('secondary', 'disabled:opacity-60')}>
                {t('loadMore')}
              </button>
            )}
            {moreFailed && (
              <span role="alert" className="text-meta text-down">
                {t('failed')}
              </span>
            )}
          </div>
        )}
      </div>

      <ReportDialog
        target={reporting && { kind: 'post', id: reporting.id }}
        onClose={() => setReporting(null)}
        onReported={({ id }) => setReported((current) => new Set(current).add(id))}
      />
    </section>
  )
}

const panelId = 'circles-feed-panel'
const tabId = (tab: FeedTab) => `circles-tab-${tab}`

type TabButtonProps = {
  tab: FeedTab
  selected: boolean
  onSelect: (tab: FeedTab) => void
  onKeyDown: (event: KeyboardEvent) => void
}

function TabButton({ tab, selected, onSelect, onKeyDown }: TabButtonProps) {
  const t = useTranslations('circles')
  return (
    <button
      id={tabId(tab)}
      type="button"
      role="tab"
      aria-selected={selected}
      aria-controls={panelId}
      tabIndex={selected ? 0 : -1}
      onClick={() => onSelect(tab)}
      onKeyDown={onKeyDown}
      className={`-mb-px min-h-11 border-b-2 text-title whitespace-nowrap transition-colors ${
        selected ? 'border-ink text-ink' : 'border-transparent text-ink-4 hover:text-ink'
      }`}
    >
      {t(`tabs.${tab}`)}
    </button>
  )
}

/** 我的圈子 for a visitor asks them to sign in; for a member in no circle, to join some; otherwise the first post is theirs to write. */
function EmptyFeed() {
  const t = useTranslations('circles')
  const { tab, circle, signedIn, askToSignIn } = useCircles()
  return (
    <div className="pt-4">
      {tab === 'mine' && !circle ? (
        signedIn ? (
          <StateShell icon="circles" title={t('mineEmptyTitle')} body={t('mineEmptyBody')} />
        ) : (
          <StateShell icon="circles" title={t('mineEmptyTitle')} body={t('mineSignIn')}>
            <Button onClick={() => askToSignIn('join')}>{t('signIn')}</Button>
          </StateShell>
        )
      ) : (
        <StateShell icon="message" title={t('emptyTitle')} body={circle ? t('emptyCircleBody', { name: circle.name }) : t('emptyBody')} />
      )}
    </div>
  )
}

function FeedSkeleton() {
  const states = useTranslations('states')
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), skeletonDelayMs)
    return () => clearTimeout(timer)
  }, [])
  return (
    <div role="status" aria-label={states('loadingList')} className="min-h-80">
      {visible &&
        [76, 58, 68].map((width) => (
          <div key={width} className="flex flex-col gap-3 border-b border-hairline py-5">
            <span className="flex items-center gap-2.5">
              <Skeleton className="size-10 rounded-pill" />
              <span className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-40" />
              </span>
            </span>
            <Skeleton className="h-3" style={{ width: `${width}%` }} />
            <Skeleton className="h-3" style={{ width: `${width - 20}%` }} />
          </div>
        ))}
    </div>
  )
}
