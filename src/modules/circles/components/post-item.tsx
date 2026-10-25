'use client'

import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'

import { Icon } from '@/components/icon'
import { LocalTime } from '@/components/local-time'
import { ShareButton } from '@/components/share-button'
import { localizePath, type Locale } from '@/i18n/config'
import { Link } from '@/i18n/navigation'
import { AppTile } from '@/modules/apps/components/app-tile'
import { FollowButton } from '@/modules/profiles/components/follows'
import { ProfileLink } from '@/modules/profiles/components/profile-link'
import { SkillTile } from '@/modules/resources/public/components/skill-tile'

import { linkify, postTitleValues, reactionEmoji, reactions, type LinkCard, type PostView, type Reaction, type ReactionView } from '../rules'
import { useCirclesSession } from './circles-session'
import { MoreMenu } from './more-menu'
import { PersonAvatar } from './person-avatar'
import { usePostActions } from './post-actions'
import { PostImages, PostVideo } from './post-media'

const dayMs = 24 * 60 * 60 * 1000

type PostItemProps = {
  post: PostView
  reported: boolean
  onReport: () => void
  /** On the post's own page: an article whose time is not a link to itself. */
  page?: boolean
  /** 「关注」on the others' posts; not on a member's own page, which has it at the top. */
  follow?: boolean
}

/**
 * One post: who (to their page) and when, in which circle,「关注」, the text, its pictures or video,
 * cards for the apps and Skills it links to, the reactions, comments and sharing, and「更多」
 * (delete one's own, report the others).
 */
export function PostItem({ post, reported, onReport, page = false, follow = true }: PostItemProps) {
  const t = useTranslations('circles')
  const { byId } = useCirclesSession()
  const { remove } = usePostActions()
  const circle = byId.get(post.circle)
  const locale = useLocale() as Locale
  const name = post.author.name || t('anonymous')
  const Wrapper = page ? 'article' : 'li'

  return (
    <Wrapper className={`flex flex-col gap-3 ${page ? '' : 'border-b border-hairline py-5'}`}>
      <div className="flex items-center gap-2.5">
        <ProfileLink handle={post.author.handle} twin className="flex-none rounded-pill">
          <PersonAvatar name={name} tone={post.author.tone} />
        </ProfileLink>
        <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          <ProfileLink handle={post.author.handle} className="max-w-full text-ui font-medium wrap-anywhere hover:underline">
            {post.mine ? t('youNamed', { name }) : name}
          </ProfileLink>
          <span className="text-small text-ink-4">
            {page ? (
              <PostTime iso={post.createdAt} />
            ) : (
              <Link href={`/circles/p/${post.id}`} className="hover:text-ink hover:underline">
                <PostTime iso={post.createdAt} />
              </Link>
            )}
            {circle && (
              <>
                <span aria-hidden="true"> · </span>
                {t.rich('postedIn', {
                  name: circle.name,
                  circle: (chunks) => (
                    <Link href={{ pathname: '/circles', query: { circle: circle.slug } }} scroll={false} className="text-ink-2 hover:text-ink hover:underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </>
            )}
          </span>
        </div>
        {follow && !post.mine && post.author.handle && (
          <FollowButton handle={post.author.handle} name={name} initial={post.following} look="outline" />
        )}
        <MoreMenu
          label={t('moreName', { name })}
          mine={post.mine}
          reported={reported}
          onReport={onReport}
          onDelete={() => remove(post.id)}
          confirm={t('deleteConfirm')}
        />
      </div>
      {post.hidden && <p className="rounded-thumb bg-warn px-3 py-2 text-meta text-warn-ink">{t('hiddenNote')}</p>}
      {post.body && (
        <p lang={post.lang} className="text-body whitespace-pre-line wrap-anywhere">
          <LinkedText text={post.body} />
        </p>
      )}
      {post.images.length > 0 && <PostImages images={post.images} />}
      {post.video && <PostVideo video={post.video} />}
      {post.links.length > 0 && (
        <ul className="flex flex-col gap-2">
          {post.links.map((card) => (
            <li key={`${card.kind}-${card.slug}`}>
              <LinkCardItem card={card} />
            </li>
          ))}
        </ul>
      )}
      {!post.hidden && (
        <div className="flex flex-wrap items-center gap-2">
          <ReactionBar post={post} />
          <div className="ml-auto flex items-center">
            <CommentsLink post={post} page={page} />
            <ShareButton
              title={t('postTitle', postTitleValues(post, name, circle?.name ?? ''))}
              url={localizePath(locale, `/circles/p/${post.id}`)}
              labels={{ share: t('share'), copied: t('linkCopied') }}
              iconOnly
              iconSize={17}
              className="flex size-9 items-center justify-center rounded-thumb text-ink-4 hover:bg-surface hover:text-ink"
            />
          </div>
        </div>
      )}
    </Wrapper>
  )
}

/** A post's or a comment's text with its addresses as links. Readers wrote them: nofollow, ugc. */
export function LinkedText({ text }: { text: string }) {
  return linkify(text).map((part, index) =>
    'href' in part ? (
      <a key={index} href={part.href} target="_blank" rel="nofollow ugc noopener noreferrer" className="text-link hover:underline">
        {part.text}
      </a>
    ) : (
      <span key={index}>{part.text}</span>
    ),
  )
}

/** The comment icon and how many there are, to the comments on the post's page (on that page, down to them). */
function CommentsLink({ post, page }: { post: PostView; page: boolean }) {
  const t = useTranslations('circles')
  const format = useFormatter()
  const label = t('commentsLabel', { count: post.comments })
  const className = 'flex h-9 items-center gap-1.5 rounded-thumb px-2 text-meta text-ink-4 hover:bg-surface hover:text-ink'
  const content = (
    <>
      <Icon name="message" size={17} />
      {post.comments > 0 && <span aria-hidden="true">{format.number(post.comments)}</span>}
    </>
  )
  return page ? (
    <a href="#comments" aria-label={label} title={label} className={className}>
      {content}
    </a>
  ) : (
    <Link href={`/circles/p/${post.id}#comments`} aria-label={label} title={label} className={className}>
      {content}
    </Link>
  )
}

/** An app or a Skill on IFAI the post links to (rule 17):「应用 · 名称」and its tagline, or「Skill · 名称」and「N 次安装 · 作者」. */
function LinkCardItem({ card }: { card: LinkCard }) {
  const t = useTranslations('circles')
  const cards = useTranslations('card')
  const format = useFormatter()
  const name = card.kind === 'app' ? { value: card.name, lang: undefined } : card.name
  return (
    <Link
      href={card.kind === 'app' ? `/apps/${card.slug}` : `/resources/skills/${card.slug}`}
      className="flex max-w-120 items-center gap-3 rounded-tile border border-surface-2 bg-surface p-3 hover:border-line"
    >
      {card.kind === 'app' ? <AppTile name={card.name} slug={card.slug} logo={card.logo} size="md" /> : <SkillTile name={card.name.value} slug={card.slug} />}
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-ui font-medium wrap-anywhere">
          {t.rich(card.kind === 'app' ? 'linkApp' : 'linkSkill', {
            name: name.value,
            n: (chunks) => <span lang={name.lang}>{chunks}</span>,
          })}
        </span>
        {card.kind === 'app' ? (
          card.tagline && (
            <span lang={card.tagline.lang} className="line-clamp-1 text-small text-ink-4">
              {card.tagline.value}
            </span>
          )
        ) : (
          <span className="text-small text-ink-4 wrap-anywhere">
            {cards('installs', { count: format.number(card.installs, { notation: 'compact', maximumFractionDigits: 1 }) })}
            {card.author && ` · ${card.author}`}
          </span>
        )}
      </span>
    </Link>
  )
}

/** 3 小时前 within a day of loading, the date after that; the exact time on hover. Comments use it too. */
export function PostTime({ iso }: { iso: string }) {
  const format = useFormatter()
  const { loadedAt } = usePostActions()
  const date = new Date(iso)
  const now = Math.max(loadedAt, date.getTime())
  if (now - date.getTime() >= dayMs) return <LocalTime iso={iso} style="date" />
  return <time dateTime={iso}>{format.relativeTime(date, now)}</time>
}

/** The reactions, most people first, and the picker with all six. */
function ReactionBar({ post }: { post: PostView }) {
  const t = useTranslations('circles')
  const { react } = usePostActions()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const pickerId = useId()

  // Closes on a press outside or Escape, like a menu.
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  const mine = new Set(post.reactions.filter((item) => item.mine).map((item) => item.reaction))
  const pick = (reaction: Reaction) => {
    react(post, reaction, !mine.has(reaction))
    setOpen(false)
  }

  return (
    <>
      {post.reactions.map((item) => (
        <ReactionChip key={item.reaction} item={item} onToggle={() => react(post, item.reaction, !item.mine)} />
      ))}
      <div
        ref={box}
        className="relative flex"
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
          aria-controls={pickerId}
          aria-label={t('addReaction')}
          title={t('addReaction')}
          className="flex size-8 items-center justify-center rounded-pill bg-surface-2 text-ink-2 hover:text-ink"
        >
          <Icon name="reaction" size={18} />
        </button>
        {open && (
          <div
            id={pickerId}
            role="group"
            aria-label={t('reactionsGroup')}
            className="absolute bottom-10 left-0 z-10 flex items-center gap-0.5 rounded-card border border-hairline bg-overlay px-2 py-1.5 whitespace-nowrap shadow-float"
          >
            {reactions.map((reaction) => (
              <button
                key={reaction}
                type="button"
                onClick={() => pick(reaction)}
                aria-pressed={mine.has(reaction)}
                aria-label={t(`reactionNames.${reaction}`)}
                title={t(`reactionNames.${reaction}`)}
                className={`flex size-10 items-center justify-center rounded-tile text-[22px] leading-none hover:bg-surface ${mine.has(reaction) ? 'bg-accent-soft' : ''}`}
              >
                <span aria-hidden="true">{reactionEmoji[reaction]}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

/** 👍 48: theirs is outlined in red. Hovering names who reacted:「你、林栖等 12 人：赞」. */
function ReactionChip({ item, onToggle }: { item: ReactionView; onToggle: () => void }) {
  const t = useTranslations('circles')
  const format = useFormatter()
  const label = t(`reactionNames.${item.reaction}`)
  const names = [...(item.mine ? [t('you')] : []), ...item.names.map((name) => name || t('anonymous'))]
  const named = Math.min(names.length, item.count)
  const who = t('reactedBy', { names: names.slice(0, named).join(t('listSeparator')), others: item.count - named, label })
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={item.mine}
      aria-label={t('reactionLabel', { label, count: item.count, mine: item.mine ? 'yes' : 'no' })}
      title={who}
      className={`flex h-8 items-center gap-1.5 rounded-pill border px-2.5 text-meta font-medium ${
        item.mine ? 'border-accent bg-accent-soft text-tile-7-ink' : 'border-transparent bg-surface-2 text-ink-2 hover:border-line'
      }`}
    >
      <span aria-hidden="true" className="text-[16px] leading-none">
        {reactionEmoji[item.reaction]}
      </span>
      {format.number(item.count)}
    </button>
  )
}
