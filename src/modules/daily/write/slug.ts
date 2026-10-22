/** URL slugs are English and shared by all five languages (docs/specs/daily.md rule 2). */
export const SLUG_MAX_LENGTH = 80

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '')
}

/** The model's slug when usable, else one from the English title, else one from the id. */
export function storySlug(suggested: string, englishTitle: string, itemId: number): string {
  return slugify(suggested) || slugify(englishTitle) || `story-${itemId}`
}
