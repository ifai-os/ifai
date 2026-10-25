import { getFormatter, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { buttonBase, buttonClass } from '@/components/button'
import { Icon } from '@/components/icon'
import { ShareButton } from '@/components/share-button'
import { Link } from '@/i18n/navigation'
import type { AuthProviders } from '@/lib/auth/providers'
import { SaveButton, SaveCount } from '@/modules/saves/components/save-button'
import { SaveProvider } from '@/modules/saves/components/save-provider'

import type { SkillDetail, VersionDetail } from '../data'
import { fileTree, guessLang } from '../files'
import { installMdUrl, zipPath } from '../install'
import { fileHref, guideHref, skillHref, skillsHref, versionHref } from '../list-params'
import { ApiKeyBadge, CertifiedBadge, ScanBadgeView } from './badges'
import { copyButtonClass } from './classes'
import { DetailTabs } from './detail-tabs'
import { InstallPanel } from './install-panel'
import { CopyInstallButton, InstallProvider } from './install-state'
import { RelatedSkills } from './related-skills'
import { SkillTile } from './skill-tile'

type SkillDetailViewProps = {
  skill: SkillDetail
  /** A fixed link to one version (/v/<version>) rather than the Skill's page. */
  pinned: boolean
  /** The sign-in methods, for the dialog a visitor gets on pressing save. */
  signIn: AuthProviders
}

// Literal class names so Tailwind sees them; deeper folders stop indenting.
const indents = ['pl-4', 'pl-9', 'pl-14', 'pl-19', 'pl-24'] as const

const kib = (bytes: number) => `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`

// Outlined like a secondary button; the save button colors its own text.
const outline = 'border border-line bg-bg hover:border-ink-4'

/**
 * A Skill's page (boards「IFAI Skill 详情」and「手机 · Skill 详情」): header with badges and facts,
 * the install panel (right column on wide screens, right under the header on phones), then
 * 概述 / 文件 / 版本记录 / 安全检测, and information, fingerprint and related Skills beside them.
 * Phones also get a bottom bar with save and copy. Saving reads the member's state in the
 * browser, so the page stays static. Text from the package (SKILL.md, file names) is rendered
 * as text, never as markup (rule 4).
 */
export async function SkillDetailView({ skill, pinned, signIn }: SkillDetailViewProps) {
  const t = await getTranslations('resources')
  const categoryName = await getTranslations('skillCategories')
  const card = await getTranslations('card')
  const format = await getFormatter()
  const shown = skill.shown
  const date = (iso: string | null) => (iso ? format.dateTime(new Date(iso), { year: 'numeric', month: 'short', day: 'numeric' }) : null)
  const installs = format.number(skill.installs, { notation: 'compact', maximumFractionDigits: 1 })
  const delisted = skill.status === 'delisted'
  const isCurrent = shown !== null && shown.version === skill.currentVersion

  // Why this version cannot be installed, if it cannot.
  const disabled = !shown
    ? t('install.none')
    : shown.status === 'withdrawn'
      ? t('install.withdrawn')
      : null
  const pending =
    !pinned && skill.pending && !delisted
      ? t(`install.pending.${skill.pending.state}`, { version: skill.pending.version, current: skill.currentVersion ?? '' })
      : null
  const instructions = shown
    ? Object.fromEntries(
        shown.hosts.map((host) => [
          host.slug,
          t('install.instruction', {
            url: installMdUrl(skill.slug, { version: isCurrent ? undefined : shown.version, host: host.slug }),
            host: host.name,
          }),
        ]),
      )
    : {}

  const tabs = shown
    ? [
        { id: 'overview', label: t('tabs.overview') },
        { id: 'files', label: t('tabs.files'), count: String(shown.files.length) },
        { id: 'versions', label: t('tabs.versions'), count: String(skill.versions.length) },
        { id: 'security', label: t('tabs.security') },
      ]
    : [{ id: 'overview', label: t('tabs.overview') }]

  const facts: { key: 'version' | 'updated' | 'license' | 'runtime' | 'apiKey' | 'size' | 'repository'; value: ReactNode }[] = []
  if (shown) facts.push({ key: 'version', value: `v${shown.version}` })
  if (shown?.publishedAt) facts.push({ key: 'updated', value: date(shown.publishedAt) })
  facts.push({ key: 'license', value: skill.license ?? t('info.noLicense') })
  if (skill.runtime.length) facts.push({ key: 'runtime', value: skill.runtime.join(', ') })
  facts.push({ key: 'apiKey', value: skill.needsApiKey ? (shown?.apiKeys.length ? shown.apiKeys.join(', ') : t('info.needed')) : t('info.notNeeded') })
  if (shown?.size) facts.push({ key: 'size', value: kib(shown.size) })
  if (skill.repository) {
    facts.push({
      key: 'repository',
      value: (
        <a href={skill.repository} target="_blank" rel="nofollow noopener" className="wrap-anywhere text-link hover:underline">
          {skill.repository.replace(/^https?:\/\/(www\.)?/, '')}
        </a>
      ),
    })
  }

  const shareLabels = { share: t('share'), copied: t('linkCopied') }

  const page = (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-6 px-4 pt-5 pb-16 md:gap-8 md:pb-24">
      <nav aria-label={t('breadcrumb')} className="text-meta text-ink-4">
        <ol className="flex flex-wrap items-center gap-2">
          <li className="flex items-center gap-2">
            <Link href="/resources" className="hover:text-ink">
              {t('resources')}
            </Link>
            <span aria-hidden="true">/</span>
          </li>
          <li className="flex items-center gap-2">
            <Link href="/resources" className="hover:text-ink">
              {t('title')}
            </Link>
            <span aria-hidden="true">/</span>
          </li>
          <li className="flex items-center gap-2">
            <Link href={skillsHref({ category: skill.category })} className="hover:text-ink">
              {categoryName(skill.category)}
            </Link>
            <span aria-hidden="true">/</span>
          </li>
          <li aria-current="page" lang={skill.name.lang} className="min-w-0 truncate text-ink">
            {skill.name.value}
          </li>
        </ol>
      </nav>

      {pinned && shown && (
        <p role="note" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-thumb bg-warn px-4 py-2.5 text-ui text-warn-ink">
          {isCurrent ? t('pinned.current', { version: shown.version }) : t('pinned.notCurrent', { version: shown.version, current: skill.currentVersion ?? '—' })}
          {!isCurrent && skill.currentVersion && (
            <Link href={skillHref(skill.slug)} className="font-medium underline">
              {t('pinned.toCurrent')}
            </Link>
          )}
        </p>
      )}
      {shown?.status === 'withdrawn' && (
        <p role="note" className="rounded-thumb border border-down px-4 py-2.5 text-ui text-down">
          {t('withdrawn', { version: shown.version })}
          {shown.withdrawReason && ` ${t('reason', { reason: shown.withdrawReason })}`}
        </p>
      )}
      {shown?.status === 'deprecated' && <p role="note" className="rounded-thumb bg-surface px-4 py-2.5 text-ui text-ink-2">{t('deprecated', { version: shown.version })}</p>}
      {delisted && (
        <p role="note" className="rounded-thumb border border-down px-4 py-2.5 text-ui text-down">
          {t('delisted')}
          {skill.delistReason && ` ${t('reason', { reason: skill.delistReason })}`}
        </p>
      )}

      <div className="grid gap-x-10 gap-y-6 md:grid-cols-[minmax(0,1fr)_340px] md:grid-rows-[auto_1fr]">
        <header className="order-1 flex min-w-0 flex-col gap-3.5 md:order-none md:col-start-1">
          <div className="flex items-center gap-4">
            <SkillTile name={skill.name.value} slug={skill.slug} size="2xl" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h1 lang={skill.name.lang} className="text-h2 wrap-anywhere md:text-h1">
                {skill.name.value}
              </h1>
              <p className="font-mono text-meta text-ink-4">
                {skill.slug}
                {shown && ` · v${shown.version}`}
              </p>
            </div>
            {!delisted && (
              <ShareButton
                title={skill.name.value}
                labels={shareLabels}
                iconOnly
                className="flex size-11 flex-none items-center justify-center rounded-pill text-ink-2 hover:text-ink md:hidden"
              />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {skill.certified && <CertifiedBadge />}
            {shown && shown.scanStatus === 'passed' && <ScanBadgeView scan="passed" />}
            {shown && shown.scanStatus === 'warnings' && <ScanBadgeView scan="reviewed" />}
            {skill.needsApiKey && <ApiKeyBadge />}
          </div>
          {skill.tagline && (
            <p lang={skill.tagline.lang} className="max-w-160 text-body text-ink-2">
              {skill.tagline.value}
            </p>
          )}
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-meta text-ink-4">
            <span>
              {card('installs', { count: installs })}
              {!delisted && <SaveCount />}
            </span>
            {shown?.publishedAt && <span>{t('updatedOn', { date: date(shown.publishedAt) ?? '' })}</span>}
            <span>
              {t('by')}{' '}
              <Link href={skillsHref({ author: skill.author.name })} className="text-ink-2 hover:text-ink">
                {skill.author.name}
              </Link>
              {skill.author.official && ` · ${t('official')}`}
            </span>
          </p>
          {skill.tags.length > 0 && (
            <ul aria-label={t('tags')} className="flex flex-wrap gap-2">
              {skill.tags.map((tag) => (
                <li key={tag.slug}>
                  <Link
                    href={skillsHref({ tag: tag.slug })}
                    lang={tag.name.lang}
                    className="flex h-6.5 items-center rounded-pill border border-surface-2 bg-surface px-2.5 text-small text-ink-2 hover:border-line hover:text-ink"
                  >
                    {tag.name.value}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {!delisted && (
            <div className="hidden flex-wrap gap-2 pt-1 md:flex">
              <SaveButton className={`${buttonBase} ${outline}`} />
              <ShareButton title={skill.name.value} className={buttonClass('secondary')} labels={shareLabels} />
            </div>
          )}
        </header>

        {/* Phones: the install panel right under the header, the facts after the tabs (`contents` lets the grid order them). */}
        <div className="contents md:col-start-2 md:row-span-2 md:row-start-1 md:flex md:min-w-0 md:flex-col md:gap-6">
          {!delisted && shown && (
            <div className="order-2 min-w-0 md:order-none">
              <InstallPanel pending={pending} />
            </div>
          )}

          <aside className="order-4 flex min-w-0 flex-col gap-6 md:order-none">
            <section aria-labelledby="info-title" className="flex flex-col gap-1">
              <h2 id="info-title" className="pb-1.5 text-title font-semibold">
                {t('info.title')}
              </h2>
              <dl className="flex flex-col">
                {facts.map((fact) => (
                  <div key={fact.key} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 border-b border-surface-2 py-2 text-meta">
                    <dt className="text-ink-4">{t(`info.${fact.key}`)}</dt>
                    <dd className="text-ink">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {shown?.sha256 && (
              <section aria-labelledby="fingerprint-title" className="flex flex-col gap-2">
                <h2 id="fingerprint-title" className="text-title font-semibold">
                  {t('fingerprint.title')}
                </h2>
                <p className="text-small text-ink-4">{t('fingerprint.label')}</p>
                <p className="rounded-thumb bg-surface px-3 py-2 font-mono text-small break-all text-ink">sha256:{shown.sha256}</p>
                <p className="text-small text-ink-3">{t('fingerprint.how', { file: `${skill.slug}-${shown.version}.zip` })}</p>
                <Link href={`${guideHref}#verify`} className="flex min-h-8 items-center self-start text-meta font-medium text-link hover:underline">
                  {t('fingerprint.verify')} ›
                </Link>
              </section>
            )}

            {skill.related.length > 0 && (
              <RelatedSkills
                title={t('related')}
                shuffleLabel={t('shuffle')}
                items={skill.related.map((item) => (
                  <li key={item.id}>
                    <Link href={skillHref(item.slug)} className="group flex items-center gap-3 border-b border-surface-2 py-2.5">
                      <SkillTile name={item.name.value} slug={item.slug} size="md" />
                      <span className="flex min-w-0 flex-col">
                        <span lang={item.name.lang} className="truncate text-ui font-medium group-hover:text-accent-ink">
                          {item.name.value}
                        </span>
                        <span className="text-small text-ink-4">
                          {card('installs', { count: format.number(item.installs, { notation: 'compact', maximumFractionDigits: 1 }) })}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              />
            )}
          </aside>
        </div>

        <div className="order-3 min-w-0 md:order-none md:col-start-1">
          <DetailTabs label={t('tabs.label')} tabs={tabs}>
            {[
              <Overview key="overview" skill={skill} shown={shown} />,
              ...(shown
                ? [
                    <Files key="files" slug={skill.slug} shown={shown} />,
                    <Versions key="versions" skill={skill} shown={shown} date={date} />,
                    <Security key="security" shown={shown} date={date} />,
                  ]
                : []),
            ]}
          </DetailTabs>
        </div>
      </div>
    </main>
  )

  // A delisted Skill can be neither saved nor installed.
  if (delisted) return page
  return (
    <SaveProvider target={{ type: 'skill', id: skill.id }} signIn={signIn}>
      {shown ? (
        <InstallProvider
          slug={skill.slug}
          version={shown.version}
          hosts={shown.hosts}
          instructions={instructions}
          zipHref={zipPath(skill.slug, shown.version)}
          disabled={disabled}
        >
          {page}
          {/* Phones: save and copy stay in reach while reading (board「手机 · Skill 详情」). */}
          <div className="sticky bottom-0 z-10 flex gap-2.5 border-t border-line bg-bg px-4 pt-2.5 pb-3.5 md:hidden">
            <SaveButton iconOnly className={`flex size-12 flex-none items-center justify-center rounded-btn transition-colors ${outline}`} />
            <CopyInstallButton className={`h-12 flex-1 text-body ${copyButtonClass}`} />
          </div>
        </InstallProvider>
      ) : (
        page
      )}
    </SaveProvider>
  )
}

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-h3 font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

async function Overview({ skill, shown }: { skill: SkillDetail; shown: VersionDetail | null }) {
  const t = await getTranslations('resources')
  const empty = !skill.capabilities && !skill.example && !skill.workflow && !skill.notes && !skill.ownerNotes

  return (
    <div className="flex max-w-190 flex-col gap-8">
      {skill.capabilities && (
        <Block id="capabilities" title={t('overview.capabilities')}>
          <ul lang={skill.capabilities.lang} className="flex flex-col gap-2.5">
            {skill.capabilities.value.map((item, index) => (
              <li key={index} className="flex gap-2.5 text-body">
                <span aria-hidden="true" className="mt-2.5 size-1.5 flex-none rounded-pill bg-ink" />
                <span className="flex flex-col gap-0.5">
                  <strong className="font-semibold">{item.title}</strong>
                  {item.detail && <span className="text-ui text-ink-3">{item.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        </Block>
      )}
      {skill.example && (
        <Block id="example" title={t('overview.example')}>
          <p className="text-ui text-ink-3">{t('overview.exampleHint')}</p>
          <pre lang={skill.example.lang} className="rounded-thumb bg-surface px-4 py-3 font-sans text-body whitespace-pre-wrap text-ink">
            {skill.example.value}
          </pre>
        </Block>
      )}
      {skill.workflow && (
        <Block id="workflow" title={t('overview.workflow')}>
          <ol lang={skill.workflow.lang} className="flex flex-col gap-3">
            {skill.workflow.value.map((step, index) => (
              <li key={index} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
                <span
                  aria-hidden="true"
                  className={`flex size-8 items-center justify-center rounded-pill text-meta font-semibold ${index === 0 ? 'bg-ink text-bg' : 'bg-surface text-ink'}`}
                >
                  {index + 1}
                </span>
                <span className="flex flex-col gap-0.5 pt-1">
                  <span className="text-body font-medium">{step.title}</span>
                  {step.detail && <span className="text-ui text-ink-3">{step.detail}</span>}
                </span>
              </li>
            ))}
          </ol>
        </Block>
      )}
      {skill.notes && (
        <Block id="notes" title={t('overview.notes')}>
          <p lang={skill.notes.lang} className="rounded-thumb bg-warn px-4 py-3 text-ui whitespace-pre-line text-warn-ink">
            {skill.notes.value}
          </p>
        </Block>
      )}
      {skill.ownerNotes && (
        <Block id="owner-notes" title={t('overview.ownerNotes')}>
          <p lang={skill.ownerNotes.lang} className="text-body whitespace-pre-line text-ink-2">
            {skill.ownerNotes.value}
          </p>
        </Block>
      )}
      {empty && <p className="text-body text-ink-3">{t('overview.empty')}</p>}
      {shown?.skillMd && (
        <details className="group rounded-card border border-surface-2">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-ui font-medium [&::-webkit-details-marker]:hidden">
            {t('overview.skillMd')}
            <span aria-hidden="true" className="text-title text-ink-4">
              <span className="group-open:hidden">+</span>
              <span className="hidden group-open:inline">−</span>
            </span>
          </summary>
          <pre lang={guessLang(shown.skillMd)} className="max-h-160 overflow-auto border-t border-surface-2 px-4 py-3 font-mono text-meta whitespace-pre-wrap wrap-anywhere text-ink">
            {shown.skillMd}
          </pre>
        </details>
      )}
    </div>
  )
}

async function Files({ slug, shown }: { slug: string; shown: VersionDetail }) {
  const t = await getTranslations('resources')
  const rows = fileTree(shown.files)
  const total = shown.files.reduce((sum, file) => sum + file.size, 0)
  return (
    <div className="flex flex-col gap-3">
      <p className="text-meta text-ink-4">{t('files.summary', { count: shown.files.length, size: kib(total) })}</p>
      <ul className="flex flex-col rounded-card border border-surface-2 py-1.5">
        {rows.map((row) => (
          <li key={`${row.kind}:${row.path}`} className={`flex items-center gap-2 pr-4 ${indents[Math.min(row.depth, indents.length - 1)]}`}>
            <Icon name={row.kind === 'dir' ? 'folder' : 'file'} size={15} className="text-ink-4" />
            {row.kind === 'dir' ? (
              <span className="flex h-9 items-center font-mono text-meta text-ink-2">{row.name}/</span>
            ) : (
              <>
                <Link href={fileHref(slug, shown.version, row.path)} rel="nofollow" className="flex h-9 min-w-0 flex-1 items-center font-mono text-meta wrap-anywhere text-ink hover:text-link">
                  {row.name}
                </Link>
                <span className="flex-none text-small text-ink-4 tabular-nums">{kib(row.size)}</span>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

async function Versions({ skill, shown, date }: { skill: SkillDetail; shown: VersionDetail; date: (iso: string | null) => string | null }) {
  const t = await getTranslations('resources')
  return (
    <ol className="flex flex-col border-t border-surface-2">
      {skill.versions.map((version) => (
        <li key={version.version} className="flex flex-col gap-1.5 border-b border-surface-2 py-3.5 md:flex-row md:gap-6">
          <div className="flex items-baseline gap-3 md:w-40 md:flex-none md:flex-col md:gap-0.5">
            <Link
              href={versionHref(skill.slug, version.version)}
              aria-current={version.version === shown.version ? 'page' : undefined}
              className="font-mono text-ui font-semibold hover:text-link"
            >
              v{version.version}
            </Link>
            {version.publishedAt && <span className="text-small text-ink-4">{date(version.publishedAt)}</span>}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="flex flex-wrap gap-2">
              {version.version === skill.currentVersion && (
                <span className="flex h-6 items-center rounded-tag bg-success-soft px-2 text-small font-medium text-success-ink">{t('versionStatus.current')}</span>
              )}
              {version.status !== 'published' && (
                <span className="flex h-6 items-center rounded-tag bg-surface px-2 text-small font-medium text-ink-2">{t(`versionStatus.${version.status}`)}</span>
              )}
            </span>
            {version.changelog && (
              <p lang={version.changelog.lang} className="text-ui whitespace-pre-line text-ink-2">
                {version.changelog.value}
              </p>
            )}
            {version.withdrawReason && <p className="text-meta text-down">{t('reason', { reason: version.withdrawReason })}</p>}
          </div>
        </li>
      ))}
    </ol>
  )
}

async function Security({ shown, date }: { shown: VersionDetail; date: (iso: string | null) => string | null }) {
  const t = await getTranslations('resources')
  const passed = shown.checks.filter((check) => check.result === 'pass')
  const reviewed = shown.checks.length - passed.length
  return (
    <div className="flex max-w-190 flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className={`flex size-10 items-center justify-center rounded-tile ${shown.scanStatus === 'passed' ? 'bg-success-soft text-success-ink' : 'bg-surface text-ink-2'}`}>
          <Icon name="shield" size={22} />
        </span>
        <span className="flex flex-col">
          <span className="text-title font-semibold">{shown.scanStatus === 'passed' ? t('scan.passed') : t('scan.reviewed')}</span>
          <span className="text-meta text-ink-4">
            {t('scan.when', { version: shown.version, date: date(shown.scannedAt) ?? '—' })}
          </span>
        </span>
      </div>
      {passed.length > 0 && (
        <ul className="grid gap-2 md:grid-cols-2">
          {passed.map((check) => (
            <li key={check.key} className="flex items-center gap-2 rounded-thumb bg-surface px-3 py-2.5 text-ui">
              <Icon name="check" size={16} className="text-up" />
              {t(`checks.${check.key}`)}
            </li>
          ))}
        </ul>
      )}
      {reviewed > 0 && <p className="text-ui text-ink-3">{t('scan.reviewedNote', { count: reviewed })}</p>}

      <dl className="flex flex-col">
        <Declaration label={t('declarations.domains')} values={shown.domains} none={t('declarations.noDomains')} mono />
        <Declaration label={t('declarations.fileScope')} values={shown.fileScope ? [shown.fileScope] : []} none={t('declarations.unknown')} />
        <Declaration label={t('declarations.tools')} values={shown.tools} none={t('declarations.noTools')} mono />
        <Declaration label={t('declarations.apiKeys')} values={shown.apiKeys} none={t('declarations.noKeys')} mono />
      </dl>

      <p className="rounded-thumb border border-line px-4 py-3 text-meta text-ink-3">{t('disclaimer')}</p>
    </div>
  )
}

function Declaration({ label, values, none, mono }: { label: string; values: string[]; none: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b border-surface-2 py-2.5 text-meta">
      <dt className="text-ink-4">{label}</dt>
      <dd className={values.length ? `${mono ? 'font-mono' : ''} wrap-anywhere text-ink` : 'text-ink-4'}>{values.length ? values.join(', ') : none}</dd>
    </div>
  )
}
