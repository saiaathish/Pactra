#!/bin/bash
# Rebuild passing.mp4 with an extra filler section (pD) after the pitch so the
# last spoken word lands ~110s -> detected segment duration ~45s (35-50s window).
set -euo pipefail
export PATH="$HOME/.local/bin:/usr/bin:/bin:$PATH"
FF=/Users/saiaathishkarthik/Desktop/Pactra/node_modules/ffmpeg-static/ffmpeg
FP=/Users/saiaathishkarthik/Desktop/Pactra/node_modules/ffprobe-static/bin/darwin/arm64/ffprobe
DIR=/Users/saiaathishkarthik/Desktop/Pactra/scripts/demo-media
W="$DIR/work2"
mkdir -p "$W"
VOICE=Samantha
RATE=175

dur() { "$FP" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$1"; }

tts() {
  local name="$1"; local text="$2"
  /usr/bin/say -v "$VOICE" -r "$RATE" -o "$W/$name.aiff" "$text"
  "$FF" -y -v error -i "$W/$name.aiff" -ar 44100 -ac 2 -c:a pcm_s16le "$W/$name.wav"
  echo "$name  $(dur "$W/$name.wav")"
}

sil() {
  local name="$1"; local secs="$2"
  "$FF" -y -v error -f lavfi -i "anullsrc=r=44100:cl=stereo" -t "$secs" -c:a pcm_s16le "$W/$name.wav"
}

tts pA  "Hey everyone, welcome back to the channel. Today I want to tell you about a new productivity app that I have been testing for the past few weeks. It completely changed the way I organize my week, and I think you are going to love it. Let me also share what I have learned about time blocking, and why I think it works so well for people who juggle a lot of projects at once. I have been using this system for about a month now, and my planning routine takes less time than it used to, which leaves me with more energy for the actual work. So let me walk you through the whole setup, step by step, and at the end I will give you all the details you need to try it yourself."
tts pA2 "And if you are new here, I would also point you to the first video in this series, where I break down the entire system from the very beginning."
tts pA3 "One thing that surprised me is how much the system relies on simple habits rather than complicated tools, and that is exactly why it stuck with me for so long."
tts pA4 "I have also gathered a few questions from the comments, and I will answer the most common ones at the end of this video."
tts pB  "Before I get into the details, I need to mention that this video is sponsored by Acme."
tts pC  "Acme's app helps you plan your week in under five minutes, and you can share schedules with your whole team. You get a 30-day free trial when you sign up, and it works on every device you own. Use the code PACTRA20 at checkout to get started. The team ships new features every month, and support responds within a day. I genuinely recommend giving it a try."
tts pD  "By the way, the free trial also includes the team plan, which is a great deal if you work with others. I have tried many similar apps over the years, and this is the first one that I kept using after the first month, so I really think it is worth a look."

# --- compute gaps ---
D_INTRO=$(node -e "
const fs=require('fs');
let s=0;
for (const n of ['pA','pA2','pA3','pA4']) s+=parseFloat(fs.readFileSync('$W/'+n+'.wav.dur','utf8'));
process.stdout.write(String(s));
" 2>/dev/null || node -e "
const fs=require('fs');
" )
# durations via shell
D_A=$(dur "$W/pA.wav"); D_A2=$(dur "$W/pA2.wav"); D_A3=$(dur "$W/pA3.wav"); D_A4=$(dur "$W/pA4.wav")
D_B=$(dur "$W/pB.wav"); D_C=$(dur "$W/pC.wav"); D_D=$(dur "$W/pD.wav")
SUM_A=$(node -e "console.log((($D_A)+($D_A2)+($D_A3)+($D_A4)).toFixed(6))")
GAP_A=$(node -e "console.log((65.0-($SUM_A)).toFixed(6))")
PITCH_END=$(node -e "console.log((65.0+($D_B)+($D_C)).toFixed(3))")
LAST_WORD=$(node -e "console.log(($PITCH_END+($D_D)).toFixed(3))")
DUR=$(node -e "console.log(($LAST_WORD-65.0).toFixed(3))")
echo "intro=$SUM_A gapA=$GAP_A pitch_end=$PITCH_END last_word=$LAST_WORD segdur=$DUR"
# segment duration must be within 35-50s with margin
node -e "
const d=parseFloat('$DUR');
if (d<36 || d>49) { console.error('BAD segment duration: '+d); process.exit(1); }
console.log('segment duration OK: '+d+'s');
"
sil gapA "$GAP_A"
TAIL=$(node -e "console.log((120.0-($LAST_WORD)).toFixed(6))")
sil tail "$TAIL"
echo "tail=$TAIL"

# --- concat audio ---
cat > "$W/list.txt" <<EOF
file '$W/pA.wav'
file '$W/pA2.wav'
file '$W/pA3.wav'
file '$W/pA4.wav'
file '$W/gapA.wav'
file '$W/pB.wav'
file '$W/pC.wav'
file '$W/pD.wav'
file '$W/tail.wav'
EOF
"$FF" -y -v error -f concat -safe 0 -i "$W/list.txt" -c:a pcm_s16le "$W/audio.wav"
AUDIO_DUR=$(dur "$W/audio.wav")
node -e "
const d=parseFloat('$AUDIO_DUR');
if (Math.abs(d-120)>0.1) { console.error('audio not 120s: '+d); process.exit(1); }
console.log('audio duration OK: '+d+'s');
"

# --- mux with color video, force 120.0 ---
"$FF" -y -v error -f lavfi -i color=c=0x2a3b4c:s=1280x720:r=30 -i "$W/audio.wav" \
  -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -b:a 96k -shortest -t 120 \
  -movflags +faststart "$DIR/passing.mp4"

echo "--- final verify ---"
"$FP" -v error -show_entries format=duration,size -of default=noprint_wrappers=1 "$DIR/passing.mp4"
"$FP" -v error -select_streams v -show_entries stream=width,height,codec_name -of csv=p=0 "$DIR/passing.mp4"
"$FP" -v error -select_streams a -show_entries stream=codec_name -of csv=p=0 "$DIR/passing.mp4"
shasum -a 256 "$DIR/passing.mp4"
echo "last speech word ~ $LAST_WORD s (disclosure at 65.0s; segment duration $DUR s)"
