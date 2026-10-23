import { useLocale, useTranslations } from 'next-intl'
import { Suspense } from 'react'

import { SignInForm } from '@/components/auth/sign-in-form'
import { ButtonLink } from '@/components/button'
import { EmptyState } from '@/components/states/empty-state'
import { localizePath, type Locale } from '@/i18n/config'
import { Link } from '@/i18n/navigation'
import type { AuthProviders } from '@/lib/auth/providers'
import { AppTile } from '@/modules/apps/components/app-tile'
import type { HeatedApp } from '@/modules/apps/data'

import { RemoveSave } from './remove-save'

type SavedPageProps = {
  /** The member's saved apps, newest first; null for a visitor, who gets the sign-in form. */
  apps: HeatedApp[] | null
  signIn: AuthProviders
}

/** 「我的收藏」(docs/specs/apps.md「页面与路由」): apps for now, Skills once resources launch. */
export function SavedPage({ apps, signIn }: SavedPageProps) {
  const t = useTranslations('saves')
  const locale = useLocale() as Locale

  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-6 px-4 pt-6 pb-16 md:gap-8 md:pt-10 md:pb-24">
      <h1 className="text-h2 md:text-h1">{t('title')}</h1>

      {apps === null ? (
        <div className="flex w-full max-w-105 flex-col gap-5">
          <p className="text-body text-ink-3">{t('signInBody')}</p>
          <Suspense>
            <SignInForm providers={signIn} callbackURL={localizePath(locale, '/me/saves')} />
          </Suspense>
        </div>
      ) : apps.length === 0 ? (
        <EmptyState icon="bookmark" title={t('emptyTitle')} body={t('emptyBody')}>
          <ButtonLink href="/apps">{t('browseApps')}</ButtonLink>
        </EmptyState>
      ) : (
        <section aria-labelledby="saved-apps" className="flex w-full max-w-190 flex-col gap-3">
          <h2 id="saved-apps" className="text-title font-semibold">
            {t('apps')} <span className="font-normal text-ink-4">{apps.length}</span>
          </h2>
          <ul className="flex flex-col border-t border-surface-2">
            {apps.map((app) => (
              <li key={app.id} className="flex items-center gap-3 border-b border-surface-2 py-3">
                <Link href={`/apps/${app.slug}`} className="group flex min-w-0 flex-1 items-center gap-3">
                  <AppTile name={app.name} slug={app.slug} logo={app.logo} size="md" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-body font-medium group-hover:text-accent">{app.name}</span>
                    {app.tagline && (
                      <span lang={app.tagline.lang} className="truncate text-small text-ink-4">
                        {app.tagline.value}
                      </span>
                    )}
                  </span>
                </Link>
                <RemoveSave target={{ type: 'app', id: app.id }} name={app.name} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
