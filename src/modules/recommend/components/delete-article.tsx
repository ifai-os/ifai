'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useRouter } from '@/i18n/navigation'

/** 「删除」in「我的文章」, asked twice: the article and its pictures are gone for good (rule 15). */
export function DeleteArticle({ articleId }: { articleId: number }) {
  const t = useTranslations('recommend.mine')
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [state, setState] = useState<'idle' | 'busy' | 'failed'>('idle')

  async function remove() {
    setState('busy')
    try {
      const response = await fetch(`/api/recommend/articles?id=${articleId}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(String(response.status))
      router.refresh()
    } catch {
      setState('failed')
    }
  }

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="text-meta text-ink-3 hover:text-down">
        {t('delete')}
      </button>
    )
  }
  return (
    <span role="group" aria-label={t('deleteConfirm')} className="flex flex-wrap items-center gap-3 text-meta">
      <span className="text-ink-2">{t('deleteConfirm')}</span>
      <button type="button" onClick={() => void remove()} disabled={state === 'busy'} className="font-medium text-down hover:underline disabled:opacity-60">
        {t('deleteYes')}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-ink-3 hover:text-ink">
        {t('cancel')}
      </button>
      {state === 'failed' && (
        <span role="alert" className="text-down">
          {t('deleteFailed')}
        </span>
      )}
    </span>
  )
}
