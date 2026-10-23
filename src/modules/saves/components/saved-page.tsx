import { useLocale, useTranslations } from 'next-intl'
import { Suspense } from 'react'

import { SignInForm } from '@/components/auth/sign-in-form'
import { ButtonLink } from '@/components/button'
import { LocalTime } from '@/components/local-time'
import { EmptyState } from '@/components/states/empty-state'
import { localizePath, type Locale } from '@/i18n/config'
import { Link } from '@/i18n/navigation'
import type { AuthProviders } from '@/lib/auth/providers'
import { AppTile } from '@/modules/apps/components/app-tile'
import type { HeatedApp } from '@/modules/apps/data'
import { storyHref } from '@/modules/daily/public/list-params'
import type { StoryItem } from '@/modules/daily/public/story-item'
import { SkillTile } from '@/modules/resources/public/components/skill-tile'
import type { SkillListItem } from '@/modules/resources/public/data'
import { skillHref } from '@/modules/resources/public/list-params'

import { RemoveSave } from './remove-save'

type SavedPageProps = {
  /** The member's saved stories, apps and Skills, newest first; null for a visitor, who gets the sign-in form. */
  saved: { stories: StoryItem[]; apps: HeatedApp[]; skills: SkillListItem[] } | null
  signIn: AuthProviders
}

/** 「我的收藏」(docs/specs/apps.md「页面与路由」): stories, then apps, then Skills. */
export function SavedPage({ saved, signIn }: SavedPageProps) {
  const t = useTranslations('saves')
  const categories = useTranslations('categories')
  const locale = useLocale() as Locale

  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-6 px-4 pt-6 pb-16 md:gap-8 md:pt-10 md:pb-24">
      <h1 className="text-h2 md:text-h1">{t('title')}</h1>

      {saved === null ? (
        <div className="flex w-full max-w-105 flex-col gap-5">
          <p className="text-body text-ink-3">{t('signInBody')}</p>
          <Suspense>
            <SignInForm providers={signIn} callbackURL={localizePath(locale, '/me/saves')} />
          </Suspense>
        </div>
      ) : saved.stories.length + saved.apps.length + saved.skills.length === 0 ? (
        <EmptyState icon="bookmark" title={t('emptyTitle')} body={t('emptyBody')}>
          <ButtonLink href="/apps">{t('browseApps')}</ButtonLink>
          <ButtonLink href="/resources" variant="secondary">
            {t('browseSkills')}
          </ButtonLink>
        </EmptyState>
      ) : (
        <div className="flex w-full max-w-190 flex-col gap-8">
          {saved.stories.length > 0 && (
            <section aria-labelledby="saved-stories" className="flex flex-col gap-3">
              <h2 id="saved-stories" className="text-title font-semibold">
                {t('stories')} <span className="font-normal text-ink-4">{saved.stories.length}</span>
              </h2>
              <ul className="flex flex-col border-t border-surface-2">
                {saved.stories.map((story) => (
                  <li key={story.id} className="flex items-center gap-3 border-b border-surface-2 py-3">
                    <Link href={storyHref(story.slug)} className="group flex min-w-0 flex-1 flex-col gap-0.5">
                      <span lang={story.title.lang} className="line-clamp-2 text-body font-medium group-hover:text-accent">
                        {story.title.value}
                      </span>
                      <span className="text-small text-ink-4">
                        {categories(story.category)} · <LocalTime iso={story.publishedAt} style="date" />
                      </span>
                    </Link>
                    <RemoveSave target={{ type: 'story', id: story.id }} name={story.title.value} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {saved.apps.length > 0 && (
            <section aria-labelledby="saved-apps" className="flex flex-col gap-3">
              <h2 id="saved-apps" className="text-title font-semibold">
                {t('apps')} <span className="font-normal text-ink-4">{saved.apps.length}</span>
              </h2>
              <ul className="flex flex-col border-t border-surface-2">
                {saved.apps.map((app) => (
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

          {saved.skills.length > 0 && (
            <section aria-labelledby="saved-skills" className="flex flex-col gap-3">
              <h2 id="saved-skills" className="text-title font-semibold">
                {t('skills')} <span className="font-normal text-ink-4">{saved.skills.length}</span>
              </h2>
              <ul className="flex flex-col border-t border-surface-2">
                {saved.skills.map((skill) => (
                  <li key={skill.id} className="flex items-center gap-3 border-b border-surface-2 py-3">
                    <Link href={skillHref(skill.slug)} className="group flex min-w-0 flex-1 items-center gap-3">
                      <SkillTile name={skill.name.value} slug={skill.slug} size="md" />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span lang={skill.name.lang} className="truncate text-body font-medium group-hover:text-accent">
                          {skill.name.value}
                        </span>
                        {skill.tagline && (
                          <span lang={skill.tagline.lang} className="truncate text-small text-ink-4">
                            {skill.tagline.value}
                          </span>
                        )}
                      </span>
                    </Link>
                    <RemoveSave target={{ type: 'skill', id: skill.id }} name={skill.name.value} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </main>
  )
}
