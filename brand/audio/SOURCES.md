# Audio sources

Every file here and where it came from. Nothing third-party is used without a licence line.

| File | Origin | Licence |
|---|---|---|
| `whoosh.wav` | Synthesised with ffmpeg (pink noise, band-limited, exponential fade) | Own work |
| `impact.wav` | Synthesised with ffmpeg (55 Hz sine + low-passed brown-noise hit) | Own work |
| `sting.wav` | `whoosh.wav` + `impact.wav` at 0.33 s (the intro's logo slam) | Own work |

Regenerate:

```bash
ffmpeg -y -f lavfi -i "anoisesrc=c=pink:d=0.7:a=0.9" -af "highpass=f=300,lowpass=f=6000,afade=t=in:d=0.45:curve=exp,afade=t=out:st=0.5:d=0.2,volume=0.8" -ar 48000 -ac 2 whoosh.wav
ffmpeg -y -f lavfi -i "sine=f=55:d=1.2" -f lavfi -i "anoisesrc=c=brown:d=0.25:a=1" -filter_complex "[0]volume=1.6,afade=t=out:st=0:d=1.2:curve=exp[a];[1]lowpass=f=900,afade=t=out:st=0:d=0.25[b];[a][b]amix=inputs=2:normalize=0,alimiter=limit=0.9" -ar 48000 -ac 2 impact.wav
ffmpeg -y -i whoosh.wav -i impact.wav -filter_complex "[1]adelay=330|330[i];[0][i]amix=inputs=2:normalize=0,apad=pad_dur=1,atrim=0:2,alimiter=limit=0.9" -ar 48000 -ac 2 sting.wav
```

## Music (optional, picked by Tim)

Drop these in and the render uses them; without them the intro and outro carry only the sound design.

- `intro-music.mp3`: under the intro (6 s, faded out).
- `outro-music.mp3`: under the outro (15 s, faded out).

Take them from the **YouTube Audio Library** (YouTube Studio → Audio library, filter "No attribution
required"): cleared for monetised YouTube videos and never claimed by Content ID. Add a row above with the
track name and its licence line.
