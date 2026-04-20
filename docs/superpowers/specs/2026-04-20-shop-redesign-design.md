# Shop — Visual Redesign

**Date:** 2026-04-20
**Feature:** Visual redesign of the existing two-step shop (purchase → arsenal → deploy → deliver)
**Status:** Design approved, pending implementation plan
**Builds on:** `docs/superpowers/specs/2026-04-19-shop-design.md` (mechanics — unchanged)

## Problem

The shop's mechanics work but the screen reads like a settings list, not an arcade vending machine. Concretely:

- Every catalog tile uses the same yellow border. Pampering, Meals, Power, Wildcard look identical.
- The wallet HUD is a static yellow string (`💰 1,247¢`) with no sense of weight or wealth.
- Arsenal and Queue rows are uniform horizontal stripes — the buyer's tokens read like to-do items, not weapons.
- No "place" identity. There's no shopkeep, no shelving metaphor, no mood. The user opens the screen and sees a list of buttons.
- Catalog cards are 108×144 with names truncated to 3 lines at 7px font. Information density is high but readability is low.
- The rivalry thesis (every item is a partner-cost demand) is invisible. The same UI could be selling self-rewards.

## Goal

Redesign the look and feel of `app/(tabs)/shop.tsx` and its four child components so that:
1. The shop feels like *a place* with personality, not a settings panel.
2. Each category is visually distinct (color identity).
3. The wallet, arsenal, and queue read at the right emotional weight (wealth, weapons cache, incoming threats).
4. Affordability and rarity are immediately legible without reading text.
5. Existing mechanics, data flow, push triggers, RLS, and seed content are 100% preserved.

## Non-goals

- No mechanic changes. The two-step purchase → redemption_requested → redeemed state machine is untouched.
- No new shop items. The 20 seeded items stay as-is.
- No economy tuning.
- No new screens or routes.
- No Skia. The shop is a UI surface per technical constraint 6 (`UI surfaces use plain React Native, game surfaces use Skia, don't mix on one screen`). All animation comes from Reanimated + Moti.
- No new push triggers, RLS policies, edge functions, or migrations.
- No new sprite art beyond what we can express with palette + emoji + PressStart2P.
- No batch purchases, refunds, expirations, or category tabs/filters.

---

## §1 — Principles

- **Visual hierarchy by category and cost.** A shopper should be able to pre-attentively distinguish a Pampering from a Power item, and a 150¢ from a 900¢ item, without reading.
- **Place > list.** The screen has a top-of-screen identity (the Shopkeep) that anchors it as a destination, not a tab.
- **Weapons, not chores.** Arsenal items are *deployable cartridges* with ammo counts. The verb is DEPLOY, not REDEEM.
- **Threat-level legibility on the queue.** A glance tells you whether your partner is calling something in *now* (incoming) vs. quietly stockpiling (ambient).
- **Affordability is informational, not punitive.** Locked items show the delta to unlock, not just dim opacity.
- **Game-feel via motion, not new assets.** Pulses, ticks, and slides — no new sprite work.

---

## §2 — Color identity per category

Each catalog category gets one accent color from the locked palette. Items in that category inherit the accent on their card border. The section header banner uses the accent as background.

| Category | Accent | Hex | Rationale |
|---|---|---|---|
| Pampering | Ghost-Pink | `#FFB8DE` | Soft, comfort, intimate |
| Meals | Pac-Yellow | `#FFCC00` | Coin-color, food, abundance |
| Chore Relief | Ghost-Cyan | `#00DDFF` | Same color as Household world (continuity) |
| Power | Ghost-Red | `#FF3333` | Aggression, strength, dominance |
| Wildcard | Power-Lime | `#9EFA00` | Chaos, surprise, fresh |

These are the only category-color uses. The wallet HUD, header, and arsenal/queue sections continue to use existing semantic colors (yellow for wealth, lime for owned/safe, red for incoming).

---

## §3 — Wallet HUD redesign (`WalletHUD.tsx`)

**Current:** plain `💰 1,247¢` string, fontSize 20, with a small 7px subtitle for token counts.

**Redesign:** an "arcade register" panel.

### Layout

```
┌──────────────────────────────────────────────┐
│  ╔══════════════════════════════╗            │
│  ║  ¢ 1,247                     ║   📦 ×3    │
│  ╚══════════════════════════════╝            │
│  ────────────────────────────────────────────│
│  3 TOKENS · 2 AWAITING DELIVERY              │
└──────────────────────────────────────────────┘
```

- Coin number sits inside an inset "register display" — 2px inner border, 4px outer panel border, both pac-yellow on black. Fixed-width digits (PressStart2P is already monospace).
- Token count chip floats to the right of the register: emoji + `×N` in white, no border.
- Subtitle line stays for tokens/awaiting; promoted to 8px (was 7px) for legibility, lime accent if `awaitingCount > 0` (signals "you've got things in flight").

### Motion

- **Odometer tick on coin change.** When `coins` prop changes, route the prop through the existing `useCountUp(target, 500)` hook (already in `lib/useCountUp.ts`, used elsewhere in the app for the same game-feel rule). Render the returned displayed integer instead of the raw prop.
- **Inset display has a subtle 2-second pulse on the inner border.** Opacity 1.0 ↔ 0.7. Sells "this is alive."

### Files

- `components/game/WalletHUD.tsx` — rewritten.
- Reuses existing `useCountUp` from `lib/useCountUp.ts`. No new hook needed.

---

## §4 — Shopkeep persona (NEW)

**Net-new content.** Not in the original docs. User explicitly approved in brainstorming.

### What it is

A small panel directly under the Wallet HUD. Renders:
- A 32×32 chibi vendor emoji (`🛍️` for now — placeholder until pixel art exists, per project posture).
- A speech-bubble style line of rotating text from a curated pool.

```
┌──────────────────────────────────────────────┐
│  🛍️  ┌───────────────────────────────────┐   │
│      │ "back again? spend big."          │   │
│      └───────────────────────────────────┘   │
└──────────────────────────────────────────────┘
```

### Variant pool

12 lines, picked deterministically per session-load (not per render — no flicker). Selection key: a small string-hash function over `player.id + new Date().toDateString()`, modulo pool length — stable for a given player on a given day, fresh every day. JS has no built-in `hashCode`; implement a 5-line djb2 in `lib/shopkeep-lines.ts`:

```ts
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
```

```ts
const SHOPKEEP_LINES = [
  "back again? spend big.",
  "your partner's gonna feel that one.",
  "browsing or buying?",
  "good arsenal in here today.",
  "they bought one yesterday. don't fall behind.",
  "everything's a weapon if you pay enough.",
  "you've earned it. now use it.",
  "stockpile or strike. dealer's choice.",
  "the register's hungry.",
  "no refunds. no regrets.",
  "every coin spent is a coin earned.",
  "they can't say no if you've already paid.",
];
```

### Variants by state

- If `coins < 200` (broke): swap the pool to a "broke" pool (3 lines): `"come back richer."` / `"window-shopping is free."` / `"go log something."`
- If `awaitingCount > 0` (you've got items mid-redemption): force `"keep the pressure on."`
- If `queue.length > 0 AND queue has redemption_requested` (partner is waiting on you): force `"your partner's waiting. handle it."`
- Default pool otherwise.

### Files

- `components/game/Shopkeep.tsx` — new.
- `lib/shopkeep-lines.ts` — pool + selection logic, pure TS, unit-testable.

### Why this is OK to add despite "don't invent features"

The original shop spec talks about the rivalry thesis throughout but the visual shop never voices it. The Shopkeep is a copy-only feature (no schema, no logic, no economy impact) that makes the existing rivalry thesis legible at the surface. Cost: ~80 lines + 12 strings. Benefit: place identity. Build-discipline calls this borderline; user explicitly approved in brainstorming.

---

## §5 — Catalog redesign (`PurchaseCard.tsx`)

**Current:** 108×144 fixed boxes, 3-up flex-wrap, identical yellow border.

**Redesign:** 2-up "item cards" with category accent + cost-tier border weight.

### Layout

```
┌────────────────────────┐
│       ⬛⬛⬛⬛⬛         │   ← top "shelf" band, accent color, 8px tall
├────────────────────────┤
│                        │
│         🦶            │   ← emoji block, 48px font (was 30)
│                        │
│      FOOT RUB         │   ← 2-line max, 8px font (was 7), centered
│       15 min          │
│                        │
├────────────────────────┤
│       ¢ 150           │   ← "price tag" footer, accent bg, 10px
└────────────────────────┘
```

- Card width: `(screenWidth - 16*2 - 12) / 2` (2-up with 12px gap).
- Card height: 168px (was 144).
- Outer border: 2px, accent color from §2.
- Top "shelf" band: 8px tall, accent color filled, no text. Sells "this item sits on the [pink/cyan/red] shelf."
- Emoji block: 48px font. Centered. Plenty of whitespace.
- Name: PressStart2P 8px (was 7px), 2 lines max, white, centered. With this width we can fit 2 lines comfortably.
- Price footer: separated by a hairline divider, accent-color background, black text in `¢ 1,247` format (¢ symbol prefixed for register continuity).

### Cost-tier weight

Border width steps up with cost:

| Cost | Border | Treatment |
|---|---|---|
| ≤ 300¢ | 2px accent | Standard |
| 301–600¢ | 3px accent | Mid-tier |
| 601+¢ | 4px accent + corner stars (`✦`) in two corners | Premium |

Tier is a derivation, not a stored field — pure function `tierForCost(cost: number)`.

### Affordability states

| State | Treatment |
|---|---|
| Affordable + partner paired | Full color, slow 2-second opacity pulse on the price footer (1.0 ↔ 0.85). |
| Unaffordable | Card stays full opacity (was 40%), top shelf band turns shadow-gray, price footer overlaid with `🔒 NEED +153¢` in white-on-shadow-gray. |
| No partner paired | Card dimmed to 50%, no shelf color, price footer reads `🔒 NO PARTNER` |

The unaffordable card retains visual identity (you can still tell it's a Massage from across the room) but is clearly gated. Showing the *delta* is more motivating than just dimming.

### Tap behavior

Unchanged from current spec. Tap on affordable → `Alert.alert` confirm in the parent. Tap on unaffordable → `Haptics.impactAsync(Rigid)` + brief flash near the wallet HUD (the parent owns the flash). The flash text reads from the lock reason: `NEED 153 MORE COINS` or `PAIR A PARTNER FIRST`.

### Files

- `components/game/PurchaseCard.tsx` — rewritten.
- New helper `lib/shop-format.ts` — pure functions: `tierForCost(cost)`, `accentForCategory(cat)`, `formatCoins(n)`. Unit-testable.

---

## §6 — Arsenal redesign (`ArsenalRow.tsx`)

**Current:** uniform horizontal band, lime border for pending, yellow for awaiting.

**Redesign:** "deployable cartridge" cards, taller, with corner ammo badge and a heavier action button.

### Pending stack layout

```
┌──────────────────────────────────────────┐
│  [×3]                                     │ ← top-right ammo badge
│  🦶                                       │
│  FOOT RUB (15 min)                       │
│  150¢ each                               │
│                                          │
│              [▶  DEPLOY  ]               │
└──────────────────────────────────────────┘
```

- Border: 2px lime (unchanged color, but border-radius 0 reinforced).
- Height grows to ~96px (was ~64px).
- Ammo badge in top-right corner: lime fill, black `×N` text, only renders if `count > 1`.
- Emoji 32px on left, name + cost stacked to the right.
- DEPLOY button: lime fill (was bordered-only), black PressStart2P 9px, vertical padding 10px (was 8). Button reads `▶ DEPLOY`.
- The DEPLOY button gets a 1.5-second slow pulse (scale 1.0 ↔ 1.03) — subliminal "use me."

### Awaiting layout

```
┌──────────────────────────────────────────┐
│  🍝  DINNER OF MY CHOICE                 │
│      ⏳ AWAITING DELIVERY                │
└──────────────────────────────────────────┘
```

- Border: 2px yellow (unchanged), with a slow opacity pulse 1.0 ↔ 0.7 over 1.8s on the border itself (NOT the content). Sells "this is live, waiting on someone."
- No action button.

### Section header

`▸ YOUR ARSENAL` becomes a chunky banner: lime background, black text, 11px PressStart2P, 6px vertical padding. Frames the section.

### REDEEM → DEPLOY copy change

The button verb changes from `▶ REDEEM` to `▶ DEPLOY` everywhere it appears. Confirm modal text:

- Was: `Redeem ${item.name}? Your partner will be notified NOW that you want this.`
- Now: `Deploy ${item.name}? ${partner.display_name} will be notified now. No takebacks.`

### Files

- `components/game/ArsenalRow.tsx` — rewritten.
- `app/(tabs)/shop.tsx` — handler `handleRedeem` → `handleDeploy` (function rename only; same logic, same `requestRedemption` lib call).

---

## §7 — Queue redesign (`QueueRow.tsx`)

**Current:** uniform horizontal band, red border for requested, gray for stockpiled. No subsection separation.

**Redesign:** two visually distinct subsections — INCOMING (urgent) and STOCKPILED (ambient).

### Section structure

The current single `▸ THEY WANT NOW` / `▸ THEY'VE STOCKPILED` flips between titles depending on contents. Replace with two stacked subsections that always render in order if their data exists:

```
🚨 INCOMING                              ← red banner, only if any requested
├─ [requested row]
├─ [requested row]

💀 STOCKPILED ON YOU                     ← shadow-gray banner, only if any stockpiled
├─ [stockpiled row]
```

Both subsections live inside one outer "QUEUE" frame so they read as related.

### INCOMING row layout

```
┌──────────────────────────────────────────┐
│  ●  🍝  DINNER OF MY CHOICE              │ ← red dot left, blinks
│         Shay called this in 5m ago       │
│                                          │
│             [✓ DELIVER NOW]              │
└──────────────────────────────────────────┘
```

- Border: 3px red (was 2px). Visual weight matches the urgency.
- Red dot in the top-left corner, blinks 1Hz (Reanimated `withRepeat(withTiming(0.2, 500))`).
- Button changes from `✓ DELIVERED` to `✓ DELIVER NOW` (pre-action verb, not past-tense — clarifies the action).
- Button: lime fill (was bordered-only), black text, 10px padding. Heavier.

### STOCKPILED row layout

Unchanged from existing layout, but:
- Inner subsection banner reads `💀 STOCKPILED ON YOU` in shadow-gray on black.
- Border on each row stays shadow-gray. No motion.

### Files

- `components/game/QueueRow.tsx` — rewritten.
- `app/(tabs)/shop.tsx` — render path inside the QUEUE block reorganized to render INCOMING and STOCKPILED as two separate `<View>` blocks with their own banners.

---

## §8 — Section banners (shared pattern)

All four section headers (`YOUR ARSENAL`, `INCOMING`, `STOCKPILED ON YOU`, `CATALOG`) and category sub-headers under CATALOG (`PAMPERING`, `MEALS`, etc.) follow one banner pattern:

```ts
<View style={{
  backgroundColor: ACCENT_COLOR,
  paddingHorizontal: 12,
  paddingVertical: 6,
  marginBottom: 8,
  alignSelf: 'flex-start', // banner only as wide as its text
}}>
  <Text style={{
    fontFamily: 'PressStart2P',
    color: '#000',
    fontSize: 10,
    letterSpacing: 1,
  }}>{LABEL}</Text>
</View>
```

This creates visual consistency: every section starts with a chunky colored chip. The accent color encodes the section's role (lime = your stuff, red = urgent, shadow-gray = ambient, category color = catalog subsection).

### Files

- `components/ui/SectionBanner.tsx` — new shared primitive. Props: `{ label: string; color: string }`.

---

## §9 — Shop screen layout (`app/(tabs)/shop.tsx`)

Top to bottom:

1. **Header bar** (existing, unchanged) — `◆ SHOP` left, `× CLOSE` right.
2. **WalletHUD** (redesigned per §3).
3. **Shopkeep panel** (NEW per §4).
4. **YOUR ARSENAL** section (banner + rows per §6) — only if rows exist.
5. **QUEUE** outer block — only if any rows exist:
   - **INCOMING** subsection (banner + rows per §7) — only if requested rows exist.
   - **STOCKPILED ON YOU** subsection (banner + rows per §7) — only if stockpiled rows exist.
6. **CATALOG** section:
   - Top banner `▸ CATALOG` in pac-yellow (parent label).
   - For each category in fixed order (`pampering`, `meals`, `chore_relief`, `power`, `wildcard`):
     - Category sub-banner (color-coded per §2).
     - 2-up grid of `PurchaseCard`s.
7. **Bottom spacer** — 60px (was 40px) to keep the last row clear of safe-area insets.

### State and data layer

Unchanged. All four reload calls (`loadArsenal`, `loadQueue`, `loadCatalogGrouped`, `getSpendableCoins`) and the `useFocusEffect` reload pattern stay as-is. The redesign is purely presentational.

### Affordability flash

Currently the parent calls `Alert.alert('Not enough coins', ...)` on tap of an unaffordable card. Replace with a transient toast positioned absolutely overlaid on top of the WalletHUD (z-stacked, does not push layout). A Moti `<MotiView>` enters from `translateY: -8, opacity: 0` to `translateY: 0, opacity: 1` over 200ms, holds 800ms, then fades out over 500ms (~1.5s total):

```
NEED 153 MORE COINS
```

Or:

```
PAIR A PARTNER FIRST
```

The Alert is too heavy for a soft fail. The toast is appropriate for "you tapped a locked card."

### Files

- `app/(tabs)/shop.tsx` — layout reordered, toast added, handler renamed.
- `components/ui/AffordabilityToast.tsx` — new tiny presentational component. Props: `{ visible: boolean; message: string | null }`.

---

## §10 — Motion summary

All motion is Reanimated 3 (or Moti where ergonomic). No Skia. All animations run on the UI thread per technical constraint 7.

| Element | Motion | Duration | Loop |
|---|---|---|---|
| Wallet coin number | Odometer tick on value change | 500ms | No |
| Wallet inner border | Opacity pulse 1.0 ↔ 0.7 | 2000ms | Yes |
| Affordable PurchaseCard price footer | Opacity pulse 1.0 ↔ 0.85 | 2000ms | Yes |
| Pending DEPLOY button | Scale pulse 1.0 ↔ 1.03 | 1500ms | Yes |
| Awaiting border | Opacity pulse 1.0 ↔ 0.7 | 1800ms | Yes |
| INCOMING red dot | Opacity blink 1.0 ↔ 0.2 | 500ms (1Hz) | Yes |
| AffordabilityToast | Slide-down + fade | 1500ms total | No |

Pulses are intentionally *out of phase* (different durations) so the screen doesn't feel like a metronome. Per game-feel guidance, motion is ambient, not flashy.

---

## §11 — Files touched

**New:**
- `components/game/Shopkeep.tsx` — persona panel.
- `components/ui/SectionBanner.tsx` — shared chunky-chip banner.
- `components/ui/AffordabilityToast.tsx` — soft-fail flash for locked card taps.
- `lib/shopkeep-lines.ts` — variant pool + deterministic daily picker.
- `lib/shop-format.ts` — `tierForCost`, `accentForCategory`, `formatCoins`.

**Rewritten:**
- `components/game/WalletHUD.tsx` — register-style panel with ticking number and pulse.
- `components/game/PurchaseCard.tsx` — 2-up item card, accent shelf, price-tag footer, cost-tier border, lock-with-delta state.
- `components/game/ArsenalRow.tsx` — taller cartridge with ammo badge, DEPLOY copy, pulsing button/border.
- `components/game/QueueRow.tsx` — INCOMING vs STOCKPILED variants with new headers and motion.

**Modified:**
- `app/(tabs)/shop.tsx` — layout per §9, render Shopkeep, split QUEUE into two subsections, replace Alert-on-locked-tap with AffordabilityToast, rename `handleRedeem` → `handleDeploy`. Confirm-modal copy: `Redeem ...?` → `Deploy ...? No takebacks.`

**Untouched:**
- `lib/shop.ts` — all client helpers (`buyItem`, `requestRedemption`, `confirmDelivery`, `loadArsenal`, `loadQueue`, `loadCatalogGrouped`, `groupArsenal`).
- `lib/wallet.ts` — `getSpendableCoins`.
- `supabase/migrations/0016_shop_purchase_states.sql`, `0017_shop_purchase_triggers.sql`.
- `supabase/functions/on-log-inserted/index.ts`, `_shared/variants.ts`.
- `supabase/seed.sql` — 20 items, 5 categories, costs, copy all stay.
- `lib/types.ts` — no schema changes.
- `app/(tabs)/index.tsx` — Shop ActionTile + RedDotBadge unchanged.

---

## §12 — Verification

The project has no client-side test framework wired up (only Deno for edge functions). Verification follows the established pattern from the prior shop and arsenal-redesign sessions:

- `npx tsc --noEmit` exits 0 on every commit.
- Manual smoke test on device (checklist in §13).
- Existing `deno test supabase/functions/_shared/` continues to pass 32/32 — these files are untouched, but worth re-running once after the redesign lands to confirm no incidental drift.

Adding a JS test framework just for two pure helpers (`shop-format.ts`, `shopkeep-lines.ts`) is out of scope. The functions are simple enough that tsc + integration via the rendered shop screen is sufficient signal.

---

## §13 — Success criteria

After this ships:

1. The Shop screen opens with a Shopkeep persona panel directly below the wallet, displaying a contextually-appropriate one-liner from the variant pool.
2. The wallet number visibly ticks from old to new value over 500ms when coins change (purchase or refresh after a log).
3. Each catalog category is visibly distinct: Pampering rows have pink accents, Meals yellow, Chore Relief cyan, Power red, Wildcard lime.
4. Catalog renders 2 cards per row (was 3), each with a 48px emoji, 2-line name at 8px, and a colored price-tag footer.
5. Premium items (601+¢) have a 4px border and corner stars; mid-tier items (301–600¢) have a 3px border; standard items (≤300¢) have a 2px border.
6. Unaffordable cards display `🔒 NEED +XXX¢` in the price footer instead of being silently dimmed.
7. Tapping an unaffordable card produces an inline AffordabilityToast (no native Alert).
8. The Arsenal section renders pending tokens as taller cartridges with corner ammo badges (`×N`) and a slow-pulsing DEPLOY button.
9. The Queue section splits into INCOMING (red banner, blinking red dot, `DELIVER NOW` button) and STOCKPILED ON YOU (shadow-gray banner, no motion) subsections.
10. All button verbs through the redemption flow read `DEPLOY` then `DELIVER NOW` (not `REDEEM` and `DELIVERED`).
11. Confirm-modal copy on redeem reads "Deploy ... ? ... No takebacks."
12. No Skia is imported in the redesigned shop files. No new migrations, no new push triggers, no schema changes. The mechanics from `2026-04-19-shop-design.md` work identically.
13. `npx tsc --noEmit` exits 0. `deno test supabase/functions/_shared/` continues to pass 32/32 (untouched).
