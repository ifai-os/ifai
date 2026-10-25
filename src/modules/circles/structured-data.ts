import type { Locale } from '@/i18n/config'
import { absoluteUrl, breadcrumbs, pageUrl, type JsonLdObject } from '@/lib/structured-data'
import { profilePath } from '@/modules/profiles/rules'

import { postLocale, postPath, type AuthorView, type CircleView, type CommentsPage, type CommentView, type PostView } from './rules'

type Labels = { home: string; circles: string; title: string; anonymous: string }

/**
 * A post's page as a DiscussionForumPosting with its first page of comments, plus its trail
 * (首页 › 圈子 › # 圈子名 › 这条动态). Hidden comments, which only their authors see, are left
 * out. Everything here is on the page itself (src/lib/structured-data.tsx); authors link to their pages.
 */
export function postJsonLd(
  { post, circle, comments }: { post: PostView; circle: CircleView; comments: CommentsPage | null },
  locale: Locale,
  labels: Labels,
): JsonLdObject[] {
  const url = pageUrl(postLocale(post), postPath(post.id))
  const person = (author: AuthorView) => ({
    '@type': 'Person',
    name: author.name || labels.anonymous,
    url: author.handle ? pageUrl(postLocale(post), profilePath(author.handle)) : null,
  })
  const shown = <T extends CommentView>(list: T[]) => list.filter((comment) => !comment.hidden)
  const comment = (item: CommentView): JsonLdObject => ({
    '@type': 'Comment',
    text: item.body,
    inLanguage: item.lang === 'und' ? null : item.lang,
    datePublished: item.createdAt,
    author: person(item.author),
  })
  const count = comments?.count ?? post.comments
  const posting: JsonLdObject = {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    headline: labels.title,
    text: post.body,
    inLanguage: post.lang === 'und' ? null : post.lang,
    url,
    mainEntityOfPage: url,
    datePublished: post.createdAt,
    author: person(post.author),
    image: post.images.length > 0 ? post.images.map((image) => absoluteUrl(image.full)) : null,
    video: post.video?.title
      ? {
          '@type': 'VideoObject',
          name: post.video.title,
          url: post.video.url,
          embedUrl: post.video.embed,
          thumbnailUrl: post.video.cover && absoluteUrl(post.video.cover),
          duration: post.video.duration ? `PT${post.video.duration}S` : null,
        }
      : null,
    interactionStatistic: [
      {
        '@type': 'InteractionCounter',
        interactionType: 'https://schema.org/LikeAction',
        userInteractionCount: post.reactions.reduce((sum, item) => sum + item.count, 0),
      },
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: count },
    ],
    commentCount: count,
    comment: comments ? shown(comments.comments).map((thread) => ({ ...comment(thread), comment: shown(thread.replies).map(comment) })) : null,
  }
  return [
    posting,
    breadcrumbs(locale, [
      { name: labels.home, path: '/' },
      { name: labels.circles, path: '/circles' },
      { name: `# ${circle.name}`, path: `/circles?circle=${encodeURIComponent(circle.slug)}` },
      { name: labels.title, path: postPath(post.id) },
    ]),
  ]
}
