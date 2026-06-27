# Sound effects

Drop real recorded samples here to replace the synthesized fallback sounds.
Use these **exact** filenames (lowercase, `.mp3`):

| File | When it plays | Suggested sound |
|------|---------------|-----------------|
| `deal.mp3`  | a card is dealt          | single card flick/slide |
| `flip.mp3`  | a card is revealed/flipped | quick card snap |
| `check.mp3` | a player checks          | soft knuckle tap on felt |
| `bet.mp3`   | a player bets            | chips placed / small stack |
| `call.mp3`  | a player calls           | a couple of chips down |
| `fold.mp3`  | a player folds           | cards sliding to the muck |
| `allin.mp3` | a player goes all-in     | big chip push / shove |
| `win.mp3`   | the pot is awarded       | chips raked + a light chime |
| `click.mp3` | UI button click          | subtle tick |

Guidelines:
- **Format:** MP3 (best browser support, small). 
- **Length:** very short — 0.2–1.5 s each. Keep files tiny.
- **Volume:** roughly normalized so none is much louder than the others.
- Free CC0 sources: Pixabay, Mixkit, Freesound, Kenney "Casino Audio".

If a file is missing or fails to load, that sound automatically falls back to
the built-in synthesized version (see `src/sound/SoundManager.ts`), so the app
always has audio — adding files just upgrades the quality.
