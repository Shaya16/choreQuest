# Photo → 16-bit (faithful)

Drop a reference photo of a person (or pet, or whatever) into Nano Banana along with this prompt. The output is that subject redrawn as a 16-bit chibi character sprite in the Chore Quest style, on a solid white background.

Use this when you want the subject to look like THEMSELVES in the game — keep their hair, clothes, and vibe from the photo. For remapping them into a class archetype, see `photo_to_16bit_as_class.md` instead.

## Prompt

Using the attached reference photo as the subject, create a 128×128 pixel art character sprite in classic 16-bit SNES / arcade-era style. The sprite must be a faithful chibi interpretation of the person in the photo — recognizably them, but as a 16-bit game character in the vein of Chrono Trigger, Secret of Mana, or Street Fighter II portraits.

Translate from the reference:
- **Face**: preserve their face shape, hairstyle, hair color, facial-hair (if any), glasses (if any), and general expression. Map real-world hair colors to the closest color in the palette (black hair → `#000000`, blonde → `#FFCC00`, brown → `#4A4A4A` or `#FFA63F`, red/ginger → `#FF3333` or `#FFA63F`, gray/white → `#FFFFFF`, dyed cyan/pink/lime/blue → use the matching palette color directly). Use limited 2-color dithering between two palette colors for hair highlights (e.g. pairs of yellow + orange for sunlit blonde, white + gray for silver hair).
- **Skin**: use `#FFA63F` (orange) as the nude / flesh-tone midtone for ALL skin tones, lighter and deeper. Do NOT use `#FFB8DE` pink for skin — pink is reserved for outfits and accents, never flesh. For lighter skin, dither `#FFA63F` with `#FFFFFF` highlights on the cheekbone / nose ridge and `#FFCC00` yellow warm accents. For deeper skin, dither `#FFA63F` with `#4A4A4A` gray or `#000000` black as shadow. Paired-pixel dithering only — no anti-aliasing, no gradients, no new colors.
- **Outfit**: replicate the kind of outfit visible in the photo (t-shirt, hoodie, dress, suit, tank top, whatever) but redrawn in blocky pixels using only the palette. Pick the closest palette color per garment. Add subtle folds/shadow via 2-color dithering — not true gradients.
- **Accessories**: keep any prominent accessories from the photo — hat, glasses, necklace, watch, headphones, earrings — as chunky pixel shapes with single white highlight pixels where light would catch.
- **Vibe**: match the overall energy of the photo — if they're smiling, smirk; if they're chill, relaxed pose; if they're hype, bigger pose.

Framing: full body, front-facing, centered in the 128×128 canvas, idle pose (one hand can be on hip, raised in a small wave, or at the side). Chibi proportions — oversized head about 40% of total height, small body, stubby limbs. A few pixels of margin on every side.

Use ONLY these 10 hex colors — no other shades, no anti-aliasing, no true gradients. Limited 2-color pixel dithering between palette colors IS allowed and encouraged for shading:
`#000000 #FFFFFF #FFCC00 #FF3333 #00DDFF #FFB8DE #FFA63F #2121FF #9EFA00 #4A4A4A`

Background: solid white (`#FFFFFF`) filling the entire 128×128 canvas behind and around the character. No transparency. No ground shadow. No scene, no props beyond what the character is holding.

Outlines: 1–2 pixels wide, pure black (`#000000`) — slightly heavier on the outer silhouette, single-pixel on interior details. Highlights: `#FFFFFF` pixel accents on eyes, lens reflections, teeth, and metal. Chunky 16-bit pixels — reference Chrono Trigger, Secret of Mana, or Street Fighter II character portraits. Hard edges only, no anti-aliasing.

## Output checklist

- [ ] 128×128 px exactly
- [ ] Solid white background (not transparent)
- [ ] Only the 10 listed hex colors
- [ ] Subject is recognizably the person in the photo (hair, outfit, accessories carried over)
- [ ] Chibi proportions (big head, small body)
- [ ] Front-facing idle pose, centered
- [ ] 1–2 pixel black outlines (heavier on silhouette)
- [ ] Limited 2-color dithering for shading — no anti-aliasing, no gradients

## Save as

`chore-quest/assets/sprites/characters/custom/{your_name}.png` — pick any filename for the subject (e.g. `shay.png`, `partner.png`). The `custom/` subfolder keeps hand-made sprites separate from the class defaults.
