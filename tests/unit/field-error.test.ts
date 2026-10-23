import { ValidationError } from 'payload'
import { describe, expect, it } from 'vitest'

import { isFieldError, rejectField } from '@/lib/field-error'

function caught(run: () => void): unknown {
  try {
    run()
  } catch (error) {
    return error
  }
  throw new Error('did not throw')
}

describe('rejectField', () => {
  it('throws a ValidationError on the field whose own message is the note', () => {
    const error = caught(() => rejectField('subscribers', 'status', '站长只能停发。'))
    expect(error).toBeInstanceOf(ValidationError)
    expect((error as ValidationError).message).toBe('站长只能停发。')
    expect((error as ValidationError).status).toBe(400)
    expect((error as ValidationError).data).toMatchObject({ collection: 'subscribers', errors: [{ path: 'status', message: '站长只能停发。' }] })
  })
})

describe('isFieldError', () => {
  it('reads the field from the error shape', () => {
    expect(isFieldError(caught(() => rejectField('skill-submissions', 'code', 'taken')), 'code')).toBe(true)
    expect(isFieldError(caught(() => rejectField('skill-submissions', 'code', 'taken')), 'repository')).toBe(false)
  })

  it('knows the other copy of payload by shape, not by class', () => {
    const fromOtherCopy = Object.assign(new Error('The following field is invalid: code'), { data: { errors: [{ path: 'code' }] } })
    expect(isFieldError(fromOtherCopy, 'code')).toBe(true)
  })

  it('is false for anything else', () => {
    expect(isFieldError(new Error('boom'), 'code')).toBe(false)
    expect(isFieldError(null, 'code')).toBe(false)
    expect(isFieldError({ data: { errors: 'code' } }, 'code')).toBe(false)
    expect(isFieldError({ data: { errors: [null] } }, 'code')).toBe(false)
  })
})
