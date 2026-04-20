# Home Arena Redesign — Design

**Date:** 2026-04-20
**Surface:** home screen (`app/(tabs)/index.tsx`) + `Stage`, `FighterCard`, `VsDivider`, `StrikeDrawer`
**Scope:** UI surface only. No schema, RPC, edge function, push trigger, or migration changes.

## Problem

The home screen reads as a stack of equal-weight slabs: top bar → compact VS arena → StrikeDrawer world grid already expanded. Nothing commands attention. The VS divider is a small column between fighters; the per-fighter HUD is crammed above a small sprite; the arsenal drawer is always open, so the "log an activity" action doesn't feel like a deliberate tap — it's just there.

## Goal

Rework the closed-state home screen into a proper arcade splash: big sprites, giant `VS` watermarked behind them, player names above the fighters, bars/XP/coins below, and an "Activity Arsenal" peek button half-emerging from the bottom of the stage as the primary call-to-action. Opening the drawer shrinks the stage and reveals the existing world picker.

## Non-goals

- Changing the logging flow, world picker internals, or move list rendering inside the open drawer.
- Changing sprite art, city art, ground tiles, or any asset.
- Changing the data shown per fighter (name, crown on leader, score bar, XP, coin wallet, debt indicator).
- Changing navigation (SHOP, MENU, contextual pill all route to the same places).

## Visual composition (closed state)

1. **Top bar** — SHOP pill (bigger) on the left, MENU pill on the right. Same routes, same red-dot badge.
2. **Stage** (taller than today, ~600px):
   - **Giant outlined `VS` watermark** centered in the upper sky, ~180pt, yellow stroke only (no fill), semi-transparent, behind the fighters. Not animated.
   - **Round/countdown ribbon** (`R22 · +20 LEAD · 7d 15h` or similar) — a single small cyan pill tucked just under the VS watermark, replacing the stacked VsDivider column.
   - **Fighters** — two columns, bigger sprite (display width 140 → 180). Each column:
     - Player name (with crown when leader) **above** the sprite.
     - Sprite in the middle.
     - Score bar + `XP n` + coin count **below** the sprite. Same bar mechanics, same colors, same debt-aware accent.
   - **City asset + ground tiles** — unchanged.
   - **Contextual pill** (CLAIM/COLLECT/OWED) — unchanged. Still bottom-center when round-close state demands.
3. **Peek arsenal handle** — rounded-top yellow tab, ~220px wide, positioned so its top edge sits *inside* the bottom of the stage and its body emerges below. Label `ACTIVITY ARSENAL` with subtitle `N AMMO · TAP TO LOG` and a pulsing down-arrow hint.

## Visual composition (open state)

- Stage shrinks to ~300px (city still visible, but less sky).
- Peek handle flips to close affordance (up-arrow, same label).
- Drawer body expands below the handle showing the existing world picker → world moves flow (unchanged internals).
- InviteBanner and the rest of the screen below stay as today.

The stage doesn't animate in this first pass — it swaps heights on drawer toggle. Animation polish deferred.

## Component-level changes

### `Stage.tsx`

- Add optional `watermark?: ReactNode` prop (or hardcode a `<GiantVS />` layer — see below). Render between the `CityParallax` layer and the `children` layer so it sits behind fighters but above the city/sky gradient.
- Accept the current height API unchanged. Home screen passes different values for closed/open drawer state.

New `GiantVS` component (co-located in `Stage.tsx` or `VsDivider.tsx`):

- Absolute-positioned inside Stage, centered horizontally, top-aligned with a small inset.
- Renders `VS` in `PressStart2P` at a large size (~120–140pt to start; tune on device).
- Yellow outline via `text-stroke` workaround in RN: a stack of offset-shadow `Text`s (4 copies offset by ±2px forming an outline) plus a transparent fill. Or use a single `Text` with a thick `textShadow` in the leader accent for a glow effect. **Pick:** stacked-shadow outline for arcade feel. Color `#FFCC00`. Opacity `0.85`.
- Purely decorative. No taps.

### `VsDivider.tsx`

- **Deprecate the current column-stack layout.** Replace with a single compact horizontal pill: `R{n} · +{margin} LEAD · {countdown}`. Cyan border (`#00DDFF`), black fill, ~8pt text.
- Margin sign flips with leader (`+20 LEAD` vs `TIED`).
- Rendered in a thin strip near the top of the stage, under the giant VS watermark.

The pill occupies horizontal space across the top of the fighters row (one row, full-width-centered), not a column between them. The existing flex-5 / flex-3 / flex-5 layout in `index.tsx` collapses to a full-width fighters row with no middle gap.

### `FighterCard.tsx`

Reorder the current JSX:

| Today (top→bottom) | New (top→bottom) |
|---|---|
| Name + crown | **Name + crown** |
| Score bar | (sprite gets bigger) |
| XP + coins row | **Character stage** |
| Character stage | **Score bar** |
| Debt caption | **XP + coins row** |
| | Debt caption |

Specifics:
- `Character stage` height stays 160; sprite `displayWidth` grows from 140 → 180 (`AnimatedSprite` display width + the static `Image` width). Shadow pulse and damage popup positions recalibrate if needed (both keyed off `alignSelf: 'center'` already — likely no change).
- Score bar + XP + coins visual treatment stays identical (including `debtAccent` behavior on the bar fill).
- The "P1 · NAME" / "P2 · NAME" format stays — the P1/P2 label is load-bearing in couple view when names are long. No change to crown placement logic (left-of-name for P1, right-of-name for P2).
- `DebtFloor` renders under the sprite inside the character stage as today.
- `DebtCaption` rendered below the XP row (same end position as today, just below the newly-placed XP row).

### `StrikeDrawer.tsx`

Two changes.

**1. Default to collapsed.** `useState<DrawerView>('picker')` becomes `useState<DrawerView>('collapsed')`. The `openSignal` effect currently forces 'picker' on signal increment; keep it — still the right behavior.

**2. Redesign the header as a peek handle.** Replace the full-width yellow flat bar with a centered rounded-top tab:

- Outer container: `alignItems: 'center'` so the tab centers.
- Tab: width 220, rounded top corners (border radius 6), 3px black border (no bottom border), yellow gradient fill.
- Pressable surface with 0.8 opacity on press (unchanged mechanic).
- Content:
  - Tiny handle notch at top (horizontal 32×2 black bar, centered) for tactile affordance.
  - Label: `ACTIVITY ARSENAL` — `PressStart2P`, 11pt, 2px letter-spacing.
  - Subtitle: `{N} AMMO · TAP TO LOG` — `Silkscreen`, 8pt.
  - Pulsing indicator: `▾` (or down-arrow glyph), 14pt, subtle Moti opacity+translate loop, shown when collapsed. Flips to `▴` when expanded.
- `marginTop: -18` on the outer drawer container so the tab visually overlaps into the stage's bottom edge. Parent container in `index.tsx` needs `overflow: 'visible'` (today's stage wrapper view has no overflow prop, so this works by default).

The drawer below the handle (picker / world moves) is unchanged — same padding, same internals.

### `app/(tabs)/index.tsx`

- Top bar: change SHOP pill to the "bigger" variant — `paddingHorizontal: 16`, `paddingVertical: 8`, `borderWidth: 3`, label font `11pt` (up from 9), icon font `18pt` (up from 14), 2px letter-spacing to 3px. MENU stays its current size. Optional subtle glow via box-shadow equivalent (if the RN shadow API cooperates; otherwise skip — border thickness alone differentiates enough).
- Stage usage: closed-state `height={600}`, open-state `height={300}`. Lift the drawer's `view` state up to `HomeScreen` so the Stage height can react:

```tsx
const [drawerView, setDrawerView] = useState<DrawerView>('collapsed');
const drawerOpen = drawerView !== 'collapsed';
const stageHeight = drawerOpen ? 300 : 600;
```

Pass `view={drawerView} onViewChange={setDrawerView}` to `StrikeDrawer`. `StrikeDrawer` becomes a controlled component.

- Fighters row: remove the middle `flex: 3` `VsDivider` column. Layout becomes two fighter columns (flex-1 each) side-by-side. The shrunk `VsDivider` (round/countdown pill) gets rendered as an absolute element inside Stage, top-aligned below the giant VS.
- Contextual pill (CLAIM/COLLECT/OWED) stays bottom-center of stage as implemented.

## State machine — drawer

| `view` | Stage height | Peek handle shows | Drawer body |
|---|---|---|---|
| `'collapsed'` | 600 | ACTIVITY ARSENAL + ▾ | (hidden) |
| `'picker'` | 300 | ACTIVITY ARSENAL + ▴ | world grid |
| one of `WORLD_ORDER` | 300 | ACTIVITY ARSENAL + ▴ | world moves list |

Tap handle: `collapsed ↔ picker`. Tap a world: `picker → world`. Tap back: `world → picker`.

## Z-order in Stage (closed state, bottom-up)

1. Starfield / city / ground (unchanged layers from `Stage`)
2. Giant `VS` watermark
3. Round/countdown pill (small, top-center, under watermark)
4. Fighters row (name, sprite, bars)
5. Contextual pill (bottom-center, when round-close state demands)
6. Peek arsenal handle (top edge inside stage)

`StrikeProjectile` and `firstStrikeBanner` stay at `zIndex: 1001` — above all.

## Files touched (estimated)

| File | Change |
|---|---|
| `components/game/Stage.tsx` | Add giant-VS watermark layer (or accept a `watermark` prop). |
| `components/game/VsDivider.tsx` | Collapse column layout into a single round/margin/countdown pill. |
| `components/game/FighterCard.tsx` | Reorder sections: name above sprite, bars below. Enlarge sprite to 180. |
| `components/game/StrikeDrawer.tsx` | Default to `'collapsed'`, redesign header as peek handle, accept controlled `view` prop. |
| `app/(tabs)/index.tsx` | Lift drawer view state, dynamic stage height, bigger SHOP pill, remove middle VS column from fighters row, render compact VsDivider pill absolutely inside Stage. |

No new components. No deleted files.

## Verification

- `npx tsc --noEmit` exit 0.
- No edge-function, shared-lib, or schema changes → existing Deno tests still 32/32.
- On-device smoke checklist:
  1. Home loads closed. Giant `VS` watermark visible at top of stage. Both fighters render with name above sprite, bars below sprite, bigger sprite than before.
  2. Peek handle labeled `ACTIVITY ARSENAL` visible at the bottom edge of the stage, half overlapping.
  3. Tap handle → stage shrinks, drawer expands showing SELECT WORLD grid. Handle shows ▴.
  4. Tap handle again → drawer collapses, stage grows back. Handle shows ▾.
  5. Leader crown moves when margin flips.
  6. Score bar fills correctly; debt-accent color applies when loser has debt.
  7. Countdown pill updates every second; round number shown.
  8. SHOP pill is visibly bigger than MENU.
  9. Tap SHOP → `/(tabs)/shop`. Red-dot badge works when `shopQueueCount > 0`.
  10. Contextual pill (CLAIM/COLLECT/OWED) still appears bottom-center in round-close states.
  11. Ball-and-chain debt indicator still renders on the losing fighter when debt is live.
  12. Stage internals don't overflow on small devices (SE-class — test Stage children padding).

## Decisions made during brainstorming

- **Giant VS is outlined, not filled.** Solid yellow VS would fight the fighters for attention. An outlined stroke reads as "arcade watermark" without stealing focus.
- **Shrunk VsDivider to a single pill.** Today's four-line column (R#, VS, MARGIN number, MARGIN label, countdown box) duplicates the new giant VS and wastes space. Combining round + margin + countdown into one thin horizontal strip recovers vertical room for the bigger sprites.
- **Stage shrinks on drawer open instead of drawer overlaying stage.** Matches the user's "shrink top, open worlds" ask. Simpler than an animated overlay and avoids z-index fights with strike effects.
- **Controlled drawer state lifted to HomeScreen.** Required so Stage can size off `view`. Side benefit: the `openSignal` external-open flow (notification tap) becomes a simple `setDrawerView('picker')` at the parent level.
- **Sprite width 140 → 180.** Modest bump, not doubling. Chore Quest's class sprite sheet is authored at 32–48px frame size and scaled up — going past 180 will start to over-magnify the pixel art. 180 is the sweet spot.
- **No stage height animation in v1.** Animating height during the stage/drawer transition adds complexity (RN height animations are janky without Reanimated) and isn't on the user's ask. Straight toggle. Revisit if the swap feels abrupt on device.
- **Giant VS stays yellow, not leader-accented.** Color-coding the watermark to leader would be cute but visually loud — the leader crown + margin pill already signal who's ahead. Keep the watermark as a neutral stage dressing.
