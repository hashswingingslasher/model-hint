# Changelog

## 0.6.3, 20 October 2026

- **Fix:** Hide no longer comes back on its own. It used to clear whenever the verdict changed, so the band reappeared as you kept typing. Hide now lasts for the prompt you are writing, until you send it or clear the box.
- New **Off** button (`o`): turns model-hint off for the session, band and model calls both, like `/model-hint`. A toast says how to turn it back on.

## 0.6.2, 18 October 2026

Prepared for Anthropic's plugin directory; no change to what the plugin does.

- The plugin folder now ships only the plugin: the demo GIF and its recording script moved to the `assets` branch, and the README links to them there.
- Added an icon for the directory listing.
- README: a section on exactly what the plugin changes (the `model` setting, only on Switch, saved like `/model`) and what each hook does.
- The demo tape no longer names environment variables or links out, and test fixtures for the secret check are assembled at run time, so directory and secret scanners do not read them as credential handling.

## 0.6.1, 18 October 2026

Security and privacy fixes from an audit before promotion.

- `/model-hint` off now stops the model calls. Before, it only hid the band, and drafts were still sent.
- A draft that looks like a credential (API keys, tokens, private keys) is never sent; the band says so.
- At most 4,000 characters of a draft are sent, and the rules read at most 8,000, so a large paste cannot make every pause or keystroke expensive.
- The step counter no longer slows down quadratically on blank lines (50,000 blank lines took 1.6 s per keystroke).
- Control, zero-width and bidirectional characters are stripped from the judge's reason before it is shown; oversized replies are refused.
- The Switch toast says the default model changed and what it was, since the Model row, like `/model`, saves it for later sessions. Switch is hidden while a turn runs.
- Background work and hooks now catch and log their own errors; `#` memory notes are never sent.
- README: new Privacy section.

## 0.6.0, 18 October 2026

- **Works in the VS Code chat panel** on extension 2.1.301 and later. That extension draws mod bands but still sends no `prompt.edit`, so while such a surface is attached model-hint reads the draft every 300 ms; the first `prompt.edit` turns this off. Seen working live in the panel. See [docs/adr/0002](docs/adr/0002-vscode-panel-by-polling.md).

## 0.5.0, 15 October 2026

- Faster verdicts: the pause before the judge drops from 600 ms to 300 ms, and a draft judged once in the session answers instantly from a cache. Live, the verdict now lands 1.2 to 1.9 s after the last keystroke (median about 1.5 s), down from about 2.1 s.
- The debug log times every verdict, split into the pause and the judge call.

## 0.4.1, 14 October 2026

- **Retraction.** 0.4.0 said the VS Code chat panel shows the hint on the status line. It does not: the panel sends no keystroke events to mods, so nothing triggers it. The README now has a "Where it runs" table and a four-step VS Code setup through terminal mode. See [docs/adr/0001](docs/adr/0001-terminal-first-vscode-reach.md).
- Live judge check recorded: 10 of 10 prompts matched the expected tier; a verdict lands about 2.1 s after typing stops.
- Added "Why not just route automatically" to the README.

## 0.4.0, 12 October 2026

- Status-line fallback on surfaces with no band.

## 0.3.0, 12 October 2026

- No tier shown until the model has read the draft; the verdict always shows, with Switch only when the session's model does not cover it.
- A failed model pass is named in the band and logged.

## 0.2.0, 12 October 2026

- Model pass: a small model reads the draft after a 600 ms pause.

## 0.1.0, 12 October 2026

- First release: word-rule hint in a band above the prompt.
