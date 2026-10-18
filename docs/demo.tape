# Records the demo with VHS (charmbracelet/vhs). Run docs/record-demo.sh, which runs this
# tape and crops the result to the band and the prompt.
# Run from the repository root with a Claude Code CLI of 2.1.296 or later on PATH.
# The session runs on Sonnet so both an opus and a haiku verdict show a Switch button.

Output docs/demo-full.gif

Require claude

Set Shell zsh
Set FontSize 15
Set Width 1200
Set Height 520
Set Padding 18
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms
Set CursorBlink false

Hide
# A clean environment, so nothing is inherited from a Claude Code session that launched this.
# Starts only from the repository root: the Down/Enter below answers a trust dialog for this folder.
Type `test -f .claude-plugin/plugin.json && for v in $(env | sed -n "s/^\(CLAUDE[A-Z_]*\)=.*/\1/p"); do unset $v; done && claude --plugin-dir . --model sonnet`
Enter
Sleep 9s
# Picks "Yes, I trust this folder" if the workspace trust dialog is up (its default is
# "No, exit"); on a plain prompt, Down and an empty Enter do nothing.
Down
Sleep 300ms
Enter
Sleep 7s
Ctrl+U
Sleep 1s
Ctrl+L
Sleep 1s
Show

Type "i need to build a AAA video game similar to GTA 5 in volume and playability"
Sleep 4.5s

Backspace 80
Sleep 600ms
Type "fix the typo in the readme"
Sleep 4.5s

Backspace 30
Sleep 600ms
Type "add pagination to the /users endpoint, 50 per page"
Sleep 4.5s

Hide
Ctrl+U
Ctrl+C
Ctrl+C
