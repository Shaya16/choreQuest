# Tribute Debt — Loser-Anchored Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the header-overlapping `DebtBadge` floating stack with a ball-and-chain image chained to the loser's sprite plus a short caption below it.

**Architecture:** Split `components/game/DebtBadge.tsx` into two small presentational components (`DebtChain`, `DebtCaption`) consumed by `FighterCard` via a new optional `debt` prop. `DebtChain` renders inside the sprite's existing bob `MotiView` so the chain rises/falls with the fighter. `DebtCaption` renders in the character-stage's bottom padding slot. The home screen computes a single `debt` value at the render root and hands it to the loser's `FighterCard`.

**Tech Stack:** React Native + Expo, `moti` for the existing sprite bob animation, `react-native-reanimated` (no longer needed in DebtBadge — the bob lives in FighterCard now).

**Design spec:** [docs/superpowers/specs/2026-04-20-tribute-debt-loser-anchor-design.md](chore-quest/docs/superpowers/specs/2026-04-20-tribute-debt-loser-anchor-design.md)

**Testing note:** This project has no JS unit-test harness; verification is via `npx tsc --noEmit` for type correctness plus manual visual check with both `variant === 'owes'` (loser view) and `variant === 'collects'` (winner view). Each task documents what to eyeball in the running app. The dev menu's **FORCE CLOSE** button is the fastest way to get into a pending-tribute state.

---

## Files touched

- **Rewrite:** [components/game/DebtBadge.tsx](chore-quest/components/game/DebtBadge.tsx) — existing `top: -42` floating-stack component is retired; two new exports (`DebtChain`, `DebtCaption`) live in its place
- **Modify:** [components/game/FighterCard.tsx](chore-quest/components/game/FighterCard.tsx) — accept a `debt` prop; render `<DebtChain />` inside the sprite's outer bob; render `<DebtCaption />` in the character-stage's `paddingBottom` slot
- **Modify:** [app/(tabs)/index.tsx](chore-quest/app/(tabs)/index.tsx) — delete the `DebtBadgeMaybe` helper at ~line 253–269 and the two `<DebtBadgeMaybe />` render blocks at ~676–713; replace with one `debt` computation near `needsPick`/`needsCollect` and pass it to the loser's `FighterCard`
- **Asset (already shipped):** [assets/sprites/worlds/ball_and_chain.png](chore-quest/assets/sprites/worlds/ball_and_chain.png)

---

## Task 1: Rewrite `components/game/DebtBadge.tsx`

**Files:**
- Rewrite: `components/game/DebtBadge.tsx`

- [ ] **Step 1: Replace the file contents**

Overwrite [components/game/DebtBadge.tsx](chore-quest/components/game/DebtBadge.tsx) with:

```tsx
import { Image, Text, View } from 'react-native';

/**
 * Visual debt indicators for a fighter whose round-close tribute is still
 * pending. Split into two pieces so FighterCard can render them in their
 * correct Z-layer:
 *   - DebtChain renders inside the sprite's bob MotiView, behind the sprite.
 *   - DebtCaption renders below the sprite in the character-stage padding.
 *
 * Gating (loser-only, item-picked) lives in the Home screen. Neither
 * component takes a side/flip prop; the chain asset is symmetric.
 */

export type DebtVariant = 'owes' | 'collects';

/**
 * Ball-and-chain overlay. Sized to hug the 140px sprite — shackle aligns
 * around ankle height, ball hangs below. No animation of its own; it bobs
 * with the sprite because FighterCard mounts it inside the bob MotiView.
 */
export function DebtChain() {
  return (
    <Image
      source={require('@/assets/sprites/worlds/ball_and_chain.png')}
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: 72,
        height: 144,
        // Centered on the 140px sprite box; shackle sits at ~ankle height,
        // ball hangs below the feet. Tune if visual QA says otherwise.
        bottom: -28,
        alignSelf: 'center',
      }}
      resizeMode="contain"
    />
  );
}

/**
 * Short caption under the sprite, viewer-relative:
 *   - owes    → "YOU OWE {icon}"  in red (loser looking at themselves)
 *   - collects → "YOU GET {icon}" in yellow (winner looking at the loser)
 * Item name is NOT repeated here — it's already on the Control Panel
 * ActionTile subtitle.
 */
export function DebtCaption({
  variant,
  itemIcon,
}: {
  variant: DebtVariant;
  itemIcon: string;
}) {
  const color = variant === 'owes' ? '#FF3333' : '#FFCC00';
  const verb = variant === 'owes' ? 'YOU OWE' : 'YOU GET';
  return (
    <Text
      style={{
        fontFamily: 'PressStart2P',
        color,
        fontSize: 7,
        letterSpacing: 1,
        textAlign: 'center',
      }}
      numberOfLines={1}
    >
      {verb} {itemIcon}
    </Text>
  );
}
```

- [ ] **Step 2: Confirm the file compiles in isolation**

Run: `npx tsc --noEmit`
Expected: exit 0.

If errors mention missing `DebtBadge` / `DebtBadgeMaybe` imports in consumers, that's expected until Task 3 lands — move on to Task 2.

---

## Task 2: Wire `DebtChain` and `DebtCaption` into `FighterCard`

**Files:**
- Modify: `components/game/FighterCard.tsx`

- [ ] **Step 1: Add the `debt` prop to the type**

At [FighterCard.tsx:14-22](chore-quest/components/game/FighterCard.tsx:14), replace the `Props` type:

```tsx
import { DebtChain, DebtCaption, type DebtVariant } from './DebtBadge';

type Props = {
  player: Player | null;
  score: number;
  side: 'left' | 'right';
  isLeader: boolean;
  attackKey: number; // increments when this player lands a hit — triggers lunge + pop
  lastDelta: number | null;
  maxScoreHint: number;
  debt?: { variant: DebtVariant; itemIcon: string } | null;
};
```

And destructure `debt` in the function signature:

```tsx
export function FighterCard({
  player,
  score,
  side,
  isLeader,
  attackKey,
  lastDelta,
  maxScoreHint,
  debt,
}: Props) {
```

- [ ] **Step 2: Render `<DebtChain />` inside the sprite's outer bob MotiView**

In [FighterCard.tsx:261-305](chore-quest/components/game/FighterCard.tsx:261), change the sprite block so `<DebtChain />` is the *first* child of the outer bob MotiView (renders behind the inner sprite MotiView because earlier siblings paint first in React Native). The final structure:

```tsx
{meta ? (
  <MotiView
    from={{ translateY: 0 }}
    animate={{ translateY: -6 }}
    transition={{
      type: 'timing',
      duration: 900,
      loop: true,
      repeatReverse: true,
    }}
  >
    {debt && <DebtChain />}
    <MotiView
      from={{ scale: 1 }}
      animate={{ scale: 1.04 }}
      transition={{
        type: 'timing',
        duration: 2400,
        loop: true,
        repeatReverse: true,
        delay: side === 'left' ? 0 : 1200,
      }}
    >
      {activeSheet ? (
        <AnimatedSprite
          sheet={activeSheet.source}
          frameCount={activeSheet.frames}
          sourceFrameWidth={activeSheet.frameW ?? DEFAULT_SHEET_FRAME_W}
          sourceFrameHeight={activeSheet.frameH ?? DEFAULT_SHEET_FRAME_H}
          displayWidth={140}
          frameDurationMs={activeSheet.durationMs ?? 120}
          facingFlip={facingFlip as 1 | -1}
        />
      ) : (
        <Image
          source={meta.sprite}
          style={{
            width: 140,
            height: 140,
            transform: [{ scaleX: facingFlip }],
          }}
          resizeMode="contain"
        />
      )}
    </MotiView>
  </MotiView>
) : (
  <EmptySlot side={side} />
)}
```

- [ ] **Step 3: Render `<DebtCaption />` at the bottom of the character stage**

At [FighterCard.tsx:170-177](chore-quest/components/game/FighterCard.tsx:170) (the `Character stage` outer `View`), add a caption slot after the sprite block but still inside the stage `View`. Replace the stage block's closing so that, *after* the MotiView/EmptySlot render, there is a caption row:

```tsx
{/* Character stage */}
<View
  style={{
    height: 160,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 14,
  }}
>
  {/* ...existing preload, flash, damage popup, shadow pulse, sprite MotiView / EmptySlot... */}

  {debt && (
    <View
      style={{
        position: 'absolute',
        bottom: 2,
        left: 0,
        right: 0,
        alignItems: 'center',
      }}
    >
      <DebtCaption variant={debt.variant} itemIcon={debt.itemIcon} />
    </View>
  )}
</View>
```

Note: the caption is in an absolutely-positioned child at `bottom: 2` so it tucks into the existing `paddingBottom: 14` without pushing the sprite upward.

- [ ] **Step 4: Confirm typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0 in FighterCard. Consumer errors in `app/(tabs)/index.tsx` still appear because it still imports the removed `DebtBadgeMaybe` — that's Task 3.

---

## Task 3: Update `app/(tabs)/index.tsx`

**Files:**
- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: Delete the stale import and helpers**

At [index.tsx:11](chore-quest/app/(tabs)/index.tsx:11), remove:

```tsx
import { DebtBadge } from '@/components/game/DebtBadge';
```

At [index.tsx:253-278](chore-quest/app/(tabs)/index.tsx:253), delete the entire `DebtBadgeMaybe` function (including the closing `}` and any blank line separator).

At [index.tsx:286-288](chore-quest/app/(tabs)/index.tsx:286), delete the `stripIcon` helper — it was only used by `DebtBadgeMaybe`.

**Keep** `extractIcon` at [index.tsx:281-284](chore-quest/app/(tabs)/index.tsx:281) — it's still used by the new `debtForLoser` computation below.

- [ ] **Step 2: Update two stale comments**

At [index.tsx:378](chore-quest/app/(tabs)/index.tsx:378), the comment mentions `DebtBadge`:

```tsx
// the loser still owes. Drives the home-screen Control Panel CTA + DebtBadge.
```

Change to:

```tsx
// the loser still owes. Drives the home-screen Control Panel CTA + the
// loser-anchored ball-and-chain indicator.
```

At [index.tsx:663](chore-quest/app/(tabs)/index.tsx:663), the comment about `DebtBadge` layers:

```tsx
{/* P1 fighter wrapper — DebtBadge layers above when applicable.
    `alignSelf: 'stretch'` is required so FighterCard's flex:1
    still fills the parent column width. */}
```

Change to:

```tsx
{/* P1 fighter wrapper — FighterCard handles debt indicator internally. */}
```

Apply the same simplification to the P2 wrapper comment at [index.tsx:695](chore-quest/app/(tabs)/index.tsx:695) if present (it currently says `/* P2 fighter wrapper — same layout fix as P1 above. */` — can be left as-is since it doesn't reference DebtBadge).

- [ ] **Step 3: Compute `debtForLoser` near the render root**

Just after the `isLoserDebt` block at [index.tsx:443-446](chore-quest/app/(tabs)/index.tsx:443), add:

```tsx
// Single source of truth for the on-Stage debt indicator. Loser-only, and
// only once the winner has picked a tribute item. Same viewer-variant rule
// as the old DebtBadgeMaybe: if the viewer is the winner, the loser's chain
// labels as 'collects' (yellow YOU GET); otherwise it labels as 'owes'
// (red YOU OWE — viewer is the loser).
const debtForLoser =
  pendingRound && pendingItem && pendingRound.loser_id != null
    ? {
        variant:
          pendingRound.winner_id === player?.id
            ? ('collects' as const)
            : ('owes' as const),
        itemIcon: extractIcon(pendingItem.name),
      }
    : null;
```

- [ ] **Step 4: Replace both `<DebtBadgeMaybe />` blocks with `debt` props**

In [index.tsx:662-684](chore-quest/app/(tabs)/index.tsx:662) (P1 column), the `FighterCard` call becomes:

```tsx
<View style={{ flex: 5, justifyContent: 'flex-end' }}>
  <View style={{ flex: 1, position: 'relative' }}>
    <FighterCard
      player={p1}
      score={p1Score}
      side="left"
      isLeader={leader === 'p1' && p2 != null}
      attackKey={attackKeyP1}
      lastDelta={lastDeltaP1}
      maxScoreHint={maxScoreHint}
      debt={p1 && debtForLoser && pendingRound?.loser_id === p1.id ? debtForLoser : null}
    />
  </View>
</View>
```

And the P2 column at [index.tsx:694-715](chore-quest/app/(tabs)/index.tsx:694) becomes:

```tsx
<View style={{ flex: 5, justifyContent: 'flex-end' }}>
  <View style={{ flex: 1, position: 'relative' }}>
    <FighterCard
      player={p2}
      score={p2Score}
      side="right"
      isLeader={leader === 'p2'}
      attackKey={attackKeyP2}
      lastDelta={lastDeltaP2}
      maxScoreHint={maxScoreHint}
      debt={p2 && debtForLoser && pendingRound?.loser_id === p2.id ? debtForLoser : null}
    />
  </View>
</View>
```

Both `<DebtBadgeMaybe .../>` JSX blocks inside those column wrappers are deleted.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, clean.

---

## Task 4: Visual verification

**Files:** (none — this is a runtime check)

- [ ] **Step 1: Start the dev server**

Run: `npx expo start`
Open the app on the simulator or device you usually test on.

- [ ] **Step 2: Reach a pending-tribute state**

In the app's **MENU tab**, tap the dev **FORCE CLOSE** button. This force-closes the current round and navigates to round-over.

Complete tribute pick (if you're the winner stub) so `tribute_shop_item_id` is set. Return to the Home tab.

- [ ] **Step 3: Eyeball the loser's column**

Verify:

- Ball-and-chain image sits on the loser's sprite, shackle roughly at ankle height, ball hanging below the feet
- The chain bobs up and down in sync with the sprite's breathing
- The caption reads `YOU GET {icon}` in yellow when you're viewing as the winner, `YOU OWE {icon}` in red when viewing as the loser
- The P1/P2 name label and MENU button at the top of the screen are NO LONGER overlapped by anything
- The item name ("DISHES FOR A WEEK" or whichever) still appears on the `COLLECT` / `OWED` ActionTile at the bottom

- [ ] **Step 4: Check the other side**

If available, switch to the other player's account (or use the dev stub swap in MENU) and verify the variant flips correctly: winner view shows yellow `YOU GET`, loser view shows red `YOU OWE`.

- [ ] **Step 5: Check the tied-round edge case**

Force close a round where neither player hit the threshold (tied/inactive). Verify no chain, no caption renders on either fighter. This protects against a regression where the gating broke.

- [ ] **Step 6: Final typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

---

## Rollback note

If the chain asset looks wrong at runtime (wrong size, wrong Y offset, bleeds over the VS divider), the only values likely to need tuning are in `DebtChain`: `width`, `height`, `bottom`. Those are all literals inside one component — no other file touches them.
