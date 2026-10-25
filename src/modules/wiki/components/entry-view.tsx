import { getFormatter, getTranslations } from 'next-intl/server'

import { LocalTime } from '@/components/local-time'
import { Link } from '@/i18n/navigation'
import { AppTile } from '@/modules/apps/components/app-tile'
import { storyHref } from '@/modules/daily/public/list-params'
import { legalContactEmail } from '@/modules/legal/documents'
import { skillHref } from '@/modules/resources/public/list-params'
import { SkillTile } from '@/modules/resources/public/components/skill-tile'

import type { EntryDetail } from '../data'
import { entryHref, topicHref, wikiHref } from '../links'
import { EntryLinks, EntryTypeTag } from './entry-list'
import { EntrySection, Paragraphs } from './text-blocks'

type SectionKey = 'explanation' | 'examples' | 'steps' | 'uses' | 'limitations' | 'contexts' | 'comparisons' | 'relations' | 'further' | 'sources'

const furtherRow = 'group flex items-center gap-3 rounded-tile px-2 py-2.5 hover:bg-surface'

/**
 * An entry's page (docs/specs/wiki.md「页面与路由」): the name, its other names and the
 * one-sentence definition, then plain words, examples, steps, uses, limitations, contexts and
 * the easily confused words, then where to read on, what to try and the sources, and when the
 * facts were last checked. One reading column; the table of contents sits beside it on wide screens.
 */
export async function EntryView({ entry }: { entry: EntryDetail }) {
  const t = await getTranslations('wiki')
  const format = await getFormatter()
  // The review date is a calendar day the editor picked (stored at noon UTC), so it is the same day for every reader.
  const reviewed = entry.reviewedAt ? format.dateTime(new Date(entry.reviewedAt), { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : null
  const topic = entry.topics[0]
  const hasRelations = entry.prerequisites.length > 0 || entry.next.length > 0 || entry.related.length > 0
  const hasFurther = entry.apps.length > 0 || entry.skills.length > 0 || entry.stories.length > 0

  const shown: Record<SectionKey, boolean> = {
    explanation: Boolean(entry.explanation),
    examples: Boolean(entry.examples?.value.length),
    steps: Boolean(entry.steps?.value.length),
    uses: Boolean(entry.uses),
    limitations: Boolean(entry.limitations),
    contexts: Boolean(entry.contexts?.value.length),
    comparisons: entry.comparisons.length > 0,
    relations: hasRelations,
    further: hasFurther,
    sources: entry.sources.length > 0,
  }
  const contents = (Object.keys(shown) as SectionKey[]).filter((key) => shown[key])
  const mail = `mailto:${legalContactEmail}?subject=${encodeURIComponent(t('reportSubject', { title: entry.title.value }))}`

  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-6 px-4 pt-5 pb-16 md:pt-7 md:pb-24">
      <nav aria-label={t('breadcrumb')} className="text-meta text-ink-4">
        <ol className="flex flex-wrap items-center gap-2">
          <li className="flex items-center gap-2">
            <Link href={wikiHref} className="hover:text-ink">
              {t('title')}
            </Link>
            <span aria-hidden="true">/</span>
          </li>
          {topic && (
            <li className="flex items-center gap-2">
              <Link href={topicHref(topic.slug)} lang={topic.name.lang} className="hover:text-ink">
                {topic.name.value}
              </Link>
              <span aria-hidden="true">/</span>
            </li>
          )}
          <li aria-current="page" lang={entry.title.lang} className="min-w-0 truncate text-ink">
            {entry.title.value}
          </li>
        </ol>
      </nav>

      <div className="grid gap-x-12 gap-y-6 md:grid-cols-[minmax(0,1fr)_240px]">
        <article className="flex max-w-read min-w-0 flex-col gap-8">
          <header className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <EntryTypeTag type={entry.type} />
              {entry.topics.map((item) => (
                <Link key={item.id} href={topicHref(item.slug)} lang={item.name.lang} className="text-meta text-ink-4 hover:text-ink">
                  {item.name.value}
                </Link>
              ))}
            </div>
            <h1 lang={entry.title.lang} className="text-h2 wrap-anywhere md:text-h1">
              {entry.title.value}
            </h1>
            {entry.otherNames.length > 0 && (
              <p className="text-ui text-ink-3">
                {t.rich('alsoCalled', {
                  names: () =>
                    entry.otherNames.map((name, index) => (
                      <span key={`${name.lang}-${name.value}`}>
                        {index > 0 && t('separator')}
                        <span lang={name.lang}>{name.value}</span>
                      </span>
                    )),
                })}
              </p>
            )}
            {reviewed && <p className="text-meta text-ink-4">{t('reviewedOn', { date: reviewed })}</p>}
          </header>

          {entry.definition && (
            <section aria-label={t('definition')} className="flex flex-col gap-1.5 rounded-card bg-surface px-5 py-4">
              <span className="text-small font-medium text-ink-4">{t('definition')}</span>
              <p lang={entry.definition.lang} className="text-title font-medium">
                {entry.definition.value}
              </p>
            </section>
          )}

          {entry.explanation && (
            <EntrySection id="explanation" title={t('sections.explanation')}>
              <Paragraphs text={entry.explanation} className="text-body-article text-ink" />
            </EntrySection>
          )}

          {entry.examples && entry.examples.value.length > 0 && (
            <EntrySection id="examples" title={t('sections.examples')}>
              <ul lang={entry.examples.lang} className="flex flex-col gap-3">
                {entry.examples.value.map((example, index) => (
                  <li key={index} className="flex flex-col gap-1 rounded-card border border-surface-2 px-5 py-4">
                    {example.title && <span className="text-title font-medium">{example.title}</span>}
                    <span className="text-body whitespace-pre-line text-ink-2">{example.text}</span>
                  </li>
                ))}
              </ul>
            </EntrySection>
          )}

          {entry.steps && entry.steps.value.length > 0 && (
            <EntrySection id="steps" title={t('sections.steps')}>
              <ol lang={entry.steps.lang} className="flex flex-col gap-4">
                {entry.steps.value.map((step, index) => (
                  <li key={index} className="flex gap-3">
                    <span aria-hidden="true" className="flex size-7 flex-none items-center justify-center rounded-pill bg-ink text-meta font-semibold text-bg tabular-nums">
                      {index + 1}
                    </span>
                    <span className="flex min-w-0 flex-col gap-1 pt-0.5">
                      <span className="text-body font-medium">{step.title}</span>
                      {step.detail && <span className="text-body whitespace-pre-line text-ink-2">{step.detail}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </EntrySection>
          )}

          {entry.uses && (
            <EntrySection id="uses" title={t('sections.uses')}>
              <Paragraphs text={entry.uses} className="text-body-article text-ink" />
            </EntrySection>
          )}

          {entry.limitations && (
            <EntrySection id="limitations" title={t('sections.limitations')}>
              <Paragraphs text={entry.limitations} className="text-body-article text-ink" />
            </EntrySection>
          )}

          {entry.contexts && entry.contexts.value.length > 0 && (
            <EntrySection id="contexts" title={t('sections.contexts')}>
              <dl lang={entry.contexts.lang} className="flex flex-col divide-y divide-hairline rounded-card border border-surface-2">
                {entry.contexts.value.map((context, index) => (
                  <div key={index} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:gap-5">
                    <dt className="text-ui font-medium sm:w-36 sm:flex-none">{context.label}</dt>
                    <dd className="text-ui whitespace-pre-line text-ink-2">{context.meaning}</dd>
                  </div>
                ))}
              </dl>
            </EntrySection>
          )}

          {entry.comparisons.length > 0 && (
            <EntrySection id="comparisons" title={t('sections.comparisons')}>
              <ul className="flex flex-col gap-3">
                {entry.comparisons.map(({ entry: other, difference }) => (
                  <li key={other.id} className="flex flex-col gap-1.5 rounded-card bg-surface px-5 py-4">
                    <span className="flex flex-wrap items-baseline gap-x-2 text-title font-medium">
                      <span lang={entry.title.lang}>{entry.title.value}</span>
                      <span aria-hidden="true" className="text-ink-4">
                        ·
                      </span>
                      <Link href={entryHref(other.slug)} lang={other.title.lang} className="text-link hover:underline">
                        {other.title.value}
                      </Link>
                    </span>
                    <p lang={difference.lang} className="text-body whitespace-pre-line text-ink-2">
                      {difference.value}
                    </p>
                  </li>
                ))}
              </ul>
            </EntrySection>
          )}

          {hasRelations && (
            <EntrySection id="relations" title={t('sections.relations')}>
              <div className="flex flex-col gap-5">
                {(
                  [
                    ['prerequisites', entry.prerequisites],
                    ['readNext', entry.next],
                    ['related', entry.related],
                  ] as const
                )
                  .filter(([, entries]) => entries.length > 0)
                  .map(([key, entries]) => (
                    <div key={key} className="flex flex-col gap-2.5">
                      <h3 className="text-ui font-medium text-ink-2">{t(key)}</h3>
                      <EntryLinks entries={entries} />
                    </div>
                  ))}
              </div>
            </EntrySection>
          )}

          {hasFurther && (
            <EntrySection id="further" title={t('sections.further')}>
              <div className="flex flex-col gap-5">
                {entry.apps.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <h3 className="text-ui font-medium text-ink-2">{t('apps')}</h3>
                    <ul className="-mx-2 flex flex-col">
                      {entry.apps.map((app) => (
                        <li key={app.slug}>
                          <Link href={`/apps/${app.slug}`} className={furtherRow}>
                            <AppTile name={app.name} slug={app.slug} logo={app.logo} size="md" />
                            <span className="flex min-w-0 flex-col">
                              <span className="text-body font-medium group-hover:text-accent-ink">{app.name}</span>
                              {app.tagline && (
                                <span lang={app.tagline.lang} className="truncate text-meta text-ink-3">
                                  {app.tagline.value}
                                </span>
                              )}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {entry.skills.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <h3 className="text-ui font-medium text-ink-2">{t('skills')}</h3>
                    <ul className="-mx-2 flex flex-col">
                      {entry.skills.map((skill) => (
                        <li key={skill.slug}>
                          <Link href={skillHref(skill.slug)} className={furtherRow}>
                            <SkillTile name={skill.name.value} slug={skill.slug} size="md" />
                            <span className="flex min-w-0 flex-col">
                              <span lang={skill.name.lang} className="text-body font-medium group-hover:text-accent-ink">
                                {skill.name.value}
                              </span>
                              {skill.tagline && (
                                <span lang={skill.tagline.lang} className="truncate text-meta text-ink-3">
                                  {skill.tagline.value}
                                </span>
                              )}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {entry.stories.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <h3 className="text-ui font-medium text-ink-2">{t('stories')}</h3>
                    <ul className="flex flex-col">
                      {entry.stories.map((story) => (
                        <li key={story.slug} className="border-b border-hairline py-2.5 last:border-b-0">
                          <Link href={storyHref(story.slug)} className="flex flex-col gap-0.5 hover:text-accent-ink">
                            <span lang={story.title.lang} className="text-body">
                              {story.title.value}
                            </span>
                            <LocalTime iso={story.publishedAt} style="date" className="text-meta text-ink-4" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </EntrySection>
          )}

          {entry.sources.length > 0 && (
            <EntrySection id="sources" title={t('sections.sources')}>
              <ol className="flex list-decimal flex-col gap-2 pl-5 text-ui marker:text-ink-4">
                {entry.sources.map((source) => (
                  <li key={source.url} className="pl-1">
                    <a href={source.url} target="_blank" rel="nofollow noopener" className="wrap-anywhere text-link hover:underline">
                      {source.title}
                    </a>
                    {source.publisher && <span className="text-ink-4"> · {source.publisher}</span>}
                  </li>
                ))}
              </ol>
            </EntrySection>
          )}

          <footer className="flex flex-col gap-1.5 border-t border-line pt-5 text-meta text-ink-4">
            <p className="flex flex-wrap gap-x-4 gap-y-1">
              {reviewed && <span>{t('reviewedOn', { date: reviewed })}</span>}
              <span>{t.rich('updatedOn', { time: () => <LocalTime iso={entry.updatedAt} style="date" /> })}</span>
            </p>
            <p>{t('reviewNote')}</p>
            <p>
              {t('reportMistake')}{' '}
              <a href={mail} className="text-link hover:underline">
                {t('tellUs')}
              </a>
            </p>
          </footer>
        </article>

        {contents.length > 1 && (
          <aside className="hidden md:block">
            <nav aria-labelledby="entry-toc" className="sticky top-20 flex flex-col gap-1 border-l border-line pl-4">
              <span id="entry-toc" className="pb-1 text-small text-ink-4">
                {t('toc')}
              </span>
              {contents.map((key) => (
                <a key={key} href={`#${key}`} className="flex min-h-8 items-center text-meta text-ink-2 hover:text-ink">
                  {t(`sections.${key}`)}
                </a>
              ))}
            </nav>
          </aside>
        )}
      </div>
    </main>
  )
}
