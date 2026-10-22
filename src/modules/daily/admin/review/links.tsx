'use client'

import type { DefaultCellComponentProps } from 'payload'

import { Button, Link, Pill, useConfig, useDocumentInfo, useTranslation } from '@payloadcms/ui'

import { reviewText } from './text'

function useReviewRoute() {
  const { config } = useConfig()
  return `${config.routes.admin}/collections/stories/review`
}

/** Above the stories list: open the queue. */
export function ReviewQueueButton() {
  const route = useReviewRoute()
  const { i18n } = useTranslation()
  const t = reviewText(i18n.language)
  return (
    <div style={{ marginBottom: 'var(--base)' }}>
      <Button buttonStyle="primary" el="link" size="medium" to={route}>
        {t.title}
      </Button>
    </div>
  )
}

/** In the admin nav, after the collection groups. */
export function ReviewNavLink() {
  const route = useReviewRoute()
  const { i18n } = useTranslation()
  const t = reviewText(i18n.language)
  return (
    <div style={{ marginTop: 'calc(var(--base) / 2)' }}>
      <Link className="nav__link" href={route} prefetch={false}>
        <span className="nav__link-label">{t.title}</span>
      </Link>
    </div>
  )
}

/** The「审核」column in the stories list: open this story on the review screen. */
export function ReviewCell({ rowData }: DefaultCellComponentProps) {
  const route = useReviewRoute()
  const { i18n } = useTranslation()
  const t = reviewText(i18n.language)
  const id = rowData?.id as number | string | undefined
  if (!id) return null
  const status = rowData?.status as string | undefined
  const label = status === 'published' ? t.queue.correct : t.queue.review
  return (
    <Pill pillStyle="light-gray" size="small" to={`${route}?story=${id}`}>
      {label}
    </Pill>
  )
}

/** At the top of a story's edit view: open it on the review screen instead. */
export function ReviewField() {
  const route = useReviewRoute()
  const { id, savedDocumentData } = useDocumentInfo()
  const { i18n } = useTranslation()
  const t = reviewText(i18n.language)
  if (!id) return null
  const published = savedDocumentData?.status === 'published'
  return (
    <div style={{ marginBottom: 'var(--base)' }}>
      <Button buttonStyle="secondary" el="link" size="small" to={`${route}?story=${id}`}>
        {published ? t.queue.correct : t.queue.review} · {t.title}
      </Button>
    </div>
  )
}
