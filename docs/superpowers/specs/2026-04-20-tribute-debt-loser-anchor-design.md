# Tribute Debt — Loser-Anchored Indicator

**Date:** 2026-04-20
**Feature:** Re-home the post-round tribute/debt indicator from "floating above the fighter header" to "attached to the loser's sprite"
**Status:** Design approved, pending implementation plan

## Problem

When a round is closed and tribute is pending, `DebtBadge` renders above the loser's `FighterCard` via `position: absolute, top: -42`. Because the fighter column starts at the top of the VS Stage (with only a thin MENU row above), the three-line badge stack (item icon + `👑 COLLECT` or `🔗 OWED` + wrapped item name) crashes into the P2 name label and the MENU button. On screens with the tribute name wrapped to two lines, the header area reads as an unreadable mash.

Screenshot evidence: `COLLECT / DISHES FOR A WEEK` overlapping `P2 · KESSY` on the winner's view.

## Goal

Move the "this fighter is in debt" signal from the header zone onto the loser's sprite itself, so the header stays clean and the debt reads as a *visual property of the loser* (which is what it narratively is) rather than a floating HUD banner.

## Non-goals

- No change to tribute gameplay, DB state, round lifecycle, or edge-function logic. This is purely the on-Stage indicator.
- No change to the Control Panel ActionTiles (`CLAIM TRIBUTE` / `COLLECT` / `OWED`) at the bottom of Home — those stay as the CTA surface, including the item-name subtitle.
- No new variants. Same two cases as today: `owes` (loser's own view) and `collects` (winner's view of the loser).
- No scoped-away work on P1 header crowding unrelated to tribute (e.g., leader crown spacing). This spec only addresses the tribute indicator.

---

## Visual design

### Asset

- **New file:** [assets/sprites/worlds/ball_and_chain.png](chore-quest/assets/sprites/worlds/ball_and_chain.png)
- 2048×2048 RGBA, transparent background. Shipped.
- Ball-and-chain with an open shackle at the top (implying it cuffs around an unseen ankle). Iron-grey palette matching existing sprite crunch.
- One asset, used identically for both `owes` and `collects` — the chain reads "this fighter is in debt" from either perspective.

### Placement on the loser's FighterCard

- Rendered as an `<Image>` sibling of the sprite inside the sprite's `MotiView` bob in [FighterCard.tsx:272-305](chore-quest/components/game/FighterCard.tsx:272) so it floats and bobs with the fighter (consistent with the "sprites hover above the ground" design intent).
- Display size: **~72×72** (chain+ball reads at ~40–50px effective height after the transparent padding in the asset). Final value tuned during implementation against the running app.
- Anchored **horizontally centered on the sprite**, shackle at ankle height (~upper third of the 140px sprite box), ball hanging below. Centered placement means no horizontal flip is needed for P1 vs P2 — the asset is vertically symmetric enough (straight chain, round ball) to read correctly from either side.
- `pointerEvents="none"`, `position: absolute` relative to the character-stage `View`, rendered *behind* the sprite (via render order inside the MotiView) so the sprite's silhouette remains the hero.

### Caption

- Small `PressStart2P` line rendered *below* the sprite, inside the character-stage's existing `paddingBottom: 14` slot.
- Two variants by viewer:
  - Loser viewing themselves (`variant === 'owes'`): `YOU OWE {itemIcon}` — red (`#FF3333`).
  - Winner viewing the loser (`variant === 'collects'`): `YOU GET {itemIcon}` — yellow (`#FFCC00`).
- `fontSize: 7`, `letterSpacing: 1`, single line, no wrapping. The item *name* (e.g., "DISHES FOR A WEEK") is dropped from the Stage — it already lives on the COLLECT/OWED ActionTile subtitle in the Control Panel, so zero information is lost.

### Animation

- The ball-and-chain image sits inside the sprite's outer bob `MotiView` (the `-6` translateY loop), so it rises and falls with the fighter's breathing. No independent animation on the chain.
- The caption does not animate.

---

## Code changes

- **`components/game/DebtBadge.tsx`** — current single-component, absolutely-positioned-above-header implementation is retired. Replaced with two small exports in the same file:
  - `DebtChain()` — renders the ball-and-chain `<Image>`, sized and positioned as described above. No props.
  - `DebtCaption({ variant, itemIcon })` — renders the caption text. `variant` drives color and verb (`YOU OWE` vs `YOU GET`).
- **`components/game/FighterCard.tsx`** — accepts one new optional prop: `debt?: { variant: 'owes' | 'collects'; itemIcon: string } | null`. When non-null, renders `<DebtChain />` inside the sprite's outer bob `MotiView` and `<DebtCaption />` inside the character-stage's `paddingBottom` slot. When null, no change to current rendering.
- **`app/(tabs)/index.tsx`** — the two `DebtBadgeMaybe` blocks in the P1/P2 columns ([index.tsx:676-713](chore-quest/app/(tabs)/index.tsx:676)) are replaced by computing a single `debt` value (loser-only, item-picked) at the top of the render and passing it into the loser's `FighterCard`. The `DebtBadgeMaybe` helper at [index.tsx:253-269](chore-quest/app/(tabs)/index.tsx:253) is deleted (its logic collapses into the computation).
- The `top: -42` floating stack is deleted.

---

## Edge cases

- **Tied round (`winner_id == null`).** No loser, no debt, nothing renders. Today's code already gates on `round.loser_id !== fighterId` returning null — preserved.
- **Multiple unpaid closed rounds.** The Home screen's `pendingRound` query already limits to the single most-recent closed+unpaid round (see [index.tsx:388-394](chore-quest/app/(tabs)/index.tsx:388)). Indicator remains single-instance. No stacking.
- **Winner hasn't picked a tribute yet (`tribute_shop_item_id == null`).** Today, `DebtBadgeMaybe` only renders when both `pendingRound` and `pendingItem` are present ([index.tsx:676](chore-quest/app/(tabs)/index.tsx:676)), so the chain only appears *after* the winner picks. Unchanged.
- **Loser is P1 vs P2.** Chain renders identically on either side (centered on the sprite, symmetric asset). Caption layout follows the fighter card's existing `side === 'left' ? 'flex-start' : 'flex-end'` alignment so the text hugs the outer edge of the column instead of the VS divider.
- **Empty slot (no P2 yet).** `pendingRound` is gated on `couple` existing with two players. No indicator renders when the card is `EmptySlot`. Unchanged.
- **Item icon is a long emoji / combined emoji.** `fontSize: 7` caption of `YOU OWE 🍽️` is ~8 characters wide. Longest plausible icons (e.g., 🛁) render in a single glyph cell. No wrapping expected on standard device widths.

---

## Out of scope / explicitly deferred

- Animating the chain swaying or the ball dragging during sprite attack cycles. Today's sprite attack animation already replaces the whole idle sheet for ~2.25s; the chain (which is a separate image inside the same bob MotiView) continues to bob but does not react to attacks. Acceptable for v1.
- A "paid" visual state (chain breaking, falling away) when tribute is collected. The indicator simply disappears when `pendingRound` clears. Could be a future polish pass.
- Leader-crown collision with the chain when the loser is also the leader of a *new* round started after the old round closed without payment. Rare edge; the leader crown and the ball-and-chain live on different Y axes (crown at name label, chain at sprite ankle) so overlap is unlikely.
