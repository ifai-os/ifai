import { useTranslations } from 'next-intl'

import { spreadTier, type SpreadTier } from '../../heat/rules'

const colors: Record<SpreadTier, string> = {
  1: 'text-heat-1',
  2: 'text-heat-2',
  3: 'text-heat-3',
  4: 'text-heat-4',
}

/**
 * 「传播指数 72」: the label in the surrounding grey, the number in its tier's colour, cold to hot
 * green, orange, red, magenta (../../heat/rules.ts). Nothing when the story never had any heat.
 * `plain` keeps the surrounding colour, for text over a picture.
 */
export function SpreadIndex({ value, plain = false }: { value: number; plain?: boolean }) {
  const card = useTranslations('card')
  if (!(value > 0)) return null
  return (
    <span>
      {card('spread')} <span className={plain ? 'font-semibold tabular-nums' : `font-semibold tabular-nums ${colors[spreadTier(value)]}`}>{value}</span>
    </span>
  )
}
