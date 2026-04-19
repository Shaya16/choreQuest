# Near Arcade Strip (front parallax layer)

## Prompt

Create a 512×200 pixel horizontal pixel-art backdrop tile in classic 8-bit NES / arcade-era style. This is the **near foreground layer** of a parallax city at night — a neon-lit arcade strip that scrolls faster than the distant skyline behind it. A character sprite will stand on a ground plane in front of this layer, so the very bottom ~20 px of this image should be empty/transparent (the app draws its own ground tiles there). The top portion of the image must also be transparent so the distant skyline and starfield show through.

Content: a row of short-to-medium storefronts and arcade-era shops, roof-tops no higher than ~140 px from the bottom. Think classic Japanese-arcade-meets-80s-NYC: narrow brick-and-steel shopfronts with big lit windows, awnings, neon marquee signs. Include:

- One full **ARCADE** storefront with a pink or cyan neon "ARCADE" marquee sign above the entrance (pictogram letters in pixel block style — very simple, not modern). A pair of glowing arcade-cabinet silhouettes visible through the window.
- One ramen/noodle stand with an orange lantern (#FFA63F) and steam.
- One storefront with a big red (#FF3333) vertical neon sign — simple symbol like a star or exclamation, no readable text.
- One storefront with green/lime (#9EFA00) side-trim — like an all-night convenience store with a lime-lit interior.
- Street-level details: a couple of street-lamps with yellow (#FFCC00) bulbs casting light circles on the sidewalk, a fire hydrant, a trash can, maybe a small bench. A few pixel-sprite silhouettes like a cat or a pigeon are a nice touch — tiny.
- Building fronts are mostly dark gray (#4A4A4A) and black (#000000) with white trim. Windows are cyan (#00DDFF) with the interior color poking through.
- Include visible brick texture suggested by 2-pixel-square patterning (not painted-on, just pixel dots in the grout pattern).

Use ONLY these 10 hex colors — no other shades, no anti-aliasing, no gradients:
`#000000 #FFFFFF #FFCC00 #FF3333 #00DDFF #FFB8DE #FFA63F #2121FF #9EFA00 #4A4A4A`

Primary colors should be **dark gray (#4A4A4A)** and **black (#000000)** for building fronts, **pink (#FFB8DE)**, **cyan (#00DDFF)**, **yellow (#FFCC00)** and **orange (#FFA63F)** for neon and lamps. Lime (#9EFA00) for one storefront accent. Red (#FF3333) for a single big sign. White for bright neon highlights. Black outlines on everything. **Bright, punchy, detailed** — this layer is the character's immediate world, so it should feel alive.

Critical technical constraints:

- **Seamless horizontal tiling**: the leftmost pixel column must match the rightmost pixel column pixel-for-pixel. When the image loops, no seam should be visible. Design the storefronts so none gets chopped mid-building at the edges — either align building edges to the image edge, or make the edge-most building wrap cleanly.
- **Transparent sky** above the rooftops (alpha 0).
- **Transparent bottom ~20 px** — the app renders its own ground tiles there, so leave that strip clean/empty.
- Hard-edged chunky pixels. No gradients, no anti-aliasing, no smoothing.
- One-pixel outlines.

## Output checklist

- [ ] 512×200 px exactly
- [ ] Transparent PNG (sky above rooftops AND bottom ~20 px transparent)
- [ ] Only the 10 listed hex colors
- [ ] Leftmost column matches rightmost column (tiles seamlessly horizontally)
- [ ] Clear ARCADE storefront with neon marquee
- [ ] Street lamps with yellow bulbs
- [ ] Multiple neon signs across the strip (pink, cyan, red, orange, lime)
- [ ] No readable text (signs are pictogram only)
- [ ] Hard-edged pixels, no smoothing

Save as: `chore-quest/assets/sprites/backgrounds/near_arcade.png`
