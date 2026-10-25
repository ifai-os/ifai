'use client'

import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

import type { FollowTarget } from '../target'
import { useFollow } from './follow-provider'

/**
 * The boards' follow buttons (docs/specs/daily.md「关注」): `row` on the story page's industry
 * tags, `entity` on its companies and products, `topic` in its topic tracker, `page` at the top
 * of a topic page or tag page. Each turns black (or grey, on a page) once followed.
 */
const looks = {
  row: {
    base: 'inline-flex h-7 min-w-16 flex-none items-center justify-center gap-1 rounded-pill border px-2.5 text-small transition-colors',
    off: 'border-line bg-bg text-ink hover:border-ink-4',
    on: 'border-ink bg-ink text-white',
  },
  entity: {
    base: 'inline-flex h-8 min-w-16 flex-none items-center justify-center rounded-pill border border-line px-3 text-small transition-colors',
    off: 'bg-bg text-ink hover:border-ink-4',
    on: 'bg-ink text-white',
  },
  topic: {
    base: 'inline-flex h-8 flex-none items-center rounded-pill border border-ink px-3.5 text-small font-medium transition-colors',
    off: 'bg-bg text-ink hover:bg-surface',
    on: 'bg-ink text-white',
  },
  page: {
    base: 'inline-flex h-10 min-w-24 flex-none items-center justify-center gap-1 rounded-btn px-6 text-body font-medium whitespace-nowrap transition-colors',
    off: 'bg-accent text-white hover:bg-accent/90',
    on: 'bg-surface-2 text-ink-2 hover:bg-line',
  },
} as const

type FollowButtonProps = {
  target: FollowTarget
  /** The tag's, company's or product's name, for screen readers: a page can have several buttons. */
  name: string
  look: keyof typeof looks
}

/** 关注 / 已关注 for one target of the FollowProvider around it. */
export function FollowButton({ target, name, look }: FollowButtonProps) {
  const t = useTranslations('follows')
  const { following, toggle } = useFollow(target)
  const style = looks[look]
  const plus = !following && (look === 'row' || look === 'page')

  return (
    <button
      type="button"
      aria-pressed={following}
      // The topic tracker's button sits by the topic's name and says「关注话题」; the others name what they follow.
      aria-label={look === 'topic' ? undefined : t(following ? 'followingName' : 'followName', { name })}
      onClick={toggle}
      className={`${style.base} ${following ? style.on : style.off}`}
    >
      {plus && <span aria-hidden="true">+</span>}
      {look === 'topic' ? t(following ? 'followingTopic' : 'followTopic') : t(following ? 'following' : 'follow')}
    </button>
  )
}

/** 「· 3,268 人关注」 after a topic page's other facts; nothing until someone follows it. */
export function FollowCount({ target }: { target: FollowTarget }) {
  const t = useTranslations('follows')
  const { count } = useFollow(target)
  if (!count) return null
  return (
    <>
      <span aria-hidden="true">·</span>
      <span>{t('count', { count })}</span>
    </>
  )
}

/**
 * Under a topic page's top, once it is followed with the button there: where its news will
 * show up (the「IFAI 公司 / 产品页（日报）」board's note; the newer board leaves it out, so it
 * only appears after the press).
 */
export function FollowedNote({ target, name }: { target: FollowTarget; name: string }) {
  const t = useTranslations('follows')
  const { following, followedHere } = useFollow(target)
  return (
    <div role="status" aria-live="polite">
      {following && followedHere && (
        <p className="pt-4 text-meta text-ink-4">
          {t.rich('followedNote', {
            name,
            link: (chunks) => (
              <Link href="/me/following" className="text-link hover:underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
      )}
    </div>
  )
}
