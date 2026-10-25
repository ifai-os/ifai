import { useLocale, useTranslations } from 'next-intl'
import { Suspense } from 'react'

import { SignInForm } from '@/components/auth/sign-in-form'
import { ButtonLink } from '@/components/button'
import { LocalTime } from '@/components/local-time'
import { EmptyState } from '@/components/states/empty-state'
import { localizePath, type Locale } from '@/i18n/config'
import { Link } from '@/i18n/navigation'
import type { AuthProviders } from '@/lib/auth/providers'

import { articleHref } from '../rules'
import type { MyArticle } from '../write'
import { DeleteArticle } from './delete-article'

const statusTone = {
  draft: 'bg-surface text-ink-3',
  published: 'bg-success-soft text-success-ink',
  hidden: 'bg-accent-soft text-accent-ink',
} as const

/** 「我的文章」(docs/specs/recommend.md「页面与路由」): drafts, published and hidden, to edit or delete. */
export function MyArticles({ articles, signIn }: { articles: MyArticle[] | null; signIn: AuthProviders }) {
  const t = useTranslations('recommend.mine')
  const channels = useTranslations('recommend.channels')
  const locale = useLocale() as Locale

  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-6 px-4 pt-6 pb-16 md:gap-8 md:pt-10 md:pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-h2 md:text-h1">{t('title')}</h1>
        {articles && articles.length > 0 && <ButtonLink href="/recommend/write">{t('write')}</ButtonLink>}
      </div>

      {articles === null ? (
        <div className="flex w-full max-w-105 flex-col gap-5">
          <p className="text-body text-ink-3">{t('signInBody')}</p>
          <Suspense>
            <SignInForm providers={signIn} callbackURL={localizePath(locale, '/me/articles')} />
          </Suspense>
        </div>
      ) : articles.length === 0 ? (
        <EmptyState icon="file" title={t('emptyTitle')} body={t('emptyBody')}>
          <ButtonLink href="/recommend/write">{t('write')}</ButtonLink>
        </EmptyState>
      ) : (
        <ul className="flex w-full max-w-190 flex-col border-t border-surface-2">
          {articles.map((article) => (
            <li key={article.id} className="flex flex-col gap-2 border-b border-surface-2 py-4 sm:flex-row sm:items-center sm:gap-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                {article.status === 'published' ? (
                  <Link href={articleHref(article.id)} lang={article.lang} className="text-title wrap-anywhere hover:text-accent-ink">
                    {article.title}
                  </Link>
                ) : (
                  <span lang={article.lang} className="text-title wrap-anywhere">
                    {article.title}
                  </span>
                )}
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-4">
                  <span className={`rounded-pill px-2 py-0.5 ${statusTone[article.status]}`}>{t(`status.${article.status}`)}</span>
                  <span>{channels(article.channel)}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {t('updated')} <LocalTime iso={article.updatedAt} style="date" />
                  </span>
                </span>
                {article.status === 'hidden' && <span className="text-small text-ink-3">{t('hiddenNote')}</span>}
              </div>
              <div className="flex flex-none items-center gap-4">
                {article.status !== 'hidden' && (
                  <Link href={`/recommend/write/${article.id}`} className="text-meta text-ink-2 hover:text-ink">
                    {t('edit')}
                  </Link>
                )}
                <DeleteArticle articleId={article.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
