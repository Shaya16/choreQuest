# Far Arcade Skyline (back parallax layer)

## Prompt

Create a 512×160 pixel horizontal pixel-art backdrop tile in classic 8-bit NES / arcade-era style. This is the **distant skyline layer** of a parallax city at night. A character sprite will stand in front of it, and a starfield will render behind it, so the upper portion of the image must be transparent. A faster-scrolling foreground layer will be rendered on top of this one.

Content: a dense silhouette of distant skyscrapers and apartment blocks seen from across a city at night. Varied building heights — the tallest ~110 px, the shortest ~40 px. Buildings are simple rectangular blocks with flat tops, occasional stepped rooftops, and thin antennas or water towers on a few. Each building has a repeating grid of tiny lit windows (2×2 or 2×3 pixel squares) — some cyan (#00DDFF), some yellow (#FFCC00), some dark (#000000, unlit). Most buildings are silhouetted in dark blue (#2121FF) or dark gray (#4A4A4A) with black outlines. One or two buildings can carry a small vertical neon sign (pink or cyan) — very small, subtle from distance, simple glyphs only, no readable text. A single tiny radio-tower blinker could sit on the tallest building.

Use ONLY these 10 hex colors — no other shades, no anti-aliasing, no gradients:
`#000000 #FFFFFF #FFCC00 #FF3333 #00DDFF #FFB8DE #FFA63F #2121FF #9EFA00 #4A4A4A`

Primary colors should be **dark blue (#2121FF)** and **dark gray (#4A4A4A)** for the silhouettes, **cyan (#00DDFF)** and **yellow (#FFCC00)** for the lit windows. Pink (#FFB8DE) only for tiny accent neon signs. Black outlines. White used sparingly for the brightest antenna-tip blinker. **Muted distance feel — this is the back layer, so it should not draw attention away from the foreground.**

Critical technical constraints:

- **Seamless horizontal tiling**: the leftmost pixel column must match the rightmost pixel column pixel-for-pixel. When the image loops, no seam should be visible. Design the buildings so none gets chopped at the edges.
- **Transparent sky**: everything above the rooftops is alpha 0 (fully transparent PNG background).
- Hard-edged chunky pixels. No gradients, no anti-aliasing, no smoothing.
- One-pixel outlines.

## Output checklist

- [ ] 512×160 px exactly
- [ ] Transparent PNG (sky above rooftops is fully transparent)
- [ ] Only the 10 listed hex colors
- [ ] Leftmost column matches rightmost column (tiles seamlessly horizontally)
- [ ] Distant silhouette feel — dark buildings, small lit windows, muted
- [ ] No readable text (signs are pictogram only)
- [ ] Hard-edged pixels, no smoothing

Save as: `chore-quest/assets/sprites/backgrounds/far_arcade.png`
