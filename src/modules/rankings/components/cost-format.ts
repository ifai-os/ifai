import { useFormatter } from 'next-intl'

/** Cost per task in US dollars: cents to two figures, dollars to the cent ($0.0041, $0.15, $6.20). */
export function useCostFormat() {
  const format = useFormatter()
  return (usd: number) =>
    format.number(
      usd,
      usd >= 1
        ? { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }
        : { style: 'currency', currency: 'USD', minimumSignificantDigits: 2, maximumSignificantDigits: 2 },
    )
}
