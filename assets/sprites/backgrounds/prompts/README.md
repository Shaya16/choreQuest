# Arcade-City Backdrop — Parallax Layers

Two seamlessly tileable PNGs that stack to make the game world the character stands in. They scroll horizontally at different speeds to create depth.

## Shared constraints (every prompt must enforce these)

- **8-bit NES/arcade pixel art.** Chunky hard-edged pixels. **No anti-aliasing. No gradients. No blurs. No smoothing.** 1-pixel outlines only.
- **Palette locked to these 10 hex colors — no others, no shades:**
  `#000000 #FFFFFF #FFCC00 #FF3333 #00DDFF #FFB8DE #FFA63F #2121FF #9EFA00 #4A4A4A`
- **Seamless horizontal tiling is CRITICAL.** The leftmost pixel column must match the rightmost pixel column pixel-for-pixel so the image loops with no visible seam when scrolled.
- **Transparent PNG.** The sky / upper area above the buildings must be transparent (alpha 0) — a starfield renders behind these in the app.
- **Bottom-anchored.** All the detail sits at the bottom of the canvas. The top portion is pure transparency.
- Reference vibe: Streets of Rage, Double Dragon, Mega Man, Shatterhand city stages, Neo XYX — but **night-time neon arcade-strip** flavor.

## Files

| File | Size | Role |
|---|---|---|
| [far_arcade.md](far_arcade.md) | 512×160 | Distant city silhouette — scrolls slow, muted blues/cyans |
| [near_arcade.md](near_arcade.md) | 512×200 | Foreground storefronts + neon signs — scrolls fast, bright pinks/yellows |

## Save paths

- `chore-quest/assets/sprites/backgrounds/far_arcade.png`
- `chore-quest/assets/sprites/backgrounds/near_arcade.png`

After you drop the PNGs in, I'll swap out the procedural rectangles for the real thing.
