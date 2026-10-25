import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { JsonLd } from '@/lib/structured-data'
import { ArticleDetailView } from '@/modules/recommend/components/article-detail'
import { getArticle, publishedArticles } from '@/modules/recommend/data'
import { articleMetadata } from '@/modules/recommend/metadata'
import { readArticleId, recommendLaunched } from '@/modules/recommend/rules'
import { articleJsonLd } from '@/modules/recommend/structured-data'

type Props = { params: Promise<{ locale: string; id: string }> }

// The newest article is rendered at build time, every other one on its first visit, then kept until
// the back office saves a change (./cache.ts). Next.js only prefetches a route it rendered at build,
// so with none the list's links would wait on the server when clicked (as the daily's stories).
export async function generateStaticParams({ params }: { params: { locale: string } }) {
  if (!isLocale(params.locale) || !recommendLaunched()) return []
  return (await publishedArticles()).slice(0, 1).map((article) => ({ id: String(article.id) }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, id } = await params
  const articleId = readArticleId(id)
  if (!isLocale(locale) || !articleId || !recommendLaunched()) return {}
  return articleMetadata(articleId)
}

export default async function ArticlePage({ params }: Props) {
  const { locale, id } = await params
  const articleId = readArticleId(id)
  if (!isLocale(locale) || !articleId || !recommendLaunched()) notFound()
  setRequestLocale(locale)
  const article = await getArticle(articleId)
  if (!article) notFound()
  const t = await getTranslations()

  return (
    <>
      <JsonLd
        data={articleJsonLd(article, locale, {
          home: t('metadata.title'),
          recommend: t('recommend.title'),
          channel: t(`recommend.channels.${article.channel}`),
          editorial: t('recommend.editorial'),
          anonymous: t('recommend.anonymous'),
        })}
      />
      <ArticleDetailView article={article} />
    </>
  )
}
