import { missingFrom, tokensToVerify, type Verification } from '@/modules/daily/write/verify'
import type { App } from '@/payload-types'

import type { ProfileFacts, WrittenProfile } from '../prompts/profile'

type Pricing = NonNullable<App['pricing']>
type Platform = NonNullable<App['platforms']>[number]

/** A suggestion that was left out because the website's text does not back it. */
export type DroppedFact = { field: 'name' | 'developer' | 'pricing' | 'platforms' | 'categories'; value: string; quote?: string }

export type CheckedFacts = {
  name: string | null
  developer: string | null
  /** Known category slugs, best first, at most three. */
  categories: string[]
  pricing: Pricing | null
  platforms: Platform[]
  dropped: DroppedFact[]
}

/** How quotes and names are matched: NFKC, lower case, straight quotes, no zero-width characters, single spaces. */
function normalized(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** True when the quote (at least three characters, give or take wrapping quote marks) appears in the material. */
export function quoteFound(quote: string, material: string): boolean {
  const needle = normalized(quote).replace(/^["'«「『]+|["'»」』.,;:!?。，；：]+$/gu, '')
  return needle.length >= 3 && normalized(material).includes(needle)
}

/**
 * The facts call's answer, keeping only what the material backs (docs/specs/apps.md: pricing and
 * platforms only from the website; empty when it does not say). The name and maker must appear in
 * the material, and every pricing or platform claim must come with a passage that is really there.
 */
export function checkFacts(facts: ProfileFacts, material: string, categorySlugs: readonly string[]): CheckedFacts {
  const dropped: DroppedFact[] = []

  const name = facts.name.trim()
  const keepName = name && quoteFound(name, material) ? name : null
  if (name && !keepName) dropped.push({ field: 'name', value: name })

  const developer = facts.developer.trim()
  const keepDeveloper = developer && quoteFound(developer, material) ? developer : null
  if (developer && !keepDeveloper) dropped.push({ field: 'developer', value: developer })

  const known = new Set(categorySlugs)
  const categories: string[] = []
  for (const slug of facts.categories.map((value) => value.trim().toLowerCase())) {
    if (!known.has(slug)) dropped.push({ field: 'categories', value: slug })
    else if (!categories.includes(slug)) categories.push(slug)
  }

  let pricing: Pricing | null = null
  if (facts.pricing !== 'unknown') {
    if (quoteFound(facts.pricingQuote, material)) pricing = facts.pricing
    else dropped.push({ field: 'pricing', value: facts.pricing, quote: facts.pricingQuote })
  }

  const platforms: Platform[] = []
  for (const { platform, quote } of facts.platforms) {
    if (platforms.includes(platform)) continue
    if (quoteFound(quote, material)) platforms.push(platform)
    else dropped.push({ field: 'platforms', value: platform, quote })
  }

  return { name: keepName, developer: keepDeveloper, categories: categories.slice(0, 3), pricing, platforms, dropped }
}

/** The parts of one language's profile, each checked as its own text. */
export function profileParts(profile: WrittenProfile): string[] {
  return [
    profile.tagline,
    profile.description,
    ...profile.features.flatMap((feature) => [feature.title, feature.detail]),
    ...profile.faqs.flatMap((faq) => [faq.question, faq.answer]),
    ...profile.tags,
  ].filter(Boolean)
}

/**
 * 原文核对 for profiles: every name and number in each language must be in the website's text.
 * Parts are checked one by one, so the first word of a feature or an answer counts as the start of
 * a sentence, as it reads; each missing token is listed once per language.
 */
export function checkProfiles(profiles: Record<string, WrittenProfile>, material: string): Verification {
  const missing: Verification['missing'] = []
  let checked = 0
  for (const [locale, profile] of Object.entries(profiles)) {
    const listed = new Set<string>()
    for (const part of profileParts(profile)) {
      checked += tokensToVerify(part).length
      for (const token of missingFrom(part, material)) {
        if (listed.has(token)) continue
        listed.add(token)
        missing.push({ locale, token })
      }
    }
  }
  return { ok: missing.length === 0, missing, checked }
}
