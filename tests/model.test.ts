import { describe, expect, test } from 'claude-code/testing'

import { satisfies, tierOf } from '../hooks/model'

describe('tierOf', () => {
  test('reads aliases, full ids and provider-prefixed ids', () => {
    expect(tierOf('opus')).toBe('opus')
    expect(tierOf('claude-sonnet-5-5')).toBe('sonnet')
    expect(tierOf('us.anthropic.claude-haiku-5-5-v1:0')).toBe('haiku')
    expect(tierOf('claude-fable-5-1')).toBe('fable')
    expect(tierOf('opusplan')).toBe('opus')
  })

  test('an unknown id is null', () => {
    expect(tierOf('gpt-5')).toBeNull()
    expect(tierOf('')).toBeNull()
  })
})

describe('satisfies', () => {
  test('a tier covers itself and fable covers opus', () => {
    expect(satisfies('sonnet', 'sonnet')).toBe(true)
    expect(satisfies('fable', 'opus')).toBe(true)
  })

  test('nothing else is covered', () => {
    expect(satisfies('opus', 'sonnet')).toBe(false)
    expect(satisfies('fable', 'haiku')).toBe(false)
    expect(satisfies(null, 'haiku')).toBe(false)
  })
})
