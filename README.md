# model-hint

A Claude Code mod that reads the prompt as you type and suggests the model tier the task wants, in a band above the prompt. No model call, no token cost: the hint comes from a small, explainable set of signals in the text, and it updates on every edit.

```
opus  architecture or large refactor, wide scope   [ Switch to opus ]  [ Hide ]
┌──────────────────────────────────────────────────────────────────────────────┐
│ > refactor the auth module across the whole codebase to use the new session  │
└──────────────────────────────────────────────────────────────────────────────┘
```

The band stays out of the way by default: it draws only when the suggested tier is not the one the session is on, and it clears when you submit.

## Install

```
/plugin install model-hint --marketplace hashswingingslasher/model-hint
```

Answer `y` to add the marketplace, then pick a scope. The band is live in that session from then on. Needs a Claude Code build with function hooks (mods), 2.1.296 or later.

To run it from a checkout instead:

```
claude --plugin-dir /path/to/model-hint
```

## What it does

| Draft | Hint | Why |
| :- | :- | :- |
| `fix the typo in the README` | haiku | mechanical edit, short ask |
| `add a --verbose flag to the CLI and log the resolved config` | sonnet | ordinary coding task |
| `there is a race condition in the job queue, find the root cause` | opus | hard bug class |
| `compare the trade-offs of event sourcing here and recommend one` | opus | needs judgment |
| a numbered list of three or more steps | opus | multi-step |
| `/model opus`, `!git status`, an empty box | nothing | the model never sees it |

Each signal has a weight. The weights sum to a score; below one threshold the hint is haiku, above the other it is opus, between them sonnet. The band shows the two strongest signals behind the pick, so you can see why it said what it said. The full list is in [hooks/classify.ts](hooks/classify.ts).

A session on Fable counts as covering an opus hint, so the band does not ask you to step down.

**Switch to &lt;tier&gt;** changes the session's model through the `/config` Model row. Where that row is not available or is locked by policy, the button shows a toast with the `/model` command to type instead. **Hide** closes the band until the hint changes or you submit. `s` and `h` press them while the band has focus (`ctrl+x tab`).

`/model-hint` turns the band off and on for the session.

## Options

Set in `/config` under the plugin's rows, or at install.

| Option | Values | Default | Effect |
| :- | :- | :- | :- |
| `show` | `when-different`, `always` | `when-different` | Draw the band only when the hint differs from the session's model, or for every draft |
| `bias` | `balanced`, `cost`, `quality` | `balanced` | Moves the two thresholds. `cost` needs more evidence before suggesting opus; `quality` needs less |

## How it is built

Three hooks and one render site, all in [hooks/register.tsx](hooks/register.tsx):

- `prompt.edit` fires on each edit the composer makes. The hook lets the edit through, classifies the draft that results, and writes the hint to `$.state` only when it changed, so typing inside a stable classification never redraws.
- `prompt.fill` covers a draft another plugin wrote into the box, which raises no edit.
- `prompt.submit` clears the hint.
- `ui.render` on `AbovePrompt` reads the hint, the session's model and the Hide state and draws the band, or yields to the engine.

[hooks/classify.ts](hooks/classify.ts) is pure and has no engine dependency; [hooks/model.ts](hooks/model.ts) maps a model id to a tier. The `$.state` contract is in [types/index.d.ts](types/index.d.ts).

## Development

```
claude plugin validate .   # manifest, hooks module, state contract
claude plugin test .       # tests/*.test.ts against the engine's own runtime
npm install && npm run typecheck
```

`tsc` needs the API declarations the engine lays in `.claude-plugin/types/` the first time it loads the mod from this folder (`claude --plugin-dir .`). They are gitignored.

Tests cover the classifier on its own, the model-id mapping, and the band on both the terminal and desktop surfaces: it draws when the tier differs, stays quiet when covered, hides and comes back, and clears on submit.

## Limits

- Heuristic, not a model. It reads words and shape, not intent. Treat it as a nudge, and tune the lists in `classify.ts` to your own vocabulary.
- It knows three tiers. Provider-specific ids are mapped by the substring `haiku`, `sonnet`, `opus` or `fable`; anything else is treated as unknown and the band always shows.
- The switch button depends on the `/config` Model row, which policy can lock.

## License

MIT
