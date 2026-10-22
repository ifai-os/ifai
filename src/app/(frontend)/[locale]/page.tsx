import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { AppCard } from '@/components/cards/app-card'
import { ComingSoonCard } from '@/components/cards/coming-soon-card'
import { DailyItemCard } from '@/components/cards/daily-item-card'
import { DateBadge } from '@/components/cards/date-badge'
import { InitialTile } from '@/components/cards/initial-tile'
import { SkillCard } from '@/components/cards/skill-card'
import { upcomingNavItems } from '@/config/site'
import { isLocale } from '@/i18n/config'
import { Link } from '@/i18n/navigation'
import { alternatesFor } from '@/lib/seo'
import {
  demoApps,
  demoFeaturedSkill,
  demoHeadlines,
  demoIssue,
  demoPickApp,
  demoSkills,
} from '@/modules/home/demo-data'

type Props = { params: Promise<{ locale: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  return { alternates: alternatesFor('/', locale) }
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)
  const t = await getTranslations()
  const upcoming = upcomingNavItems()

  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-10 px-4 pt-6 pb-16">
      <p role="note" className="rounded-thumb bg-warn px-4 py-1.5 text-center text-small text-warn-ink">
        {t('home.demoBanner')}
      </p>

      <section className="flex flex-wrap gap-4">
        <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-5 rounded-hero border border-surface-2 bg-surface px-6 py-7 sm:px-8">
          <div className="flex items-center gap-5">
            <DateBadge date={demoIssue.date} />
            <div className="flex min-w-0 flex-col gap-1.5">
              <h1 className="text-display">{t('home.todayAI')}</h1>
              <span className="text-meta text-ink-4">
                {t('home.dailyMeta', { time: demoIssue.publishedAt, count: demoIssue.count })}
              </span>
            </div>
          </div>
          <ol className="flex flex-col">
            {demoHeadlines.map((headline, index) => (
              <DailyItemCard
                key={headline.title.en}
                href="/daily"
                no={index + 1}
                category={t(`categories.${headline.category}`)}
                title={headline.title[locale]}
              />
            ))}
          </ol>
          <Link href="/daily" className="flex min-h-8 items-center self-start text-ui font-medium text-link">
            {t('home.readDaily')} ›
          </Link>
        </div>

        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <Link
            href="/apps"
            className="group flex flex-col gap-3.5 rounded-hero border border-surface-2 bg-surface px-6 py-5.5"
          >
            <span className="text-small text-ink-4">{t('home.pickApp')}</span>
            <span className="flex items-center gap-3.5">
              <InitialTile label={demoPickApp.initials} tone={demoPickApp.tone} size="xl" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-h3 font-semibold group-hover:text-accent">{demoPickApp.name}</span>
                <span className="text-meta text-ink-2">{demoPickApp.description[locale]}</span>
              </span>
            </span>
            <span className="text-small text-ink-4">
              {t('card.heat', { value: demoPickApp.heat })} · {t(`categories.${demoPickApp.category}`)}
            </span>
          </Link>
          <Link
            href="/resources"
            className="group flex flex-col gap-1.5 rounded-hero border border-surface-2 bg-surface px-6 py-5"
          >
            <span className="text-small text-ink-4">{t('home.newSkill')}</span>
            <span className="text-title font-semibold group-hover:text-accent">
              {demoFeaturedSkill.name[locale]}
            </span>
            <span className="text-meta text-ink-2">{demoFeaturedSkill.description[locale]}</span>
          </Link>
        </div>
      </section>

      <section aria-labelledby="trending-apps" className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="trending-apps" className="text-h2">
            {t('home.trendingApps')}
          </h2>
          <Link href="/apps" className="text-ui text-ink-4 hover:text-accent">
            {t('home.viewAll')} ›
          </Link>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-4">
          {demoApps.map((app, index) => (
            <AppCard
              key={app.slug}
              href="/apps"
              name={app.name}
              initials={app.initials}
              tone={app.tone}
              category={t(`categories.${app.category}`)}
              description={app.description[locale]}
              heat={app.heat}
              rank={index + 1}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="new-skills" className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="new-skills" className="text-h2">
            {t('home.newSkills')}
          </h2>
          <Link href="/resources" className="text-ui text-ink-4 hover:text-accent">
            {t('home.viewAll')} ›
          </Link>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(250px,100%),1fr))] gap-4">
          {demoSkills.map((skill) => (
            <SkillCard
              key={skill.slug}
              href="/resources"
              name={skill.name[locale]}
              author={skill.author}
              description={skill.description[locale]}
              initials={skill.initials}
              tone={skill.tone}
              rating={skill.rating}
              installs={skill.installs}
            />
          ))}
        </div>
      </section>

      {upcoming.length > 0 && (
        <section aria-labelledby="coming-soon" className="flex flex-col gap-4">
          <h2 id="coming-soon" className="text-h2">
            {t('home.comingSoon')}
          </h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(250px,100%),1fr))] gap-4">
            {upcoming.map((item) => (
              <ComingSoonCard
                key={item.key}
                icon={item.icon}
                title={t(`nav.${item.key}`)}
                description={t(`modules.${item.key}`)}
              />
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
