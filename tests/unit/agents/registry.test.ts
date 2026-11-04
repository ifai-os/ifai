import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { launchedOperations, operations } from '@/modules/agents/operations'
import { readCursor, writeCursor } from '@/modules/agents/operations/news'
import { isWrite, methodOf } from '@/modules/agents/operations/types'

describe('the operations', () => {
  it('have their own names, tools, and methods and paths', () => {
    for (const values of [
      operations.map((operation) => operation.name),
      operations.map((operation) => operation.tool),
      operations.map((operation) => `${methodOf(operation)} ${operation.path}`),
    ]) {
      expect(new Set(values).size, values.join()).toBe(values.length)
    }
  })

  it('write only with a read-and-write key, and read with GET (docs/specs/agents.md「写操作」)', () => {
    for (const operation of operations) {
      expect(isWrite(operation), operation.tool).toBe(operation.auth === 'write')
      if (operation.creates) expect(methodOf(operation), operation.tool).toBe('POST')
      if (operation.hints?.destructive) expect(methodOf(operation), operation.tool).toBe('DELETE')
      // A write's body carries its fields; a DELETE has only its path, and a language.
      if (methodOf(operation) === 'DELETE') {
        const fields = Object.keys(operation.input.shape).filter((name) => !operation.path.includes(`{${name}}`))
        expect(fields, operation.tool).toEqual(['lang'])
      }
    }
  })

  it('name every path parameter in their input, and read in a language', () => {
    for (const operation of operations) {
      for (const [, name] of operation.path.matchAll(/\{(\w+)\}/g)) expect(operation.input.shape, `${operation.tool} {${name}}`).toHaveProperty(name)
      expect(operation.input.shape, operation.tool).toHaveProperty('lang')
    }
  })

  it('are tools an agent can pick from their names and descriptions', () => {
    for (const operation of operations) {
      expect(operation.tool).toMatch(/^[a-z][a-z_]{2,40}$/)
      expect(operation.description.length, operation.tool).toBeGreaterThan(60)
      expect(() => z.toJSONSchema(operation.input, { io: 'input' }), operation.tool).not.toThrow()
    }
  })

  it('come with their modules’ phases (rule 2)', () => {
    const tools = (phase: 1 | 2 | 3) => launchedOperations(phase).map((operation) => operation.tool)
    expect(tools(1)).toEqual(expect.arrayContaining(['search', 'list_news', 'read_news', 'list_apps', 'read_app', 'list_skills', 'read_skill']))
    for (const later of ['list_articles', 'read_article', 'list_circles', 'circle_posts', 'model_rankings']) expect(tools(1)).not.toContain(later)
    expect(tools(2)).toEqual(expect.arrayContaining(['list_articles', 'read_article', 'list_circles', 'circle_posts']))
    expect(tools(2)).not.toContain('model_rankings')
    expect(tools(3)).toContain('model_rankings')
    // Saving and following are there from the start; posting comes with the circles.
    expect(tools(1)).toEqual(expect.arrayContaining(['whoami', 'save', 'follow']))
    for (const later of ['create_post', 'delete_post', 'react', 'report_post']) expect(tools(1)).not.toContain(later)
    expect(tools(2)).toEqual(expect.arrayContaining(['create_post', 'delete_post', 'react', 'report_post']))
  })
})

describe('news cursors', () => {
  it('carry the last story’s time and id', () => {
    const cursor = writeCursor({ publishedAt: '2026-11-02T13:09:13.676+08:00', id: 2 })
    expect(cursor).toBe('2026-11-02T05:09:13.676Z_2')
    expect(readCursor(cursor)).toEqual({ publishedAt: '2026-11-02T05:09:13.676Z', id: 2 })
  })

  it('refuse anything else', () => {
    for (const value of ['', 'x', '2026-11-02T05:09:13.676Z', '2026-11-02T05:09:13.676Z_0', '2026-11-02T05:09:13.676Z_01', '2026-13-45T99:99:99Z_3', '2026-11-02_3']) {
      expect(readCursor(value), value).toBeNull()
    }
  })
})
