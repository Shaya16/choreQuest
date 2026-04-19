# Photo → 16-bit (as arcade class)

Drop a reference photo of a person into Nano Banana along with this prompt. The output is that person reimagined as one of the five Chore Quest arcade classes — their face and hair carried over from the photo, but dressed and posed as the class archetype. Solid white background.

**Before pasting**, edit the `CLASS =` line below to pick one of the five classes and keep only that class's "Outfit and pose" block. Delete the other four.

## Prompt

Using the attached reference photo as the face/head reference, create a 128×128 pixel art character sprite in classic 16-bit SNES / arcade-era style. Keep the subject recognizable — their face shape, hairstyle, hair color, glasses (if any), and general expression must read as the same person — but dress and equip them as the Chore Quest class specified below. Visual target: Chrono Trigger, Secret of Mana, or Street Fighter II character portraits.

CLASS = [ gym_fighter | vibe_queen | sweepman | chef_kong | nerd_tron ]

Translate from the photo (always):
- **Face**: preserve face shape, hairstyle, hair color, facial-hair if any, and glasses if any. Map hair colors to the nearest palette color (black → `#000000`, blonde → `#FFCC00`, brown → `#4A4A4A` or `#FFA63F`, red → `#FF3333`, gray/white → `#FFFFFF`, dyed cyan/pink/lime/blue → the matching palette color directly). Use 2-color dithering between two palette colors for hair highlights where it helps.
- **Skin**: use `#FFA63F` (orange) as the nude / flesh-tone midtone for ALL skin tones, lighter and deeper. Do NOT use `#FFB8DE` pink for skin — pink is reserved for outfits and accents, never flesh. For lighter skin, dither `#FFA63F` with `#FFFFFF` highlights on the cheekbone / nose ridge and `#FFCC00` yellow warm accents. For deeper skin, dither `#FFA63F` with `#4A4A4A` gray or `#000000` black as shadow. Paired-pixel dithering only — no anti-aliasing, no gradients, no new colors.
- **Expression**: confident smirk or half-smile, matching the class's personality below.

### Outfit and pose by class — keep only the block for the CLASS you picked

**gym_fighter** — red tank top, yellow sweatband across the forehead, fingerless black boxing gloves, red shorts with yellow stripe, white sneakers. Broad blocky torso, muscled arms with `#FFFFFF` highlights and `#FF3333`↔`#FFCC00` dithering for toned definition. Holding a single black dumbbell on one shoulder. Cocky grin, chest puffed out. Primary colors: red (`#FF3333`) and yellow (`#FFCC00`).

**vibe_queen** — bright pink leotard / crop-top, cyan belt, pink leg warmers over white sneakers, cyan headphones over the ears with a visible coiled cord. One hand on hip, other hand throwing a peace sign or finger-gun. Slight diagonal lean, playful wink or half-smile. Dither pink↔white on the leotard for highlights. Primary colors: pink (`#FFB8DE`) and cyan (`#00DDFF`).

**sweepman** — blue jumpsuit / overalls over a gray t-shirt, rolled sleeves, yellow rubber gloves, work boots, gray flat cap or backwards baseball cap. Holding a wooden broom upright in one hand like a staff, bristles bright yellow. Other hand in a small "let's get to work" fist. Wide confident stance. Dither blue↔black on jumpsuit folds. Primary colors: blue (`#2121FF`) and gray (`#4A4A4A`), yellow accents.

**chef_kong** — tall white chef's hat (mushroom-shape), white double-breasted chef's jacket with black buttons, orange neckerchief, white pants with thin black stripes, black shoes, white apron at the waist. Holding a gray cleaver-style knife upright in one hand ("let's cook" energy, not menacing). Big toothy grin. Dither white↔gray on jacket folds and knife blade. Primary colors: white (`#FFFFFF`) and orange (`#FFA63F`), gray knife blade.

**nerd_tron** — lime-green t-shirt with a cyan circuit pattern on the chest (simple geometric shapes), blue cargo pants rolled at the ankle, white sneakers, big black-rimmed square glasses with white pixel-highlight lenses (layer these OVER any glasses in the photo — always square and oversized). Holding a thick cyan-covered book with a yellow star on it in one hand, a pencil/stylus held up like a lightsaber in the other. Slouched posture, smug smirk. Dither lime↔cyan on shirt pattern. Primary colors: lime (`#9EFA00`) and blue (`#2121FF`), cyan on book/chest.

### Style constraints (always)

Framing: full body, front-facing, centered in the 128×128 canvas, idle pose. Chibi proportions — oversized head about 40% of total height, small body, stubby limbs. A few pixels of margin on every side.

Use ONLY these 10 hex colors — no other shades, no anti-aliasing, no true gradients. Limited 2-color pixel dithering between palette colors IS allowed and encouraged for shading:
`#000000 #FFFFFF #FFCC00 #FF3333 #00DDFF #FFB8DE #FFA63F #2121FF #9EFA00 #4A4A4A`

Background: solid white (`#FFFFFF`) filling the entire 128×128 canvas behind and around the character. No transparency. No ground shadow. No scene.

Outlines: 1–2 pixels wide, pure black (`#000000`) — heavier on the outer silhouette, single-pixel on interior details. Highlights: `#FFFFFF` pixel accents on eyes, lens reflections, metal, teeth. Chunky 16-bit pixels — reference Chrono Trigger, Secret of Mana, Street Fighter II, or Shovel Knight. Hard edges only, no anti-aliasing.

## Output checklist

- [ ] 128×128 px exactly
- [ ] Solid white background (not transparent)
- [ ] Only the 10 listed hex colors
- [ ] Face/hair carried over from the reference photo (recognizably the same person)
- [ ] Outfit and prop match the chosen CLASS exactly
- [ ] Chibi proportions (big head, small body)
- [ ] Front-facing idle pose, centered
- [ ] 1–2 pixel black outlines (heavier on silhouette)
- [ ] Limited 2-color dithering for shading — no anti-aliasing, no gradients

## Save as

`chore-quest/assets/sprites/characters/custom/{your_name}_{class}.png` — e.g. `shay_gym_fighter.png`, `partner_vibe_queen.png`.
