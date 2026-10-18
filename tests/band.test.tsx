import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { ModelCompleteResult, On, PromptEditInput, PromptEditResult } from 'claude-code'

import { PAUSE_MS, POLL_MS } from '../hooks/register'

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
  /** When set, the judge model fails with this instead of answering. */
  failure: ModelCompleteResult | null
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
    failure: null,
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
    const value: ModelCompleteResult = w.failure ?? { isAnswered: true, text: w.reply(), usage }
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
    test(`${surface}: draws the verdict with a Switch button when the task wants another tier`, async ($, on) => {
      const w = world(on, 'claude-opus-5-5')
      w.reply = () => '{"tier":"haiku","reason":"one-line typo fix"}'
      const ui = await mount($, surface)
      await type($, 'fix the typo in the README')
      await w.clock.advance(PAUSE_MS)

      expect((await ui.find({ type: 'Text', text: 'haiku' }))?.text).toBe('haiku')
      expect((await ui.find({ type: 'Text', text: /typo/ }))?.text).toBe('one-line typo fix')
      expect(await ui.find({ key: 'switch' })).toBeDefined()
      expect(await ui.find({ key: 'hide' })).toBeDefined()
    })

    test(`${surface}: a covered verdict shows without a Switch button`, async ($, on) => {
      const w = world(on, 'claude-haiku-5-5')
      w.reply = () => '{"tier":"haiku","reason":"one-line typo fix"}'
      const ui = await mount($, surface)
      await type($, 'fix the typo in the README')
      await w.clock.advance(PAUSE_MS)

      expect((await ui.find({ type: 'Text', text: 'haiku' }))?.text).toBe('haiku')
      expect((await ui.find({ type: 'Text', text: /covered/ }))?.text).toBe('one-line typo fix · covered by haiku')
      expect(await ui.find({ key: 'switch' })).toBeUndefined()
    })

    test(`${surface}: fable covers an opus-grade task`, async ($, on) => {
      const w = world(on, 'claude-fable-5-1')
      w.reply = () => '{"tier":"opus","reason":"hard concurrency bug"}'
      const ui = await mount($, surface)
      await type($, 'there is a race condition in the job queue, find the root cause')
      await w.clock.advance(PAUSE_MS)

      expect((await ui.find({ type: 'Text', text: /covered/ }))?.text).toBe('hard concurrency bug · covered by fable')
      expect(await ui.find({ key: 'switch' })).toBeUndefined()
    })

    test(`${surface}: show=when-different hides a covered verdict entirely`, { options: { show: 'when-different' } }, async ($, on) => {
      const w = world(on, 'claude-haiku-5-5')
      w.reply = () => '{"tier":"haiku","reason":"one-line typo fix"}'
      const ui = await mount($, surface)
      await type($, 'fix the typo in the README')
      await w.clock.advance(PAUSE_MS)

      expect(await ui.find({ type: 'Text', text: 'haiku' })).toBeUndefined()
      expect(await ui.find({ key: 'hide' })).toBeUndefined()
    })

    test(`${surface}: Hide removes the band until the hint changes`, { options: { engine: 'rules' } }, async ($, on) => {
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

    test(`${surface}: submitting clears the hint`, { options: { engine: 'rules' } }, async ($, on) => {
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

      // Before the pause: no tier shown, only that the model is reading, and no call yet.
      expect(await ui.find({ type: 'Text', text: 'sonnet' })).toBeUndefined()
      expect((await ui.find({ type: 'Text', text: /reading/ }))?.text).toBe('reading the draft...')
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

  test('no tier is shown while the model reads', async ($, on) => {
    const w = world(on, 'claude-opus-5-5')
    w.reply = () => '{"tier":"haiku","reason":"one-line typo fix"}'
    const ui = await mount($, 'terminal')
    await type($, 'fix the typo in the README')
    expect((await ui.find({ type: 'Text', text: /reading/ }))?.text).toBe('reading the draft...')
    expect(await ui.find({ type: 'Text', text: 'haiku' })).toBeUndefined()
    expect(await ui.find({ key: 'switch' })).toBeUndefined()

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

  test('a failed model pass is named in the band, not left on reading', async ($, on) => {
    const w = world(on, 'claude-opus-5-5')
    w.failure = { isAnswered: false, reason: 'api-error', status: 429, error: 'rate_limit', usage }
    const ui = await mount($, 'terminal')
    await type($, 'fix the typo in the README')
    await w.clock.advance(PAUSE_MS)

    // The rules' guess stands in, labelled as such.
    expect((await ui.find({ type: 'Text', text: /judge/ }))?.text).toContain("(judge API error, rules' guess)")
    expect((await ui.find({ type: 'Text', text: 'haiku' }))?.text).toBe('haiku')

    // The next edit clears the note and tries again.
    await type($, 'fix the typo in the README now')
    expect(await ui.find({ type: 'Text', text: /judge/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: /reading/ }))?.text).toBe('reading the draft...')
  })

  test('without a band, the status line under the prompt carries the hint', async ($, on) => {
    const w = world(on, 'claude-fable-5-1')
    w.reply = () => '{"tier":"opus","reason":"open-ended, huge scope"}'
    const status: (string | undefined)[] = []
    on('ui.status', (_$, e) => {
      status.push(e.text)
      return { value: undefined }
    })
    on('prompt.submit', (_$, e) => ({ text: e.text }))

    await type($, 'i need to build a AAA video game similar to GTA 5')
    expect(status.at(-1)).toBe('model-hint: reading the draft...')

    await w.clock.advance(PAUSE_MS)
    expect(status.at(-1)).toBe('model-hint: opus · open-ended, huge scope · covered by fable')

    await $.prompt.submit({ text: 'x', wait: false, origin: { kind: 'composer' } })
    expect(status.at(-1)).toBeUndefined()
  })

  test('without a band, an uncovered verdict names the /model command', { options: { engine: 'rules' } }, async ($, on) => {
    world(on, 'claude-opus-5-5')
    const status: (string | undefined)[] = []
    on('ui.status', (_$, e) => {
      status.push(e.text)
      return { value: undefined }
    })

    await type($, 'fix the typo in the README')
    expect(status.at(-1)).toBe('model-hint: haiku · mechanical edit, short ask · /model haiku to switch')
  })

  test('once a band has drawn, the status line is cleared and left alone', { options: { engine: 'rules' } }, async ($, on) => {
    world(on, 'claude-opus-5-5')
    const status: (string | undefined)[] = []
    on('ui.status', (_$, e) => {
      status.push(e.text)
      return { value: undefined }
    })
    const ui = await mount($, 'terminal')
    expect(status).toEqual([undefined])

    await type($, 'fix the typo in the README')
    expect((await ui.find({ type: 'Text', text: 'haiku' }))?.text).toBe('haiku')
    expect(status).toEqual([undefined])
  })

  test('a draft judged once is answered from the cache, without a call', async ($, on) => {
    const w = world(on, 'claude-opus-5-5')
    w.reply = () => '{"tier":"haiku","reason":"one-line typo fix"}'
    const ui = await mount($, 'terminal')
    await type($, 'fix the typo in the README')
    await w.clock.advance(PAUSE_MS)
    expect(w.asked).toHaveLength(1)

    await type($, 'fix the typo in the README and the LICENSE')
    await type($, 'fix the typo in the README')
    // Back on a judged draft: the verdict is there at once, no timer, no call.
    expect((await ui.find({ type: 'Text', text: /typo/ }))?.text).toBe('one-line typo fix')
    await w.clock.advance(PAUSE_MS * 3)
    expect(w.asked).toHaveLength(1)
  })

  test('on a surface that raises no prompt.edit, the draft is read on a timer', async ($, on) => {
    const w = world(on, 'claude-sonnet-5-5')
    w.reply = () => '{"tier":"opus","reason":"open-ended, huge scope"}'
    on('session.attach', (_$, e) => ({ clientId: e.clientId }))
    const ui = await $.ui.mount({ plugin: 'model-hint', surface: 'vscode', component: 'AbovePrompt', props: bandProps })
    await $.session.attach({ surface: 'vscode', clientId: 'panel' })

    // The panel changes the draft without raising prompt.edit.
    w.box = { text: 'i need to build a AAA video game similar to GTA 5', cursor: 0 }
    await w.clock.advance(POLL_MS)
    expect((await ui.find({ type: 'Text', text: /reading/ }))?.text).toBe('reading the draft...')

    await w.clock.advance(PAUSE_MS)
    expect(w.asked).toEqual(['i need to build a AAA video game similar to GTA 5'])
    expect((await ui.find({ type: 'Text', text: 'opus' }))?.text).toBe('opus')

    // An unchanged draft is not judged again.
    await w.clock.advance(POLL_MS * 5)
    expect(w.asked).toHaveLength(1)
  })

  test('the first prompt.edit switches the timer off', async ($, on) => {
    const w = world(on, 'claude-sonnet-5-5')
    on('session.attach', (_$, e) => ({ clientId: e.clientId }))
    await mount($, 'terminal')
    await $.session.attach({ surface: 'desktop', clientId: 'app' })
    await type($, 'add a --verbose flag to the CLI')
    await w.clock.advance(PAUSE_MS)
    expect(w.asked).toHaveLength(1)

    // With edits arriving, a draft changed behind the box's back is not polled.
    w.box = { text: 'a draft only a poller would see', cursor: 0 }
    await w.clock.advance(POLL_MS * 5)
    expect(w.asked).toHaveLength(1)
  })

  test('/model-hint off stops the model calls, not only the band', async ($, on) => {
    const w = world(on, 'claude-sonnet-5-5')
    on('command.run', () => ({ text: '' }))
    const ui = await mount($, 'terminal')
    const toggle = { command: 'model-hint', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } } as const
    const off = await $.command.run(toggle)
    expect(off.text).toBe('Model hint off for this session.')

    await type($, 'i need to build a AAA video game similar to GTA 5')
    await w.clock.advance(PAUSE_MS * 5)
    expect(w.asked).toEqual([])
    expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)

    await $.command.run(toggle)
    await type($, 'i need to build a AAA video game similar to GTA 5')
    await w.clock.advance(PAUSE_MS)
    expect(w.asked).toHaveLength(1)
  })

  test('a draft that looks like a secret is never sent, and the band says why', async ($, on) => {
    const w = world(on, 'claude-opus-5-5')
    const ui = await mount($, 'terminal')
    await type($, ['why does this key fail: sk', '-an', 't-api03-', 'q'.repeat(30)].join(''))
    await w.clock.advance(PAUSE_MS * 5)

    expect(w.asked).toEqual([])
    expect((await ui.find({ type: 'Text', text: /secret/ }))?.text).toContain("(not sent, looks like a secret, rules' guess)")
  })

  test('the Switch button is hidden while a turn is running', async ($, on) => {
    const w = world(on, 'claude-opus-5-5')
    w.reply = () => '{"tier":"haiku","reason":"one-line typo fix"}'
    const ui = await $.ui.mount({ plugin: 'model-hint', surface: 'terminal', component: 'AbovePrompt', props: { ...bandProps, isWorking: true } })
    await type($, 'fix the typo in the README')
    await w.clock.advance(PAUSE_MS)

    expect((await ui.find({ type: 'Text', text: 'haiku' }))?.text).toBe('haiku')
    expect(await ui.find({ key: 'switch' })).toBeUndefined()
  })

  test('engine: rules never calls the model', { options: { engine: 'rules' } }, async ($, on) => {
    const w = world(on, 'claude-opus-5-5')
    const ui = await mount($, 'terminal')
    await type($, 'fix the typo in the README')
    await w.clock.advance(PAUSE_MS * 5)

    expect(w.asked).toEqual([])
    expect(await ui.find({ type: 'Text', text: /reading/ })).toBeUndefined()
    expect((await ui.find({ type: 'Text', text: 'haiku' }))?.text).toBe('haiku')
    expect((await ui.find({ type: 'Text', text: /mechanical/ }))?.text).toContain('mechanical edit')
  })

  test('bias: cost holds a borderline ask on sonnet', { options: { bias: 'cost', engine: 'rules' } }, async ($, on) => {
    world(on, 'claude-opus-5-5')
    const ui = await mount($, 'terminal')
    await type($, 'investigate why the nightly build is broken')

    expect((await ui.find({ type: 'Text', text: 'sonnet' }))?.text).toBe('sonnet')
  })
})
