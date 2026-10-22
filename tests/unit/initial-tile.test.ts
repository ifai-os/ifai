import { describe, expect, it } from 'vitest'

import { toneFor } from '@/components/cards/initial-tile'

describe('toneFor', () => {
  it('is stable and within the seven tile tones', () => {
    for (const id of ['chatgpt', 'claude', '多引擎检索', 'ui-review', '']) {
      const tone = toneFor(id)
      expect(tone).toBe(toneFor(id))
      expect(tone).toBeGreaterThanOrEqual(0)
      expect(tone).toBeLessThan(7)
    }
  })
})
