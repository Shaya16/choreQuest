# Kessy

The real Player 2 for this Chore Quest instance. Drop `kessy.png` (the source photo) into Nano Banana alongside this prompt.

## Prompt

Using the attached photo (`kessy.png`) as the reference subject, create a 128×128 pixel art character sprite in classic 16-bit SNES / arcade-era style. This is "Kessy" — Player 2 of Chore Quest, the real-life co-star rendered as a game-ready chibi hero in the style of Chrono Trigger, Secret of Mana, or Street Fighter II character portraits.

Translate from the photo — Kessy must be recognizable as themselves:
- **Face**: preserve face shape, hairstyle, hair color and texture, facial hair (if any), glasses (if any), and the expression. Map hair colors to the nearest palette color (black → `#000000`, blonde → `#FFCC00`, brown → `#4A4A4A` or `#FFA63F`, red → `#FF3333`, gray/white → `#FFFFFF`, dyed bright colors → matching palette color directly). Use 2-color pixel dithering between palette colors for hair highlights where it helps the shape read.
- **Skin**: use `#FFA63F` (orange) as the nude / flesh-tone midtone for ALL skin tones, lighter and deeper. Do NOT use `#FFB8DE` pink for skin — pink is reserved for outfits and accents, never flesh. For lighter skin, dither `#FFA63F` with `#FFFFFF` highlights on the cheekbone / nose ridge and `#FFCC00` yellow warm accents. For deeper skin, dither `#FFA63F` with `#4A4A4A` gray or `#000000` black as shadow. Paired-pixel dithering only — no anti-aliasing, no gradients, no new colors.
- **Outfit**: replicate the outfit visible in the photo, redrawn blocky using only the palette. If the outfit is ambiguous or unclear, default to arcade-co-star energy — something stylish that pops against black, something a co-protagonist would wear. Add subtle folds/shading via 2-color dithering, never true gradients.
- **Accessories**: keep anything prominent — hats, glasses, necklaces, watches, headphones, earrings — as chunky pixel shapes with single-pixel `#FFFFFF` highlights where light would catch.
- **Vibe**: confident smirk or small grin. Player 2 energy — equal-weight co-lead, not sidekick; playful and game-ready.

Framing: full body, front-facing, centered in the 128×128 canvas, idle pose (one hand on hip / raised in a small wave / slight action stance — pick what fits the photo's energy). Chibi proportions — oversized head about 40% of total height, small body, stubby limbs. A few pixels of margin on every side.

Use ONLY these 10 hex colors — no other shades, no anti-aliasing, no true gradients. Limited 2-color pixel dithering between palette colors IS allowed and encouraged for shading:
`#000000 #FFFFFF #FFCC00 #FF3333 #00DDFF #FFB8DE #FFA63F #2121FF #9EFA00 #4A4A4A`

Background: **transparent** (not white — this is a playable class sprite, same standard as the other 5 classes). No ground shadow. No scene.

Outlines: 1–2 pixel black (`#000000`), slightly heavier on the outer silhouette, single-pixel on interior details. Highlights: `#FFFFFF` accents on eyes, lens reflections, teeth, and metal. Chunky 16-bit pixels, hard edges only, no anti-aliasing.

## Output checklist

- [ ] 128×128 px exactly
- [ ] Transparent background (NOT white)
- [ ] Only the 10 listed hex colors
- [ ] Recognizable as the person in `kessy.png`
- [ ] Chibi proportions (big head, small body)
- [ ] Front-facing idle pose, centered
- [ ] 1–2 pixel black outlines (heavier on silhouette)
- [ ] Limited 2-color dithering for shading — no anti-aliasing, no gradients

## Save as

`chore-quest/assets/sprites/characters/kessy.png`
