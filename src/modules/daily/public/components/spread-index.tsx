import { useTranslations } from 'next-intl'

import { Icon } from '@/components/icon'

import { spreadTier, type SpreadTier } from '../../heat/rules'

const colors: Record<SpreadTier, string> = {
  1: 'text-heat-1',
  2: 'text-heat-2',
  3: 'text-heat-3',
  4: 'text-heat-4',
}

/**
 * 「⚡ 传播指数 72」: the bolt and the number in the tier's colour, the label in the surrounding
 * grey; cold to hot green, orange, red, magenta (../../heat/rules.ts). Nothing when the story never had any heat.
 * `plain` keeps the surrounding colour, for text over a picture. `compact` lets the bolt stand for
 * the label (the 48-hour list): the words stay for screen readers and as the tooltip.
 */
export function SpreadIndex({ value, plain = false, compact = false }: { value: number; plain?: boolean; compact?: boolean }) {
  const card = useTranslations('card')
  if (!(value > 0)) return null
  const color = plain ? '' : colors[spreadTier(value)]
  return (
    <span className="inline-flex items-center gap-1" title={compact ? card('spread') : undefined}>
      <Icon name="bolt" size={14} fill="currentColor" strokeWidth={1.2} className={`flex-none ${color}`} />
      <span>
        {compact ? <span className="sr-only">{card('spread')}</span> : card('spread')} <span className={plain ? 'font-semibold tabular-nums' : `font-semibold tabular-nums ${color}`}>{value}</span>
      </span>
    </span>
  )
}
