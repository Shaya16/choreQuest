# Shop Visual Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the look and feel of the existing shop screen so it reads like an arcade vending machine instead of a settings list — without changing any mechanics, schema, push triggers, or seed content.

**Architecture:** Pure presentational rewrite of 4 existing components + 4 new presentational components/helpers. The data layer (`lib/shop.ts`, `lib/wallet.ts`, RLS, edge functions, migrations) is untouched. All animation is React Native + Reanimated 3 + Moti — no Skia (shop is a UI surface per technical constraint 6). Verification = `npx tsc --noEmit` + on-device smoke test, matching the project's established pattern.

**Tech Stack:** React Native, Expo Router, Moti, Reanimated 3, NativeWind, PressStart2P font.

**Spec:** `docs/superpowers/specs/2026-04-20-shop-redesign-design.md`

---

## Working directory

All paths in this plan are relative to `/Users/shayavivi/Desktop/Projects/Chore Quest/chore-quest`.

```bash
cd "/Users/shayavivi/Desktop/Projects/Chore Quest/chore-quest"
```

---

## Task 1: Create `lib/shop-format.ts` — pure formatting helpers

**Files:**
- Create: `lib/shop-format.ts`

This file holds three pure helpers used by the catalog cards and wallet HUD: cost-tier classification, category accent color, and coin number formatting. Pure functions, zero React imports, conforms to constraint 5 (`lib/` has no React).

- [ ] **Step 1: Write `lib/shop-format.ts`**

```ts
import type { ShopCategory } from './types';

export type CostTier = 'standard' | 'mid' | 'premium';

/**
 * Classifies a shop item by cost into one of three visual tiers. Drives
 * border weight and corner-star treatment on PurchaseCard.
 */
export function tierForCost(cost: number): CostTier {
  if (cost <= 300) return 'standard';
  if (cost <= 600) return 'mid';
  return 'premium';
}

/**
 * Maps a ShopCategory to its accent color from the locked palette. Used by
 * PurchaseCard borders, price-tag footers, and category section banners.
 */
export function accentForCategory(category: ShopCategory): string {
  switch (category) {
    case 'pampering':
      return '#FFB8DE'; // ghost-pink
    case 'meals':
      return '#FFCC00'; // pac-yellow
    case 'chore_relief':
      return '#00DDFF'; // ghost-cyan
    case 'power':
      return '#FF3333'; // ghost-red
    case 'wildcard':
      return '#9EFA00'; // power-lime
  }
}

/**
 * Formats a coin integer for display in the WalletHUD register and
 * PurchaseCard price footer. Comma-separates thousands and prefixes the
 * cent symbol. e.g. 1247 -> "¢ 1,247".
 */
export function formatCoins(n: number): string {
  return `¢ ${n.toLocaleString()}`;
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/shop-format.ts
git commit -m "feat(shop): add shop-format helpers (tier, accent, coin format)"
```

---

## Task 2: Create `lib/shopkeep-lines.ts` — variant pool + deterministic picker

**Files:**
- Create: `lib/shopkeep-lines.ts`

Variant pool for the Shopkeep persona's rotating one-liner. Selection is deterministic per (player, day) so the line is stable on a given day but fresh tomorrow. State-aware: returns a "broke" line when `coins < 200`, a "waiting on you" line when `incomingCount > 0`, otherwise a default-pool pick.

- [ ] **Step 1: Write `lib/shopkeep-lines.ts`**

```ts
const DEFAULT_LINES = [
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

const BROKE_LINES = [
  "come back richer.",
  "window-shopping is free.",
  "go log something.",
];

const WAITING_ON_YOU = "your partner's waiting. handle it.";
const KEEP_PRESSURE = "keep the pressure on.";

const BROKE_THRESHOLD = 200;

/**
 * djb2 string hash — 5-line deterministic integer hash. Used to pick a
 * stable line per (player, day). JS has no built-in hashCode.
 */
function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export type ShopkeepInputs = {
  playerId: string;
  date: Date;
  coins: number;
  awaitingCount: number; // items the player is waiting on partner to deliver
  incomingCount: number; // items the partner has called in on the player
};

/**
 * Picks the Shopkeep one-liner. State-aware: incoming > awaiting > broke >
 * default pool. Within the default pool, picks deterministically per
 * (playerId, day) so the line doesn't flicker on re-render.
 */
export function pickShopkeepLine(inputs: ShopkeepInputs): string {
  if (inputs.incomingCount > 0) return WAITING_ON_YOU;
  if (inputs.awaitingCount > 0) return KEEP_PRESSURE;
  const pool = inputs.coins < BROKE_THRESHOLD ? BROKE_LINES : DEFAULT_LINES;
  const dayKey = inputs.date.toISOString().slice(0, 10); // YYYY-MM-DD
  const idx = djb2(inputs.playerId + dayKey) % pool.length;
  return pool[idx];
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add lib/shopkeep-lines.ts
git commit -m "feat(shop): add shopkeep variant pool with state-aware picker"
```

---

## Task 3: Create `components/ui/SectionBanner.tsx` — shared chunky-chip banner

**Files:**
- Create: `components/ui/SectionBanner.tsx`

Shared primitive for all section headers (`YOUR ARSENAL`, `INCOMING`, `STOCKPILED ON YOU`, `CATALOG`, and the per-category sub-headers). One chunky colored chip with PressStart2P black-on-color text. Self-sized via `alignSelf: 'flex-start'`.

- [ ] **Step 1: Write `components/ui/SectionBanner.tsx`**

```tsx
import { Text, View } from 'react-native';

type Props = {
  label: string;
  color: string;
  fontSize?: number; // default 10
};

/**
 * Chunky colored chip used as a section header throughout the Shop screen.
 * The accent color encodes the section's role (lime = your stuff, red =
 * urgent, shadow-gray = ambient, category color = catalog subsection).
 */
export function SectionBanner({ label, color, fontSize = 10 }: Props) {
  return (
    <View
      style={{
        backgroundColor: color,
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginBottom: 8,
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={{
          fontFamily: 'PressStart2P',
          color: '#000',
          fontSize,
          letterSpacing: 1,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add components/ui/SectionBanner.tsx
git commit -m "feat(ui): add SectionBanner shared chip primitive"
```

---

## Task 4: Create `components/ui/AffordabilityToast.tsx` — soft-fail flash

**Files:**
- Create: `components/ui/AffordabilityToast.tsx`

Replaces the current native `Alert.alert` for "not enough coins" / "no partner" tap-on-locked-card. Slides down from above + fades in over 200ms, holds 800ms, fades out 500ms. Positioned absolutely overlaid on top of the WalletHUD by the parent — does not push layout.

- [ ] **Step 1: Write `components/ui/AffordabilityToast.tsx`**

```tsx
import { Text, View } from 'react-native';
import { MotiView } from 'moti';

type Props = {
  message: string | null; // null = hidden
};

/**
 * Transient flash for "you tapped a locked catalog card" feedback. Parent
 * controls visibility via the message prop (null = hidden). Auto-dismiss
 * is the parent's job — see useTransientMessage in the Shop screen.
 *
 * Renders absolutely positioned. Parent wraps it in a relatively-positioned
 * container (the WalletHUD area) so the toast overlays without shoving
 * layout down.
 */
export function AffordabilityToast({ message }: Props) {
  if (!message) return null;
  return (
    <MotiView
      key={message} // force re-mount on each new message so animation replays
      from={{ opacity: 0, translateY: -8 }}
      animate={{ opacity: 1, translateY: 0 }}
      exit={{ opacity: 0, translateY: -8 }}
      transition={{ type: 'timing', duration: 200 }}
      style={{
        position: 'absolute',
        top: 8,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 10,
      }}
    >
      <View
        style={{
          backgroundColor: '#FF3333',
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderWidth: 2,
          borderColor: '#000',
        }}
      >
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#000',
            fontSize: 9,
            letterSpacing: 1,
          }}
        >
          {message}
        </Text>
      </View>
    </MotiView>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add components/ui/AffordabilityToast.tsx
git commit -m "feat(ui): add AffordabilityToast for soft-fail catalog tap"
```

---

## Task 5: Create `components/game/Shopkeep.tsx` — persona panel

**Files:**
- Create: `components/game/Shopkeep.tsx`

Renders the Shopkeep emoji + speech bubble line. Stateless; takes the picked line as a prop so the parent can pass the right line based on `(playerId, coins, awaiting, incoming)`. No motion in v1 — keep the persona quiet so it doesn't compete with the affordability pulse on the catalog cards.

- [ ] **Step 1: Write `components/game/Shopkeep.tsx`**

```tsx
import { Text, View } from 'react-native';

type Props = {
  line: string;
};

/**
 * Persona panel under the WalletHUD. Anchors the screen as a destination
 * (a place with a vendor) rather than a tab (a list of buttons). Pure
 * presentational — parent picks the line via pickShopkeepLine.
 */
export function Shopkeep({ line }: Props) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        gap: 12,
      }}
    >
      <Text style={{ fontSize: 32 }}>🛍️</Text>
      <View
        style={{
          flex: 1,
          backgroundColor: '#000',
          borderWidth: 2,
          borderColor: '#4A4A4A',
          paddingHorizontal: 10,
          paddingVertical: 8,
        }}
      >
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#FFFFFF',
            fontSize: 8,
            lineHeight: 12,
          }}
        >
          "{line}"
        </Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add components/game/Shopkeep.tsx
git commit -m "feat(shop): add Shopkeep persona panel"
```

---

## Task 6: Rewrite `components/game/WalletHUD.tsx` — register-style panel

**Files:**
- Rewrite: `components/game/WalletHUD.tsx`

The wallet HUD becomes an inset "register display" with the coin number ticking via the existing `useCountUp` hook. Token count chip floats to the right. Subtitle line stays for tokens/awaiting context, promoted to 8px and turning lime when awaiting > 0.

- [ ] **Step 1: Rewrite `components/game/WalletHUD.tsx`**

```tsx
import { Text, View } from 'react-native';
import { MotiView } from 'moti';

import { useCountUp } from '@/lib/useCountUp';
import { formatCoins } from '@/lib/shop-format';

type Props = {
  coins: number;
  tokenCount: number;
  awaitingCount: number;
};

/**
 * Top-of-shop "arcade register" panel. The coin number ticks via useCountUp
 * on prop change, and the inset display has a slow opacity pulse so the
 * register feels alive. Token count chip floats to the right.
 */
export function WalletHUD({ coins, tokenCount, awaitingCount }: Props) {
  const displayed = useCountUp(coins, 500);
  return (
    <View
      style={{
        backgroundColor: '#000',
        borderBottomWidth: 2,
        borderBottomColor: '#FFCC00',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 10,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Inset register display */}
        <MotiView
          from={{ opacity: 1 }}
          animate={{ opacity: 0.7 }}
          transition={{
            type: 'timing',
            duration: 2000,
            loop: true,
            repeatReverse: true,
          }}
          style={{
            borderWidth: 4,
            borderColor: '#FFCC00',
            padding: 4,
            flexShrink: 1,
          }}
        >
          <View
            style={{
              borderWidth: 2,
              borderColor: '#FFCC00',
              paddingHorizontal: 14,
              paddingVertical: 8,
            }}
          >
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: '#FFCC00',
                fontSize: 18,
                letterSpacing: 1,
              }}
            >
              {formatCoins(displayed)}
            </Text>
          </View>
        </MotiView>

        {/* Token count chip */}
        {tokenCount > 0 && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              marginLeft: 12,
            }}
          >
            <Text style={{ fontSize: 18 }}>📦</Text>
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: '#FFFFFF',
                fontSize: 11,
              }}
            >
              ×{tokenCount}
            </Text>
          </View>
        )}
      </View>

      {(tokenCount > 0 || awaitingCount > 0) && (
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: awaitingCount > 0 ? '#9EFA00' : '#4A4A4A',
            fontSize: 8,
            marginTop: 8,
            letterSpacing: 1,
          }}
        >
          {tokenCount} TOKEN{tokenCount === 1 ? '' : 'S'}
          {awaitingCount > 0 ? ` · ${awaitingCount} AWAITING DELIVERY` : ''}
        </Text>
      )}
    </View>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add components/game/WalletHUD.tsx
git commit -m "feat(shop): redesign WalletHUD as inset register with ticking number"
```

---

## Task 7: Rewrite `components/game/PurchaseCard.tsx` — 2-up item cards with cost tier

**Files:**
- Rewrite: `components/game/PurchaseCard.tsx`

Catalog tile becomes a taller 2-up "item card" with a category-color top shelf, larger emoji block, 2-line name, and a price-tag footer. Border weight and corner stars escalate by cost tier. Locked state shows `🔒 NEED +XXX¢` instead of dimming. Affordable cards get a slow 2-second opacity pulse on the price footer.

The component now requires the parent to compute and pass the screen width-derived card width (so this component stays presentational and doesn't pull in `useWindowDimensions`). Parent uses `Dimensions.get('window')` once at render.

- [ ] **Step 1: Rewrite `components/game/PurchaseCard.tsx`**

```tsx
import { Pressable, Text, View } from 'react-native';
import { MotiView } from 'moti';
import * as Haptics from 'expo-haptics';

import { accentForCategory, formatCoins, tierForCost } from '@/lib/shop-format';
import type { ShopItem } from '@/lib/types';

type Props = {
  item: ShopItem;
  width: number; // computed by parent (screen width / 2 - margins)
  affordable: boolean;
  disabledReason: 'afford' | 'partner' | null;
  shortfall: number; // coins needed beyond what player has; 0 if affordable
  onPress: (item: ShopItem) => void;
};

/**
 * One catalog item card. Category accent on the top shelf and price-tag
 * footer; cost-tier border weight; locked variant shows the delta to
 * unlock so unaffordable items remain motivating, not just dimmed.
 */
export function PurchaseCard({
  item,
  width,
  affordable,
  disabledReason,
  shortfall,
  onPress,
}: Props) {
  const accent = accentForCategory(item.category);
  const tier = tierForCost(item.cost);
  const borderWidth = tier === 'standard' ? 2 : tier === 'mid' ? 3 : 4;
  const isPartnerLocked = disabledReason === 'partner';
  const isAffordLocked = disabledReason === 'afford';
  const locked = !affordable;

  // Color choices for locked vs. unlocked
  const shelfColor = locked ? '#4A4A4A' : accent;
  const footerBg = locked ? '#4A4A4A' : accent;
  const footerText = locked ? '#FFFFFF' : '#000000';

  return (
    <Pressable
      onPress={() => {
        Haptics.impactAsync(
          locked
            ? Haptics.ImpactFeedbackStyle.Rigid
            : Haptics.ImpactFeedbackStyle.Medium
        );
        onPress(item);
      }}
      style={{
        width,
        height: 168,
        backgroundColor: '#000',
        borderWidth,
        borderColor: locked ? '#4A4A4A' : accent,
        opacity: isPartnerLocked ? 0.5 : 1,
      }}
    >
      {/* Top shelf band */}
      <View style={{ height: 8, backgroundColor: shelfColor }} />

      {/* Premium corner stars */}
      {tier === 'premium' && !locked && (
        <>
          <Text
            style={{
              position: 'absolute',
              top: 12,
              left: 6,
              fontFamily: 'PressStart2P',
              fontSize: 10,
              color: accent,
            }}
          >
            ✦
          </Text>
          <Text
            style={{
              position: 'absolute',
              top: 12,
              right: 6,
              fontFamily: 'PressStart2P',
              fontSize: 10,
              color: accent,
            }}
          >
            ✦
          </Text>
        </>
      )}

      {/* Body: emoji + name */}
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 6,
          paddingVertical: 8,
          gap: 8,
        }}
      >
        <Text style={{ fontSize: 48 }}>{extractIcon(item.name)}</Text>
        <Text
          numberOfLines={2}
          style={{
            fontFamily: 'PressStart2P',
            color: '#FFFFFF',
            fontSize: 8,
            textAlign: 'center',
            lineHeight: 12,
          }}
        >
          {stripIcon(item.name).toUpperCase()}
        </Text>
      </View>

      {/* Price-tag footer */}
      <MotiView
        from={{ opacity: 1 }}
        animate={{ opacity: locked ? 1 : 0.85 }}
        transition={
          locked
            ? { type: 'timing', duration: 0 }
            : {
                type: 'timing',
                duration: 2000,
                loop: true,
                repeatReverse: true,
              }
        }
        style={{
          backgroundColor: footerBg,
          paddingVertical: 6,
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: footerText,
            fontSize: 10,
          }}
        >
          {isPartnerLocked
            ? '🔒 NO PARTNER'
            : isAffordLocked
              ? `🔒 NEED +${shortfall}¢`
              : formatCoins(item.cost)}
        </Text>
      </MotiView>
    </Pressable>
  );
}

function extractIcon(name: string): string {
  const match = name.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
  return match ? match[0] : '🎁';
}

function stripIcon(name: string): string {
  return name.replace(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u, '').trim();
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0. (The Shop screen still passes the OLD prop shape — that mismatch will be fixed in Task 10. tsc may flag the call site, which is expected and resolved later.)

If tsc fails ONLY on `app/(tabs)/shop.tsx` PurchaseCard usage (missing `width` / `shortfall` props), proceed — Task 10 rewires the call site. If tsc fails on anything else, stop and investigate.

- [ ] **Step 3: Commit**

```bash
git add components/game/PurchaseCard.tsx
git commit -m "feat(shop): redesign PurchaseCard with cost tier, accent, locked delta"
```

---

## Task 8: Rewrite `components/game/ArsenalRow.tsx` — DEPLOY cartridges with ammo badge

**Files:**
- Rewrite: `components/game/ArsenalRow.tsx`

Pending stack becomes a taller cartridge with a corner ammo badge, lime-filled DEPLOY button (slow scale pulse), and renamed copy. Awaiting variant gets a slow border opacity pulse so it feels alive.

- [ ] **Step 1: Rewrite `components/game/ArsenalRow.tsx`**

```tsx
import { Pressable, Text, View } from 'react-native';
import { MotiView } from 'moti';

import type { ShopItem } from '@/lib/types';

type PendingStackProps = {
  variant: 'pending';
  item: ShopItem;
  count: number;
  onRedeem: (item: ShopItem) => void;
};

type AwaitingProps = {
  variant: 'awaiting';
  item: ShopItem;
};

type Props = PendingStackProps | AwaitingProps;

/**
 * Buyer's arsenal row. Pending = deployable cartridge with ammo badge and
 * pulsing DEPLOY button. Awaiting = no action, slow border pulse so the
 * row feels live (waiting on partner). Parent owns the confirm modal.
 */
export function ArsenalRow(props: Props) {
  const { item } = props;
  const isPending = props.variant === 'pending';
  return (
    <MotiView
      from={{ opacity: 1 }}
      animate={{ opacity: isPending ? 1 : 0.7 }}
      transition={
        isPending
          ? { type: 'timing', duration: 0 }
          : {
              type: 'timing',
              duration: 1800,
              loop: true,
              repeatReverse: true,
            }
      }
      style={{
        backgroundColor: '#000',
        borderWidth: 2,
        borderColor: isPending ? '#9EFA00' : '#FFCC00',
        marginBottom: 8,
        position: 'relative',
        minHeight: 96,
      }}
    >
      {/* Ammo badge */}
      {isPending && props.count > 1 && (
        <View
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            backgroundColor: '#9EFA00',
            paddingHorizontal: 8,
            paddingVertical: 4,
            zIndex: 5,
          }}
        >
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#000',
              fontSize: 9,
            }}
          >
            ×{props.count}
          </Text>
        </View>
      )}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: 12,
          gap: 12,
        }}
      >
        <Text style={{ fontSize: 32 }}>{extractIcon(item.name)}</Text>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFFFFF',
              fontSize: 9,
              lineHeight: 14,
            }}
          >
            {stripIcon(item.name).toUpperCase()}
          </Text>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: isPending ? '#4A4A4A' : '#FFCC00',
              fontSize: 7,
              marginTop: 4,
            }}
          >
            {isPending
              ? `${item.cost}¢ EACH`
              : '⏳ AWAITING DELIVERY'}
          </Text>
        </View>
      </View>

      {isPending && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
          <MotiView
            from={{ scale: 1 }}
            animate={{ scale: 1.03 }}
            transition={{
              type: 'timing',
              duration: 1500,
              loop: true,
              repeatReverse: true,
            }}
          >
            <Pressable
              onPress={() => props.onRedeem(item)}
              style={{
                backgroundColor: '#9EFA00',
                paddingVertical: 10,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: 'PressStart2P',
                  color: '#000',
                  fontSize: 9,
                  letterSpacing: 1,
                }}
              >
                ▶ DEPLOY
              </Text>
            </Pressable>
          </MotiView>
        </View>
      )}
    </MotiView>
  );
}

function extractIcon(name: string): string {
  const match = name.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
  return match ? match[0] : '🎁';
}

function stripIcon(name: string): string {
  return name.replace(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u, '').trim();
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0. Note: `onRedeem` prop name is preserved so `app/(tabs)/shop.tsx` still compiles. Only the *displayed verb* changes from REDEEM to DEPLOY in this task. The handler rename happens in Task 10.

- [ ] **Step 3: Commit**

```bash
git add components/game/ArsenalRow.tsx
git commit -m "feat(shop): redesign ArsenalRow as cartridge with DEPLOY button + ammo badge"
```

---

## Task 9: Rewrite `components/game/QueueRow.tsx` — INCOMING vs STOCKPILED

**Files:**
- Rewrite: `components/game/QueueRow.tsx`

Two visually distinct row variants. Requested rows get a 3px red border, blinking red dot in the corner, and a lime-filled `✓ DELIVER NOW` button. Stockpiled rows stay shadow-gray and ambient.

- [ ] **Step 1: Rewrite `components/game/QueueRow.tsx`**

```tsx
import { Pressable, Text, View } from 'react-native';
import { MotiView } from 'moti';
import * as Haptics from 'expo-haptics';

import type { ShopItem } from '@/lib/types';

type RequestedProps = {
  variant: 'requested';
  purchaseId: string;
  item: ShopItem;
  requestedAt: string;
  partnerName: string;
  onDeliver: (purchaseId: string) => void;
};

type StockpiledProps = {
  variant: 'stockpiled';
  item: ShopItem;
  count: number;
  partnerName: string;
};

type Props = RequestedProps | StockpiledProps;

/**
 * Target's queue row. Requested = high-prominence with blinking red dot and
 * heavy DELIVER NOW button. Stockpiled = ambient gray with no motion.
 */
export function QueueRow(props: Props) {
  const { item } = props;
  const isRequested = props.variant === 'requested';
  return (
    <View
      style={{
        backgroundColor: '#000',
        borderWidth: isRequested ? 3 : 2,
        borderColor: isRequested ? '#FF3333' : '#4A4A4A',
        marginBottom: 8,
        position: 'relative',
        padding: 12,
      }}
    >
      {/* Blinking red dot for incoming */}
      {isRequested && (
        <MotiView
          from={{ opacity: 1 }}
          animate={{ opacity: 0.2 }}
          transition={{
            type: 'timing',
            duration: 500,
            loop: true,
            repeatReverse: true,
          }}
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: '#FF3333',
            zIndex: 5,
          }}
        />
      )}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          marginLeft: isRequested ? 14 : 0,
        }}
      >
        <Text style={{ fontSize: 28 }}>{extractIcon(item.name)}</Text>
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFFFFF',
              fontSize: 9,
              lineHeight: 14,
            }}
          >
            {stripIcon(item.name).toUpperCase()}
            {!isRequested && props.count > 1 ? `  ×${props.count}` : ''}
          </Text>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: isRequested ? '#FF3333' : '#4A4A4A',
              fontSize: 7,
              marginTop: 4,
            }}
          >
            {isRequested
              ? `${props.partnerName} called this in ${formatRelative(props.requestedAt)}`
              : `${props.partnerName} HAS THESE SAVED · BRACE`}
          </Text>
        </View>
      </View>

      {isRequested && (
        <View style={{ marginTop: 10 }}>
          <Pressable
            onPress={() => {
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success
              );
              props.onDeliver(props.purchaseId);
            }}
            style={{
              backgroundColor: '#9EFA00',
              paddingVertical: 10,
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: '#000',
                fontSize: 9,
                letterSpacing: 1,
              }}
            >
              ✓ DELIVER NOW
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function formatRelative(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function extractIcon(name: string): string {
  const match = name.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
  return match ? match[0] : '🎁';
}

function stripIcon(name: string): string {
  return name.replace(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u, '').trim();
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add components/game/QueueRow.tsx
git commit -m "feat(shop): redesign QueueRow with INCOMING vs STOCKPILED variants"
```

---

## Task 10: Wire it all up in `app/(tabs)/shop.tsx`

**Files:**
- Modify: `app/(tabs)/shop.tsx`

Integrate Shopkeep, split QUEUE into INCOMING/STOCKPILED subsections, replace `Alert.alert` on locked-card tap with `AffordabilityToast`, swap section headers for `SectionBanner`, pass new `width` and `shortfall` props to `PurchaseCard`, rename `handleRedeem` → `handleDeploy`, and update the redeem confirm-modal copy.

- [ ] **Step 1: Rewrite `app/(tabs)/shop.tsx`**

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { ArsenalRow } from '@/components/game/ArsenalRow';
import { PurchaseCard } from '@/components/game/PurchaseCard';
import { QueueRow } from '@/components/game/QueueRow';
import { Shopkeep } from '@/components/game/Shopkeep';
import { WalletHUD } from '@/components/game/WalletHUD';
import { AffordabilityToast } from '@/components/ui/AffordabilityToast';
import { SectionBanner } from '@/components/ui/SectionBanner';
import {
  buyItem,
  confirmDelivery,
  groupArsenal,
  loadArsenal,
  loadCatalogGrouped,
  loadQueue,
  requestRedemption,
  type PurchaseWithItem,
} from '@/lib/shop';
import { accentForCategory } from '@/lib/shop-format';
import { pickShopkeepLine } from '@/lib/shopkeep-lines';
import { useSession } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { getSpendableCoins } from '@/lib/wallet';
import type { Player, ShopCategory, ShopItem } from '@/lib/types';

const CATEGORY_LABELS: Record<ShopCategory, string> = {
  pampering: 'PAMPERING',
  meals: 'MEALS',
  chore_relief: 'CHORE RELIEF',
  power: 'POWER',
  wildcard: 'WILDCARD',
};

const EMPTY_CATALOG: Record<ShopCategory, ShopItem[]> = {
  pampering: [],
  meals: [],
  chore_relief: [],
  power: [],
  wildcard: [],
};

const SCREEN_PADDING = 16;
const CARD_GAP = 12;
const CARD_WIDTH =
  (Dimensions.get('window').width - SCREEN_PADDING * 2 - CARD_GAP) / 2;

export default function ShopScreen() {
  const player = useSession((s) => s.player);
  const couple = useSession((s) => s.couple);
  const [partner, setPartner] = useState<Player | null>(null);
  const [coins, setCoins] = useState<number>(0);
  const [arsenal, setArsenal] = useState<PurchaseWithItem[]>([]);
  const [queue, setQueue] = useState<PurchaseWithItem[]>([]);
  const [catalog, setCatalog] = useState<Record<ShopCategory, ShopItem[]>>(
    EMPTY_CATALOG
  );
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    if (!player || !couple) return;
    const [{ data: partnerRow }, coinsVal, arsenalRows, queueRows, catalogRows] =
      await Promise.all([
        supabase
          .from('players')
          .select('*')
          .eq('couple_id', couple.id)
          .neq('id', player.id)
          .maybeSingle<Player>(),
        getSpendableCoins(player.id),
        loadArsenal(player.id),
        loadQueue(player.id),
        loadCatalogGrouped(),
      ]);
    setPartner(partnerRow ?? null);
    setCoins(coinsVal);
    setArsenal(arsenalRows);
    setQueue(queueRows);
    setCatalog(catalogRows);
  }, [player?.id, couple?.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  function flashToast(message: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMessage(message);
    toastTimer.current = setTimeout(() => setToastMessage(null), 1500);
  }

  const { pendingStacks, awaiting } = groupArsenal(arsenal);
  const tokenCount = pendingStacks.reduce((n, s) => n + s.count, 0);

  // Split queue rows into INCOMING (requested) and STOCKPILED (pending).
  const incoming = useMemo(
    () => queue.filter((p) => p.status === 'redemption_requested'),
    [queue]
  );
  const stockpiled = useMemo(
    () => queue.filter((p) => p.status === 'pending'),
    [queue]
  );

  // Shopkeep line — picked once per render cycle from current state.
  const shopkeepLine = useMemo(() => {
    if (!player) return '';
    return pickShopkeepLine({
      playerId: player.id,
      date: new Date(),
      coins,
      awaitingCount: awaiting.length,
      incomingCount: incoming.length,
    });
  }, [player?.id, coins, awaiting.length, incoming.length]);

  function handleBuy(item: ShopItem) {
    if (!player) return;
    if (!partner) {
      flashToast('PAIR A PARTNER FIRST');
      return;
    }
    if (coins < item.cost) {
      flashToast(`NEED ${item.cost - coins} MORE COINS`);
      return;
    }
    Alert.alert(
      `Spend ${item.cost}¢?`,
      `${item.name}\n\nPurchase is permanent.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Buy',
          style: 'destructive',
          onPress: async () => {
            const { ok, error } = await buyItem(item.id, player.id, partner.id);
            if (!ok) {
              Alert.alert('Purchase failed', error ?? 'Unknown error.');
              return;
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await reload();
          },
        },
      ]
    );
  }

  function handleDeploy(item: ShopItem) {
    if (!player || !partner) return;
    Alert.alert(
      `Deploy ${item.name}?`,
      `${partner.display_name} will be notified now. No takebacks.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deploy',
          style: 'destructive',
          onPress: async () => {
            const { ok, error } = await requestRedemption(player.id, item.id);
            if (!ok) {
              Alert.alert('Deploy failed', error ?? 'Unknown error.');
              return;
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await reload();
          },
        },
      ]
    );
  }

  async function handleDeliver(purchaseId: string) {
    const { ok, error } = await confirmDelivery(purchaseId);
    if (!ok) {
      Alert.alert('Confirm failed', error ?? 'Unknown error.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await reload();
  }

  const categoryOrder: ShopCategory[] = [
    'pampering',
    'meals',
    'chore_relief',
    'power',
    'wildcard',
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }} edges={['top']}>
      {/* Header with Close button */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 2,
          borderBottomColor: '#4A4A4A',
        }}
      >
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#FFCC00',
            fontSize: 14,
          }}
        >
          ◆ SHOP
        </Text>
        <Pressable onPress={() => router.back()}>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFFFFF',
              fontSize: 9,
            }}
          >
            × CLOSE
          </Text>
        </Pressable>
      </View>

      {/* Wallet + toast container (relative parent so toast can absolute-overlay) */}
      <View style={{ position: 'relative' }}>
        <WalletHUD
          coins={coins}
          tokenCount={tokenCount}
          awaitingCount={awaiting.length}
        />
        <AffordabilityToast message={toastMessage} />
      </View>

      {/* Shopkeep persona */}
      {player && <Shopkeep line={shopkeepLine} />}

      <ScrollView contentContainerStyle={{ padding: SCREEN_PADDING }}>
        {/* ARSENAL */}
        {(pendingStacks.length > 0 || awaiting.length > 0) && (
          <View style={{ marginBottom: 24 }}>
            <SectionBanner label="▸ YOUR ARSENAL" color="#9EFA00" fontSize={11} />
            {pendingStacks.map((s) => (
              <ArsenalRow
                key={`pend-${s.item.id}`}
                variant="pending"
                item={s.item}
                count={s.count}
                onRedeem={handleDeploy}
              />
            ))}
            {awaiting.map((p) =>
              p.shop_item ? (
                <ArsenalRow
                  key={`awa-${p.id}`}
                  variant="awaiting"
                  item={p.shop_item}
                />
              ) : null
            )}
          </View>
        )}

        {/* QUEUE */}
        {(incoming.length > 0 || stockpiled.length > 0) && (
          <View style={{ marginBottom: 24 }}>
            {incoming.length > 0 && partner && (
              <View style={{ marginBottom: stockpiled.length > 0 ? 16 : 0 }}>
                <SectionBanner
                  label="🚨 INCOMING"
                  color="#FF3333"
                  fontSize={11}
                />
                {incoming.map((p) =>
                  p.shop_item ? (
                    <QueueRow
                      key={p.id}
                      variant="requested"
                      purchaseId={p.id}
                      item={p.shop_item}
                      requestedAt={p.redemption_requested_at ?? p.purchased_at}
                      partnerName={partner.display_name}
                      onDeliver={handleDeliver}
                    />
                  ) : null
                )}
              </View>
            )}

            {stockpiled.length > 0 && partner && (
              <View>
                <SectionBanner
                  label="💀 STOCKPILED ON YOU"
                  color="#4A4A4A"
                  fontSize={10}
                />
                {stockpiled.map((p) =>
                  p.shop_item ? (
                    <QueueRow
                      key={p.id}
                      variant="stockpiled"
                      item={p.shop_item}
                      count={1}
                      partnerName={partner.display_name}
                    />
                  ) : null
                )}
              </View>
            )}
          </View>
        )}

        {/* CATALOG */}
        <SectionBanner label="▸ CATALOG" color="#FFCC00" fontSize={11} />
        {categoryOrder.map((cat) => {
          const items = catalog[cat];
          if (!items || items.length === 0) return null;
          return (
            <View key={cat} style={{ marginBottom: 20 }}>
              <SectionBanner
                label={CATEGORY_LABELS[cat]}
                color={accentForCategory(cat)}
                fontSize={9}
              />
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: CARD_GAP,
                }}
              >
                {items.map((item) => {
                  const affordable = coins >= item.cost && !!partner;
                  const shortfall = Math.max(0, item.cost - coins);
                  return (
                    <PurchaseCard
                      key={item.id}
                      item={item}
                      width={CARD_WIDTH}
                      affordable={affordable}
                      disabledReason={
                        !partner ? 'partner' : coins < item.cost ? 'afford' : null
                      }
                      shortfall={shortfall}
                      onPress={handleBuy}
                    />
                  );
                })}
              </View>
            </View>
          );
        })}

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0. The new `width`, `shortfall` props are now passed; the `handleRedeem` callsite is now `handleDeploy` (which still calls `requestRedemption` under the hood — same lib function, different UX verb). All section headers use `SectionBanner`. Toast replaces Alert for soft fails.

- [ ] **Step 3: Commit**

```bash
git add app/(tabs)/shop.tsx
git commit -m "feat(shop): wire up redesigned shop screen (Shopkeep, banners, toast, deploy)"
```

---

## Task 11: Final verification

**Files:**
- None (verification only).

- [ ] **Step 1: Full typecheck**

```bash
npx tsc --noEmit
```

Expected: exit 0.

- [ ] **Step 2: Re-run edge function tests to confirm no incidental drift**

```bash
deno test supabase/functions/_shared/
```

Expected: 32 passed (12 round-close + 11 tribute-tiers + 5 variant-picker + 4 quiet-hours).

- [ ] **Step 3: Smoke test on device**

```bash
npx expo start --ios
```

Run through this checklist on the device:

1. Open the Shop tab.
2. **Wallet HUD** — coin number sits inside an inset yellow-bordered "register". Number visibly ticks if you log a chore in another tab and return.
3. **Shopkeep panel** below the wallet — chibi 🛍️ + speech-bubble line. Line should be one of:
   - Default pool if you have ≥200 coins and no pending or incoming items.
   - "your partner's waiting. handle it." if you have any incoming items (partner has called something in on you).
   - "keep the pressure on." if you have any awaiting items (you've called something in on partner).
   - "come back richer." or "window-shopping is free." or "go log something." if coins < 200.
4. **YOUR ARSENAL** — if you have pending tokens, they render as taller cartridges with a corner ammo badge (×N) when count > 1, and a lime DEPLOY button that pulses subtly. Awaiting rows show ⏳ AWAITING DELIVERY with no button and a slow border opacity pulse.
5. **Tap DEPLOY** on a pending stack → confirm modal reads `Deploy [Name]? [Partner] will be notified now. No takebacks.` with a Deploy button. Tapping Deploy fires the redemption.
6. **QUEUE** — if your partner has called something in, you see 🚨 INCOMING banner (red) with one or more rows that each have a 3px red border, a blinking red dot in the corner, and a lime DELIVER NOW button. If they have stockpiled items, those appear under 💀 STOCKPILED ON YOU (gray, no motion).
7. **CATALOG** — sections are visually distinct: Pampering = pink banner + pink card borders, Meals = yellow, Chore Relief = cyan, Power = red, Wildcard = lime.
8. **Cards are 2-up** (was 3-up). Each card is taller (~168px), with 48px emoji, name, and price-tag footer.
9. **Cost tier** — items ≤300¢ have 2px borders. Items 301–600¢ have 3px borders. Items 601+¢ (Full Massage 900, Zero Chores Day 700, Dishes For A Week 600 → wait, 600 is mid; Zero Chores Day 700 and Full Massage 900 are premium) have 4px borders + corner stars (✦) on the top-left and top-right.
10. **Affordable cards pulse** subtly on the price footer (slow 2s opacity 1.0 ↔ 0.85).
11. **Tap an unaffordable card** → AffordabilityToast slides down from above the wallet reading `NEED XXX MORE COINS`. No native Alert.
12. **Tap a card if no partner paired** (test by having a player with no partner) → AffordabilityToast reads `PAIR A PARTNER FIRST`.
13. **Locked card price footer** reads `🔒 NEED +XXX¢` instead of just being dimmed (card body itself is full opacity unless partner-locked, in which case 50%).
14. **No Skia errors in the Metro logs** — confirm no `@shopify/react-native-skia` import in the redesigned shop files (`grep -r 'react-native-skia' app/(tabs)/shop.tsx components/game/Shopkeep.tsx components/game/WalletHUD.tsx components/game/PurchaseCard.tsx components/game/ArsenalRow.tsx components/game/QueueRow.tsx components/ui/SectionBanner.tsx components/ui/AffordabilityToast.tsx` should print nothing).
15. **No new migrations applied, no edge functions deployed.** The data layer is unchanged.

- [ ] **Step 4: Update STATE.md**

Add a section to `STATE.md` documenting:
- Shop visual redesign landed (link to spec + plan).
- New files: `lib/shop-format.ts`, `lib/shopkeep-lines.ts`, `components/ui/SectionBanner.tsx`, `components/ui/AffordabilityToast.tsx`, `components/game/Shopkeep.tsx`.
- Rewritten files: `components/game/WalletHUD.tsx`, `components/game/PurchaseCard.tsx`, `components/game/ArsenalRow.tsx`, `components/game/QueueRow.tsx`, `app/(tabs)/shop.tsx`.
- Verification: `npx tsc --noEmit` 0, Deno tests 32/32, on-device smoke checklist 1–15 ✓.
- No migrations to apply, no edge functions to deploy.
- Decision noted: REDEEM → DEPLOY copy change is pure UX (the lib helper `requestRedemption` retained its name to avoid touching the data-flow surface).

- [ ] **Step 5: Final commit**

```bash
git add STATE.md
git commit -m "chore: update STATE.md with shop visual redesign completion"
```

---

## Self-review notes

- **Spec coverage:** §1 principles → applied throughout. §2 colors → Tasks 1, 7, 10. §3 wallet → Task 6. §4 Shopkeep → Tasks 2, 5, 10. §5 catalog → Tasks 1, 7, 10. §6 arsenal → Task 8 + Task 10 handler rename. §7 queue → Tasks 9, 10. §8 banners → Task 3 + adoption in Task 10. §9 layout → Task 10. §10 motion → applied across Tasks 6, 7, 8, 9. §11 files touched → matches plan. §12 verification → Task 11.
- **Type consistency:** `tierForCost`/`accentForCategory`/`formatCoins` defined in Task 1 are used in Tasks 6, 7, 10 with matching signatures. `pickShopkeepLine` from Task 2 is consumed in Task 10 with matching `ShopkeepInputs`. `SectionBanner` props (`label`, `color`, `fontSize?`) defined in Task 3 are used in Task 10 with matching call shape. `AffordabilityToast` `message: string | null` from Task 4 matches Task 10 state type. `PurchaseCard` new props (`width`, `shortfall`) from Task 7 match Task 10 callsite. `ArsenalRow` `onRedeem` callback name preserved from current code (renamed verb only) — Task 10's `handleDeploy` is a function rename of `handleRedeem`, nothing else.
- **No placeholders.** Every step has runnable code or an exact command + expected outcome.
- **Order safety.** Tasks 1–5 add new files only — they cannot break the existing app. Task 6 rewrites WalletHUD with no API change. Task 7 changes `PurchaseCard`'s prop shape; tsc will flag the parent until Task 10 updates the callsite. The plan acknowledges this and tells the executor to proceed past that single expected error. Task 10 fixes the parent and the build returns to green. Tasks 8 and 9 are API-compatible with the existing parent (props unchanged).
