import { describe, expect, it } from 'vitest'
import { CAPTIONS } from './copy'

describe('legendas de filme', () => {
  it.each(Object.entries(CAPTIONS))('%s tem no máximo 60 caracteres', (_k, text) => {
    expect(text.length).toBeLessThanOrEqual(60)
  })
})
