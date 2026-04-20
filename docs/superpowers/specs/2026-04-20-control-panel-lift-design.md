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

### SHOP overlay button — always present

- **Position:** absolute, top-left of the Stage. Sits in the black sky area, above the fighters' top edge, well clear of the VS divider and the per-side name/XP HUD.
- **Padding from Stage edge:** 12px top, 12px left.
- **Style:** unchanged `ActionTile` (existing pixel button — black fill, 3px yellow `#FFCC00` border, 4px drop shadow that disappears on press, bounce-in + lamp-glow intro animations). Icon `💰`, label `SHOP`. **Subtitle (`REDEEM`) dropped** — single-line label keeps the overlay compact.
- **Red-dot badge:** `RedDotBadge` keeps its existing absolute-corner positioning; pins to top-right of the SHOP button, driven by `shopQueueCount > 0` exactly as today.
- **Tap:** `router.push('/(tabs)/shop')` — unchanged.

### Contextual overlay button — only when state demands

One of `CLAIM` / `COLLECT` / `OWED` (mutually exclusive today via `needsPick` / `needsCollect` / `isLoserDebt`).

- **Position:** absolute, bottom-center of the Stage. Sits just above the ground tile strip, in front of the city.
- **Padding from Stage bottom:** 28px (clears the ground tiles + a small visual gap).
- **Style:** unchanged `ActionTile` with its existing color-per-state treatment (`#9EFA00` green for CLAIM, `#FFCC00` yellow for COLLECT, `#FF3333` red for OWED). The existing `bounceDelay={120}` + `lampDelay={200}` already gives the slide-in feel.
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

| Condition | Overlay shown | Position |
|---|---|---|
| Always (player loaded) | `SHOP` | Stage top-left |
| `needsPick` (winner, no tribute picked) | `CLAIM` | Stage bottom-center |
| `needsCollect` (winner, tribute picked, partner not delivered) | `COLLECT` | Stage bottom-center |
| `isLoserDebt` (loser, debt unresolved) | `OWED` | Stage bottom-center |
| None of the above | (no contextual button) | — |

`needsPick`, `needsCollect`, and `isLoserDebt` are mutually exclusive in the existing logic (winner-vs-loser branching); spec preserves that — the bottom-center slot holds at most one contextual tile at any time.

## Z-order on the Stage

Bottom-up:
1. City asset (background, untouched)
2. Ground tiles (untouched)
3. Fighters + VS divider + countdown + per-side HUD (untouched)
4. **NEW:** SHOP overlay (top-left)
5. **NEW:** Contextual overlay (bottom-center)
6. Existing strike effects overlay (`StrikeProjectile`, `firstStrikeBanner`) stays above everything via `zIndex: 1001`

The two new overlays sit *above* the fighters in z-order so a tap target is never blocked by a fighter sprite, but their layout positions (top-left sky, bottom-center above ground) place them where they don't visually collide with the fighters.

## Touch-target sizing

`ActionTile` today uses `flex: 1` inside its `ControlPanel` row, which produced a wide, low button. Free-floating overlays need explicit sizing:

- **SHOP overlay:** `width: 96`, button content auto-sized vertically. Height should land near 56–64px so the touch target meets the iOS 44pt minimum comfortably.
- **Contextual overlay:** `width: 140` (longer label like `COLLECT TRIBUTE` needs more room), same vertical sizing.

These are starting numbers — implementation may need to tune by ±10px after on-device check.

## Files touched (estimated)

| File | Change |
|---|---|
| `app/(tabs)/index.tsx` | Remove `ControlPanel` function + its `<ControlPanel>` block. Pass `Stage` `height={520}`. Add two new absolutely-positioned overlay containers inside the `<Stage>` children: top-left for `SHOP`, bottom-center for the contextual tile. Update the `RedDotBadge` parent to remain `position: 'relative'` around the SHOP overlay. |
| (no new files) | `ActionTile`, `RedDotBadge`, `Stage`, `CityParallax`, `FighterCard`, `VsDivider`, `StrikeDrawer` all unchanged. |

## Verification

- `npx tsc --noEmit` exit 0.
- No edge-function or shared-lib changes → existing Deno tests still 32/32; no new tests required (UI surface only, project pattern from prior shop/arsenal redesigns).
- On-device smoke checklist:
  1. Home loads. SHOP overlay visible top-left of Stage. Stage visibly taller than before.
  2. ControlPanel row no longer present below StrikeDrawer.
  3. Tap SHOP overlay → shop screen opens.
  4. With `shopQueueCount > 0`, red dot badge visible on SHOP overlay corner.
  5. Force-close a round as winner with no tribute picked → CLAIM overlay slides up bottom-center.
  6. Pick a tribute → CLAIM disappears, COLLECT appears in same slot.
  7. As loser of a closed round → OWED overlay appears bottom-center, red.
  8. Tap any contextual overlay → routes to `/(round)/over`.
  9. No overlay collides with fighters, VS divider, name/XP HUD, or countdown.
  10. With no P2, InviteBanner still appears below the Stage.

## Out-of-scope for this design (potential follow-ups)

- Diegetic SHOP treatment (turning SHOP into an actual storefront drawn on the city asset, alongside ARCADE) — explicitly deferred per the brainstorming session: keep the city asset untouched.
- Fighter-anchored contextual buttons (OWED appearing at the losing fighter's feet) — considered and rejected as too prone to colliding with the existing debt indicator on the FighterCard.
- Animation polish on the contextual slide-in (custom slide-from-below transition) — current bounce-in is sufficient for the first ship; revisit if the appearance feels abrupt on device.

## Decisions made during brainstorming (not in any prior doc)

- **City asset stays untouched.** Originally explored adding a SHOP storefront as a new building in the city skyline. Rejected to avoid pixel-art work and to keep the design focused on the buttons.
- **Buttons, not billboards.** Originally explored neon-billboard treatments mounted on rooftops. Rejected — too complex visually, would crowd the fighters' black sky space, and the existing `ActionTile` style is already polished and themed.
- **Stage grows, not StrikeDrawer.** Of the three ways to spend the freed ~120px (grow Stage / lift StrikeDrawer / split), chose grow-Stage to give the city more breathing room and make the new overlays feel like they belong to a larger space.
- **SHOP top-left, contextual bottom-center.** Of the three placement options (bottom row of buttons / top-left + bottom-center / fighter-anchored), chose split positioning to separate "permanent fixture" from "this round's call to action" visually.
- **Subtitle dropped from SHOP overlay.** The current `subtitle="REDEEM"` is part of the row layout. As a free-floating overlay, the single-line label reads cleaner. The contextual tile keeps its dynamic subtitle (`pendingItem?.name?.slice(0, 14)?.toUpperCase()`) because it's load-bearing context.
