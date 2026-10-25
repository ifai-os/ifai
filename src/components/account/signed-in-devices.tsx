'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { Icon } from '@/components/icon'
import { LocalTime } from '@/components/local-time'
import { useRouter } from '@/i18n/navigation'
import { authClient } from '@/lib/auth/client'
import { describeDevice, deviceLabel } from '@/lib/auth/devices'
import type { SignedInDevice } from '@/lib/auth/settings'

import { rowButton, SettingsCard, SettingsRow } from './settings-ui'

type Problem = 'failed' | 'signed-out'

/**
 * 「登录的设备」(docs/specs/account.md): every sign-in that has not run out, this one first. The
 * others can be signed out one by one (through /api/account/sessions/<id>, which keeps the tokens
 * on the server) or all at once (Better Auth's `revokeOtherSessions`). A device signed out here
 * keeps its cached sign-in for up to five minutes (`cookieCache`).
 */
export function SignedInDevices({ devices }: { devices: SignedInDevice[] }) {
  const t = useTranslations('account')
  const router = useRouter()
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [problem, setProblem] = useState<Problem | null>(null)
  const shown = devices.filter((device) => !gone.has(device.id))
  const others = shown.filter((device) => !device.current)

  async function signOut(id: string) {
    setBusy(id)
    setProblem(null)
    const response = await fetch(`/api/account/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null)
    setBusy(null)
    // Already gone (signed out elsewhere, or ran out) is as good as done.
    if (response?.ok || response?.status === 404) {
      setGone((current) => new Set([...current, id]))
      router.refresh()
      return
    }
    setProblem(response?.status === 401 ? 'signed-out' : 'failed')
  }

  async function signOutOthers() {
    setBusy('others')
    setProblem(null)
    const { error } = await authClient.revokeOtherSessions().catch(() => ({ error: { code: 'NETWORK' } }))
    setBusy(null)
    if (error) {
      setProblem('failed')
      return
    }
    setGone(new Set(others.map((device) => device.id)))
    router.refresh()
  }

  return (
    <div className="flex flex-col items-start gap-3.5">
      <div className="w-full">
        <SettingsCard>
          {shown.map((device) => {
            const parsed = describeDevice(device.userAgent)
            const label = deviceLabel(parsed) ?? t('unknownDevice')
            return (
              <SettingsRow
                key={device.id}
                lead={
                  <span className="flex size-10 flex-none items-center justify-center rounded-tile bg-surface text-ink-2">
                    <Icon name={parsed.handheld ? 'phone' : 'computer'} size={20} />
                  </span>
                }
                title={label}
                description={
                  <>
                    {device.ipAddress && `${device.ipAddress} · `}
                    {t.rich('signedInAt', { time: () => <LocalTime iso={device.signedInAt} /> })}
                  </>
                }
                action={
                  device.current ? (
                    <span className="rounded-tag bg-success-soft px-2 py-0.5 text-small text-success-ink">{t('thisDevice')}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => signOut(device.id)}
                      disabled={busy !== null}
                      aria-label={t('signOutDeviceLabel', { device: label })}
                      className={rowButton.secondary}
                    >
                      {busy === device.id ? t('signingOut') : t('signOutDevice')}
                    </button>
                  )
                }
              />
            )
          })}
        </SettingsCard>
      </div>
      {problem && (
        <p role="alert" className="text-small text-down">
          {problem === 'signed-out' ? t('signedOutMeanwhile') : t('signOutFailed')}
        </p>
      )}
      {others.length > 0 && (
        <button type="button" onClick={signOutOthers} disabled={busy !== null} className="text-meta text-down hover:underline disabled:opacity-60">
          {busy === 'others' ? t('signingOut') : t('signOutOthers')}
        </button>
      )}
    </div>
  )
}
