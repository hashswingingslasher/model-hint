import { describe, expect, test } from 'claude-code/testing'

import { MIN_LENGTH, SEND_LIMIT, looksSecret, parse, request } from '../hooks/judge'

describe('judge.parse', () => {
  test('reads a clean JSON verdict', () => {
    expect(parse('{"tier":"opus","reason":"open-ended, huge scope"}')).toEqual({
      tier: 'opus',
      reasons: ['open-ended, huge scope'],
      score: 0,
      source: 'model',
    })
  })

  test('tolerates prose and fences around the JSON', () => {
    const reply = 'Sure:\n```json\n{ "tier": "haiku", "reason": "one-line rename" }\n```'
    expect(parse(reply)?.tier).toBe('haiku')
  })

  test('fills a missing or empty reason', () => {
    expect(parse('{"tier":"sonnet"}')?.reasons).toEqual(['judged by the model'])
    expect(parse('{"tier":"sonnet","reason":"  "}')?.reasons).toEqual(['judged by the model'])
  })

  test('caps a long reason', () => {
    const long = 'x'.repeat(200)
    expect(parse(`{"tier":"sonnet","reason":"${long}"}`)?.reasons[0]).toHaveLength(60)
  })

  test('rejects an unknown tier, bad JSON, or no JSON', () => {
    expect(parse('{"tier":"gpt","reason":"nope"}')).toBeNull()
    expect(parse('{"tier":')).toBeNull()
    expect(parse('opus')).toBeNull()
    expect(parse('[1]')).toBeNull()
  })
})

describe('judge hardening', () => {
  test('control, zero-width and bidi characters are stripped from the reason', () => {
    const reply = '{"tier":"haiku","reason":"ok\\u001b]52;c;aGk=\\u0007 fix\\u200b\\u202e"}'
    expect(parse(reply)?.reasons[0]).toBe('ok]52;c;aGk= fix')
  })

  test('an oversized or brace-flooded reply is refused quickly', () => {
    const t0 = Date.now()
    expect(parse('{'.repeat(100000))).toBeNull()
    expect(parse('{"tier":"opus","reason":"' + 'x'.repeat(5000) + '"}')).toBeNull()
    expect(Date.now() - t0).toBeLessThan(100)
  })

  test('only the start of a long draft is sent', () => {
    expect(request('x'.repeat(SEND_LIMIT * 25), 'haiku').prompt).toHaveLength(SEND_LIMIT)
    expect(request('short', 'haiku').prompt).toBe('short')
  })

  test('credentials are recognised; ordinary text is not', () => {
    // Built at run time, so secret scanners do not mistake the fixtures for real keys.
    const fake = (prefix: string, body: string) => prefix + body
    for (const secret of [
      fake('sk-ant-', 'api03-' + 'q'.repeat(24)),
      fake('ghp', '_' + 'q'.repeat(36)),
      fake('AKIA', 'Q'.repeat(16)),
      fake('-----BEGIN OPENSSH ', 'PRIVATE KEY-----'),
      fake('xoxb', '-' + '1'.repeat(10) + '-' + 'q'.repeat(10)),
    ]) expect(looksSecret(`please check ${secret} for me`)).toBe(true)
    for (const fine of ['fix the sk- prefix handling', 'rename AKIA to AWS', 'add a private key loader']) {
      expect(looksSecret(fine)).toBe(false)
    }
  })
})

describe('judge.request', () => {
  test('is a bounded, low-effort completion with the draft as the only user text', () => {
    const r = request('build a AAA video game similar to GTA 5', 'haiku')
    expect(r.model).toBe('haiku')
    expect(r.prompt).toBe('build a AAA video game similar to GTA 5')
    expect(r.effort).toBe('low')
    expect(r.maxTokens).toBe(60)
    expect(r.timeoutMs).toBe(8000)
    expect(typeof r.system).toBe('string')
    expect(MIN_LENGTH).toBeGreaterThan(0)
  })
})
