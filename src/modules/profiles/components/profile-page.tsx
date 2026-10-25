'use client'

import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

import { buttonClass } from '@/components/button'
import { tileTones } from '@/components/cards/initial-tile'
import { Icon } from '@/components/icon'
import { LocalTime } from '@/components/local-time'
import { ShareButton } from '@/components/share-button'
import { StateShell } from '@/components/states/state-shell'
import { localizePath, type Locale } from '@/i18n/config'
import { Link } from '@/i18n/navigation'
import type { AuthProviders } from '@/lib/auth/providers'
import { AppTile } from '@/modules/apps/components/app-tile'
import { Stars } from '@/modules/apps/reviews/components/stars'
import { CirclesSessionProvider } from '@/modules/circles/components/circles-session'
import { PersonAvatar } from '@/modules/circles/components/person-avatar'
import type { CircleView } from '@/modules/circles/rules'

import type { ProfileCircle, ProfilePageData, ProfileReview } from '../public'
import { peoplePath, profilePath, profileTabs, websiteLabel, type ProfileTab } from '../rules'
import { FollowButton, FollowsProvider, useFollowers } from './follows'
import { ProfilePosts } from './profile-posts'

type ProfilePageProps = {
  page: ProfilePageData
  circles: CircleView[]
  signIn: AuthProviders
}

/**
 * A member's page (docs/specs/circles.md「/u/[handle]」, the「IFAI 个人主页」board): who they are
 * and their numbers, then 动态 / 评价 / 圈子 (and a link to「我的收藏」on one's own page).
 */
export function ProfilePage({ page, circles, signIn }: ProfilePageProps) {
  const t = useTranslations('profiles')
  return (
    <CirclesSessionProvider circles={circles} signIn={signIn} afterSignIn={t('afterSignIn')}>
      <FollowsProvider>
        <main id="main" className="mx-auto flex w-full max-w-[720px] flex-col px-4 pt-8 pb-24 md:pt-12">
          <ProfileHeader page={page} />
          <ProfileTabs page={page} />
          {page.posts && <ProfilePosts handle={page.profile.handle} initial={page.posts} loadedAt={page.loadedAt} />}
          {page.reviews && <ProfileReviews handle={page.profile.handle} reviews={page.reviews} />}
          {page.tab === 'circles' && <ProfileCircles circles={page.circles} own={page.own} />}
        </main>
      </FollowsProvider>
    </CirclesSessionProvider>
  )
}

function ProfileHeader({ page }: { page: ProfilePageData }) {
  const t = useTranslations('profiles')
  const circlesT = useTranslations('circles')
  const format = useFormatter()
  const locale = useLocale() as Locale
  const { profile, own, follows, stats, circles } = page
  const name = profile.name || circlesT('anonymous')
  const followers = useFollowers(profile.handle, follows.followers)
  const bold = (chunks: ReactNode) => <b className="font-semibold text-ink">{chunks}</b>

  return (
    <section aria-labelledby="profile-name" className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <PersonAvatar name={name} tone={profile.tone} size="xl" />
        <div className="flex items-center gap-2">
          {own ? (
            <>
              <Link href="/me/account" className={buttonClass('secondary', 'h-9')}>
                {t('editProfile')}
              </Link>
              <ShareButton
                title={t('metaTitle', { name, handle: profile.handle })}
                url={localizePath(locale, profilePath(profile.handle))}
                labels={{ share: t('shareProfile'), copied: t('linkCopied') }}
                iconOnly
                iconSize={18}
                className="flex size-9 items-center justify-center rounded-btn border border-line bg-bg text-ink hover:border-ink-4"
              />
            </>
          ) : (
            <>
              <FollowButton handle={profile.handle} name={name} initial={page.following} look="large" />
              <ProfileMenu handle={profile.handle} name={name} />
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h1 id="profile-name" className="text-h2 wrap-anywhere">
          {name}
        </h1>
        <span className="text-ui text-ink-4">@{profile.handle}</span>
      </div>
      {profile.bio && (
        <p lang={profile.bioLang ?? undefined} className="text-body text-ink-2 wrap-anywhere">
          {profile.bio}
        </p>
      )}
      {profile.website && (
        <a
          href={profile.website}
          target="_blank"
          rel="nofollow ugc noopener me"
          className="flex items-center gap-1 self-start text-meta text-link hover:underline"
        >
          <Icon name="link" size={15} />
          <span className="wrap-anywhere">{websiteLabel(profile.website)}</span>
        </a>
      )}
      <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-ui text-ink-2">
        <Link href={peoplePath(profile.handle, 'following')} className="hover:text-ink">
          {t.rich('followingCount', { count: follows.following, b: bold })}
        </Link>
        <span aria-hidden="true" className="text-ink-4">
          ·
        </span>
        <Link href={peoplePath(profile.handle, 'followers')} className="hover:text-ink">
          {t.rich('followersCount', { count: followers, b: bold })}
        </Link>
      </p>

      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label={t('postsCard')} value={format.number(stats.posts)}>
          {t('receivedNote', { reactions: stats.reactions, comments: stats.comments })}
        </StatCard>
        <StatCard label={t('circlesCard')} value={format.number(circles.length)}>
          {circles.length > 0 && <CircleTiles circles={circles} />}
        </StatCard>
        <StatCard label={t('daysCard')} value={t('days', { count: stats.days })}>
          {t('reviewsNote', { count: stats.reviews })}
        </StatCard>
      </div>
    </section>
  )
}

function StatCard({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-tile border border-line p-4">
      <span className="text-small text-ink-4">{label}</span>
      <span className="text-h3 font-semibold">{value}</span>
      {children && <span className="mt-1.5 text-small text-ink-4">{children}</span>}
    </div>
  )
}

/** The first four circles' colours, then「+N」for the rest. */
function CircleTiles({ circles }: { circles: ProfileCircle[] }) {
  const shown = circles.slice(0, 4)
  return (
    <span aria-hidden="true" className="flex gap-1">
      {shown.map(({ circle }) => (
        <span
          key={circle.id}
          title={circle.name}
          className={`flex size-5.5 items-center justify-center rounded-btn text-micro font-semibold ${tileTones[circle.tone % tileTones.length]}`}
        >
          #
        </span>
      ))}
      {circles.length > shown.length && (
        <span className="flex h-5.5 items-center rounded-btn bg-surface-2 px-1.5 text-micro text-ink-2">+{circles.length - shown.length}</span>
      )}
    </span>
  )
}

/** 「更多」on someone else's page:「复制主页链接」(4b adds blocking and reporting). */
function ProfileMenu({ handle, name }: { handle: string; name: string }) {
  const t = useTranslations('profiles')
  const locale = useLocale() as Locale
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  async function copyLink() {
    setOpen(false)
    try {
      await navigator.clipboard.writeText(new URL(localizePath(locale, profilePath(handle)), window.location.origin).href)
      setCopied(true)
    } catch {
      // No clipboard access: the address bar has the link.
    }
  }

  return (
    <div
      ref={box}
      className="relative flex-none"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpen(false)
        }
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t('moreName', { name })}
        className="flex size-9 items-center justify-center rounded-btn border border-line bg-bg text-ink hover:border-ink-4"
      >
        <Icon name={copied ? 'check' : 'more'} size={18} />
      </button>
      {open && (
        <div id={menuId} className="absolute top-11 right-0 z-10 flex w-max min-w-42 flex-col rounded-tile border border-hairline bg-bg p-1.5 shadow-float">
          <button type="button" onClick={copyLink} className="flex min-h-10 w-full items-center rounded-thumb px-2.5 text-left text-ui hover:bg-surface">
            {t('copyLink')}
          </button>
        </div>
      )}
      <span role="status" className="sr-only">
        {copied ? t('linkCopied') : ''}
      </span>
    </div>
  )
}

/** 动态 / 评价 / 圈子 as links (?tab=), each with its number; on one's own page,「收藏」with a lock goes to「我的收藏」. */
function ProfileTabs({ page }: { page: ProfilePageData }) {
  const t = useTranslations('profiles')
  const format = useFormatter()
  const { handle } = page.profile
  const tabClass = (on: boolean) =>
    `-mb-px flex h-12 items-center gap-1.5 border-b-2 text-body font-medium whitespace-nowrap transition-colors ${
      on ? 'border-ink text-ink' : 'border-transparent text-ink-4 hover:text-ink'
    }`
  const href = (tab: ProfileTab) => (tab === 'posts' ? profilePath(handle) : { pathname: profilePath(handle), query: { tab } })
  return (
    <nav aria-label={t('tabsLabel')} className="mt-9 flex flex-wrap gap-x-5 border-b border-line sm:gap-x-7">
      {profileTabs.map((tab) => (
        <Link key={tab} href={href(tab)} scroll={false} aria-current={tab === page.tab ? 'page' : undefined} className={tabClass(tab === page.tab)}>
          {t(`tabs.${tab}`)}
          <span className="text-meta font-normal text-ink-4">{format.number(page.counts[tab])}</span>
        </Link>
      ))}
      {page.own && (
        <Link href="/me/saves" className={tabClass(false)}>
          {t('tabs.saves')}
          <Icon name="lock" size={14} className="flex-none text-ink-4" />
        </Link>
      )}
    </nav>
  )
}

/** 「评价」: their reviews of published apps, newest first, 20 a page (?before=). */
function ProfileReviews({ handle, reviews }: { handle: string; reviews: { reviews: ProfileReview[]; next: number | null } }) {
  const t = useTranslations('profiles')
  const reviewsT = useTranslations('reviews')
  if (reviews.reviews.length === 0) {
    return (
      <div className="pt-6">
        <StateShell icon="message" title={t('reviewsEmpty')} />
      </div>
    )
  }
  return (
    <>
      <ul className="flex flex-col">
        {reviews.reviews.map((review) => (
          <li key={review.id} className="flex flex-col gap-2.5 border-b border-hairline py-5">
            {review.hidden && <p className="rounded-thumb bg-warn px-3 py-2 text-meta text-warn-ink">{t('reviewHiddenNote')}</p>}
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <Link href={`/apps/${review.app.slug}`} className="flex min-w-0 items-center gap-2.5 hover:underline">
                <AppTile name={review.app.name} slug={review.app.slug} logo={review.app.logo} size="sm" />
                <span className="text-ui font-medium wrap-anywhere">{review.app.name}</span>
              </Link>
              <Stars rating={review.rating} size={13} />
              <span className="sr-only">{reviewsT('stars', { rating: review.rating })}</span>
              <span className="ml-auto text-meta text-ink-4">
                <LocalTime iso={review.createdAt} style="date" />
              </span>
            </div>
            <p lang={review.lang} className="text-body whitespace-pre-line text-ink-2 wrap-anywhere">
              {review.body}
            </p>
          </li>
        ))}
      </ul>
      {reviews.next && (
        <div className="flex justify-center pt-7">
          <Link
            href={{ pathname: profilePath(handle), query: { tab: 'reviews', before: String(reviews.next) } }}
            scroll={false}
            className={buttonClass('secondary')}
          >
            {t('earlierReviews')}
          </Link>
        </div>
      )}
    </>
  )
}

/** 「圈子」: the circles they posted in (rule 22), with the circles' numbers and how many posts are theirs. */
function ProfileCircles({ circles, own }: { circles: ProfileCircle[]; own: boolean }) {
  const t = useTranslations('profiles')
  const circlesT = useTranslations('circles')
  if (circles.length === 0) {
    return (
      <div className="pt-6">
        <StateShell icon="circles" title={t('circlesEmpty')} />
      </div>
    )
  }
  return (
    <ul className="grid grid-cols-1 gap-3 pt-6 sm:grid-cols-2">
      {circles.map(({ circle, posts, members, today }) => (
        <li key={circle.id} className="flex min-w-0 items-center gap-3 rounded-tile border border-line p-4">
          <span
            aria-hidden="true"
            className={`flex size-11 flex-none items-center justify-center rounded-tile text-title font-semibold ${tileTones[circle.tone % tileTones.length]}`}
          >
            #
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Link href={{ pathname: '/circles', query: { circle: circle.slug } }} className="self-start text-body font-medium wrap-anywhere hover:underline">
              {circle.name}
            </Link>
            <span className="text-small text-ink-4">
              {[circlesT('members', { count: members }), circlesT('today', { count: today }), t(own ? 'postedByYou' : 'postedByThem', { count: posts })].join(' · ')}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}
