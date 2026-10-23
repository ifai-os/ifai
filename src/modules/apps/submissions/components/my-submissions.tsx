import { getTranslations } from 'next-intl/server'

import { InitialTile, toneFor } from '@/components/cards/initial-tile'
import { LocalTime } from '@/components/local-time'
import { Link } from '@/i18n/navigation'
import { detectLanguage } from '@/lib/i18n/detect'

import { initialOf } from '../../localized'
import type { MySubmission } from '../data'
import type { SubmissionStatus } from '../rules'

const pills: Record<SubmissionStatus, string> = {
  pending: 'bg-info-soft text-ink-2',
  accepted: 'bg-success-soft text-success-ink',
  duplicate: 'bg-surface-2 text-ink-2',
  rejected: 'bg-surface-2 text-ink-3',
}

/**
 * 「我的提交」: the member's latest submissions, newest first, with where each one stands, the
 * owner's note once there is a result, and the app's page when it is listed. The name and the
 * note carry their own language, which need not be the page's.
 */
export async function MySubmissions({ submissions }: { submissions: MySubmission[] }) {
  const t = await getTranslations('appSubmissions')

  return (
    <section id="mine" aria-labelledby="mine-title" className="flex scroll-mt-20 flex-col gap-3.5">
      <h2 id="mine-title" tabIndex={-1} className="text-h3 font-semibold outline-none">
        {t('mine.title')}
      </h2>
      <ul className="flex flex-col divide-y divide-hairline rounded-card border border-surface-2">
        {submissions.map((item) => (
          <li key={item.id} className="flex flex-col gap-2 px-4 py-3.5 md:px-5">
            <div className="flex items-center gap-3">
              <InitialTile label={initialOf(item.name)} tone={toneFor(item.domain)} size="sm" />
              <div className="flex min-w-0 flex-1 flex-col wrap-anywhere">
                <span lang={detectLanguage(item.name, item.locale)} className="text-ui font-medium">
                  {item.name}
                </span>
                <span className="text-small text-ink-4">{item.domain}</span>
              </div>
              <span className={`inline-flex h-6 flex-none items-center rounded-tag px-2 text-small font-medium whitespace-nowrap ${pills[item.status]}`}>
                {t(`mine.status.${item.status}`)}
              </span>
            </div>
            <p className="text-small text-ink-4">
              <span className="font-mono">{t('done.number', { code: item.code })}</span>
              {' · '}
              {t.rich('mine.sentOn', { time: () => <LocalTime iso={item.submittedAt} style="date" /> })}
            </p>
            {item.reply && (
              <div className="flex flex-col gap-0.5 rounded-thumb bg-surface px-3 py-2.5">
                <span className="text-small text-ink-4">{t('mine.reply')}</span>
                <p lang={detectLanguage(item.reply, item.locale)} className="text-meta whitespace-pre-line text-ink-2 wrap-anywhere">
                  {item.reply}
                </p>
              </div>
            )}
            {item.app && (
              <Link href={`/apps/${item.app.slug}`} className="flex min-h-8 items-center self-start text-meta font-medium text-link hover:underline">
                {t('mine.view', { name: item.app.name })} ›
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
