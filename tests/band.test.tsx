import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { ModelCompleteResult, On, PromptEditInput, PromptEditResult } from 'claude-code'

import { PAUSE_MS } from '../hooks/register'

const SURFACES = ['terminal', 'desktop'] as const

const bandProps = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 6,
  bodyColumns: 100,
  scroll: { offset: 0, bodyRows: 6 },
  view: {},
}

type World = {
  clock: ReturnType<typeof mock.clock>
  box: { text: string; cursor: number }
  /** Every draft the judge model was asked about, in order. */
  asked: string[]
  /** What the judge model answers next; a function may also move the box, to stage a stale verdict. */
  reply: () => string
}

const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

/**
 * Answers the engine calls the mod makes beneath the test: the box after an
 * edit and on read, the session's model, the clock, and the judge model.
 */
function world(on: On, model: string): World {
  const w: World = {
    clock: mock.clock(on),
    box: { text: '', cursor: 0 },
    asked: [],
    reply: () => '{"tier":"sonnet","reason":"ordinary"}',
  }
  on('prompt.edit', (_$, e) => {
    const text = e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end)
    w.box = { text, cursor: e.start + e.inputText.length }
    return w.box
  })
  on('prompt.read', () => ({ value: w.box }))
  on('session.model', () => ({ value: model }))
  on('ui.render', () => ({ type: 'engine', ref: 0 }))
  on('model.complete', (_$, e) => {
    w.asked.push(e.prompt)
    const value: ModelCompleteResult = { isAnswered: true, text: w.reply(), usage }
    return { value }
  })
  return w
}

/**
 * Types `text` into an empty box the way the composer raises it: one edit,
 * inserted at 0. The kit's `$` types only the events a plugin can call, and
 * `prompt.edit` is the composer's alone, so it is reached by name here.
 */
function type($: Engine, text: string) {
  const raise = ($.prompt as unknown as { edit: (e: PromptEditInput) => Promise<PromptEditResult> }).edit
  return raise({ origin: { kind: 'composer' }, text: '', cursor: 0, start: 0, end: 0, inputText: text })
}

async function mount($: Engine, surface: (typeof SURFACES)[number]) {
  return $.ui.mount({ plugin: 'model-hint', surface, component: 'AbovePrompt', props: bandProps })
}

describe('band', () => {
  for (const surface of SURFACES) {
    test(`${surface}: draws the hint when the task wants another tier`, async ($, on) => {
      world(on, 'claude-opus-5-5')
      const ui = await mount($, surface)
      await type($, 'fix the typo in the README')

      expect((await ui.find({ type: 'Text', text: 'haiku' }))?.text).toBe('haiku')
      expect((await ui.find({ type: 'Text', text: /mechanical/ }))?.text).toContain('mechanical edit')
      expect(await ui.find({ key: 'switch' })).toBeDefined()
      expect(await ui.find({ key: 'hide' })).toBeDefined()
    })

    test(`${surface}: stays quiet while the session's model already covers the task`, async ($, on) => {
      world(on, 'claude-haiku-5-5')
      const ui = await mount($, surface)
      await type($, 'fix the typo in the README')

      expect(await ui.find({ type: 'Text', text: 'haiku' })).toBeUndefined()
    })

    test(`${surface}: fable covers an opus-grade task`, async ($, on) => {
      world(on, 'claude-fable-5-1')
      const ui = await mount($, surface)
      await type($, 'there is a race condition in the job queue, find the root cause')

      expect(await ui.find({ type: 'Text', text: 'opus' })).toBeUndefined()
    })

    test(`${surface}: Hide removes the band until the hint changes`, async ($, on) => {
      world(on, 'claude-haiku-5-5')
      const ui = await mount($, surface)
      await type($, 'add a --verbose flag to the CLI and log the resolved config when it is set')
      expect(await ui.find({ type: 'Text', text: 'sonnet' })).toBeDefined()
      await ui.press({ key: 'hide' })
      expect(await ui.find({ type: 'Text', text: 'sonnet' })).toBeUndefined()

      // Same tier and reasons: still hidden.
      await type($, 'add a --verbose flag to the CLI and log the resolved config when it is set please')
      expect(await ui.find({ type: 'Text', text: 'sonnet' })).toBeUndefined()

      // A different hint comes back.
      await type($, 'refactor the auth module across the whole codebase to use the new session store')
      expect((await ui.find({ type: 'Text', text: 'opus' }))?.text).toBe('opus')
      expect((await ui.find({ type: 'Text', text: /refactor/ }))?.text).toContain('refactor')
    })

    test(`${surface}: submitting clears the hint`, async ($, on) => {
      world(on, 'claude-opus-5-5')
      on('prompt.submit', (_$, e) => ({ text: e.text }))
      const ui = await mount($, surface)
      await type($, 'fix the typo in the README')
      expect(await ui.find({ type: 'Text', text: 'haiku' })).toBeDefined()

      await $.prompt.submit({ text: 'fix the typo in the README', wait: false, origin: { kind: 'composer' } })
      expect(await ui.find({ type: 'Text', text: 'haiku' })).toBeUndefined()
    })

    test(`${surface}: the model's verdict replaces the rules' after a pause`, async ($, on) => {
      const w = world(on, 'claude-sonnet-5-5')
      w.reply = () => '{"tier":"opus","reason":"open-ended, huge scope"}'
      const ui = await mount($, surface)
      const draft = 'i need to build a AAA video game similar to GTA 5 in volume and playability.'
      await type($, draft)

      // Rules alone: sonnet, which the session covers, so nothing drawn, and no model call yet.
      expect(await ui.find({ type: 'Text', text: 'sonnet' })).toBeUndefined()
      expect(w.asked).toEqual([])

      await w.clock.advance(PAUSE_MS)
      expect(w.asked).toEqual([draft])
      expect((await ui.find({ type: 'Text', text: 'opus' }))?.text).toBe('opus')
      expect((await ui.find({ type: 'Text', text: /huge scope/ }))?.text).toBe('open-ended, huge scope')
    })

    test(`${surface}: a slash command draws nothing`, async ($, on) => {
      world(on, 'claude-opus-5-5')
      const ui = await mount($, surface)
      await type($, '/model haiku')

      expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
    })
  }

  test('typing again before the pause cancels the model pass', async ($, on) => {
    const w = world(on, 'claude-opus-5-5')
    await mount($, 'terminal')
    await type($, 'add a --verbose flag to the CLI and log the')
    await w.clock.advance(PAUSE_MS - 1)
    await type($, 'add a --verbose flag to the CLI and log the resolved config')
    await w.clock.advance(PAUSE_MS - 1)
    expect(w.asked).toEqual([])

    await w.clock.advance(1)
    expect(w.asked).toEqual(['add a --verbose flag to the CLI and log the resolved config'])
  })

  test('a verdict for a draft that has moved on is dropped', async ($, on) => {
    const w = world(on, 'claude-sonnet-5-5')
    w.reply = () => {
      w.box = { text: 'something else entirely', cursor: 0 }
      return '{"tier":"opus","reason":"stale"}'
    }
    const ui = await mount($, 'terminal')
    await type($, 'add a --verbose flag to the CLI and log the resolved config')
    await w.clock.advance(PAUSE_MS)

    expect(w.asked).toHaveLength(1)
    expect(await ui.find({ type: 'Text', text: 'opus' })).toBeUndefined()
  })

  test('the band says the rules are provisional while the model reads', async ($, on) => {
    const w = world(on, 'claude-opus-5-5')
    w.reply = () => '{"tier":"haiku","reason":"one-line typo fix"}'
    const ui = await mount($, 'terminal')
    await type($, 'fix the typo in the README')
    expect((await ui.find({ type: 'Text', text: /reading/ }))?.text).toContain('(reading...)')

    await w.clock.advance(PAUSE_MS)
    expect(await ui.find({ type: 'Text', text: /reading/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /typo/ }))?.text).toBe('one-line typo fix')
  })

  test('a model verdict is kept while the person keeps typing', async ($, on) => {
    const w = world(on, 'claude-sonnet-5-5')
    w.reply = () => '{"tier":"opus","reason":"open-ended, huge scope"}'
    const ui = await mount($, 'terminal')
    await type($, 'i need to build a AAA video game similar to GTA 5')
    await w.clock.advance(PAUSE_MS)
    expect((await ui.find({ type: 'Text', text: 'opus' }))?.text).toBe('opus')

    await type($, 'i need to build a AAA video game similar to GTA 5 in volume')
    expect((await ui.find({ type: 'Text', text: 'opus' }))?.text).toBe('opus')

    // Emptying the box drops it.
    await type($, '')
    expect(await ui.find({ type: 'Text', text: 'opus' })).toBeUndefined()
  })

  test('engine: rules never calls the model', { options: { engine: 'rules' } }, async ($, on) => {
    const w = world(on, 'claude-opus-5-5')
    const ui = await mount($, 'terminal')
    await type($, 'fix the typo in the README')
    await w.clock.advance(PAUSE_MS * 5)

    expect(w.asked).toEqual([])
    expect(await ui.find({ type: 'Text', text: /reading/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: 'haiku' }))?.text).toBe('haiku')
  })

  test('show: always draws the hint even when covered', { options: { show: 'always' } }, async ($, on) => {
    world(on, 'claude-haiku-5-5')
    const ui = await mount($, 'terminal')
    await type($, 'fix the typo in the README')

    expect((await ui.find({ type: 'Text', text: 'haiku' }))?.text).toBe('haiku')
    expect(await ui.find({ key: 'switch' })).toBeUndefined()
  })

  test('bias: cost holds a borderline ask on sonnet', { options: { bias: 'cost' } }, async ($, on) => {
    world(on, 'claude-opus-5-5')
    const ui = await mount($, 'terminal')
    await type($, 'investigate why the nightly build is broken')

    expect((await ui.find({ type: 'Text', text: 'sonnet' }))?.text).toBe('sonnet')
  })
})
