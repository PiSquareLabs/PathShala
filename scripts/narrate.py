"""Voice-over for the demo video with Piper (offline neural TTS).
   1. python3 scripts/narrate.py clips   -> one wav per text in docs/demo/texts.json (+ durations.json)
   2. python3 scripts/narrate.py mix     -> docs/demo/tts/voice.wav from docs/demo/timeline.json
   Needs: pip install piper-tts, and a voice (en_US-lessac-medium.onnx) at $PIPER_VOICE."""
import json, os, re, sys, wave
import numpy as np

D = 'docs/demo'; T = f'{D}/tts'; os.makedirs(T, exist_ok=True)
VOICE = os.environ.get('PIPER_VOICE', '/tmp/voice/en_US-lessac-medium.onnx')
# say the abbreviations the way a person would
SAY = [(r'\bGPS\b', 'Government Primary School'), (r'UDISE\+', 'U-DISE plus'), (r'Pekhri-2', 'Pekhri two'), (r'\bSMC\b', 'school management committee'),
       (r'\bBRICS\b', 'BRICS'), (r'\bUI\b', 'user interface'), (r'\bDPG\b', 'digital public good'), (r'Gushaini', 'Gushaini'), (r'Nagini', 'Nagini')]
def spoken(t):
    for a, b in SAY: t = re.sub(a, b, t)
    return t.replace('...', '.').replace(':', ',')

if sys.argv[1] == 'clips':
    from piper import PiperVoice, SynthesisConfig
    cfg = SynthesisConfig(length_scale=0.85)   # a little faster than the default pace
    v = PiperVoice.load(VOICE); durs = {}
    for x in json.load(open(f'{D}/texts.json')):
        f = f"{T}/{x['k']}.wav"
        if x['k'] in durs: continue
        with wave.open(f, 'wb') as w: v.synthesize_wav(spoken(x['text']), w, syn_config=cfg)
        with wave.open(f) as w: durs[x['k']] = w.getnframes() / w.getframerate()
    json.dump(durs, open(f'{T}/durations.json', 'w')); print(len(durs), 'clips', round(sum(durs.values())), 'seconds')
else:
    tl = json.load(open(f'{D}/timeline.json')); sr = 22050; end = 0; clips = []
    for e in tl:
        with wave.open(f"{T}/{e['k']}.wav") as w:
            sr = w.getframerate(); a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
        clips.append((e['at'] + 0.35, a)); end = max(end, e['at'] + 0.35 + len(a) / sr)
    out = np.zeros(int((end + 2) * sr), dtype=np.float32)
    for at, a in clips: i = int(at * sr); out[i:i + len(a)] += a
    out = np.clip(out, -32768, 32767).astype(np.int16)
    with wave.open(f'{T}/voice.wav', 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(out.tobytes())
    print('voice', round(end), 'seconds')
