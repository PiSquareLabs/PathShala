#!/bin/sh
# Convert the Playwright webm recording to an mp4, adding docs/demo/tts/voice.wav when it exists.
# Needs a full ffmpeg, for example `pip install imageio-ffmpeg`.
FF=${FFMPEG:-$(python3 -c "import imageio_ffmpeg as i;print(i.get_ffmpeg_exe())")}
IN=$(ls -t docs/demo/raw/*.webm | head -1)
if [ -f docs/demo/tts/voice.wav ]; then
  "$FF" -y -i "$IN" -i docs/demo/tts/voice.wav -c:v libx264 -pix_fmt yuv420p -crf 24 -preset medium -c:a aac -b:a 128k -shortest -movflags +faststart docs/demo/pathshala-demo.mp4
else
  "$FF" -y -i "$IN" -c:v libx264 -pix_fmt yuv420p -crf 24 -preset medium -movflags +faststart docs/demo/pathshala-demo.mp4
fi
