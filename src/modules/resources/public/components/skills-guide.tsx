import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { ButtonLink } from '@/components/button'
import { Icon } from '@/components/icon'
import { Link } from '@/i18n/navigation'

import type { GuideHost } from '../data'
import { HostTile } from './host-tile'

const stepKeys = ['pick', 'install', 'use'] as const

/**
 * 使用指南 (docs/specs/resources.md「页面与路由」): the three steps, where each assistant keeps
 * Skills, how to check a download's fingerprint, and what the security check covers. No board;
 * it follows the detail page. The list's「三步用上 Skill」and the detail page's fingerprint link here.
 */
export async function SkillsGuide({ hosts }: { hosts: GuideHost[] }) {
  const t = await getTranslations('resources')
  const file = t('guide.verify.file')

  return (
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
          <li aria-current="page" className="text-ink">
            {t('guide.title')}
          </li>
        </ol>
      </nav>

      <div className="flex w-full max-w-190 flex-col gap-10 md:gap-12">
        <header className="flex flex-col gap-3">
          <h1 className="text-h2 md:text-h1">{t('guide.title')}</h1>
          <p className="text-body text-ink-3">{t('guide.intro')}</p>
        </header>

        <Section id="steps" title={t('steps.title')}>
          <ol className="flex flex-col gap-4">
            {stepKeys.map((key, index) => (
              <li key={key} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
                <span
                  aria-hidden="true"
                  className={`flex size-8 items-center justify-center rounded-pill text-meta font-semibold ${index === 0 ? 'bg-ink text-bg' : 'bg-surface text-ink'}`}
                >
                  {index + 1}
                </span>
                <span className="flex flex-col gap-1 pt-1">
                  <span className="text-body font-medium">{t(`guide.steps.${key}`)}</span>
                  <span className="text-ui text-ink-3">
                    {key === 'install'
                      ? t('guide.steps.installBody', { copy: t('install.copy'), download: t('install.download') })
                      : t(`guide.steps.${key}Body`)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="hosts" title={t('guide.hosts.title')}>
          <p className="text-ui text-ink-2">{t('guide.hosts.intro')}</p>
          <p className="rounded-thumb bg-surface px-3 py-2 font-mono text-meta wrap-anywhere text-ink">{t('guide.hosts.path')}</p>
          {hosts.length > 0 && (
            <ul className="grid gap-3 md:grid-cols-2">
              {hosts.map((host) => (
                <li key={host.slug} className="flex min-w-0 flex-col gap-3 rounded-card border border-surface-2 p-4">
                  <div className="flex items-center gap-2.5">
                    <HostTile name={host.name} slug={host.slug} logo={host.logo} />
                    <h3 className="min-w-0 flex-1 truncate text-title font-semibold">{host.name}</h3>
                    {host.website && (
                      <a
                        href={host.website}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex flex-none items-center gap-1 text-meta text-link hover:underline"
                      >
                        {t('guide.hosts.website')}
                        <Icon name="external" size={14} />
                      </a>
                    )}
                  </div>
                  {host.globalDir || host.projectDir ? (
                    <dl className="flex flex-col gap-1.5 text-meta">
                      {host.globalDir && <Directory label={t('guide.hosts.global')} path={host.globalDir} />}
                      {host.projectDir && <Directory label={t('guide.hosts.project')} path={host.projectDir} />}
                    </dl>
                  ) : (
                    <p className="text-meta text-ink-3">{t('guide.hosts.unknown')}</p>
                  )}
                  {host.instructions && (
                    <p lang={host.instructions.lang} className="text-meta whitespace-pre-line text-ink-2">
                      {host.instructions.value}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section id="verify" title={t('guide.verify.title')}>
          <p className="text-ui text-ink-2">{t('guide.verify.body', { fingerprint: t('fingerprint.title') })}</p>
          <Commands label={t('guide.verify.mac')} lines={[`shasum -a 256 ${file}`, `sha256sum ${file}`]} />
          <Commands label={t('guide.verify.windows')} lines={[`Get-FileHash ${file} -Algorithm SHA256`]} />
          <p className="text-ui text-ink-2">{t('guide.verify.match')}</p>
          <p className="text-ui text-ink-3">{t('guide.verify.assistant')}</p>
        </Section>

        <Section id="safety" title={t('guide.safety.title')}>
          <ul className="flex list-disc flex-col gap-2 pl-5 text-ui text-ink-2">
            <li>{t('guide.safety.blocked')}</li>
            <li>{t('guide.safety.reviewed')}</li>
            <li>{t('guide.safety.noScripts')}</li>
            <li>{t('guide.safety.limits', { security: t('tabs.security') })}</li>
          </ul>
        </Section>

        <div>
          <ButtonLink href="/resources">{t('allSkills')}</ButtonLink>
        </div>
      </div>
    </main>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-20 flex-col gap-3.5">
      <h2 id={`${id}-title`} className="text-h3 font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Directory({ label, path }: { label: string; path: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <dt className="text-ink-4">{label}</dt>
      <dd className="font-mono wrap-anywhere text-ink">{path}</dd>
    </div>
  )
}

/** Commands to type, one per line, under the systems they are for. */
function Commands({ label, lines }: { label: string; lines: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-meta text-ink-4">{label}</p>
      <pre className="overflow-x-auto rounded-thumb bg-surface px-3 py-2.5 font-mono text-meta text-ink">{lines.join('\n')}</pre>
    </div>
  )
}
