import { describe, expect, test } from 'claude-code/testing'

import { classify, countSteps, isSkippable } from '../hooks/classify'

describe('classify', () => {
  test('nothing typed, a slash command or a shell escape gives no hint', () => {
    expect(classify('')).toBeNull()
    expect(classify('   ')).toBeNull()
    expect(classify('/model opus')).toBeNull()
    expect(classify('!git status')).toBeNull()
  })

  test('mechanical edits land on haiku', () => {
    for (const draft of [
      'fix the typo in the README',
      'rename foo to bar in this file',
      'run the tests',
      'what does parseArgs do?',
      'add a comment above this function',
    ]) {
      const hint = classify(draft)
      expect(hint?.tier).toBe('haiku')
      expect(hint?.reasons[0]).toBe('mechanical edit')
    }
  })

  test('an ordinary coding ask lands on sonnet', () => {
    const hint = classify('add a --verbose flag to the CLI and print the resolved config when it is set')
    expect(hint?.tier).toBe('sonnet')
    expect(hint?.reasons).toEqual(['ordinary coding task'])
  })

  test('architecture, hard bugs and wide scope land on opus', () => {
    expect(classify('refactor the auth module across the whole codebase to use the new session store')?.tier).toBe('opus')
    expect(classify('there is a race condition in the job queue, find the root cause')?.tier).toBe('opus')
    expect(classify('compare the trade-offs of moving to event sourcing and recommend an approach')?.tier).toBe('opus')
  })

  test('untangling a codebase while debugging is opus, not sonnet', () => {
    const hint = classify('fix errors in codebase where there are multiple features which need to be separated and made modular while debugging.')
    expect(hint?.tier).toBe('opus')
    expect(hint?.reasons).toEqual(['architecture or large refactor', 'wide scope'])
  })

  test('a long multi-step brief lands on opus even without keywords', () => {
    const brief = [
      '1. read the current import pipeline',
      '2. add a dry-run mode that reports what would change',
      '3. make the writer idempotent',
      '4. update the docs',
    ].join('\n')
    const hint = classify(brief)
    expect(hint?.tier).toBe('opus')
    expect(hint?.reasons).toContain('multi-step')
  })

  test('bias moves the thresholds without changing the score', () => {
    const draft = 'investigate why the nightly build is broken'
    const balanced = classify(draft, 'balanced')
    const cost = classify(draft, 'cost')
    const quality = classify(draft, 'quality')
    expect(balanced?.score).toBe(cost?.score)
    expect(balanced?.score).toBe(quality?.score)
    expect(cost?.tier).toBe('sonnet')
    expect(quality?.tier).toBe('opus')
  })

  test('reasons explain the pick, strongest signal first, at most two', () => {
    const hint = classify('redesign the entire billing system, then migrate every tenant')
    expect(hint?.tier).toBe('opus')
    expect(hint?.reasons).toHaveLength(2)
    expect(hint?.reasons[0]).toBe('architecture or large refactor')
  })
})

describe('countSteps', () => {
  test('counts numbered items, bullets and chained clauses', () => {
    expect(countSteps('do it')).toBe(1)
    expect(countSteps('a, then b, then c')).toBe(3)
    expect(countSteps('- one\n- two\n- three\n- four')).toBe(4)
    expect(countSteps('1) x\n2) y')).toBe(2)
  })
})

describe('isSkippable', () => {
  test('leading whitespace does not hide a command', () => {
    expect(isSkippable('  /help')).toBe(true)
    expect(isSkippable('  ! ls')).toBe(true)
    expect(isSkippable('ask about /help')).toBe(false)
  })
})
