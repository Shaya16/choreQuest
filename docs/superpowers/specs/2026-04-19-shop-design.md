# Shop — Design

**Date:** 2026-04-19
**Feature:** Two-step shop (purchase → stockpile → redeem) with full partner-attested delivery loop
**Status:** Design approved, pending implementation plan

## Problem

Phase 1 shipped activities, coins, rounds, and the round-close tribute mechanic. Coins accumulate. There is no way to spend them. The Shop tab is a placeholder ("Shop grid lights up in Phase 1") and the entire economic loop is therefore broken — earning has no payoff outside the once-a-week round-close tribute.

A complete shop is the missing other half of the round-close+tribute work. Tributes are the *winner's prize* (free, tier-gated by margin, once per round). The shop is the *I want this enough to pay for it* menu (coin-gated, anytime, either player). Together they form the two channels through which one player's effort compels the other's behavior — the rivalry thesis the user reframed the game around in the previous session.

## Goal

Ship a working two-step shop that:
1. Lets either player browse the 20 seeded items and buy any they can afford.
2. Holds purchases as **inventory tokens** in the buyer's "ARSENAL" — coins are deducted on purchase, but the partner is not yet on the hook for delivery.
3. Lets the buyer **redeem a token** when they actually want the service performed, which pings the partner with high-urgency push.
4. Lets the partner **confirm delivery** with a single tap once they've performed the IRL action — closes the loop with a satisfying coin-shower beat and clears the token from both players' active views.
5. Surfaces the right ambient signals on home (red-dot badge on Shop button when partner is waiting on you).

## Non-goals

- No self-reward shop items. Every shop item is a partner-cost demand. Self-rewards would dilute the rivalry thesis.
- No refunds, cancellations, or expiration. Purchases are permanent commitments.
- No category tabs — just grouped sections with collapsible headers on a single scrollable screen.
- No new sprite art. Emoji placeholders continue (existing project posture).
- No purchase history / Hall of Fame view of past delivered items.
- No batch purchases ("buy 5 of these at once") — single tap = single purchase.
- No item curation / rebalancing — the 20 seeded items stay as-is. Tuning happens after real play data.
- No re-architecture of the `purchases` table beyond what's needed to support the two-step state machine.
- No big full-screen cinematic for purchase or delivery — the moments are satisfying via coin-shower + haptic + stamp text, not via an overlay route. Save the cinematic vocabulary for round-close.

---

## §1 — Principles

- **Every item is a partner-cost demand.** The seed already conforms (Foot Rub from partner, Breakfast in Bed cooked by partner, Skip One Chore covered by partner, etc.). Don't add self-rewards.
- **All purchases are permanent.** No refunds. No expirations. Coins go out, tokens come in, and the only way out of inventory is partner-attested delivery.
- **Full transparency.** Per the project brief: both players see everything — same wallet, same arsenal counts, same queue. No admin views, no asymmetric information.
- **Inventory stacks.** Buying the same item twice gives you `x2`. Each REDEEM consumes one from the stack.
- **Single-tap delivery confirmation.** Reserve hold-to-charge for the round-close tribute (once a week, capital-R Ritual). Shop redemptions happen multiple times per week — the right weight is a satisfying tap, not a heavy charge.
- **Affordability is aspirational.** Items you can't afford are dimmed (40% opacity), not hidden. Tap shows a tiny "NEED +XXX COINS" flash, no purchase modal.

---

## §2 — Data model

The `purchases` table from migration 0001 is the right shape. Two changes via a new migration:

### Migration `0016_shop_purchase_states.sql`

1. Add `redemption_requested_at TIMESTAMPTZ` column to `purchases`.
2. Expand the `status` CHECK constraint to allow a new value `'redemption_requested'`.

State machine after the migration:
- `pending` — bought, sitting in buyer's arsenal, not yet activated.
- `redemption_requested` — buyer tapped REDEEM NOW, partner is on the hook (NEW).
- `redeemed` — partner tapped DELIVERED, token consumed.
- `cancelled` — unused; preserved for forward-compat.

### Existing column semantics

- `purchased_at` — set at INSERT (purchase moment).
- `redemption_requested_at` — set when `status` flips `pending → redemption_requested`.
- `redeemed_at` — set when `status` flips `redemption_requested → redeemed`.

### `getSpendableCoins` interaction

The existing helper (`lib/wallet.ts`) already subtracts purchases joined with shop_items.cost where `status != 'cancelled'`. That covers the new `redemption_requested` state correctly without modification — once you've bought the item the coins are gone, regardless of redemption progress.

---

## §3 — Push events

Three new trigger types added to `_shared/variants.ts`:

- **`purchase_made`** — fires to target when buyer creates a purchase row. Light tone, low urgency.
- **`redemption_requested`** — fires to target when buyer flips a purchase to `redemption_requested`. High urgency, this is the "drop everything, your partner wants this NOW" beat.
- **`delivery_confirmed`** — fires to buyer when target flips a purchase to `redeemed`. Closure beat. "✓ Kessy delivered Dinner. Respect."

Four variants per pool (matches existing convention). Rotation via existing `variant-picker.ts`. All respect `isQuietHours()`.

### Variant text (initial)

```ts
purchase_made: [
  "{{partner}} just bought {{item}}. saving it for later.",
  "{{partner}} acquired {{item}}. dread the redemption.",
  "🛍️ {{partner}} stockpiled {{item}}. tick tick tick.",
  "{{partner}} added {{item}} to their arsenal. brace.",
],
redemption_requested: [
  "{{item}} — now. {{partner}} cashed in.",
  "{{partner}} is calling in {{item}}. drop everything.",
  "🚨 {{partner}} wants {{item}}. RIGHT now.",
  "incoming: {{item}}. {{partner}} is waiting.",
],
delivery_confirmed: [
  "✓ {{partner}} delivered {{item}}. respect.",
  "{{item}}: paid in full. {{partner}} got theirs.",
  "{{partner}} confirmed {{item}}. closed clean.",
  "✓ done — {{item}}. {{partner}} is square.",
],
```

### Triggering

Migration `0017_shop_purchase_triggers.sql` adds three Postgres triggers on `purchases`:

- `notify_purchase_made` on INSERT — POSTs `{ type: 'purchase_made', purchase: row }`.
- `notify_redemption_requested` on UPDATE OF status — fires when `status` flips to `redemption_requested`. POSTs `{ type: 'redemption_requested', purchase: row }`.
- `notify_delivery_confirmed` on UPDATE OF status — fires when `status` flips to `redeemed`. POSTs `{ type: 'delivery_confirmed', purchase: row }`.

All three POST to the existing `on-log-inserted` Edge Function (which is the catch-all event dispatcher), following the same pattern as the tribute triggers in migration 0011.

---

## §4 — Flows

### Purchase flow

1. Player on Shop screen taps a catalog item.
2. Confirm modal: `SPEND 300¢ ON BREAKFAST IN BED?` with YES / CANCEL. Stops misclicks since purchases are permanent.
3. Tap YES → `purchases.insert({ buyer_id=me, target_id=partner, status='pending', shop_item_id })`.
4. Coin deduct is automatic via `getSpendableCoins`'s on-read computation. The wallet HUD updates on next refresh.
5. Coin-shower haptic + brief "ITEM ACQUIRED" stamp text on the buyer's screen.
6. Token appears in the buyer's ARSENAL section (or stacks onto an existing row of the same item).
7. Postgres trigger fires `purchase_made` push to target. Low urgency.

### Redemption flow

1. Buyer taps a token row in their ARSENAL.
2. Confirm modal: `REDEEM FOOT RUB NOW?` with YES / CANCEL.
3. Tap YES → `purchases.update({ status='redemption_requested', redemption_requested_at=now() })` against the OLDEST row in the stack (`purchased_at ASC LIMIT 1`) so stacks consume FIFO.
4. Token row label changes to "⏳ AWAITING DELIVERY", REDEEM button hidden.
5. Postgres trigger fires `redemption_requested` push to target. High urgency, big push.
6. The target's view of the same Shop screen now shows this purchase in their QUEUE section with a big `DELIVERED ✓` button.

### Delivery confirmation flow

1. Target performs the IRL action.
2. Returns to app, opens Shop, taps `DELIVERED ✓` on the queued item.
3. `purchases.update({ status='redeemed', redeemed_at=now() })`.
4. Coin shower (Skia particle effect over the row) + satisfying haptic + brief "DELIVERED" stamp.
5. Token disappears from both sides' active views (still in the DB for history; just filtered out of the live UI by `status != 'redeemed'`).
6. Postgres trigger fires `delivery_confirmed` push to buyer. Closure tone.

### Edge case — no partner paired yet

- ARSENAL section is hidden (no purchases possible without a partner to target).
- QUEUE section is hidden.
- CATALOG renders normally (aspirational), but each item card is dimmed and tapping shows a "NEED A PARTNER TO BUY FROM" flash. No purchase modal.

---

## §5 — Shop screen layout

One scrollable screen. Stacked sections in this order:

### 1. Wallet HUD (sticky at top)

- Big number: `💰 1,247 COINS` — sourced from `getSpendableCoins(player.id)`.
- Subtle below: `📦 3 TOKENS · 2 AWAITING DELIVERY` — counts derived from `loadArsenal()` (where `target_id = partner.id` does NOT apply; the arsenal is what *I* bought = `buyer_id = me`).

### 2. ARSENAL (your tokens)

Section title `▸ YOUR ARSENAL`. Renders only if there are rows where `buyer_id = me AND status IN ('pending', 'redemption_requested')`.

Grouped by `shop_item_id`, one row per stack. Two row variants:

**Pending stack:**
```
┌──────────────────────────────────────────┐
│ 🦶 FOOT RUB (15 min)              ×3     │
│ 150¢ each · tap to redeem                 │
│                          [▶ REDEEM]       │
└──────────────────────────────────────────┘
```

**Awaiting delivery (one row per requested purchase, ungrouped):**
```
┌──────────────────────────────────────────┐
│ 🍝 DINNER OF MY CHOICE                   │
│ ⏳ AWAITING DELIVERY                      │
└──────────────────────────────────────────┘
```

Awaiting items break out of their stack (one row each), so the user can see how many are actively pending.

### 3. QUEUE (their demands on you)

Section title `▸ THEY WANT NOW` (when there are `redemption_requested` rows targeting me) or `▸ THEY'VE STOCKPILED` (when only `pending` rows targeting me). Renders only if rows exist where `target_id = me`.

Sorted with `redemption_requested` first (most urgent), then `pending`. Two row variants:

**Awaiting your delivery (high prominence, big button):**
```
┌──────────────────────────────────────────┐
│ 🍝 DINNER OF MY CHOICE                   │
│ Shay called this in 5min ago              │
│                       [✓ DELIVERED]       │
└──────────────────────────────────────────┘
```

**Stockpiled by partner (informational only, no action):**
```
┌──────────────────────────────────────────┐
│ 🦶 FOOT RUB (15 min)              ×3     │
│ Shay has these saved up · brace           │
└──────────────────────────────────────────┘
```

### 4. CATALOG

Section title `▸ CATALOG`. Grouped by category with collapsible headers. The 20 seeded items, by category:

- **Pampering** — Foot Rub (150), Back Rub (250), Proper Massage (500), Full Massage (900)
- **Meals** — Breakfast in Bed (300), Dinner of My Choice (400)
- **Chore Relief** — Skip One Chore (250), Sleep In (300), No Grocery (400), Deep Clean (500), Dishes For A Week (600)
- **Power** — Plan Date Night (450), Zero Chores Day (700)
- **Wildcard** — No-Phones Dinner (200)

Each item is a card:

```
┌───────────┐
│   🦶      │
│ FOOT RUB  │
│  15 min   │
│   150¢    │
└───────────┘
```

Affordable items: crisp, tappable, full-color. Unaffordable items: dimmed to 40% opacity, greyed text, tap shows a 1-second "NEED +XXX COINS" flash near the wallet HUD, no purchase modal opens.

If solo (no partner): all cards dimmed, tap shows "NEED A PARTNER" flash.

---

## §6 — Home surface

No new Control Panel tiles for the shop loop — the loop lives on the Shop screen. **One ambient cue:** the existing SHOP `ActionTile` in the Control Panel gets a small **red dot badge** in its top-right corner whenever there are rows where `target_id = me AND status = 'redemption_requested'`. Same visual vocabulary as unread-message dots. A glance at home tells you whether your partner is waiting on you for something.

The badge clears as soon as you confirm delivery on every active redemption request.

The existing CLAIM / COLLECT / OWED tiles for the round-close tribute remain unchanged — they share the Control Panel with the standard SHOP tile.

---

## §7 — Operational concerns

### Realtime sync

The existing realtime infrastructure (Supabase channel + `postgres_changes` on `logs`) is not extended. The Shop screen instead refreshes its three queries (arsenal / queue / wallet) on each `useFocusEffect` — refreshing whenever the screen comes into focus is fine for the shop's cadence (not as twitchy as the live arena scoreboard).

### Idempotency

- Purchase INSERT is one INSERT — duplicate prevention is the user pressing the button twice. The confirm modal blocks accidental double-taps; if the user genuinely buys twice, the stack increments by 2 (correct behavior).
- Status flips use `UPDATE ... WHERE id = ? AND status = '<prior>'` so a second concurrent flip is a no-op.

### RLS

The `purchases` table already has couple-scoped RLS via existing policies (verify in `0002_rls.sql`). No policy changes needed.

### Quiet hours

All three new push types respect `isQuietHours()`. The same dispatcher in `on-log-inserted` enforces this — no per-handler check needed beyond the early return that already exists.

### Push variant rotation

Each new trigger type gets its own `push_state` row per (player, trigger_type). The CHECK constraint on `push_state.trigger_type` was already extended in migration 0011. The three new types (`purchase_made`, `redemption_requested`, `delivery_confirmed`) get added to the CHECK in migration **0016** alongside the other constraint changes.

### Shop placeholder text in seed

The Shop screen's existing placeholder copy ("Shop grid lights up in Phase 1") is removed when the new screen replaces it. No data cleanup needed.

---

## §8 — Files touched (anticipated)

**New:**
- `supabase/migrations/0016_shop_purchase_states.sql` — status CHECK expansion, new column, push_state CHECK extension
- `supabase/migrations/0017_shop_purchase_triggers.sql` — three pg triggers
- `lib/shop.ts` — client helpers: `loadArsenal`, `loadQueue`, `loadCatalogGrouped`, `buyItem`, `requestRedemption`, `confirmDelivery`
- `components/game/PurchaseCard.tsx` — catalog card (the buyable tiles)
- `components/game/ArsenalRow.tsx` — buyer's stacked or ungrouped row
- `components/game/QueueRow.tsx` — target's queue row
- `components/game/WalletHUD.tsx` — sticky top header for the Shop screen
- `components/game/RedDotBadge.tsx` — small notification dot used on the Shop ActionTile

**Modified:**
- `supabase/functions/on-log-inserted/index.ts` — three new handler branches
- `supabase/functions/_shared/variants.ts` — three new variant pools
- `lib/types.ts` — extend `Purchase` type with `redemption_requested_at`, extend `PurchaseStatus` union with `'redemption_requested'`, extend `PushTriggerType` with three new triggers
- `app/(tabs)/shop.tsx` — replace placeholder body with the real screen
- `app/(tabs)/index.tsx` — Shop ActionTile renders RedDotBadge when queue has `redemption_requested` items

**Untouched:**
- `purchases` table beyond migration 0016 changes
- Round-close + tribute code (separate feature, no overlap besides shared push infra)
- Activities, rounds, wallet helper internals
- Any sprite assets

---

## §9 — Success criteria

After this ships:

1. The Shop screen renders a real catalog of all 20 seeded items grouped by category, with affordability dimming.
2. Tapping an affordable item, confirming, and tapping YES inserts a `purchases` row with `status='pending'` and the wallet HUD reflects the deduction on next refresh.
3. The new purchase appears in the buyer's ARSENAL section with the right stack count.
4. Tapping REDEEM on an arsenal stack, confirming, flips ONE row's status to `redemption_requested` and the row label updates to "AWAITING DELIVERY".
5. The target receives a high-urgency `redemption_requested` push within seconds, and on opening the Shop screen sees the row in their QUEUE section with a `DELIVERED ✓` button.
6. Tapping `DELIVERED ✓` flips the row to `redeemed`, fires a coin-shower haptic, and the row disappears from both sides' Shop screens within seconds.
7. The Home Control Panel's SHOP ActionTile shows a red-dot badge whenever the player has any `redemption_requested` rows targeting them; the badge disappears within a refresh cycle of confirming delivery.
8. Solo players (no partner) see CATALOG dimmed with "NEED A PARTNER" flash on tap; no ARSENAL or QUEUE sections render.
9. Stacked purchases of the same item show as one row with `×N` count; redeeming one decrements the count.
10. All three push types respect quiet hours and rotate text variants per the existing `variant-picker` pattern.
