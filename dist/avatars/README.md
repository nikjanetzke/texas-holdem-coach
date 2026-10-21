# Character portraits

Drop the nine character photos in this folder using these **exact** filenames
(case-sensitive, `.jpg`):

| File | Character | Style |
|------|-----------|-------|
| `marco.jpg`   | Marco "The Cigar" | Loose-aggressive high roller |
| `eleanor.jpg` | Eleanor           | Tight seasoned pro |
| `vivian.jpg`  | Vivian            | Tight-aggressive calculator |
| `leo.jpg`     | Leo               | Loose calling station |
| `spike.jpg`   | Spike             | Hyper-aggressive maniac |
| `bruno.jpg`   | Bruno             | Aggressive intimidator |
| `danny.jpg`   | Danny             | Balanced grinder |
| `tex.jpg`     | Tex               | Tight/trappy rounder |
| `nadia.jpg`   | Nadia             | Tight rock |

Guidelines:
- Square-ish, head centered. They're rendered in a circular mask, so anything
  near the corners gets clipped.
- ~256x256 px is plenty (they show at ~32 px on the table). Bigger is fine but
  wastes bandwidth.
- If a file is missing, that seat falls back to a drawn cartoon face — the app
  still works, you just won't see the photo.

The roster and play-styles live in `app/src/ai/characters.ts`.
