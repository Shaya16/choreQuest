# Round Close & Tribute — Design

**Date:** 2026-04-19
**Feature:** Hide Jackpot, build round-close rollover, build tribute experience as a fighting-game ritual
**Status:** Design approved, pending implementation plan

## Problem

The product brief was 50/50 cooperative (shared Jackpot funding real dates) and competitive (weekly rounds with loser tribute). In live use the rivalry is the engine — the Jackpot is too abstract to motivate logging on a Tuesday night, while "I'm losing this round and she's about to make me cook her dinner" is concrete dread that drives behavior.

Phase 1 shipped the cooperative half (Jackpot tab, 70/30 coin split, jackpot goals seeded) but never finished the competitive half. The schema has `tribute_tier`, `tribute_selected`, `tribute_paid` columns. None of them are wired. Rounds start but never close — `status='active'` lives forever, no winner is declared, no tribute is selected, no rollover happens. The climax mechanic of every week of play does not exist in code.

## Goal

Sharpen Phase 1 to match the rivalry thesis:
1. Hide the cooperative layer (Jackpot tab, jackpot UI) without losing the data — the forever-layer pattern.
2. Build round-close rollover so every Sunday at 00:00 Asia/Jerusalem, the active round closes and a new one opens automatically.
3. Build the tribute experience as the visceral end-of-round climax — winner picks a real-world demand, loser owes it, both players feel it like a fighting game's K.O. screen, not like an in-app receipt.

## Non-goals

- No Phase 2 progression UI (Levels, Workshop, Memory Layer). XP keeps banking silently.
- No new sprite art. The cinematic composes existing components (`Stage`, `FighterCard`, `StrikeProjectile`, `StrikeBanner`, `AnimatedSprite`, `ActionFeed`).
- No retuning of shop prices. Combined wallet inflates ~3.3× — things will feel cheap for a few rounds. Tune after real data.
- No re-enabling Jackpot, no Jackpot-aware features. Tab is gone from UI; route file is left on disk so re-enabling is a one-line change.
- No deletion of the `personal_wallet` column or `tribute_paid` boolean — they go vestigial, get cleaned in a later migration.
- No multi-couple support. Single couple, both players in Asia/Jerusalem.
- No `expo-av` SFX implementation if the package isn't already wired. SFX hooks land as no-ops; audio is plumbed when assets exist.
- No Hall of Fame view of past rounds. Round data is persisted; consumption is a future surface.

---

## §1 — Wallet & Jackpot UI surgery

### DB

Zero schema changes. `coins_earned` still splits 70% `jackpot_share` / 30% `personal_share` per log. Forever-layer preserved exactly.

### UI

- **Jackpot tab removed** from `app/(tabs)/_layout.tsx`. The `app/(tabs)/jackpot.tsx` route file stays on disk. Re-enabling is adding the tab entry back.
- **Wallet display** anywhere "personal wallet" was shown becomes a single number called **Coins**, equal to lifetime `personal_share + jackpot_share` minus all `purchases` for that player minus any tribute-related deductions (none exist; tributes don't cost coins, only time).
- **`getSpendableCoins(playerId)`** helper in new `lib/wallet.ts`. Sources:
  1. `SUM(personal_share + jackpot_share)` from logs where `player_id = playerId`
  2. minus `SUM(shop_items.cost)` from purchases where `buyer_id = playerId` and `status != 'cancelled'`
  3. plus `SUM(winner_bonus_coins)` from rounds where `winner_id = playerId` (see §2)
- All shop / wallet display reads switch to this helper. `players.personal_wallet` column is no longer read; cached writes to it can stop. Vestigial.

**Why compute on read instead of backfilling `personal_wallet`:** combining the two shares means the cached column is wrong by definition. Computing from logs+purchases+round-bonuses is honest, requires no migration, and is cheap at couple-scale (hundreds of rows lifetime, not millions).

---

## §2 — Round close mechanic

### Trigger

New Supabase Edge Function: `supabase/functions/round-rollover-tick/index.ts`.

Pattern: pg_cron runs every 10 minutes Sunday→Monday, invokes the function. Function scans `rounds` where `status='active'` AND `end_date < CURRENT_DATE AT TIME ZONE 'Asia/Jerusalem'`. For each match, atomically closes the round and opens the next one.

Uses the same plumbing as the existing `notifications-tick` function. DST-safe (poll-and-check, no hard-coded UTC offsets). Idempotent (`UPDATE ... WHERE status='active'` — second call updates 0 rows).

### Migration

`supabase/migrations/0010_round_close_columns.sql`:
- Add to `rounds`: `winner_id UUID REFERENCES players(id)`, `loser_id UUID REFERENCES players(id)`, `margin INT`, `winner_bonus_coins INT DEFAULT 0`, `tribute_shop_item_id UUID REFERENCES shop_items(id)`, `tribute_paid_at TIMESTAMPTZ`.
- Existing `tribute_tier`, `tribute_selected`, `tribute_paid` stay as-is (backwards-compatible). `tribute_paid_at IS NOT NULL` becomes the canonical truth; `tribute_paid` keeps in sync via a backfill or trigger if needed (cleanup migration drops it later).
- Status check constraint expands to allow `'tied'` only if needed — current design uses `'closed'` with `winner_id=null` for ties; no constraint change required.

### Close algorithm (per round)

1. Compute `winnerScore` and `loserScore` = `SUM(coins_earned)` for each player's logs in the round.
2. Determine `winner_id` / `loser_id` by score. If equal, both null.
3. `margin = |winnerScore - loserScore|`. If tied, margin = 0.
4. Determine `tribute_tier`:
   - `loser logged 0 logs` → `'flawless'`
   - `winner took 5+ of 6 Worlds` → `'flawless'` (overrides margin)
   - `margin >= 150` → `'total_carnage'`
   - `margin 40..149` → `'knockout'`
   - `margin 1..39` → `'paper_cut'`
   - `margin == 0` → null (tied)
5. `winner_bonus_coins = MIN(FLOOR(margin * 0.25), 500)`. Zero if tied.
6. Update the round row: `status='closed'`, set winner/loser/margin/tribute_tier/winner_bonus_coins.
7. Insert next round (`ensureActiveRound` already handles the unique-active-round race via the `0007_rounds_unique_active.sql` partial index).
8. Enqueue push notifications:
   - Winner: `🥊 KO! You beat [Partner] by [margin] coins. Pick your tribute.`
   - Loser: `💀 Round over. You owe [Partner] tribute. They're picking now…`
   - Tied: `🤝 Round tied. Even score. Round [N+1] starts now.`

The bonus coins are persisted on the round row, not as a synthetic log. `getSpendableCoins` from §1 sums them in.

### "World" determination for Flawless

For the override "winner took 5+ of 6 Worlds": Worlds are the 6 categories in `activities.world` (gym, aerobics, university, diet, household, reading). Winner of a World = highest sum of `coins_earned` for logs in that World during the round. Worlds with zero logs from both players don't count toward the 6. If the winner takes 5+ of the worlds that *had logs at all*, Flawless triggers.

Edge: if only 1–2 Worlds had logs across both players, Flawless override is skipped (not enough surface for "domination" to be meaningful) and tier falls back to margin.

---

## §3 — Tribute experience (game-feel)

The full surface is built into one new route: `app/(round)/over.tsx` (or top-level `app/round-over.tsx` — implementation detail). Forced on app open via a check in `app/_layout.tsx` next to existing auth/couple gating: if there's a closed round where this player's role is unresolved, redirect.

Stacked rounds (e.g., player offline for 2 weeks): walk through cinematics oldest-first. Each round is its own moment — never merged into a summary.

### The K.O. cinematic — auto-plays on first open after close

~6 seconds, fully tappable to skip. Replayable from a `▶ Replay K.O.` button on the round-over screen.

1. **Boot in.** Same `Stage` from Home, both fighters at idle. Screen darkens around the arena.
2. **One last strike.** Winner's `StrikeProjectile` flies and connects on loser. Loser's `FighterCard` snaps to held "down" pose (existing strike-hit treatment, sustained). Heavy haptic; low-pitched arcade thud SFX (no-op if audio not wired).
3. **Screen flash to white.** Big arcade-font text slams in:
   - `K.O.` — Paper Cut
   - `KNOCKOUT!` — Knockout
   - `TOTAL CARNAGE!!` — Total Carnage
   - `FLAWLESS VICTORY!!!` — Flawless (extra particles, sustained note)
4. **Score tally.** Both scores count up digit-by-digit using the existing `useCountUp.ts` hook. When loser's number stops, winner's keeps going past it; the `+ MARGIN` flash is the crescendo. Bonus coins appear next: `+ 87 COINS WIRED` — coin sprites streak from the scoreboard into the winner's `FighterCard`.
5. **Tier stamp.** `[KNOCKOUT — TRIBUTE UNLOCKED]` slams in with red ink, slight rotation.
6. **CTA.**
   - Winner: `[ ▶ CLAIM TRIBUTE ]`
   - Loser: `[ ▶ ACCEPT DEFEAT ]`

**Tied case.** Skips steps 2–5. `Stage` shows both fighters in a mid-bow pose. Stamp: `R O U N D   T I E D`. Single button: `[ ▶ CONTINUE ]`. New round number revealed. Both players dismiss to home.

### Tribute selection — face-down cards (winner only)

After winner taps `CLAIM TRIBUTE`:

- Four shop items, curated by tier, presented as **face-down cards** floating above the arena.
  - Tier filter is a hardcoded cost-range mapping in `lib/tribute.ts`:
    - Paper Cut → cost 80–249
    - Knockout → cost 250–449
    - Total Carnage → cost 450–699
    - Flawless → cost 700+
  - Filter is `is_active = true AND cost IN [range]`. If a tier has fewer than 4 eligible items, fill with adjacent tier-down items.
  - Selection within the eligible pool: deterministic per round (e.g., `ORDER BY md5(round.id || shop_item.id) LIMIT 4`) so the cards stay the same across re-opens — no losing your "thinking" between sessions.
- Each card hover-bounces idly (Reanimated `useSharedValue`).
- **Tap a card → flip animation reveals it** (icon, name, tier label). Card-flip SFX per tap.
- Flipped cards can be flipped *back* (re-hide). Winner can shop the row freely.
- **Tap a flipped card a second time → lock it in.** Chosen card flies to center, grows, `T R I B U T E   L O C K E D` red stamp slams over it. Other cards shatter offscreen.
- Persist: `rounds.tribute_shop_item_id = <id>`. Push fires to loser (see below). Winner moves to "awaiting payment" view.

### Loser's selection cinematic

When loser opens app post-pick:

1. Their own arena boots in. Their fighter is in dazed/down pose (existing strike-hit, modulated).
2. The opponent's fighter walks up (slight x-translate over ~0.6s, idle bounce continues).
3. The opponent drops the **chosen tribute card** on top of them. Card flips reveal: e.g. `🍝 DINNER OF MY CHOICE`.
4. Stamp: `D E B T   I N C U R R E D`.
5. Single button: `[ ✓ ACKNOWLEDGE ]` — dismisses to home.

### Home arena, payment pending

The Home `Stage` re-renders based on payment state. Debt is shown *as part of the world*, not as overlay UI.

**Loser's home (debt outstanding):**
- Their `FighterCard` carries a chain sprite overlay (or a small `🔗` emoji badge floating beside the head — pick whichever is faster to ship).
- The owed item icon (e.g., `🍝`) floats slowly above their fighter's head, gently bobbing (Reanimated loop).
- `ActionFeed` shows a sticky line: `▸ DEBT: 🍝 DINNER OF MY CHOICE`.

**Winner's home (debt outstanding to them):**
- Their `FighterCard` stays at idle (no chain). If a smug-idle variant exists, use it; otherwise add a small `👑` emoji badge above head.
- The owed item icon floats above the *opponent's* fighter on their stage (same bobbing animation).
- `ActionFeed` sticky: `▸ COLLECT: 🍝 DINNER OF MY CHOICE — TAP TO CONFIRM`.

**Tap targets:**
- Winner taps the floating item icon (or the `ActionFeed` sticky) → opens the **Collect modal** (next section).
- Loser taps the floating item icon → opens a small read-only "Your debt: 🍝" reminder. No action available.

### Confirm received — the finisher (winner only)

Not a button tap. A **hold-to-confirm gauge**, charged like a special move.

- Modal shows the chosen item card large in center.
- Partner's fighter on one side ("they fed you"), winner's fighter on the other side, fists raised waiting.
- Big control: `▶ HOLD TO COLLECT`. As the winner holds:
  - Power gauge fills (Reanimated, 60fps).
  - Charging SFX builds in pitch (no-op if audio not wired).
  - Light haptic ramps from soft to firm over the duration.
  - Hold duration: **1.2 seconds**.
- **Release at full** → confirmation:
  - Screen flash. Heavy haptic. `P A I D` red stamp slams across the card.
  - Coin shower (Skia particle effect) cascades over both fighters.
  - Brief crowd-cheer / arcade jingle.
  - Both fighters return to neutral idle. Chain sprite drops off loser. Item icon shatters from above their head.
  - `ActionFeed` sticky line clears.
  - Persist: `rounds.tribute_paid_at = NOW()`. `tribute_paid = true` for backwards compat (handled in same UPDATE).
- **Release early** → gauge resets. Soft haptic fizzle. No accidental confirms.

After payment, the round is fully resolved. Both home arenas return to standard "active round" mode for the new round.

---

## §4 — Operational concerns

### Push (uses existing infrastructure)

All pushes go through the existing `lib/notifications.ts` + `expo_push_token` flow. Three new event types (defined in `lib/notifications.ts` event registry):
- `round_won` — fires to winner on close
- `round_lost` — fires to loser on close
- `round_tied` — fires to both on tied close
- `tribute_picked` — fires to loser when winner locks in a card
- `tribute_paid` — fires to loser when winner confirms received (closes the loop with a small "we're done" beat)

A `tribute_pending_reminder` push fires on day 7+ post-pick if `tribute_paid_at IS NULL`: `💀 [Loser] still owes 🍝 — tap them on the shoulder.` Implemented as an extra check in `notifications-tick`. Safe to defer if scope is tight — flag only.

Push respects the existing quiet-hours guard (`lib/notifications.ts`).

### Dev affordance

Add `🛠 FORCE CLOSE ROUND` button to `app/(tabs)/menu.tsx`. Always visible (no flag). Calls a new `forceCloseCurrentRound()` helper that runs the same atomic close logic as the cron, scoped to the active round. After tap, push fires to the user, redirect kicks in, cinematic plays. Critical for testing without waiting until Sunday.

### Solo / unpaired

Cron skips couples with fewer than 2 players. No close, no tribute. The `dev_stub_partner` migration's stub player counts as a real player for round-close purposes.

### Skipping cinematic

Tap-to-skip jumps straight to the post-cinematic state (card pick for winner, acknowledge for loser). Never blocks. Replayable via `▶ Replay K.O.` button on the round-over screen.

### Idempotency

`UPDATE rounds SET status='closed' ... WHERE id = ? AND status='active'` returns 0 rows on second invocation. Cron and dev button both safe to call repeatedly.

---

## Files touched (anticipated)

**New:**
- `supabase/migrations/0010_round_close_columns.sql`
- `supabase/functions/round-rollover-tick/index.ts`
- `lib/wallet.ts` — `getSpendableCoins(playerId)`
- `lib/tribute.ts` — tier→cost-range mapping, card selection helper, `forceCloseCurrentRound()`
- `app/(round)/over.tsx` (or `app/round-over.tsx`) — round-over route
- `components/game/KoOverlay.tsx` — K.O. cinematic
- `components/game/TributeCard.tsx` — face-down/flip card
- `components/game/HoldToCollect.tsx` — charge-gauge confirm control
- `components/game/DebtBadge.tsx` — chain + floating item icon for home arena

**Modified:**
- `app/(tabs)/_layout.tsx` — drop Jackpot tab
- `app/_layout.tsx` — closed-round redirect gating
- `app/(tabs)/index.tsx` (home) — debt-state rendering on `Stage`
- `app/(tabs)/shop.tsx` — read from `getSpendableCoins`
- `app/(tabs)/menu.tsx` — dev `FORCE CLOSE ROUND` button
- `lib/round.ts` — extend `RoundStats` / round helpers as needed for close + scoring per World
- `lib/notifications.ts` — register new event types
- `lib/types.ts` — extend `Round` type with new columns

**Untouched:**
- `app/(tabs)/jackpot.tsx` — left on disk, unreferenced
- All sprite assets, fonts, palette config

---

## Open questions (none blocking, surface during implementation)

- Whether `expo-av` is currently wired. If yes, SFX paths get specified in implementation. If no, all SFX hooks are no-ops with TODO comments.
- Whether a smug-idle / down sprite variant exists in `AnimatedSprite`. If not, fall back to badge emoji overlays for v1; revisit when sprite assets ship.
- Whether to hard-cap `winner_bonus_coins` at 500 or scale it differently — start with 500, tune after a few rounds.

---

## Success criteria

After this ships:

1. Jackpot tab no longer appears in the bottom tab bar; the Jackpot screen is unreachable from normal navigation.
2. Wallet display anywhere shows a single combined "Coins" number; the value matches `getSpendableCoins(playerId)`.
3. Sunday at 00:00 Asia/Jerusalem, the active round closes within ~10 minutes; a new round opens with `status='active'`; both players receive a push notification reflecting their role.
4. Opening the app after a close auto-routes to the round-over cinematic.
5. Winner can pick a tribute via the card flow; loser sees the picked tribute reflected in their home arena (debt badge + sticky `ActionFeed` line).
6. Winner can hold-to-collect to mark tribute paid; both arenas return to neutral state on confirm.
7. The dev `FORCE CLOSE ROUND` button reproduces the entire cinematic flow without waiting for Sunday.
8. Stacked closed rounds resolve oldest-first.
9. Tied rounds skip tribute entirely and roll over to the next round with both players acknowledging the tie.
10. Re-opening the app after seeing the cinematic does NOT replay it (state persists).
