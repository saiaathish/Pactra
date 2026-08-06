#!/bin/bash
# Phase 1c: long10 extra filler paragraph F13.
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

tts F13 "One more habit that helped me a lot is writing down a short list of wins at the end of every workday. It takes two minutes, and it gives me a clear sense of progress even on days that feel messy. I also started closing my browser at six in the evening, and that small signal tells my brain that the working part of the day is done. I keep a blank page on my desk for this list, and it takes two minutes at most."
echo DONE
