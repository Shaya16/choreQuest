# Character sprite prompts — for Nano Banana / Gemini image gen

Five playable classes plus two photo-to-sprite converters. Each prompt is a self-contained file you can paste into Nano Banana without extra context.

## Shared constraints (already embedded in every prompt)

- **Output**: single 128×128 pixel PNG, one character centered (transparent background for class sprites, solid white background for photo-based sprites)
- **Style**: 16-bit SNES / arcade-era pixel art (Chrono Trigger, Street Fighter II, Shovel Knight energy), chunky hard-edged pixels, limited 2-color dithering allowed for shading, no anti-aliasing, no true gradients, 1–2 pixel black outlines (heavier on silhouette)
- **Palette** — use ONLY these 10 hex colors; no others, no shades in between:
  - `#000000` black (bg, outlines, shadows)
  - `#FFFFFF` white (highlights, teeth, eyes)
  - `#FFCC00` yellow (accents, coins, shines)
  - `#FF3333` red (aggressive, hot)
  - `#00DDFF` cyan (cool, tech, water)
  - `#FFB8DE` pink (soft, vibe)
  - `#FFA63F` orange (warm, food)
  - `#2121FF` blue (uniforms, denim)
  - `#9EFA00` lime (nerdy, radioactive)
  - `#4A4A4A` gray (metal, stone)
- **Framing**: full body, front-facing, idle stance, centered in the 128×128 canvas, a few pixels of margin around the sprite
- **Proportions**: chibi — big head (~40% of height), small body, stubby limbs, expressive face
- **Expression**: confident / slight smirk — these are playable heroes, not neutral mannequins

## Files

### Class sprites (generate from scratch — no photo input)

- `gym_fighter.md` — muscle-bound brawler, red + yellow
- `vibe_queen.md` — dancer with headphones, pink + cyan
- `sweepman.md` — broom-wielding cleaner, blue + gray
- `chef_kong.md` — chef with big hat + knife, orange + white
- `nerd_tron.md` — glasses + book hacker, lime + blue

### Personalized classes (drop the named photo + paste prompt)

- `shay.md` — Player 1, rendered from `shay.png`
- `kessy.md` — Player 2, rendered from `kessy.png`

### Photo → sprite (drop an image + paste prompt)

These output on a **solid white background** (not transparent) so the result can be cropped/keyed by hand later.

- `photo_to_16bit_faithful.md` — drop any photo, get the subject redrawn as a 16-bit chibi that looks like them (keeps their real hair + outfit)
- `photo_to_16bit_as_class.md` — drop a photo + pick one of the five classes, get that person reimagined as the class archetype (their face/hair, the class's outfit and prop)

## After generation

- Class sprites → `chore-quest/assets/sprites/characters/{class_name}.png` (same name as the markdown file but `.png`). Transparent PNG.
- Photo-based sprites → `chore-quest/assets/sprites/characters/custom/{your_name}[_{class}].png`. White background; the `custom/` subfolder keeps hand-made sprites out of the default class lineup.

The character-select screen will load class PNGs automatically; custom sprites are opt-in via the player profile.
