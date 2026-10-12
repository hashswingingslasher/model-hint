# model-hint

A Claude Code mod that reads the prompt as you type and suggests the model tier the task wants, in a band above the prompt. Two passes: word rules answer on every keystroke for free, then, once you pause for 600 ms, a small model (haiku by default) reads the draft and its verdict replaces the rules'. One short completion per pause, nothing while you are typing.

```
opus  architecture or large refactor, wide scope   [ Switch to opus ]  [ Hide ]
┌──────────────────────────────────────────────────────────────────────────────┐
│ > refactor the auth module across the whole codebase to use the new session  │
└──────────────────────────────────────────────────────────────────────────────┘
```

The band stays out of the way by default: it draws only when the suggested tier is not the one the session is on, and it clears when you submit. Terminal and desktop only; the VS Code panel has no band to draw into.

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
| `i need to build a AAA video game similar to GTA 5` | opus | open-ended, huge scope (from the model) |
| `/model opus`, `!git status`, an empty box | nothing | the model never sees it |

**Rules pass.** Each signal in [hooks/classify.ts](hooks/classify.ts) has a weight. The weights sum to a score; below one threshold the hint is haiku, above the other it is opus, between them sonnet. The band shows the two strongest signals behind the pick, with `(reading...)` after them while the model pass is pending.

**Model pass.** After a pause, the draft goes to the judge model with a fixed system prompt ([hooks/judge.ts](hooks/judge.ts)) that describes the three tiers and asks for `{"tier","reason"}` in at most sixty output tokens at low effort. The verdict lands only if you have not typed since, and it stays on screen while you keep typing, until the next pause re-judges. Drafts under 15 characters, commands and shell escapes are never sent. A failed or malformed reply leaves the rules' hint in place.

A session on Fable counts as covering an opus hint, so the band does not ask you to step down.

**Switch to &lt;tier&gt;** changes the session's model through the `/config` Model row. Where that row is not available or is locked by policy, the button shows a toast with the `/model` command to type instead. **Hide** closes the band until the hint changes or you submit. `s` and `h` press them while the band has focus (`ctrl+x tab`).

`/model-hint` turns the band off and on for the session.

## Options

Set in `/config` under the plugin's rows, or at install.

| Option | Values | Default | Effect |
| :- | :- | :- | :- |
| `engine` | `model`, `rules` | `model` | `rules` turns the model pass off: words only, no completions |
| `judge` | a model alias or id | `haiku` | Which model reads the draft |
| `show` | `when-different`, `always` | `when-different` | Draw the band only when the hint differs from the session's model, or for every draft |
| `bias` | `balanced`, `cost`, `quality` | `balanced` | Moves the two thresholds. `cost` needs more evidence before suggesting opus; `quality` needs less |

## How it is built

Three hooks and one render site, all in [hooks/register.tsx](hooks/register.tsx):

- `prompt.edit` fires on each edit the composer makes. The hook lets the edit through, runs the rules on the draft that results, writes the hint to `$.state` only when it changed, and arms a `$.clock.after` timer for the model pass. Each edit cancels the previous timer and aborts any completion in flight, so at most one model call is ever pending.
- `prompt.fill` covers a draft another plugin wrote into the box, which raises no edit.
- `prompt.submit` clears the hint.
- `ui.render` on `AbovePrompt` reads the hint, the session's model and the Hide state and draws the band, or yields to the engine.

[hooks/classify.ts](hooks/classify.ts) and [hooks/judge.ts](hooks/judge.ts) are pure and have no engine dependency; [hooks/model.ts](hooks/model.ts) maps a model id to a tier. The `$.state` contract is in [types/index.d.ts](types/index.d.ts).

## Development

```
claude plugin validate .   # manifest, hooks module, state contract
claude plugin test .       # tests/*.test.ts against the engine's own runtime
npm install && npm run typecheck
```

`tsc` needs the API declarations the engine lays in `.claude-plugin/types/` the first time it loads the mod from this folder (`claude --plugin-dir .`). They are gitignored.

Tests cover the rules on their own, the judge's prompt and reply parsing, the model-id mapping, and the band on both the terminal and desktop surfaces: it draws when the tier differs, stays quiet when covered, hides and comes back, clears on submit, takes the model's verdict after the pause, cancels the pass when typing resumes, and drops a verdict for a draft that moved on. The judge model and the clock are mocked.

## Limits

- The rules pass reads words, not intent, and is only there to answer instantly. The model pass is the real judgment, and it costs one small completion per pause; set `engine` to `rules` to avoid that.
- It knows three tiers. Provider-specific ids are mapped by the substring `haiku`, `sonnet`, `opus` or `fable`; anything else is treated as unknown and the band always shows.
- The switch button depends on the `/config` Model row, which policy can lock.

## License

MIT
