# model-hint

[![CI](https://github.com/hashswingingslasher/model-hint/actions/workflows/ci.yml/badge.svg)](https://github.com/hashswingingslasher/model-hint/actions/workflows/ci.yml)

A Claude Code mod that reads the prompt as you type and suggests the model tier the task wants, in a band above the prompt. Two passes: word rules answer on every keystroke for free, then, once you pause for 300 ms, a small model (haiku by default) reads the draft and its verdict replaces the rules'. One short completion per pause, nothing while you are typing.

![model-hint suggesting opus, haiku and sonnet for three drafts in a Claude Code session on Sonnet](https://raw.githubusercontent.com/hashswingingslasher/model-hint/assets/demo.gif)

Recorded live with VHS; the GIF and the script that records it are on the [`assets` branch](https://github.com/hashswingingslasher/model-hint/tree/assets).

While you type it says `reading the draft...`; the verdict lands 1.2 to 1.9 s after you stop typing (a 300 ms pause, then a haiku call that measured 0.9 to 1.6 s). A draft judged once in the session answers instantly from a cache. The Switch button appears only when the session's model does not cover the verdict; a covered one reads `opus  hard concurrency bug · covered by fable`. The band clears when you submit.

## Privacy

With the default `engine: model`, your **unsent draft** leaves your machine. About 300 ms after you stop typing, the first 4,000 characters go to the judge model through Claude Code's own connection: your login, your configured provider (Anthropic, Bedrock, Vertex or a gateway), billed like any request and counted against your plan. Another installed plugin that hooks `model.complete` can see those calls too.

What is never sent:
- drafts that look like a credential (API keys, tokens, private keys); the band shows `not sent, looks like a secret`
- slash commands, `!` shell escapes, `#` memory notes, and drafts under 15 characters
- anything at all after `/model-hint` turns it off for the session

Set `engine` to `rules` and nothing leaves your machine: the hint comes from local word rules only.

The plugin itself makes no network, file or shell calls, and it reads no credentials or environment variables. The judge call goes through Claude Code's own `$.model.complete`, which uses the session's existing login; the plugin never sees it.

## What it changes and what it hooks

It changes one setting, `model`, and only when you press **Switch** (or its `s` hotkey). It writes through the `/config` Model row (`$.config.set({ key: 'model' })`), the same row `/model` uses, so the new model is saved to your user settings (`~/.claude/settings.json`) and becomes the default for later sessions. The toast names the model it replaced. Nothing else is written.

It hooks these events, all read-only except where noted:

| Hook | What it does |
| :- | :- |
| `prompt.edit` | Reads the draft after each edit to classify it. Passes the edit through unchanged. |
| `prompt.fill` | Reads the draft after another plugin fills the box. Passes the fill through unchanged. |
| `prompt.submit` | Clears the hint. Passes the prompt through unchanged and never blocks it. |
| `session.attach`, `session.detach` | Start and stop the 300 ms draft reading on surfaces that send no edits (the VS Code panel). |
| `ui.render` (`AbovePrompt`) | Draws the band, or leaves the engine's own drawing in place. |
| `command.run` (`/model-hint`) | Turns the plugin off and on for the session. |

## Where it runs

| Where | Works | Notes |
| :- | :- | :- |
| Claude Code in a terminal | Yes | Seen working on 2.1.296 and 2.1.299 |
| VS Code, terminal mode | Yes | Same engine as above; setup below |
| VS Code, graphical chat panel | Yes, from extension 2.1.301 | Seen working on 18 Oct 2026. The panel draws the band but sends no keystroke events, so model-hint reads the draft every 300 ms while the panel is attached. Earlier extensions draw nothing ([#99045](https://github.com/anthropics/claude-code/issues/99045)) |
| JetBrains terminal, Claude Code Desktop | Expected | Not yet seen working |
| Windows | Untested | |

**VS Code setup.** On extension 2.1.301 or later the chat panel works once the plugin is installed; nothing else to set up. On older extensions, use terminal mode. It runs whatever `claude` is first on your PATH, and the extension does not install one.

1. Install or upgrade the standalone CLI to 2.1.296 or later (`npm i -g @anthropic-ai/claude-code`), and check `claude --version` in a new terminal.
2. In VS Code settings, turn on `claudeCode.useTerminal`.
3. Install the plugin at user scope (below).
4. Open Claude Code. It now opens in a terminal tab, with the band above the prompt.

Terminal mode keeps inline diffs but gives up the panel's plan review, @-mention chips and click-to-rewind.

## Why not just route automatically

Some tools pick a model for you without saying so. model-hint does the opposite: it tells you which tier it thinks the task needs and why, before you send, and leaves the choice with you. Nothing changes unless you press Switch. When it is wrong, you can see its reason and ignore it.

## Install

```
/plugin install model-hint --marketplace hashswingingslasher/model-hint
```

Answer `y` to add the marketplace, then pick the user scope so it loads in every session. Needs a Claude Code build with function hooks (mods), 2.1.296 or later.

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

**Rules pass.** Each signal in [hooks/classify.ts](hooks/classify.ts) has a weight. The weights sum to a score; below one threshold the hint is haiku, above the other it is opus, between them sonnet. With the model pass on, the rules' guess is never shown as a tier; it stands in only when the model pass fails, labelled `(judge API error, rules' guess)`. With `engine` set to `rules` it is the verdict, with the two strongest signals as the reason.

**Model pass.** After a pause, the draft goes to the judge model with a fixed system prompt ([hooks/judge.ts](hooks/judge.ts)) that describes the three tiers and asks for `{"tier","reason"}` in at most sixty output tokens at low effort. The verdict lands only if you have not typed since, and it stays on screen while you keep typing, until the next pause re-judges. Drafts under 15 characters, commands and shell escapes are never sent. A failed or malformed reply leaves the rules' hint in place.

A session on Fable counts as covering an opus hint, so the band does not ask you to step down.

**Switch to &lt;tier&gt;** changes the model through the `/config` Model row. Like `/model`, this also saves it as your default for later sessions, and a toast says what it was before. It is hidden while Claude is working. Where that row is not available or is locked by policy, the button shows a toast with the `/model` command to type instead. **Hide** closes the band for the prompt you are writing; it comes back when you send it or clear the box. **Off** turns model-hint off for the rest of the session: no band and no model calls. `s`, `h` and `o` press them while the band has focus (`ctrl+x tab`).

`/model-hint` turns it off and on for the session, the same as the Off button. Off stops the model calls too, not only the band.

## Options

Set in `/config` under the plugin's rows, or at install.

| Option | Values | Default | Effect |
| :- | :- | :- | :- |
| `engine` | `model`, `rules` | `model` | `rules` turns the model pass off: words only, no completions |
| `judge` | a model alias or id | `haiku` | Which model reads the draft |
| `show` | `always`, `when-different` | `always` | `when-different` hides the band entirely when the session's model covers the verdict |
| `bias` | `balanced`, `cost`, `quality` | `balanced` | Moves the two thresholds. `cost` needs more evidence before suggesting opus; `quality` needs less |

## How it is built

Three hooks and one render site, all in [hooks/register.tsx](hooks/register.tsx):

- `prompt.edit` fires on each edit the composer makes. The hook lets the edit through, runs the rules on the draft that results, writes the hint to `$.state` only when it changed, and arms a `$.clock.after` timer for the model pass. Each edit cancels the previous timer and aborts any completion in flight, so at most one model call is ever pending.
- `prompt.fill` covers a draft another plugin wrote into the box, which raises no edit.
- `prompt.submit` clears the hint.
- `ui.render` on `AbovePrompt` reads the hint, the session's model and the Hide state and draws the band, or yields to the engine. A failed model pass is logged to the debug log (`claude --debug`) and named in the band.
- `session.attach` starts a 300 ms timer that reads the draft with `$.prompt.read()` when a surface attaches that draws the band but raises no `prompt.edit` (the VS Code panel). The first `prompt.edit` switches the timer off for the session, so the terminal never polls.
- `$.ui.status` mirrors the hint under the prompt until a band has drawn once. It is kept for surfaces not yet checked, such as mobile; it does not help in the VS Code panel, where none of the hooks above fire.

[hooks/classify.ts](hooks/classify.ts) and [hooks/judge.ts](hooks/judge.ts) are pure and have no engine dependency; [hooks/model.ts](hooks/model.ts) maps a model id to a tier. The `$.state` contract is in [types/index.d.ts](types/index.d.ts).

## Development

```
claude plugin validate .   # manifest, hooks module, state contract
claude plugin test .       # tests/*.test.ts against the engine's own runtime
npm install && npm run typecheck
```

`tsc` needs the API declarations the engine lays in `.claude-plugin/types/` the first time it loads the mod from this folder (`claude --plugin-dir .`). They are gitignored. `tsconfig.core.json` checks the engine-free core (`classify.ts`, `model.ts`) without them.

CI runs that core typecheck, then `plugin validate --strict` and `plugin test` on Claude Code 2.1.296 (the minimum, required) and on the latest release (allowed to fail, so API drift shows without blocking a merge).

**Live check (haiku judge, 10 prompts labelled before the run: 3 haiku, 4 sonnet, 3 opus).** 10 of 10 matched (14 Oct 2026). In live terminal sessions on 15 Oct the verdict landed 1.2 to 1.9 s after the last keystroke, median about 1.5 s. Run with `claude --debug` to see the same timing for your own prompts: each verdict logs its time after the last edit, split into the pause and the judge call.

Tests cover the rules on their own, the judge's prompt and reply parsing, the model-id mapping, and the band on both the terminal and desktop surfaces: it draws when the tier differs, stays quiet when covered, hides and comes back, clears on submit, takes the model's verdict after the pause, cancels the pass when typing resumes, and drops a verdict for a draft that moved on. The judge model and the clock are mocked.

## Limits

- The verdict's speed is set by the network round trip, not the model. On 18 Oct 2026, Haiku 5.5 and Haiku 4.5 measured the same as the judge (median 0.95 to 0.99 s, both 10 of 10 accurate), and Haiku 4.5 costs ten times as much per token, so `haiku` stays the default.
- The rules pass reads words, not intent, and is only there to answer instantly. The model pass is the real judgment, and it costs one small completion per pause; set `engine` to `rules` to avoid that.
- It knows three tiers. Provider-specific ids are mapped by the substring `haiku`, `sonnet`, `opus` or `fable`; anything else is treated as unknown and the band always shows.
- The switch button depends on the `/config` Model row, which policy can lock.
- Mods are an early-access Claude Code API and can change between releases.

## License

MIT
