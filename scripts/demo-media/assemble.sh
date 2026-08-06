#!/bin/bash
# Phase 2: assemble the 5 demo mp4s from measured wav clips.
# All gaps are computed from ffprobe-measured durations; every final audio
# stream is asserted to be within 0.05s of the target length before muxing.
set -euo pipefail
export PATH="$HOME/.local/bin:/usr/bin:/bin:$PATH"
FF=/Users/saiaathishkarthik/Desktop/Pactra/node_modules/ffmpeg-static/ffmpeg
FP=/Users/saiaathishkarthik/Desktop/Pactra/node_modules/ffprobe-static/bin/darwin/arm64/ffprobe
DIR=/Users/saiaathishkarthik/Desktop/Pactra/scripts/demo-media
W="$DIR/work"
COLOR="color=c=0x2a3b4c:s=1280x720:r=30"
BARS="smptebars=s=1280x720:r=30"

dur() { "$FP" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$1"; }
calc() { awk -v a="$1" -v b="$2" 'BEGIN{printf "%.6f", a+b}'; }
calcsub() { awk -v a="$1" -v b="$2" 'BEGIN{printf "%.6f", a-b}'; }

# --- generate silence wav of exact duration ---
sil() { # sil <out.wav> <duration>
  rm -f "$1"
  "$FF" -y -v error -f lavfi -i "anullsrc=r=44100:cl=stereo" -t "$2" -c:a pcm_s16le "$1"
}

# --- build a video from a concat list (audio-only concat then mux) ---
# build <name> <total> <video_src> <listfile>
build() {
  local name="$1" total="$2" vsrc="$3" list="$4"
  rm -f "$W/$name.audio.wav" "$DIR/$name.mp4"
  "$FF" -y -v error -f concat -safe 0 -i "$list" -ar 44100 -ac 2 -c:a pcm_s16le "$W/$name.audio.wav"
  local ad; ad=$(dur "$W/$name.audio.wav")
  local bad; bad=$(awk -v a="$ad" -v t="$total" 'BEGIN{d=a-t; if(d<0)d=-d; print (d>0.05)?1:0}')
  if [ "$bad" = "1" ]; then echo "ASSERT FAIL $name audio=$ad target=$total"; exit 1; fi
  echo "$name concat audio duration = $ad (target $total)"
  "$FF" -y -v error -f lavfi -i "$vsrc" -i "$W/$name.audio.wav" -map 0:v -map 1:a \
    -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -r 30 \
    -c:a aac -b:a 96k -ar 44100 -ac 2 -t "$total" -movflags +faststart \
    "$DIR/$name.mp4"
}

echo "=== measured clip durations ==="
for c in fA fB fC fD fD2 fD3s pA pA2 pA3 pA4 pB pC F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12 F13; do
  echo "$c  $(dur "$W/$c.wav")"
done

# === failing.mp4 (120.0s) ===
dA=$(dur "$W/fA.wav"); dB=$(dur "$W/fB.wav"); dC=$(dur "$W/fC.wav")
dD=$(dur "$W/fD.wav"); dD2=$(dur "$W/fD2.wav"); dD3=$(dur "$W/fD3s.wav")
gA=$(calcsub 17.0 "$dA")
gD=$(calcsub 120.0 "$(calc 17.0 "$(calc "$dB" "$(calc "$dC" "$(calc "$dD" "$(calc "$dD2" "$dD3")")")")")")
echo "--- failing plan: gapA=$gA gapD=$gD speechEnd=$(calc 17.0 "$(calc "$dB" "$(calc "$dC" "$(calc "$dD" "$(calc "$dD2" "$dD3")")")")")"
[ "$(awk -v x="$gA" 'BEGIN{print (x<0)?1:0}')" = 1 ] && { echo "NEG gapA"; exit 1; }
[ "$(awk -v x="$gD" 'BEGIN{print (x<0)?1:0}')" = 1 ] && { echo "NEG gapD"; exit 1; }
sil "$W/sil_fA.wav" "$gA"; sil "$W/sil_fD.wav" "$gD"
cat > "$W/list_failing.txt" <<EOF
file '$W/fA.wav'
file '$W/sil_fA.wav'
file '$W/fB.wav'
file '$W/fC.wav'
file '$W/fD.wav'
file '$W/fD2.wav'
file '$W/fD3s.wav'
file '$W/sil_fD.wav'
EOF
build failing 120.0 "$COLOR" "$W/list_failing.txt"

# === passing.mp4 (120.0s) ===
dpA=$(dur "$W/pA.wav"); dpA2=$(dur "$W/pA2.wav"); dpA3=$(dur "$W/pA3.wav"); dpA4=$(dur "$W/pA4.wav")
dpB=$(dur "$W/pB.wav"); dpC=$(dur "$W/pC.wav")
dAspeech=$(calc "$(calc "$(calc "$dpA" "$dpA2")" "$dpA3")" "$dpA4")
gA2=$(calcsub 65.0 "$dAspeech")
dBC=$(calc "$dpB" "$dpC")
gC=$(calcsub 120.0 "$(calc 65.0 "$dBC")")
echo "--- passing plan: Aspeech=$dAspeech gapA=$gA2 gapC=$gC Cends=$(calc 65.0 "$dBC")"
[ "$(awk -v x="$gA2" 'BEGIN{print (x<0)?1:0}')" = 1 ] && { echo "NEG gapA2"; exit 1; }
[ "$(awk -v x="$gC" 'BEGIN{print (x<0)?1:0}')" = 1 ] && { echo "NEG gapC"; exit 1; }
sil "$W/sil_pA.wav" "$gA2"; sil "$W/sil_pC.wav" "$gC"
cat > "$W/list_passing.txt" <<EOF
file '$W/pA.wav'
file '$W/pA2.wav'
file '$W/pA3.wav'
file '$W/pA4.wav'
file '$W/sil_pA.wav'
file '$W/pB.wav'
file '$W/pC.wav'
file '$W/sil_pC.wav'
EOF
build passing 120.0 "$COLOR" "$W/list_passing.txt"

# === probe.mp4 (40.0s): 2s silence + fB + fC + tail silence ===
dB2=$(dur "$W/fB.wav"); dC2=$(dur "$W/fC.wav")
gT=$(calcsub 40.0 "$(calc 2.0 "$(calc "$dB2" "$dC2")")")
echo "--- probe plan: gapTail=$gT (2s lead + fB + fC)"
[ "$(awk -v x="$gT" 'BEGIN{print (x<0)?1:0}')" = 1 ] && { echo "NEG gT"; exit 1; }
sil "$W/sil_lead2.wav" 2.0; sil "$W/sil_probeT.wav" "$gT"
cat > "$W/list_probe.txt" <<EOF
file '$W/sil_lead2.wav'
file '$W/fB.wav'
file '$W/fC.wav'
file '$W/sil_probeT.wav'
EOF
build probe 40.0 "$COLOR" "$W/list_probe.txt"

# === long10.mp4 (600.0s): passing A-block + pB + rotated fillers F1..F12,F1..F4,F13 ===
sumF=0
FL=()
for f in F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12 F1 F2 F3 F4 F13; do
  FL+=("$f")
done
cat > "$W/list_long10.txt" <<EOF
file '$W/pA.wav'
file '$W/pA2.wav'
file '$W/pA3.wav'
file '$W/pA4.wav'
file '$W/sil_pA.wav'
file '$W/pB.wav'
EOF
sumF=$(dur "$W/pB.wav")
for f in "${FL[@]}"; do
  echo "file '$W/$f.wav'" >> "$W/list_long10.txt"
  sumF=$(calc "$sumF" "$(dur "$W/$f.wav")")
done
speechEnd=$(calc 65.0 "$sumF")
gT2=$(calcsub 600.0 "$speechEnd")
echo "--- long10 plan: fillerSum=$sumF speechEnd=$speechEnd gapTail=$gT2"
[ "$(awk -v x="$gT2" 'BEGIN{print (x<0)?1:0}')" = 1 ] && { echo "NEG gT2"; exit 1; }
[ "$(awk -v x="$gT2" 'BEGIN{print (x<2)?1:0}')" = 1 ] && { echo "gapTail < 2s, adjust fillers"; exit 1; }
sil "$W/sil_longT.wav" "$gT2"
echo "file '$W/sil_longT.wav'" >> "$W/list_long10.txt"
build long10 600.0 "$COLOR" "$W/list_long10.txt"

# === nospeech.mp4 (120.0s): color bars + silent audio, no speech ===
rm -f "$DIR/nospeech.mp4"
"$FF" -y -v error -f lavfi -i "$BARS" -f lavfi -i "anullsrc=r=44100:cl=stereo" \
  -map 0:v -map 1:a -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 96k -ar 44100 -ac 2 -t 120.0 -movflags +faststart "$DIR/nospeech.mp4"

echo "=== ALL BUILT ==="
for f in failing passing probe long10 nospeech; do
  "$FP" -v error -show_entries format=duration,size -of default=noprint_wrappers=1 "$DIR/$f.mp4" | head -4
  "$FP" -v error -select_streams v:0 -show_entries stream=codec_name,width,height,r_frame_rate,pix_fmt -of default=noprint_wrappers=1 "$DIR/$f.mp4" | head -5
  "$FP" -v error -select_streams a:0 -show_entries stream=codec_name,sample_rate,channels,bit_rate -of default=noprint_wrappers=1 "$DIR/$f.mp4" | head -4
  echo "---"
done
