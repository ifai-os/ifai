'use client'

import { useTranslation } from '@payloadcms/ui'

const label = { zh: '界面语言', en: 'Interface' } as const

/**
 * In the admin header, before the content-language picker: switch the back office between 中文 and English.
 * Payload remembers the choice in its payload-lng cookie; without one the back office opens in Chinese (src/proxy.ts).
 */
export function UiLanguageSwitch() {
  const { i18n, languageOptions, switchLanguage } = useTranslation()
  const current = i18n.language
  return (
    <div className="localizer-button ifai-ui-language" role="group" aria-label={current === 'en' ? label.en : label.zh}>
      <span className="localizer-button__label">{current === 'en' ? label.en : label.zh}:&nbsp;</span>
      {languageOptions.map((option, index) => (
        <span key={option.value} className="ifai-ui-language__option">
          {index > 0 && <span aria-hidden="true">&nbsp;·&nbsp;</span>}
          <button
            aria-pressed={option.value === current}
            disabled={option.value === current}
            lang={option.value === 'zh' ? 'zh-Hans' : option.value}
            onClick={() => switchLanguage?.(option.value)}
            type="button"
          >
            {option.label}
          </button>
        </span>
      ))}
    </div>
  )
}
