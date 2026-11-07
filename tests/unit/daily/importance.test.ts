import { describe, expect, it } from 'vitest'

import { importanceOf, spreadIndex } from '@/modules/daily/heat/importance'
import { heatScore } from '@/modules/daily/heat/rules'

describe('importance', () => {
  it('gives a SOTA model release the full score', () => {
    expect(importanceOf({ category: 'research', score: 40, sota: true })).toBe(100)
  })

  it('starts from the category and moves one point for every two of AI score', () => {
    expect(importanceOf({ category: 'llm', score: 70, sota: false })).toBe(60)
    expect(importanceOf({ category: 'llm', score: 90, sota: false })).toBe(70)
    expect(importanceOf({ category: 'llm', score: 60, sota: false })).toBe(55)
    expect(importanceOf({ category: 'research', score: null, sota: null })).toBe(30)
    expect(importanceOf({ category: null, score: undefined, sota: undefined })).toBe(45)
    // Only a SOTA release reaches past 95, and nothing drops under 20.
    expect(importanceOf({ category: 'llm', score: 200, sota: false })).toBe(95)
    expect(importanceOf({ category: 'research', score: 0, sota: false })).toBe(20)
  })
})

describe('the reach index', () => {
  const one = heatScore(1)

  it('puts importance under the reach, never below the reach alone', () => {
    expect(spreadIndex(100, one)).toBe(68.8)
    expect(spreadIndex(60, one)).toBe(50.1)
    expect(spreadIndex(30, one)).toBe(36.1)
    expect(spreadIndex(30, 0)).toBe(18)
    for (const reach of [0, 22, 53, 92, 100]) {
      for (const importance of [0, 30, 60, 100]) {
        expect(spreadIndex(importance, reach)).toBeGreaterThanOrEqual(reach)
        expect(spreadIndex(importance, reach)).toBeLessThanOrEqual(100)
      }
    }
  })

  it('ranks a SOTA release above an ordinary story with the same reach', () => {
    expect(spreadIndex(100, one)).toBeGreaterThan(spreadIndex(60, one))
    expect(spreadIndex(100, 92)).toBeGreaterThan(spreadIndex(30, 92))
  })
})
