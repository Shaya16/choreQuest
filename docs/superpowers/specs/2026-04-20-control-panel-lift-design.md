# Control Panel Lift — Design

**Date:** 2026-04-20
**Surface:** home screen (`app/(tabs)/index.tsx`)
**Scope:** UI surface only. No schema, RPC, edge function, push trigger, or migration changes.

## Problem

The bottom `ControlPanel` row holds 1–2 ActionTiles (`SHOP` always; one of `CLAIM` / `COLLECT` / `OWED` when round-close state demands). It eats vertical real estate beneath the StrikeDrawer and visually disconnects player actions from the VS arena above. The Stage's city background — which already has storefronts (ARCADE, the red `!` sign) — is purely decorative; it could host the SHOP entrypoint diegetically.

## Goal

Lift the ControlPanel buttons onto the Stage as overlays on the existing city background, grow the Stage into the freed space, and keep the city pixel art untouched.

## Non-goals

- Re-drawing or extending the city pixel-art asset.
- Changing the shop screen, shop logic, round-close logic, tribute flow, or fighter card debt indicator.
- Changing tap navigation targets — `SHOP` still routes to `/(tabs)/shop`; `CLAIM` / `COLLECT` / `OWED` still route to `/(round)/over`.
- Changing prop shapes, types, or data wiring of `ActionTile`, `RedDotBadge`, or any consumer.

## Layout changes

### Stage height

`Stage` height grows from `420` → `520` (+100px, ~24% taller). The extra 100px comes from removing the `ControlPanel` row below the StrikeDrawer (which today is ~120px including its border and header strip — ~20px becomes safer bottom padding).

Internals of the Stage (fighter positioning, VS divider, XP/name HUD, countdown) keep their existing relative anchors. The black sky region grows; fighters remain floating above the city, untouched.

### SHOP button — always present, in the top bar

- **Position:** top bar of the screen (above the Stage), left side. Mirrors the existing MENU button on the right. Not on the Stage itself — the Stage's top-left is FighterCard HUD territory and the city band's bottom-left would obscure city art. The top bar already had room (MENU was alone on the right with `justifyContent: 'flex-end'`); switching to `space-between` gives SHOP the left slot symmetrically.
- **Style:** new `PillButton` helper — clean pill matching the MENU button style (black fill, 2px yellow `#FFCC00` border, `PressStart2P` label, icon char, 0.7 opacity on press). No drop shadow, bevel, lamp, or bounce — the ActionTile's in-your-face chrome was built for the ControlPanel row context and reads as busy when floated alone. `PillButton` is the shared shape.
- **Red-dot badge:** `RedDotBadge` pinned to top-right of the SHOP pill via a `position: 'relative'` wrapper, driven by `shopQueueCount > 0` exactly as today.
- **Tap:** `router.push('/(tabs)/shop')` — unchanged.

### Contextual overlay button — only when state demands

One of `CLAIM` / `COLLECT` / `OWED` (mutually exclusive today via `needsPick` / `needsCollect` / `isLoserDebt`).

- **Position:** absolute, bottom-center of the Stage, just above the ground tile strip. Only visible during round-close states, so transient overlap with the ARCADE storefront is acceptable — the button is the important thing in that moment. Bottom-center draws the eye and mirrors the top-center countdown/VS divider above.
- **Padding from Stage bottom:** 8px (inside the Stage's child container, which sits above the 24px ground strip — so ~32px clear of Stage's actual bottom edge).
- **Style:** same `PillButton` as SHOP, color-variant border per state (`#9EFA00` green for CLAIM, `#FFCC00` yellow for COLLECT, `#FF3333` red for OWED). Subtitle (`TRIBUTE`, or the tribute item name for COLLECT/OWED) appears on a second line.
- **Tap:** `router.push({ pathname: '/(round)/over', params: { roundId: pendingRound.id } })` — unchanged.

### Removed surface

- The local `ControlPanel` function (defined inline at `app/(tabs)/index.tsx:190`).
- The `<ControlPanel>...</ControlPanel>` block that wraps the four ActionTile invocations (lines ~711–772 today).
- The `bounceDelay={0}` / `lampDelay={0}` on the SHOP tile becomes superfluous when there's no row context — keep the props (defaulted to 0) for visual continuity with the contextual tile.

`ActionTile` and `RedDotBadge` components stay — they're reused as overlay buttons.

### Page below the Stage (unchanged ordering)

`StrikeDrawer` → `InviteBanner` (when `!p2`) → `<View style={{ height: 60 }} />` bottom padding. No control row anymore.

## State machine — overlay visibility

Same conditions as today, just relocated to the Stage:

| Condition | Button shown | Position |
|---|---|---|
| Always (player loaded) | `SHOP` | Top bar, left (mirror of MENU) |
| `needsPick` (winner, no tribute picked) | `CLAIM` | Stage bottom-center |
| `needsCollect` (winner, tribute picked, partner not delivered) | `COLLECT` | Stage bottom-center |
| `isLoserDebt` (loser, debt unresolved) | `OWED` | Stage bottom-center |
| None of the above | (no contextual button) | — |

`needsPick`, `needsCollect`, and `isLoserDebt` are mutually exclusive in the existing logic (winner-vs-loser branching); spec preserves that — the bottom-center slot holds at most one contextual pill at any time.

## Z-order on the Stage

Bottom-up:
1. City asset (background, untouched)
2. Ground tiles (untouched)
3. Fighters + VS divider + countdown + per-side HUD (untouched)
4. **NEW:** Contextual overlay (bottom-center, in front of city — only when round-close state demands)
5. Existing strike effects overlay (`StrikeProjectile`, `firstStrikeBanner`) stays above everything via `zIndex: 1001`

SHOP lives *outside* the Stage (in the screen's top bar), so it's not part of the Stage z-order at all. The contextual overlay sits *above* the fighters in z-order so a tap target is never blocked by a fighter sprite.

## Touch-target sizing

`PillButton` auto-sizes to its content (icon + label row with optional subtitle). With `paddingHorizontal: 10` and `paddingVertical: 5` plus `PressStart2P` at 9pt, the resulting tap target is roughly 36–44px tall and 90–130px wide depending on label length. Matches the existing MENU button footprint, which has been on device since the home screen shipped — known comfortable target.

## Files touched (estimated)

| File | Change |
|---|---|
| `app/(tabs)/index.tsx` | Remove `ControlPanel` function + its `<ControlPanel>` block. Remove `ActionTile` helper function entirely (no longer used). Add `PillButton` helper (clean pill matching MENU style). Pass `Stage` `height={520}`. Update top-bar row to `justifyContent: 'space-between'` with a new SHOP `PillButton` on the left (wrapped in `position: 'relative'` for `RedDotBadge`) and the existing MENU button unchanged on the right. Add bottom-center contextual overlay container inside the `<Stage>` children that renders one of three `PillButton`s (CLAIM / COLLECT / OWED) per round-close state. |
| (no new files) | `RedDotBadge`, `Stage`, `CityParallax`, `FighterCard`, `VsDivider`, `StrikeDrawer` all unchanged. `ActionTile` removed — it has no other consumers. |

## Verification

- `npx tsc --noEmit` exit 0.
- No edge-function or shared-lib changes → existing Deno tests still 32/32; no new tests required (UI surface only, project pattern from prior shop/arsenal redesigns).
- On-device smoke checklist:
  1. Home loads. SHOP pill visible in the top bar left, mirroring MENU on the right. Stage visibly taller than before.
  2. ControlPanel row no longer present below StrikeDrawer.
  3. Tap SHOP pill → shop screen opens.
  4. With `shopQueueCount > 0`, red dot badge visible on SHOP pill corner.
  5. Force-close a round as winner with no tribute picked → CLAIM pill appears bottom-center of Stage.
  6. Pick a tribute → CLAIM disappears, COLLECT appears in same slot (with tribute item name as subtitle).
  7. As loser of a closed round → OWED pill appears bottom-center of Stage, red border.
  8. Tap any contextual pill → routes to `/(round)/over`.
  9. Contextual pill doesn't collide with fighters' feet or the ground tile strip.
  10. With no P2, InviteBanner still appears below the Stage.

## Out-of-scope for this design (potential follow-ups)

- Diegetic SHOP treatment (turning SHOP into an actual storefront drawn on the city asset, alongside ARCADE) — explicitly deferred per the brainstorming session: keep the city asset untouched.
- Fighter-anchored contextual buttons (OWED appearing at the losing fighter's feet) — considered and rejected as too prone to colliding with the existing debt indicator on the FighterCard.
- Animation polish on the contextual slide-in (custom slide-from-below transition) — current bounce-in is sufficient for the first ship; revisit if the appearance feels abrupt on device.

## Decisions made during brainstorming (not in any prior doc)

- **City asset stays untouched.** Originally explored adding a SHOP storefront as a new building in the city skyline. Rejected to avoid pixel-art work and to keep the design focused on the buttons.
- **Buttons, not billboards.** Originally explored neon-billboard treatments mounted on rooftops. Rejected — too complex visually, would crowd the fighters' black sky space, and the existing `ActionTile` style is already polished and themed.
- **Stage grows, not StrikeDrawer.** Of the three ways to spend the freed ~120px (grow Stage / lift StrikeDrawer / split), chose grow-Stage to give the city more breathing room and make the new overlays feel like they belong to a larger space.
- **SHOP bottom-left, contextual bottom-right.** Originally explored SHOP top-left + contextual bottom-center. Self-review caught that the Stage's top corners are already occupied by FighterCard HUD (name + score bar + XP + coins), and the sky between HUD and fighters is too narrow on small devices. Revised to put both overlays in the city band at the bottom: SHOP left, contextual right. Still separates "permanent" from "call to action" horizontally; avoids all HUD/fighter collisions; sits on the visually inert city backdrop.
- **Subtitle dropped from SHOP overlay.** The current `subtitle="REDEEM"` is part of the row layout. As a free-floating overlay, the single-line label reads cleaner. The contextual tile keeps its dynamic subtitle (`pendingItem?.name?.slice(0, 14)?.toUpperCase()`) because it's load-bearing context.
- **SHOP moved to top bar instead of inside Stage.** First implementation placed SHOP at Stage bottom-left. On review the user pointed out this didn't match the brainstorm pick (top-left) and the ActionTile visual style read as busy/cluttered when free-floating. Replaced with a `PillButton` matching the existing MENU pill, and moved SHOP to the top bar's left slot so it mirrors MENU on the right. Removes the HUD-collision concern that drove the bottom-left compromise (top bar is outside the Stage, so no FighterCard collision).
- **`PillButton` replaces `ActionTile` for all lifted buttons.** The original `ActionTile` — icon window, bevel, drop shadow, blinking lamp, bounce animation — was designed for the ControlPanel row and reads as visually busy when floated alone. New `PillButton` is a simpler black-fill + colored-border pill with icon + label (+ optional subtitle), matching the MENU button shape already on screen. Applied uniformly to SHOP (top bar) and the contextual overlay (stage bottom-center). `ActionTile` deleted — no other consumers.
