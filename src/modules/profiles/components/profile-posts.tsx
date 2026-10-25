'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'

import { buttonClass } from '@/components/button'
import { StateShell } from '@/components/states/state-shell'
import type { Locale } from '@/i18n/config'
import { request } from '@/modules/circles/components/circles-session'
import { PostActionsContext, useReact } from '@/modules/circles/components/post-actions'
import { PostItem } from '@/modules/circles/components/post-item'
import { ReportDialog } from '@/modules/circles/components/report-dialog'
import type { CirclesChange, FeedPage, PostView, ReactionView } from '@/modules/circles/rules'

type ProfilePostsProps = {
  handle: string
  /** The first page, read with the page. */
  initial: { posts: PostView[]; next: number | null }
  loadedAt: number
}

/**
 * 「动态」on a member's page (docs/specs/circles.md「/u/[handle]」): their posts as on the circles
 * page, without「关注」, which is at the top of the page; 20 at a time,「更早的动态」for more.
 */
export function ProfilePosts({ handle, initial, loadedAt }: ProfilePostsProps) {
  const t = useTranslations('profiles')
  const locale = useLocale() as Locale
  const [posts, setPosts] = useState(initial.posts)
  const [next, setNext] = useState(initial.next)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [reporting, setReporting] = useState<PostView | null>(null)
  const [reported, setReported] = useState<ReadonlySet<number>>(new Set())

  const setReactions = useCallback((postId: number, reactions: ReactionView[]) => {
    setPosts((shown) => shown.map((post) => (post.id === postId ? { ...post, reactions } : post)))
  }, [])
  const react = useReact(setReactions)
  const remove = useCallback(async (postId: number) => {
    const { data } = await request<CirclesChange>(`/api/circles/posts?id=${postId}`, { method: 'DELETE' })
    if (!data) return false
    setPosts((shown) => shown.filter((post) => post.id !== postId))
    return true
  }, [])
  const actions = useMemo(() => ({ loadedAt, react, remove }), [loadedAt, react, remove])

  async function loadMore() {
    if (!next || loading) return
    setLoading(true)
    setFailed(false)
    const { data } = await request<FeedPage>(`/api/circles/feed?${new URLSearchParams({ author: handle, locale, cursor: String(next) })}`)
    setLoading(false)
    if (!data) {
      setFailed(true)
      return
    }
    setPosts((shown) => {
      const seen = new Set(shown.map((post) => post.id))
      return [...shown, ...data.posts.filter((post) => !seen.has(post.id))]
    })
    setNext(data.next)
  }

  if (posts.length === 0) {
    return (
      <div className="pt-6">
        <StateShell icon="message" title={t('postsEmpty')} />
      </div>
    )
  }

  return (
    <PostActionsContext value={actions}>
      <ul className="flex flex-col">
        {posts.map((post) => (
          <PostItem key={post.id} post={post} reported={reported.has(post.id)} onReport={() => setReporting(post)} follow={false} />
        ))}
      </ul>
      {(next || failed) && (
        <div className="flex flex-wrap items-center justify-center gap-3 pt-7">
          {next && (
            <button type="button" onClick={loadMore} disabled={loading} className={buttonClass('secondary', 'disabled:opacity-60')}>
              {t('earlierPosts')}
            </button>
          )}
          {failed && (
            <span role="alert" className="text-meta text-down">
              {t('postsFailed')}
            </span>
          )}
        </div>
      )}
      <ReportDialog
        target={reporting && { kind: 'post', id: reporting.id }}
        onClose={() => setReporting(null)}
        onReported={({ id }) => setReported((current) => new Set(current).add(id))}
      />
    </PostActionsContext>
  )
}
