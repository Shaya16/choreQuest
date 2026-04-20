# Debt Debuff — Coin Penalty While Obligations Are Open

**Date:** 2026-04-20
**Feature:** While a player has any unresolved debt (unpaid tribute OR unredeemed purchase token against them) older than 24h, new logs earn 50% coins. Adds an "Amnesty" opt-out for purchase tokens at 1.5× cost.
**Status:** Design approved, pending implementation plan
**Related:** [2026-04-20-tribute-debt-loser-anchor-design.md](2026-04-20-tribute-debt-loser-anchor-design.md) — the ball-and-chain sprite is the visual anchor; this spec adds the gameplay weight behind it.

---

## Problem

Chore Quest already has two "debt" concepts sitting on the schema:

1. **Unpaid tribute** — `rounds.tribute_paid = false` after a round closes with a winner.
2. **Pending purchase token** — `purchases.status = 'pending'` where the current player is `target_id` (partner bought a service token from them).

Today these sit passively. Nothing pressures a player to resolve them. A loser can simply not pay tribute. A target can hoard 5 unredeemed tokens indefinitely. The economy has no mechanism to make debt *feel* owed.

The existing `DebtBadge` / ball-and-chain indicator (see related spec) communicates *that* a debt exists, but carries no mechanical consequence.

## Goal

Give open debts real gameplay weight: while you owe, your future coin earnings are halved. The moment you pay the oldest debt (or all of them), the penalty lifts. The forever-layer (`lifetime_xp`) is untouched — this is a coin-economy pressure, not a progression tax.

Add a **shop-adjacent opt-out** (Amnesty) for purchase-token debts only: target pays 1.5× original cost to cancel, buyer is fully refunded. Tributes cannot be bought off.

## Non-goals

- No change to `lifetime_xp` accumulation. Constraint 11 (coins/XP separate) preserved; XP never decreases.
- No change to `round_value_earned` scoring. A player in debt can still win rounds normally — avoids a doom-spiral where losing compounds losing.
- No change to the 70/30 `jackpot_share` / `personal_share` split. Constraint 10 preserved — halving happens *before* the split, so the ratio of each log is unchanged.
- No change to the crit system. Crits still roll and double; they just double a halved base.
- No new database tables. Debt state is derived on-demand from existing rows.
- No change to the existing `DebtBadge` / ball-and-chain visual from the related spec. This spec adds complementary UI surfaces; it doesn't touch that one.
- No Amnesty for tributes. Tributes are the stakes of the weekly round loop; buying out of them would neuter the entire tribute tier system.

---

## 1. Mechanic

### Trigger condition

Player `P` is **in debt** at time `now` if either of the following queries returns ≥1 row:

```sql
-- Unredeemed purchase tokens against P, older than 24h
SELECT 1 FROM purchases
WHERE target_id = P
  AND status = 'pending'
  AND purchased_at < now - interval '24 hours'

-- Unpaid tribute from a closed round where P lost, older than 24h
SELECT 1 FROM rounds
WHERE couple_id = P.couple_id
  AND status IN ('closed')                       -- NOT 'inactive' (no tribute fires)
  AND winner_id IS NOT NULL
  AND winner_id <> P.id
  AND tribute_paid = false
  AND end_date < (now - interval '24 hours')::date
```

**Grace period: 24h.** Debt created <24h ago does not trigger the debuff. Gives both sides time to schedule (e.g., a 60-minute massage token) without instant penalty.

### Effect

While in debt:

```
coins_earned       = base × mult_chain × 0.5   -- NEW: debt multiplier
xp_earned          = base × mult_chain         -- UNCHANGED (no 0.5)
round_value_earned = (same formula as today, no 0.5)
jackpot_share      = round(coins_earned × 0.70)
personal_share     = coins_earned - jackpot_share
```

The 0.5 is applied **after all existing multipliers** (`player_multiplier × combo_multiplier × crit_multiplier × daily_bonus × weekly_hero × season × power_up`) and **before** the 70/30 split.

### Magnitude

**Flat 50%**, regardless of how many debts are open. One debt or five, same penalty. Paying any debt recomputes; if any remaining debt is still >24h old, the debuff stays on. Paying them all lifts it.

Rationale for flat (not stacking): simplicity, and in a 2-player couple's app the realistic debt count ceiling is ~2–3. Stacking adds animation/explanation complexity without meaningful behavior change at that scale. Revisit if playtesting shows people hoarding debts to game the system.

### Crits

Crits still roll normally (10% chance). A crit during debuff: `base × mult_chain × 2.0 × 0.5` = effectively `base × mult_chain × 1.0`. A "critical hit" that lands on a halved coin pool still feels like a crit (the animation fires, coins drop with crit flair), but the take-home is only as much as an uncritted non-debt log. Acceptable — the crit *event* is preserved even when its *magnitude* is tamed.

---

## 2. Data / helper module

### No new tables or columns.

All state is derived from existing rows: `purchases.status`, `purchases.target_id`, `purchases.purchased_at`, `rounds.winner_id`, `rounds.tribute_paid`, `rounds.end_date`, `rounds.status`.

### New shared helper: `lib/debt.ts`

Pure-TypeScript module (no React imports — constraint 5). Exports:

```ts
export type DebtSource =
  | { kind: 'purchase'; purchase_id: string; shop_item_id: string; cost: number; purchased_at: string }
  | { kind: 'tribute';  round_id: string;    tribute_shop_item_id: string | null; end_date: string }

export type DebtState = {
  inDebt: boolean            // at least one source older than 24h
  debtMultiplier: 0.5 | 1.0  // convenience
  sources: DebtSource[]      // ALL open debts (even <24h), for UI listings
  activeSources: DebtSource[] // only those >24h (what triggers the debuff)
}

export function computeDebtState(args: {
  playerId: string
  coupleId: string
  purchases: PurchaseRow[]   // pre-fetched by caller (Zustand store / query)
  rounds: RoundRow[]
  now: Date
}): DebtState
```

The helper is pure; the caller is responsible for fetching. Zustand store already holds `rounds` and `purchases` for the current couple; wire the derivation there.

### `lib/economy.ts` update

`computeLogValues` (existing function from session 3) gains one new param:

```ts
export function computeLogValues(args: {
  // ...existing...
  debtMultiplier: number  // 1.0 or 0.5, caller derives from computeDebtState
}): { coins_earned: number; xp_earned: number; round_value_earned: number; jackpot_share: number; personal_share: number; ... }
```

Internally:
- `coins_earned` formula multiplies by `debtMultiplier` as the final factor before rounding.
- `xp_earned` and `round_value_earned` formulas **do NOT** multiply by `debtMultiplier`.
- 70/30 split is taken from the post-debt `coins_earned` (preserving ratio).

### Migration

No schema change is required for the **debuff mechanic itself** — the fields we read (`purchases.status`, `purchased_at`, `target_id`; `rounds.winner_id`, `tribute_paid`, `end_date`, `status`) already exist.

A **single small migration** is added for the **Amnesty flow** only (§4): adds `purchases.cancelled_via` so refund events are auditable. Migration number assigned at plan time (next free slot after `0018`).

---

## 3. UX surfaces

Five touchpoints. Listed in rough order of priority; if shipping sequentially, §3.1 + §3.2 are the minimum to make the feature *readable*, rest are polish.

### 3.1. Home dashboard — debt chip

Next to each player's `FighterCard` name row, a red chip `🔒 IN DEBT · 50% COINS` renders when that player is debuffed. **Both players see the chip on both avatars** — information-symmetry principle (PROJECT_BRIEF §1). The winner seeing "P2 · IN DEBT" on their rival's card is the point.

Tap behavior differs by viewer:
- **Debuffed player taps own chip** → opens `DebtModal` with action buttons (PAY / AMNESTY / MARK PAID)
- **Partner taps the other's chip** → opens same modal in read-only mode (list of what the other player owes, no action buttons)

Debt modal rows:
- Purchase token row: `PAY` (existing redeem flow) | `AMNESTY · {1.5× cost}¢` (§4)
- Tribute row: `MARK PAID` (existing tribute-paid flow)

The chip is independent of the existing ball-and-chain sprite from the related spec — chip is a *status indicator with actions*, chain is a *flavor sprite*. Both can render for the same player.

### 3.2. Log confirm screen — halved preview

On the activity-confirm card (where the coin/round-value preview lives today for dual-currency), when the logging player is debuffed:

- Coin preview shows `30 → 15` with a strikethrough on the `30`.
- Small red label below: `DEBT · HALF PAY`.
- Round value preview is **unchanged** (no strikethrough) — reinforces that round competition isn't affected.

### 3.3. Coin drop animation

On log submit while debuffed: the coin-drop animation plays with roughly half the visual intensity — fewer coin sprites and/or reduced burst scale. Exact knobs depend on the current `CoinDropAnimation` API at implementation time; the intent is that a debuffed log reads visually as a *smaller* drop, not a skipped one.

### 3.4. WalletHUD chain icon

Small chain-link glyph (reuse the existing ball-and-chain asset at a tiny scale, or a simpler `🔗` text fallback) renders immediately to the left of the coin ticker in `WalletHUD` while debuffed. No animation; pure status.

### 3.5. Shop — "WHAT YOU OWE" section

New top section in the shop tab, rendered above the existing purchase catalog. Shows one row per `purchases WHERE target_id = me AND status = 'pending'` — pending AND under-24h included (so target sees what's brewing).

Per-row:
- Item icon + name (e.g., `🦶 FOOT RUB`)
- Age pill (`JUST NOW` / `6H` / `2D 3H`)
- Two buttons: `PAY` (opens standard redeem flow, existing) | `AMNESTY · 225¢` (opens Amnesty confirm modal — §4)

If no rows, the section is hidden entirely (not a zero-state — shop stays clean).

---

## 4. Amnesty flow

Target pays 1.5× the original purchase cost to cancel the token. Buyer is refunded the original 1× to their Personal Wallet.

### Not in `shop_items` catalog

Amnesty is **not a static shop item**. It's a per-purchase action surfaced on the owed-row in the `WHAT YOU OWE` section (§3.5) and in the `DebtModal` (§3.1). Pricing is dynamic (1.5× that specific purchase's cost).

### Migration

One tiny schema addition for auditability (next free slot after any in-flight `0019`+ — plan will assign at write time):

```sql
ALTER TABLE purchases
  ADD COLUMN cancelled_via TEXT
  CHECK (cancelled_via IN ('amnesty', 'buyer_cancel') OR cancelled_via IS NULL);
```

`'amnesty'` = target paid to cancel (this flow).
`'buyer_cancel'` = buyer cancelled their own purchase (existing flow, if any).
`NULL` = not cancelled OR cancelled by some pre-migration-0019 path.

### RPC: `purchase_amnesty(purchase_id UUID)`

New Supabase RPC (SQL function), atomic:

```
BEGIN TX
  Load purchase row; verify caller.user_id maps to a player where player.id = purchase.target_id.
  Verify status = 'pending'.
  cost_amnesty = purchase.cost * 1.5 (rounded up to nearest int).
  Verify target.personal_wallet >= cost_amnesty, else raise insufficient_funds.
  Deduct cost_amnesty from target.personal_wallet.
  Credit purchase.cost to buyer.personal_wallet.
  Update purchase set status='cancelled', cancelled_via='amnesty', redeemed_at=now().
COMMIT
```

Return: `{ refund: cost, fee: cost_amnesty, buyer_new_wallet: int, target_new_wallet: int }`.

### UI: AmnestyConfirmModal

```
CANCEL "60 MIN MASSAGE"?
Cost: 750¢ from your wallet
Partner refunded: 500¢

    [ CANCEL OBLIGATION ]  [ NEVERMIND ]
```

On success, fire a push to buyer: `{partner} cancelled the "60 min massage" token. 500¢ refunded.` (Reuse existing push infrastructure; one new template in the variant pool.)

### Amnesty does NOT exist for tributes.

- Tribute = the weekly round's teeth. Buyable amnesty neuters the tier system.
- Tribute can only be paid (existing `MARK PAID` flow) or, if the round winner chose nothing, eventually ages out of relevance when a new round closes. (This corner — winner never picked — is a separate bug, not this spec's problem.)

---

## 5. Edge cases

- **Multiple unpaid tributes across weeks.** Each counts as a debt; flat 50% still applies (no deepening). If this happens, the couple has a tribute-paying culture problem, not a debuff-math problem.
- **Debt created during a log session.** The logging player is not in debuff state at log time (grace period still in effect). Next log after 24h will be halved.
- **Amnesty when target can't afford 1.5×.** `AMNESTY` button disabled on that row; tooltip on tap: `Need {cost_amnesty}¢ to cancel. You have {wallet}¢.`
- **Buyer cancels their own purchase** (if such a flow exists or gets added later). Target's debt clears immediately; debuff recomputes. No 24h cooldown on unwinding.
- **Solo couple (partner not yet paired).** No debts possible — no purchases can be made without a target, no rounds close without two players. `computeDebtState` returns `{ inDebt: false, ... }` trivially.
- **Round status = 'inactive'** (under the 50-point dead-round threshold from session 3). No tribute fires, no `winner_id` eligibility for debt. Treated as zero-debt.
- **Round status = 'closed' but `winner_id IS NULL`** (tied round). No loser, no debt. The trigger query's `winner_id IS NOT NULL` handles this.
- **Log submitted in the same transaction that resolves the last debt** (very rare race). The log uses the debt state at submit-time. If resolution happened first in the same tick, log earns full coins. If log first, log earns half, then debt clears on next log. No retroactive adjustment.
- **Clock skew between client and server.** All >24h comparisons happen server-side (in the SQL view and the RPC). Client-side `computeDebtState` is for UI hints only; the server is source of truth at log-write time.
- **Amnesty on a token that's already redeemed or cancelled.** RPC fails at the `status = 'pending'` check; client shows a generic "already resolved" toast.

---

## 6. Out of scope / explicitly deferred

- **Stacking debuff (Option 2 from brainstorm).** If playtesting shows debt hoarding, upgrade flat-50 to linear-stacked (50/65/75%) in a follow-up. Flat is v1.
- **Crits-off during debuff (Option 3 from brainstorm).** Dramatic but adds animation state. Not shipping v1.
- **Escalating debuff over time** (e.g., 50% at day 1, 25% at day 7). Meta-design: penalty deepens the longer you stall. Deferred — needs playtesting to see if flat is punishing enough.
- **Partial tribute payment.** Schema has a single `tribute_paid BOOLEAN`. Partial tributes (e.g., "you did 1 of 2 Carnage items") aren't modeled and aren't in scope.
- **"Amnesty for tributes" at some very high cost.** Pushed back on in §4 non-goals — raising it here only to explicitly defer. The tribute tier system is the round's stakes; do not dilute.
- **Couple-level shared debuff.** If *either* player is in debt, is the couple's Jackpot contribution halved? Interesting, but adds coupling between debuff and shared-goal pace that isn't obviously wanted. Defer.
- **A "debt age" visual on the ball-and-chain sprite** (rusting as time passes). Pure flavor; revisit when the core mechanic has proven sticky.

---

## 7. Testing

### Unit (`tests/lib/debt.test.ts` + `tests/lib/economy.test.ts`)

- `computeDebtState`: matrix of purchase rows × round rows × clock times; verify `inDebt` and `activeSources` partitioning.
- `computeLogValues(debtMultiplier: 0.5)`: `xp_earned` unchanged, `round_value_earned` unchanged, `coins_earned` halved, 70/30 ratio on post-debt coins.
- Crit × debt: `base=30, mult_chain=1.0, crit=2.0, debt=0.5` → `coins=30`. Ratio within rounding.

### Deno (edge function level)

- `purchase_amnesty` RPC tests under `supabase/functions/_shared/amnesty.test.ts` or a dedicated folder:
  - Happy path: target wallet deducts, buyer wallet credits, status flips, `cancelled_via='amnesty'`.
  - Target insufficient funds: raise, no partial state.
  - Already-resolved purchase: raise.
  - Wrong caller (not target): raise (RLS enforcement).

### Manual smoke (documented in the plan)

- Home chip appears after 24h grace, disappears after pay.
- Log preview strikethrough renders at the right moment.
- Amnesty modal math correct (1.5× out, 1× refunded), push lands for buyer.
- Round-close on a debuffed player: they earn normal `round_value_earned` (no doom spiral).
- `WHAT YOU OWE` section hides when list is empty.

### Regression

- Tribute payment flow unchanged — existing `MARK PAID` still works exactly as before.
- Existing `DebtBadge` / ball-and-chain rendering (the related visual spec) unchanged.
