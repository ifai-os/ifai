import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { AppCard } from '@/components/cards/app-card'
import { ComingSoonCard } from '@/components/cards/coming-soon-card'
import { SkillCard } from '@/components/cards/skill-card'
import { upcomingNavItems } from '@/config/site'
import { isLocale } from '@/i18n/config'
import { Link } from '@/i18n/navigation'
import { dayKey, serverTimeZone } from '@/lib/local-time'
import { alternatesFor } from '@/lib/seo'
import { JsonLd, siteJsonLd } from '@/lib/structured-data'
import { AppTile } from '@/modules/apps/components/app-tile'
import { getHomeApps } from '@/modules/apps/data'
import { SubscribeBox } from '@/modules/daily/email/components/subscribe-box'
import { subscribingOpen } from '@/modules/daily/email/delivery'
import { TodayHeadlines } from '@/modules/daily/public/components/today-headlines'
import { latestStories } from '@/modules/daily/public/data'
import { ScanBadgeView } from '@/modules/resources/public/components/badges'
import { SkillTile } from '@/modules/resources/public/components/skill-tile'
import { getHomeSkills } from '@/modules/resources/public/data'
import { skillHref } from '@/modules/resources/public/list-params'

/** Newest stories read for「今天的 AI」; the reader's own today is picked out of them in the browser. */
const storiesRead = 20
/** Cards in「热门应用」. */
const trendingShown = 6

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
  const [stories, apps, skills] = await Promise.all([
    latestStories(locale, storiesRead),
    getHomeApps(locale, trendingShown),
    getHomeSkills(locale),
  ])
  const { pick } = apps
  const pickSkill = skills.featured

  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-10 px-4 pt-6 pb-16">
      <JsonLd data={siteJsonLd(locale, t('metadata.description'))} />
      <section className="flex flex-wrap gap-4">
        <div className="flex min-w-0 flex-[2_1_560px] flex-col gap-5 rounded-hero border border-surface-2 bg-surface px-6 py-7 sm:px-8">
          <TodayHeadlines stories={stories} serverToday={dayKey(new Date(), serverTimeZone)} />
        </div>

        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          {pick && (
            <Link
              href={`/apps/${pick.slug}`}
              className="group flex flex-col gap-3.5 rounded-hero border border-surface-2 bg-surface px-6 py-5.5"
            >
              <span className="text-small text-ink-4">{t('home.pickApp')}</span>
              <span className="flex items-center gap-3.5">
                <AppTile name={pick.name} slug={pick.slug} logo={pick.logo} size="xl" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-h3 font-semibold group-hover:text-accent-ink">{pick.name}</span>
                  {pick.tagline && (
                    <span lang={pick.tagline.lang} className="text-meta text-ink-2">
                      {pick.tagline.value}
                    </span>
                  )}
                </span>
              </span>
              <span className="text-small text-ink-4">
                {[pick.heat && t('card.heat', { value: pick.heat.heat }), pick.category?.name].filter(Boolean).join(' · ')}
              </span>
            </Link>
          )}
          {pickSkill && (
            <Link
              href={skillHref(pickSkill.slug)}
              className="group flex flex-col gap-1.5 rounded-hero border border-surface-2 bg-surface px-6 py-5"
            >
              <span className="text-small text-ink-4">{t('home.newSkill')}</span>
              <span lang={pickSkill.name.lang} className="text-title font-semibold group-hover:text-accent-ink">
                {pickSkill.name.value}
              </span>
              {pickSkill.tagline && (
                <span lang={pickSkill.tagline.lang} className="text-meta text-ink-2">
                  {pickSkill.tagline.value}
                </span>
              )}
            </Link>
          )}
        </div>
      </section>

      {subscribingOpen() && <SubscribeBox variant="band" />}

      {apps.trending.length > 0 && (
        <section aria-labelledby="trending-apps" className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="trending-apps" className="text-h2">
              {t('home.trendingApps')}
            </h2>
            <Link href="/apps" className="text-ui text-ink-4 hover:text-accent-ink">
              {t('home.viewAll')} ›
            </Link>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-4">
            {apps.trending.map((app) => (
              <AppCard
                key={app.id}
                href={`/apps/${app.slug}`}
                name={app.name}
                icon={<AppTile name={app.name} slug={app.slug} logo={app.logo} size="lg" />}
                category={app.category?.name ?? null}
                description={app.tagline?.value ?? null}
                descriptionLang={app.tagline?.lang}
                heat={app.heat?.heat ?? null}
                rank={app.heat?.rankOverall ?? null}
              />
            ))}
          </div>
        </section>
      )}

      {skills.newest.length > 0 && (
        <section aria-labelledby="new-skills" className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="new-skills" className="text-h2">
              {t('home.newSkills')}
            </h2>
            <Link href="/resources" className="text-ui text-ink-4 hover:text-accent-ink">
              {t('home.viewAll')} ›
            </Link>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(250px,100%),1fr))] gap-4">
            {skills.newest.map((skill) => (
              <SkillCard
                key={skill.id}
                href={skillHref(skill.slug)}
                name={skill.name.value}
                nameLang={skill.name.lang}
                author={skill.author.name}
                description={skill.tagline?.value ?? null}
                descriptionLang={skill.tagline?.lang}
                icon={<SkillTile name={skill.name.value} slug={skill.slug} size="md" />}
                installs={skill.installs}
                updatedAt={skill.updatedAt}
                badge={skill.scan && <ScanBadgeView scan={skill.scan} />}
              />
            ))}
          </div>
        </section>
      )}

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
