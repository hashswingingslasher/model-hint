#!/bin/sh
# Records demo.gif for the README: runs demo.tape with VHS against a checkout of
# model-hint's main branch, then crops the frame to the band, the prompt and the
# footer, leaving out the session banner.
#   sh record-demo.sh /path/to/model-hint
# Needs vhs and ffmpeg, and a Claude Code CLI of 2.1.296 or later on PATH.
set -eu
MODEL_HINT_DIR=$(cd "${1:?usage: record-demo.sh /path/to/model-hint}" && pwd)
export MODEL_HINT_DIR
cd "$(dirname "$0")"
vhs demo.tape
ffmpeg -loglevel error -y -i demo-full.gif \
  -filter_complex "crop=1200:180:0:340,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none" \
  demo.gif
rm demo-full.gif
echo "wrote demo.gif"
