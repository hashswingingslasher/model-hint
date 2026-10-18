#!/bin/sh
# Records docs/demo.gif: runs docs/demo.tape with VHS, then crops the frame to the
# band, the prompt and the footer, leaving out the session banner.
# Needs vhs and ffmpeg, and a Claude Code CLI of 2.1.296 or later on PATH.
set -eu
cd "$(dirname "$0")/.."
vhs docs/demo.tape
ffmpeg -loglevel error -y -i docs/demo-full.gif \
  -filter_complex "crop=1200:180:0:340,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none" \
  docs/demo.gif
rm docs/demo-full.gif
echo "wrote docs/demo.gif"
