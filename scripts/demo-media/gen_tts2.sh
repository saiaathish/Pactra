#!/bin/bash
# Phase 1b: additional candidate clips, measured and printed.
set -euo pipefail
export PATH="$HOME/.local/bin:/usr/bin:/bin:$PATH"
FF=/Users/saiaathishkarthik/Desktop/Pactra/node_modules/ffmpeg-static/ffmpeg
FP=/Users/saiaathishkarthik/Desktop/Pactra/node_modules/ffprobe-static/bin/darwin/arm64/ffprobe
DIR=/Users/saiaathishkarthik/Desktop/Pactra/scripts/demo-media
W="$DIR/work"
VOICE=Samantha
RATE=175

tts() {
  local name="$1"; local text="$2"
  /usr/bin/say -v "$VOICE" -r "$RATE" -o "$W/$name.aiff" "$text"
  "$FF" -y -v error -i "$W/$name.aiff" -ar 44100 -ac 2 -c:a pcm_s16le "$W/$name.wav"
  local d
  d=$("$FP" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$W/$name.wav")
  echo "$name  $d"
}

# passing-A extensions (no disclosure terms, no Acme)
tts pA3 "One thing that surprised me is how much the system relies on simple habits rather than complicated tools, and that is exactly why it stuck with me for so long."
tts pA4 "I have also gathered a few questions from the comments, and I will answer the most common ones at the end of this video."

# failing-D extra candidates (no disclosure terms, no Acme)
tts fD3s "Beyond apps, I have been trying to protect my focus during the day. I put my phone in another room while I do deep work, and I only check messages at set times. It took about a week to get used to it, but now my afternoons feel much calmer and my evenings are finally my own."
tts fD4 "One last tip, if you have a long commute, try turning it into your planning time, and you will be surprised how much calmer your mornings feel."

echo DONE
