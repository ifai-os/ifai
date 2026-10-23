import { getFormatter, getTranslations } from 'next-intl/server'

import { Link } from '@/i18n/navigation'

import { legalContactEmail, legalHref, legalSections, legalUpdatedAt, parseLegalBody, type LegalDocument } from '../documents'

/**
 * 隐私政策 / 用户协议 (docs/specs/legal.md): a title, when it last changed, a short intro and one
 * heading per section. No board; it follows the resources guide's column.
 */
export async function LegalPage({ document }: { document: LegalDocument }) {
  const t = await getTranslations('legal')
  const format = await getFormatter()
  const other: LegalDocument = document === 'privacy' ? 'terms' : 'privacy'
  const values = { email: legalContactEmail }
  const sections =
    document === 'privacy'
      ? legalSections.privacy.map((key) => ({ key, title: t(`privacy.sections.${key}.title`), body: t(`privacy.sections.${key}.body`, values) }))
      : legalSections.terms.map((key) => ({ key, title: t(`terms.sections.${key}.title`), body: t(`terms.sections.${key}.body`, values) }))
  const updated = format.dateTime(new Date(`${legalUpdatedAt[document]}T00:00:00Z`), { dateStyle: 'long', timeZone: 'UTC' })

  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col px-4 pt-8 pb-16 md:pt-10 md:pb-24">
      <article className="flex w-full max-w-190 flex-col gap-10 md:gap-12">
        <header className="flex flex-col gap-3">
          <h1 className="text-h2 md:text-h1">{t(`${document}.title`)}</h1>
          <p className="text-meta text-ink-4">{t('updated', { date: updated })}</p>
          <p className="text-body text-ink-3">{t(`${document}.intro`)}</p>
          <p className="text-meta text-ink-4">{t('englishPrevails')}</p>
        </header>

        {sections.map(({ key, title, body }) => (
          <section key={key} id={key} aria-labelledby={`${key}-title`} className="flex scroll-mt-20 flex-col gap-3.5">
            <h2 id={`${key}-title`} className="text-h3 font-semibold">
              {title}
            </h2>
            {parseLegalBody(body).map((block, index) =>
              block.type === 'list' ? (
                <ul key={index} className="flex list-disc flex-col gap-2 pl-5 text-ui text-ink-2 marker:text-ink-4">
                  {block.items.map((item) => (
                    <li key={item} className="wrap-anywhere">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p key={index} className="text-ui wrap-anywhere text-ink-2">
                  {block.text}
                </p>
              ),
            )}
            {key === 'contact' && (
              <a href={`mailto:${legalContactEmail}`} className="w-fit text-ui wrap-anywhere text-link hover:underline">
                {legalContactEmail}
              </a>
            )}
          </section>
        ))}

        <p className="border-t border-line pt-6 text-ui">
          <Link href={legalHref[other]} className="text-link hover:underline">
            {t(`${other}.title`)}
          </Link>
        </p>
      </article>
    </main>
  )
}
