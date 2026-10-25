'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useMemo, useState } from 'react'

import { Link, useRouter } from '@/i18n/navigation'
import type { AuthProviders } from '@/lib/auth/providers'
import { FollowsProvider } from '@/modules/profiles/components/follows'

import type { CircleView, CirclesChange, CommentsPage, PostView, ReactionView, ReportTarget } from '../rules'
import { CirclesSessionProvider, request, useCirclesSession } from './circles-session'
import { Comments } from './comments'
import { PostActionsContext, useReact } from './post-actions'
import { PostItem } from './post-item'
import { ReportDialog } from './report-dialog'

type PostPageProps = {
  post: PostView
  circles: CircleView[]
  /** The first page of comments from the server; null on a hidden post, or when the page has to read them itself. */
  comments: CommentsPage | null
  loadedAt: number
  /** The page's heading, for screen readers: the post's title. */
  title: string
  signIn: AuthProviders
}

/**
 * A post's own page (docs/specs/circles.md「/circles/p/[id]」): the links back to the circles,
 * the post as in the feed, and its comments on a grey band below.
 */
export function PostPage({ circles, signIn, ...page }: PostPageProps) {
  const t = useTranslations('circles')
  return (
    <CirclesSessionProvider circles={circles} signIn={signIn} afterSignIn={t('afterSignInPost')}>
      <FollowsProvider>
        <PostPageContent {...page} />
      </FollowsProvider>
    </CirclesSessionProvider>
  )
}

const reportKey = (target: ReportTarget) => `${target.kind}:${target.id}`

function PostPageContent({ post: initial, comments, loadedAt, title }: Omit<PostPageProps, 'circles' | 'signIn'>) {
  const t = useTranslations('circles')
  const router = useRouter()
  const { byId } = useCirclesSession()
  const [post, setPost] = useState(initial)
  const [count, setCount] = useState(comments?.count ?? initial.comments)
  const [reporting, setReporting] = useState<ReportTarget | null>(null)
  const [reported, setReported] = useState<ReadonlySet<string>>(new Set())
  const circle = byId.get(post.circle)

  const setReactions = useCallback((postId: number, reactions: ReactionView[]) => {
    setPost((current) => (current.id === postId ? { ...current, reactions } : current))
  }, [])
  const react = useReact(setReactions)
  // Its page is gone with it: back to the circles.
  const remove = useCallback(
    async (postId: number) => {
      const { data } = await request<CirclesChange>(`/api/circles/posts?id=${postId}`, { method: 'DELETE' })
      if (!data) return false
      router.replace('/circles')
      return true
    },
    [router],
  )
  const actions = useMemo(() => ({ loadedAt, react, remove }), [loadedAt, react, remove])
  const isReported = useCallback((target: ReportTarget) => reported.has(reportKey(target)), [reported])

  return (
    <PostActionsContext value={actions}>
      <main id="main" className="flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-read flex-col gap-5 px-4 pt-6 pb-10">
          <h1 className="sr-only">{title}</h1>
          <nav aria-label={t('breadcrumb')} className="text-meta text-ink-4">
            <ol className="flex flex-wrap items-center gap-2">
              <li className="flex items-center gap-2">
                <Link href="/circles" className="hover:text-ink">
                  {t('title')}
                </Link>
                {circle && <span aria-hidden="true">/</span>}
              </li>
              {circle && (
                <li>
                  <Link href={{ pathname: '/circles', query: { circle: circle.slug } }} className="hover:text-ink">
                    # {circle.name}
                  </Link>
                </li>
              )}
            </ol>
          </nav>
          <PostItem
            post={{ ...post, comments: count }}
            reported={isReported({ kind: 'post', id: post.id })}
            onReport={() => setReporting({ kind: 'post', id: post.id })}
            page
          />
        </div>
        {!post.hidden && (
          <Comments
            postId={post.id}
            initial={comments}
            count={count}
            onCount={setCount}
            isReported={(id) => isReported({ kind: 'comment', id })}
            onReport={(id) => setReporting({ kind: 'comment', id })}
          />
        )}
      </main>
      <ReportDialog
        target={reporting}
        onClose={() => setReporting(null)}
        onReported={(target) => setReported((current) => new Set(current).add(reportKey(target)))}
      />
    </PostActionsContext>
  )
}
