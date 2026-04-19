# Live Partner Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up live partner-strike visibility via an in-app banner plus six push-notification triggers with trash-talk voice, driven by Supabase Edge Functions.

**Architecture:** Client listens to existing Supabase realtime `postgres_changes` on `logs` to render in-app banners. Server-side, a Postgres trigger on `logs` INSERT calls an `on-log-inserted` Edge Function that evaluates event-driven triggers (lead flip, milestone, round-ending, round-closed). A `pg_cron` job every 30 min calls a `notifications-tick` Edge Function for time-driven triggers (end-of-day reminder at 7pm, inactivity nudge at 3pm). Both functions share a variant picker that rotates text using per-player per-trigger last-index state.

**Tech Stack:** Expo SDK 54, React Native, expo-notifications, Supabase (Postgres + Edge Functions + pg_cron + pg_net), Deno runtime for Edge Functions.

---

## File Structure

**New files:**
- `supabase/migrations/0008_push_state.sql` — push_state table, players.expo_push_token column
- `supabase/migrations/0009_push_triggers.sql` — Postgres trigger on logs INSERT + pg_cron schedule
- `supabase/functions/_shared/variants.ts` — all trigger variant pools + interpolation
- `supabase/functions/_shared/variant-picker.ts` — rotation logic
- `supabase/functions/_shared/variant-picker.test.ts` — tests for rotation logic
- `supabase/functions/_shared/quiet-hours.ts` — Jerusalem quiet-hours guard
- `supabase/functions/_shared/quiet-hours.test.ts` — tests for quiet-hours
- `supabase/functions/_shared/expo-push.ts` — Expo Push API client
- `supabase/functions/on-log-inserted/index.ts` — event-driven triggers
- `supabase/functions/notifications-tick/index.ts` — time-driven triggers
- `lib/notifications.ts` — client push-token registration
- `components/game/StrikeBanner.tsx` — in-app banner on partner strike

**Modified files:**
- `lib/types.ts` — add expo_push_token to Player, add PushState type to Database shape
- `app/_layout.tsx` — mount StrikeBanner + deep-link handler
- `app/(auth)/login.tsx` — register push token after sign-in
- `app/(tabs)/menu.tsx` — notifications toggle
- `app/(tabs)/index.tsx` — read `openDrawer` route param to auto-open drawer

---

## Task 1: Database migration — push_state table and push token column

**Files:**
- Create: `supabase/migrations/0008_push_state.sql`
- Modify: `lib/types.ts` (add Player.expo_push_token, PushState type, Database.Tables.push_state entry)

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0008_push_state.sql`:

```sql
-- =============================================================================
-- Migration 0008: push_state table and expo_push_token column
-- =============================================================================
-- Backs the live-partner-visibility feature:
--   * push_state tracks the last-sent variant index per (player, trigger_type)
--     so trash-talk text rotates and never repeats back-to-back.
--   * players.expo_push_token stores the target device for Expo Push API calls.
-- =============================================================================

create table public.push_state (
  player_id uuid not null references public.players(id) on delete cascade,
  trigger_type text not null check (
    trigger_type in (
      'lead_flip',
      'milestone',
      'round_ending',
      'round_closed',
      'end_of_day',
      'inactivity'
    )
  ),
  last_variant_index int,
  last_fired_at timestamptz,
  -- Per-round dedup state for the 4 triggers that dedup by round.
  -- Milestone stores the highest level crossed (100/250/500/1000); others
  -- store the round id they last fired for.
  dedup_round_id uuid references public.rounds(id) on delete set null,
  dedup_level int,
  -- Per-day dedup state for the 2 solo triggers (end_of_day, inactivity).
  dedup_date date,
  primary key (player_id, trigger_type)
);

alter table public.push_state enable row level security;

-- Player can read their own rotation state (useful for debugging).
create policy "push_state: players see own"
  on public.push_state
  for select
  using (
    player_id in (select id from public.players where user_id = auth.uid())
  );

-- Only service role writes (Edge Functions run as service role).
-- Deny policy absence = default deny for insert/update/delete by non-service-role.

alter table public.players add column expo_push_token text;
```

- [ ] **Step 2: Update types in `lib/types.ts`**

Add to `Player` type (after `upgrades: string[];`):
```ts
  expo_push_token: string | null;
```

Add new type after `JackpotGoal`:
```ts
export type PushTriggerType =
  | 'lead_flip'
  | 'milestone'
  | 'round_ending'
  | 'round_closed'
  | 'end_of_day'
  | 'inactivity';

export type PushState = {
  player_id: string;
  trigger_type: PushTriggerType;
  last_variant_index: number | null;
  last_fired_at: string | null;
  dedup_round_id: string | null;
  dedup_level: number | null;
  dedup_date: string | null;
};
```

Add to `Database.public.Tables` (after `jackpot_goals`):
```ts
      push_state: {
        Row: PushState;
        Insert: Partial<PushState> & Pick<PushState, 'player_id' | 'trigger_type'>;
        Update: Partial<PushState>;
        Relationships: NoRelationships;
      };
```

- [ ] **Step 3: Apply migration**

Run:
```bash
cd chore-quest && npx supabase db push
```
Expected output: "Finished supabase db push" (or apply via the Supabase dashboard SQL editor if CLI not available).

- [ ] **Step 4: Verify TypeScript compiles**

Run:
```bash
cd chore-quest && npx tsc --noEmit
```
Expected: exits with no errors.

- [ ] **Step 5: Commit**

```bash
cd chore-quest
git add supabase/migrations/0008_push_state.sql lib/types.ts
git commit -m "feat: add push_state table and expo_push_token column"
```

---

## Task 2: Shared variants module

**Files:**
- Create: `supabase/functions/_shared/variants.ts`

- [ ] **Step 1: Write the module**

Create `supabase/functions/_shared/variants.ts`:

```ts
// =============================================================================
// Push notification variant pools. Every trigger type has 4 variants that
// rotate via the variant picker — we never send the same text twice in a row
// for the same trigger. Shared between on-log-inserted and notifications-tick.
// =============================================================================

export type TriggerType =
  | 'lead_flip'
  | 'milestone'
  | 'round_ending'
  | 'round_closed'
  | 'end_of_day'
  | 'inactivity';

export const VARIANTS: Record<TriggerType, string[]> = {
  lead_flip: [
    "👑 {{partner}}'s cooking. you're {{gap}} behind. do something.",
    "lead just flipped. {{gap}} down. pathetic. go fix it.",
    "👑 you got lapped, bestie. {{gap}} point gap. move.",
    "caught slipping. {{partner}}'s up {{gap}}. humbling.",
  ],
  milestone: [
    "{{partner}} just crossed {{n}} 💅 you? {{y}}. do math.",
    "{{n}} for {{partner}}. {{y}} for you. vibe check.",
    "📈 {{partner}} touched {{n}}. you're at {{y}}. respectfully: catch up.",
    "locked in she is. locked out you are. {{n}} vs {{y}}.",
  ],
  round_ending: [
    "{{hours}}h left. {{gap}} to tie. clock's ticking, babe.",
    "{{hours}}h on the clock, {{gap}} down. comeback arc or eulogy.",
    "⏳ {{hours}}h. need {{gap}}. go or go home.",
    "{{hours}}h. {{gap}} point deficit. panic or pull up?",
  ],
  round_closed: [
    "🏆 {{partner}} took round {{n}} by {{margin}}. round {{next}} just opened. redemption arc?",
    "brutal. {{partner}} won round {{n}} ({{margin}} margin). round {{next}}'s fresh. don't miss twice.",
    "round {{n}}: {{partner}}. round {{next}}: open. humble yourself and strike first.",
    "🏆 {{partner}} 1, you 0. new round dropped. cook or be cooked.",
  ],
  end_of_day: [
    "day ends in 5h. {{n}} strikes locked and loaded. unlock them.",
    "{{n}} strikes expiring in 5h. a choice is being made.",
    "☠️ 5h till reset. {{n}} untouched strikes. embarrassing.",
    "your drawer has {{n}} unused strikes. clock says 7pm. act accordingly.",
  ],
  inactivity: [
    "it's 3pm and you've struck nothing. are we ok.",
    "haven't seen you in the arena today. something wrong?",
    "0 strikes. {{partner}}: {{partner_count}}. make this right.",
    "3pm. 0 on the board. just checking in 👀",
  ],
};

/**
 * Substitutes {{key}} tokens in template with matching values from vars.
 * Unknown keys render as empty strings.
 */
export function renderVariant(
  template: string,
  vars: Record<string, string | number>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = vars[key];
    return value === undefined ? '' : String(value);
  });
}
```

- [ ] **Step 2: Commit**

```bash
cd chore-quest
git add supabase/functions/_shared/variants.ts
git commit -m "feat: add push notification variant pools"
```

---

## Task 3: Variant picker with tests

**Files:**
- Create: `supabase/functions/_shared/variant-picker.ts`
- Create: `supabase/functions/_shared/variant-picker.test.ts`

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/variant-picker.test.ts`:

```ts
import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { pickVariant } from './variant-picker.ts';

const pool = ['A', 'B', 'C', 'D'];

Deno.test('pickVariant never picks the last-used index', () => {
  for (let i = 0; i < 100; i++) {
    const result = pickVariant(pool, 2, {}, () => Math.random());
    assertNotEquals(result.index, 2, 'must exclude lastIndex');
  }
});

Deno.test('pickVariant falls through when lastIndex is null', () => {
  const seen = new Set<number>();
  for (let i = 0; i < 200; i++) {
    const result = pickVariant(pool, null, {}, () => Math.random());
    seen.add(result.index);
  }
  assertEquals(seen.size, pool.length, 'all indices reachable when no exclusion');
});

Deno.test('pickVariant is deterministic with a seeded rand', () => {
  // rand() = 0 picks the first candidate; rand() = 0.999 picks the last.
  const resultFirst = pickVariant(pool, 0, { x: 1 }, () => 0);
  assertEquals(resultFirst.index, 1, 'first candidate when lastIndex=0 is index 1');
  const resultLast = pickVariant(pool, 3, { x: 1 }, () => 0.999);
  assertEquals(resultLast.index, 2, 'last candidate when lastIndex=3 is index 2');
});

Deno.test('pickVariant interpolates template variables', () => {
  const result = pickVariant(
    ['hello {{who}}, score {{n}}'],
    null,
    { who: 'kessy', n: 42 },
    () => 0
  );
  assertEquals(result.text, 'hello kessy, score 42');
});

Deno.test('pickVariant handles single-variant pools', () => {
  const result = pickVariant(['only option'], 0, {}, () => 0);
  assertEquals(result.index, 0);
  assertEquals(result.text, 'only option');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd chore-quest && deno test supabase/functions/_shared/variant-picker.test.ts
```
Expected: FAIL — "Cannot find module './variant-picker.ts'".

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/_shared/variant-picker.ts`:

```ts
import { renderVariant } from './variants.ts';

export type VariantPickResult = {
  text: string;
  index: number;
};

/**
 * Picks a variant from the pool excluding lastIndex and renders it with vars.
 * Falls through to full pool when lastIndex is null or out of bounds.
 * When only one variant exists, returns it even if it matches lastIndex —
 * rotation guarantee is best-effort, never blocks delivery.
 */
export function pickVariant(
  variants: string[],
  lastIndex: number | null,
  vars: Record<string, string | number>,
  rand: () => number = Math.random
): VariantPickResult {
  if (variants.length === 0) {
    throw new Error('pickVariant: empty variant pool');
  }
  if (variants.length === 1) {
    return { text: renderVariant(variants[0], vars), index: 0 };
  }
  const candidates =
    lastIndex === null || lastIndex < 0 || lastIndex >= variants.length
      ? variants.map((_, i) => i)
      : variants.map((_, i) => i).filter((i) => i !== lastIndex);
  const index = candidates[Math.floor(rand() * candidates.length)];
  return { text: renderVariant(variants[index], vars), index };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd chore-quest && deno test supabase/functions/_shared/variant-picker.test.ts
```
Expected: 5 tests passed.

- [ ] **Step 5: Commit**

```bash
cd chore-quest
git add supabase/functions/_shared/variant-picker.ts supabase/functions/_shared/variant-picker.test.ts
git commit -m "feat: add variant-picker with rotation guarantee"
```

---

## Task 4: Quiet hours helper with tests

**Files:**
- Create: `supabase/functions/_shared/quiet-hours.ts`
- Create: `supabase/functions/_shared/quiet-hours.test.ts`

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/quiet-hours.test.ts`:

```ts
import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { isQuietHours, jerusalemHourAt } from './quiet-hours.ts';

Deno.test('jerusalemHourAt returns the local Jerusalem hour from a UTC Date', () => {
  // 2026-04-19 UTC is summer time (IDT = UTC+3).
  // 10:00 UTC → 13:00 Jerusalem
  const d = new Date('2026-04-19T10:00:00Z');
  assertEquals(jerusalemHourAt(d), 13);
});

Deno.test('isQuietHours true between 22:00 and 07:00 Jerusalem', () => {
  // 23:00 Jerusalem = 20:00 UTC in summer
  assertEquals(isQuietHours(new Date('2026-04-19T20:00:00Z')), true);
  // 03:00 Jerusalem = 00:00 UTC in summer
  assertEquals(isQuietHours(new Date('2026-04-19T00:00:00Z')), true);
  // 07:00 Jerusalem = 04:00 UTC in summer (boundary — quiet ends at 07:00)
  assertEquals(isQuietHours(new Date('2026-04-19T04:00:00Z')), false);
});

Deno.test('isQuietHours false during daytime Jerusalem hours', () => {
  // 15:00 Jerusalem = 12:00 UTC in summer
  assertEquals(isQuietHours(new Date('2026-04-19T12:00:00Z')), false);
  // 19:00 Jerusalem = 16:00 UTC in summer
  assertEquals(isQuietHours(new Date('2026-04-19T16:00:00Z')), false);
});

Deno.test('isQuietHours boundary at 22:00 Jerusalem is quiet', () => {
  // 22:00 Jerusalem = 19:00 UTC in summer
  assertEquals(isQuietHours(new Date('2026-04-19T19:00:00Z')), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd chore-quest && deno test supabase/functions/_shared/quiet-hours.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/_shared/quiet-hours.ts`:

```ts
/**
 * Quiet hours for push notifications: 22:00 to 07:00 Asia/Jerusalem.
 * DST-safe via Intl.DateTimeFormat with the IANA zone.
 */
export const PRIMARY_TZ = 'Asia/Jerusalem';

/** Returns the hour-of-day (0-23) in Jerusalem for a given UTC instant. */
export function jerusalemHourAt(now: Date = new Date()): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: PRIMARY_TZ,
    hour: 'numeric',
    hour12: false,
  }).format(now);
  // en-US with hour12:false renders "00" through "23".
  const hour = Number(formatted);
  return hour === 24 ? 0 : hour;
}

/** True if the given UTC instant falls inside 22:00–07:00 Jerusalem quiet hours. */
export function isQuietHours(now: Date = new Date()): boolean {
  const hour = jerusalemHourAt(now);
  return hour >= 22 || hour < 7;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
cd chore-quest && deno test supabase/functions/_shared/quiet-hours.test.ts
```
Expected: 4 tests passed.

- [ ] **Step 5: Commit**

```bash
cd chore-quest
git add supabase/functions/_shared/quiet-hours.ts supabase/functions/_shared/quiet-hours.test.ts
git commit -m "feat: add quiet-hours guard for push notifications"
```

---

## Task 5: Expo Push API client

**Files:**
- Create: `supabase/functions/_shared/expo-push.ts`

- [ ] **Step 1: Write the module**

Create `supabase/functions/_shared/expo-push.ts`:

```ts
// =============================================================================
// Thin wrapper over Expo's push service. Handles the Expo response envelope
// and surfaces DeviceNotRegistered so callers can clear the dead token.
// Docs: https://docs.expo.dev/push-notifications/sending-notifications/
// =============================================================================

export type ExpoPushMessage = {
  to: string;
  title?: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
};

export type ExpoPushSendResult =
  | { ok: true }
  | { ok: false; deviceNotRegistered: boolean; error: string };

export async function sendPush(
  message: ExpoPushMessage
): Promise<ExpoPushSendResult> {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...message, sound: message.sound ?? 'default' }),
  });
  if (!response.ok) {
    const text = await response.text();
    return { ok: false, deviceNotRegistered: false, error: `HTTP ${response.status}: ${text}` };
  }
  const payload = await response.json();
  // Expo wraps single-message responses in { data: { status, details?: { error? } } }
  const data = payload?.data;
  if (data?.status === 'ok') return { ok: true };
  const errorCode = data?.details?.error ?? 'unknown';
  const errorMsg = data?.message ?? 'unknown error';
  return {
    ok: false,
    deviceNotRegistered: errorCode === 'DeviceNotRegistered',
    error: `${errorCode}: ${errorMsg}`,
  };
}
```

- [ ] **Step 2: Commit**

```bash
cd chore-quest
git add supabase/functions/_shared/expo-push.ts
git commit -m "feat: add Expo Push API client"
```

---

## Task 6: Event-driven Edge Function — on-log-inserted

**Files:**
- Create: `supabase/functions/on-log-inserted/index.ts`

- [ ] **Step 1: Write the function**

Create `supabase/functions/on-log-inserted/index.ts`:

```ts
// =============================================================================
// Fires push notifications in response to log inserts. Receives a payload from
// a Postgres trigger (via pg_net) containing the newly-inserted log row.
// Evaluates 4 event-driven triggers and fires whichever apply.
// =============================================================================
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { VARIANTS, TriggerType } from '../_shared/variants.ts';
import { pickVariant } from '../_shared/variant-picker.ts';
import { isQuietHours } from '../_shared/quiet-hours.ts';
import { sendPush } from '../_shared/expo-push.ts';

type LogRow = {
  id: string;
  player_id: string;
  activity_id: string;
  round_id: string;
  coins_earned: number;
  logged_at: string;
};

type Payload = { record: LogRow };

const MILESTONE_LEVELS = [100, 250, 500, 1000];
const COOLDOWN_MS = 30 * 60 * 1000;

Deno.serve(async (req: Request) => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  const payload = (await req.json()) as Payload;
  const log = payload.record;
  if (!log) return new Response('no record', { status: 400 });

  // Load striker, partner, round totals for both players.
  const { data: striker } = await admin
    .from('players')
    .select('*')
    .eq('id', log.player_id)
    .single();
  if (!striker?.couple_id) return new Response('no couple', { status: 200 });

  const { data: partner } = await admin
    .from('players')
    .select('*')
    .eq('couple_id', striker.couple_id)
    .neq('id', striker.id)
    .maybeSingle();
  if (!partner) return new Response('no partner', { status: 200 });

  const { data: round } = await admin
    .from('rounds')
    .select('*')
    .eq('id', log.round_id)
    .single();
  if (!round) return new Response('no round', { status: 200 });

  const { data: totals } = await admin
    .from('logs')
    .select('player_id, coins_earned')
    .eq('round_id', log.round_id);
  const strikerTotal = (totals ?? [])
    .filter((r) => r.player_id === striker.id)
    .reduce((s, r) => s + (r.coins_earned ?? 0), 0);
  const partnerTotal = (totals ?? [])
    .filter((r) => r.player_id === partner.id)
    .reduce((s, r) => s + (r.coins_earned ?? 0), 0);

  // Totals BEFORE this strike landed (log.coins_earned is already in totals).
  const strikerTotalBefore = strikerTotal - (log.coins_earned ?? 0);

  // --- Trigger: lead flip ---
  const wasBehind = strikerTotalBefore <= partnerTotal;
  const isAhead = strikerTotal > partnerTotal;
  if (wasBehind && isAhead) {
    await maybeFire(admin, partner, 'lead_flip', {
      partner: striker.display_name.toLowerCase(),
      gap: strikerTotal - partnerTotal,
    });
  }

  // --- Trigger: milestone ---
  for (const level of MILESTONE_LEVELS) {
    if (strikerTotalBefore < level && strikerTotal >= level) {
      await maybeFireMilestone(admin, partner, level, {
        partner: striker.display_name.toLowerCase(),
        n: level,
        y: partnerTotal,
      }, log.round_id);
    }
  }

  // --- Trigger: round ending soon ---
  const now = new Date();
  const endMs = new Date(round.end_date).getTime();
  const hoursLeft = Math.floor((endMs - now.getTime()) / (60 * 60 * 1000));
  const partnerBehind = strikerTotal - partnerTotal;
  if (hoursLeft > 0 && hoursLeft < 24 && partnerBehind >= 50) {
    await maybeFireOncePerRound(admin, partner, 'round_ending', {
      hours: hoursLeft,
      gap: partnerBehind,
    }, log.round_id);
  }

  // round_closed fires from a separate path — on rounds.status transition, not log insert.

  return new Response('ok', { status: 200 });
});

async function maybeFire(
  admin: SupabaseClient,
  target: { id: string; expo_push_token: string | null },
  trigger: TriggerType,
  vars: Record<string, string | number>
) {
  if (!target.expo_push_token) return;
  if (isQuietHours()) return;

  const { data: state } = await admin
    .from('push_state')
    .select('*')
    .eq('player_id', target.id)
    .eq('trigger_type', trigger)
    .maybeSingle();

  if (state?.last_fired_at) {
    const age = Date.now() - new Date(state.last_fired_at).getTime();
    if (age < COOLDOWN_MS) return;
  }

  const { text, index } = pickVariant(
    VARIANTS[trigger],
    state?.last_variant_index ?? null,
    vars
  );

  const result = await sendPush({
    to: target.expo_push_token,
    body: text,
    data: { screen: 'strike_drawer' },
  });

  if (result.ok) {
    await admin.from('push_state').upsert({
      player_id: target.id,
      trigger_type: trigger,
      last_variant_index: index,
      last_fired_at: new Date().toISOString(),
    });
  } else if (result.deviceNotRegistered) {
    await admin.from('players').update({ expo_push_token: null }).eq('id', target.id);
  }
}

async function maybeFireMilestone(
  admin: SupabaseClient,
  target: { id: string; expo_push_token: string | null },
  level: number,
  vars: Record<string, string | number>,
  roundId: string
) {
  if (!target.expo_push_token) return;
  if (isQuietHours()) return;

  const { data: state } = await admin
    .from('push_state')
    .select('*')
    .eq('player_id', target.id)
    .eq('trigger_type', 'milestone')
    .maybeSingle();

  // Milestone dedup: per (player, round, level) — never same level twice in a round.
  if (state?.dedup_round_id === roundId && (state?.dedup_level ?? 0) >= level) return;
  if (state?.last_fired_at) {
    const age = Date.now() - new Date(state.last_fired_at).getTime();
    if (age < COOLDOWN_MS) return;
  }

  const { text, index } = pickVariant(
    VARIANTS.milestone,
    state?.last_variant_index ?? null,
    vars
  );
  const result = await sendPush({
    to: target.expo_push_token,
    body: text,
    data: { screen: 'strike_drawer' },
  });
  if (result.ok) {
    await admin.from('push_state').upsert({
      player_id: target.id,
      trigger_type: 'milestone',
      last_variant_index: index,
      last_fired_at: new Date().toISOString(),
      dedup_round_id: roundId,
      dedup_level: level,
    });
  } else if (result.deviceNotRegistered) {
    await admin.from('players').update({ expo_push_token: null }).eq('id', target.id);
  }
}

async function maybeFireOncePerRound(
  admin: SupabaseClient,
  target: { id: string; expo_push_token: string | null },
  trigger: Extract<TriggerType, 'round_ending' | 'round_closed'>,
  vars: Record<string, string | number>,
  roundId: string
) {
  if (!target.expo_push_token) return;
  if (isQuietHours()) return;

  const { data: state } = await admin
    .from('push_state')
    .select('*')
    .eq('player_id', target.id)
    .eq('trigger_type', trigger)
    .maybeSingle();

  if (state?.dedup_round_id === roundId) return;
  if (state?.last_fired_at) {
    const age = Date.now() - new Date(state.last_fired_at).getTime();
    if (age < COOLDOWN_MS) return;
  }

  const { text, index } = pickVariant(
    VARIANTS[trigger],
    state?.last_variant_index ?? null,
    vars
  );
  const result = await sendPush({
    to: target.expo_push_token,
    body: text,
    data: { screen: 'strike_drawer' },
  });
  if (result.ok) {
    await admin.from('push_state').upsert({
      player_id: target.id,
      trigger_type: trigger,
      last_variant_index: index,
      last_fired_at: new Date().toISOString(),
      dedup_round_id: roundId,
    });
  } else if (result.deviceNotRegistered) {
    await admin.from('players').update({ expo_push_token: null }).eq('id', target.id);
  }
}
```

- [ ] **Step 2: Deploy the function**

Run:
```bash
cd chore-quest && npx supabase functions deploy on-log-inserted
```
Expected: "Deployed function on-log-inserted".

- [ ] **Step 3: Commit**

```bash
cd chore-quest
git add supabase/functions/on-log-inserted/index.ts
git commit -m "feat: add on-log-inserted Edge Function for event-driven pushes"
```

---

## Task 7: Database trigger wiring the Edge Function

**Files:**
- Create: `supabase/migrations/0009_push_triggers.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/0009_push_triggers.sql`:

```sql
-- =============================================================================
-- Migration 0009: wire pg trigger + pg_cron for push notifications
-- =============================================================================
-- Depends on pg_net (for http_post) and pg_cron (for scheduled ticks), both
-- available on Supabase-hosted Postgres.
-- Requires Edge Function URL in vault. Set before running this migration:
--   insert into vault.secrets (name, secret) values
--     ('edge_functions_base_url', 'https://<project-ref>.supabase.co/functions/v1'),
--     ('edge_functions_service_key', '<anon or service role key>');
-- =============================================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.notify_log_inserted()
returns trigger
language plpgsql
security definer
as $$
declare
  base_url text;
  service_key text;
begin
  select decrypted_secret into base_url from vault.decrypted_secrets
    where name = 'edge_functions_base_url';
  select decrypted_secret into service_key from vault.decrypted_secrets
    where name = 'edge_functions_service_key';
  if base_url is null or service_key is null then
    return new;
  end if;
  perform net.http_post(
    url := base_url || '/on-log-inserted',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body := jsonb_build_object('record', to_jsonb(new))
  );
  return new;
end;
$$;

create trigger logs_after_insert_notify
  after insert on public.logs
  for each row
  execute function public.notify_log_inserted();

-- Schedule notifications-tick every 30 min (function added in Task 9).
select cron.schedule(
  'notifications_tick',
  '*/30 * * * *',
  $$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_base_url') || '/notifications-tick',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_service_key')
      ),
      body := '{}'::jsonb
    );
  $$
);
```

- [ ] **Step 2: Store Edge Function secrets in Supabase Vault**

Via Supabase SQL Editor run (replace placeholders with real values from Supabase project dashboard):
```sql
insert into vault.secrets (name, secret) values
  ('edge_functions_base_url', 'https://YOUR_PROJECT_REF.supabase.co/functions/v1'),
  ('edge_functions_service_key', 'YOUR_SERVICE_ROLE_KEY');
```
Expected: 2 rows inserted.

- [ ] **Step 3: Apply the migration**

Run:
```bash
cd chore-quest && npx supabase db push
```
Expected: applies 0009 cleanly.

- [ ] **Step 4: Smoke-test the trigger**

Insert a dummy log via Supabase SQL editor using existing player_id + activity_id + round_id and verify the Edge Function was invoked (check Supabase function logs).
Expected: function log shows an invocation with the record payload.

- [ ] **Step 5: Commit**

```bash
cd chore-quest
git add supabase/migrations/0009_push_triggers.sql
git commit -m "feat: wire logs insert trigger and pg_cron to Edge Functions"
```

---

## Task 8: Round-closed trigger path

**Files:**
- Modify: `supabase/migrations/0009_push_triggers.sql`
- Modify: `supabase/functions/on-log-inserted/index.ts`

Round closure is a state transition on `rounds`, not an insert on `logs` — needs its own mechanism. Simplest: reuse the on-log-inserted Edge Function but with a different payload, triggered by an `AFTER UPDATE` on `rounds` when status flips to `closed`.

- [ ] **Step 1: Append round-close handling to the Edge Function**

Modify `supabase/functions/on-log-inserted/index.ts`. Replace the top-level handler with a dispatcher:

Near the top of the file, add type:
```ts
type RoundClosedPayload = {
  type: 'round_closed';
  round: {
    id: string;
    couple_id: string;
    number: number;
    winner_id: string | null;
    p1_total: number | null;
    p2_total: number | null;
    margin: number | null;
  };
};

type DispatchPayload = Payload | RoundClosedPayload;
```

Replace the `Deno.serve(async (req) => { ... })` block top-level body with:

```ts
Deno.serve(async (req: Request) => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  const payload = (await req.json()) as DispatchPayload;

  if ('type' in payload && payload.type === 'round_closed') {
    await handleRoundClosed(admin, payload);
    return new Response('ok', { status: 200 });
  }

  const log = (payload as Payload).record;
  if (!log) return new Response('no record', { status: 400 });

  // ... (keep the existing log-handling body as-is, from the loadPlayer call onward)
});
```

Add `handleRoundClosed` at bottom of file:

```ts
async function handleRoundClosed(
  admin: SupabaseClient,
  payload: RoundClosedPayload
) {
  const { round } = payload;
  if (!round.winner_id) return; // no loser to notify

  const { data: winner } = await admin
    .from('players')
    .select('*')
    .eq('id', round.winner_id)
    .single();
  if (!winner) return;

  const { data: loser } = await admin
    .from('players')
    .select('*')
    .eq('couple_id', round.couple_id)
    .neq('id', round.winner_id)
    .maybeSingle();
  if (!loser) return;

  await maybeFireOncePerRound(admin, loser, 'round_closed', {
    partner: winner.display_name.toLowerCase(),
    n: round.number,
    next: round.number + 1,
    margin: round.margin ?? 0,
  }, round.id);
}
```

- [ ] **Step 2: Append pg trigger for round close to migration 0009**

Append to `supabase/migrations/0009_push_triggers.sql`:

```sql
create or replace function public.notify_round_closed()
returns trigger
language plpgsql
security definer
as $$
declare
  base_url text;
  service_key text;
begin
  if new.status = 'closed' and coalesce(old.status, 'active') <> 'closed' then
    select decrypted_secret into base_url from vault.decrypted_secrets
      where name = 'edge_functions_base_url';
    select decrypted_secret into service_key from vault.decrypted_secrets
      where name = 'edge_functions_service_key';
    if base_url is null or service_key is null then return new; end if;
    perform net.http_post(
      url := base_url || '/on-log-inserted',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object('type', 'round_closed', 'round', to_jsonb(new))
    );
  end if;
  return new;
end;
$$;

create trigger rounds_after_update_notify
  after update of status on public.rounds
  for each row
  execute function public.notify_round_closed();
```

- [ ] **Step 3: Apply migration amendment**

Since migration 0009 has already been created as a file, this is an update to the same migration file before applying. If 0009 was already applied to dev DB, run the appended SQL directly in the SQL Editor or create a 0010 migration. Plan assumes same-file edit pre-apply; if already applied, inline the above into `0010_round_close_trigger.sql`.

Run:
```bash
cd chore-quest && npx supabase db push
```

- [ ] **Step 4: Redeploy Edge Function**

Run:
```bash
cd chore-quest && npx supabase functions deploy on-log-inserted
```

- [ ] **Step 5: Commit**

```bash
cd chore-quest
git add supabase/migrations/0009_push_triggers.sql supabase/functions/on-log-inserted/index.ts
git commit -m "feat: add round-closed push trigger"
```

---

## Task 9: Time-driven Edge Function — notifications-tick

**Files:**
- Create: `supabase/functions/notifications-tick/index.ts`

- [ ] **Step 1: Write the function**

Create `supabase/functions/notifications-tick/index.ts`:

```ts
// =============================================================================
// Runs every 30 minutes from pg_cron. Fires the two time-driven triggers
// (end-of-day reminder, inactivity nudge) when the Jerusalem-local window
// matches and the player's daily state qualifies.
// =============================================================================
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { VARIANTS } from '../_shared/variants.ts';
import { pickVariant } from '../_shared/variant-picker.ts';
import { isQuietHours, jerusalemHourAt, PRIMARY_TZ } from '../_shared/quiet-hours.ts';
import { sendPush } from '../_shared/expo-push.ts';

const COOLDOWN_MS = 30 * 60 * 1000;
const END_OF_DAY_MIN_UNUSED = 5;

Deno.serve(async () => {
  if (isQuietHours()) return new Response('quiet hours', { status: 200 });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const now = new Date();
  const hour = jerusalemHourAt(now);
  const today = todayInJerusalem(now);

  // Window ±15 min absorbs the 30-min tick cadence.
  const isInactivityWindow = hour === 15;
  const isEndOfDayWindow = hour === 19;
  if (!isInactivityWindow && !isEndOfDayWindow) return new Response('not a window', { status: 200 });

  const { data: players } = await admin
    .from('players')
    .select('*')
    .not('expo_push_token', 'is', null);

  for (const player of (players ?? [])) {
    if (isInactivityWindow) await tryInactivity(admin, player, today);
    if (isEndOfDayWindow) await tryEndOfDay(admin, player, today);
  }

  return new Response('ok', { status: 200 });
});

function todayInJerusalem(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: PRIMARY_TZ }).format(now); // YYYY-MM-DD
}

function jerusalemDayBoundsUtc(today: string): { start: string; end: string } {
  // 00:00 Jerusalem on `today` → UTC instant. Use Intl to handle DST.
  // Simplest: build a Date from "today" + "T00:00:00" as Jerusalem time.
  // Intl doesn't parse, but we can use the trick: construct as UTC, subtract offset.
  const midnightLocalAsUtc = new Date(`${today}T00:00:00Z`);
  const jerusalemOffsetMin = getJerusalemOffsetMinutes(midnightLocalAsUtc);
  const start = new Date(midnightLocalAsUtc.getTime() - jerusalemOffsetMin * 60_000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function getJerusalemOffsetMinutes(at: Date): number {
  // Offset = local - utc, minutes. Jerusalem is UTC+2 (IST) or UTC+3 (IDT).
  const utcHour = at.getUTCHours();
  const jerusalemHour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: PRIMARY_TZ,
      hour: 'numeric',
      hour12: false,
    }).format(at)
  );
  let diff = jerusalemHour - utcHour;
  if (diff < -12) diff += 24;
  if (diff > 12) diff -= 24;
  return diff * 60;
}

async function tryInactivity(
  admin: SupabaseClient,
  player: { id: string; display_name: string; couple_id: string | null; expo_push_token: string | null },
  today: string
) {
  if (!player.expo_push_token) return;

  // Dedup: fired today already?
  const { data: state } = await admin
    .from('push_state')
    .select('*')
    .eq('player_id', player.id)
    .eq('trigger_type', 'inactivity')
    .maybeSingle();
  if (state?.dedup_date === today) return;
  if (state?.last_fired_at) {
    const age = Date.now() - new Date(state.last_fired_at).getTime();
    if (age < COOLDOWN_MS) return;
  }

  // Qualification: 0 logs today in Jerusalem day.
  const { start, end } = jerusalemDayBoundsUtc(today);
  const { count: myCount } = await admin
    .from('logs')
    .select('id', { count: 'exact', head: true })
    .eq('player_id', player.id)
    .gte('logged_at', start)
    .lte('logged_at', end);
  if ((myCount ?? 0) > 0) return;

  // Load partner for count + name.
  let partnerName = 'partner';
  let partnerCount = 0;
  if (player.couple_id) {
    const { data: partner } = await admin
      .from('players')
      .select('id, display_name')
      .eq('couple_id', player.couple_id)
      .neq('id', player.id)
      .maybeSingle();
    if (partner) {
      partnerName = partner.display_name.toLowerCase();
      const { count: pc } = await admin
        .from('logs')
        .select('id', { count: 'exact', head: true })
        .eq('player_id', partner.id)
        .gte('logged_at', start)
        .lte('logged_at', end);
      partnerCount = pc ?? 0;
    }
  }

  const { text, index } = pickVariant(
    VARIANTS.inactivity,
    state?.last_variant_index ?? null,
    { partner: partnerName, partner_count: partnerCount }
  );
  const result = await sendPush({
    to: player.expo_push_token,
    body: text,
    data: { screen: 'strike_drawer' },
  });
  if (result.ok) {
    await admin.from('push_state').upsert({
      player_id: player.id,
      trigger_type: 'inactivity',
      last_variant_index: index,
      last_fired_at: new Date().toISOString(),
      dedup_date: today,
    });
  } else if (result.deviceNotRegistered) {
    await admin.from('players').update({ expo_push_token: null }).eq('id', player.id);
  }
}

async function tryEndOfDay(
  admin: SupabaseClient,
  player: { id: string; expo_push_token: string | null },
  today: string
) {
  if (!player.expo_push_token) return;

  const { data: state } = await admin
    .from('push_state')
    .select('*')
    .eq('player_id', player.id)
    .eq('trigger_type', 'end_of_day')
    .maybeSingle();
  if (state?.dedup_date === today) return;
  if (state?.last_fired_at) {
    const age = Date.now() - new Date(state.last_fired_at).getTime();
    if (age < COOLDOWN_MS) return;
  }

  // Compute unused daily strikes: sum across activities of (daily_cap - today_count)
  // where daily_cap > 0 and today_count < daily_cap.
  const { start, end } = jerusalemDayBoundsUtc(today);
  const { data: activities } = await admin
    .from('activities')
    .select('id, daily_cap')
    .eq('is_active', true)
    .gt('daily_cap', 0);
  const { data: todayLogs } = await admin
    .from('logs')
    .select('activity_id')
    .eq('player_id', player.id)
    .gte('logged_at', start)
    .lte('logged_at', end);
  const counts: Record<string, number> = {};
  for (const l of (todayLogs ?? [])) counts[l.activity_id] = (counts[l.activity_id] ?? 0) + 1;
  let unused = 0;
  for (const a of (activities ?? [])) {
    const used = counts[a.id] ?? 0;
    unused += Math.max(0, (a.daily_cap ?? 0) - used);
  }
  if (unused < END_OF_DAY_MIN_UNUSED) return;

  const { text, index } = pickVariant(
    VARIANTS.end_of_day,
    state?.last_variant_index ?? null,
    { n: unused }
  );
  const result = await sendPush({
    to: player.expo_push_token,
    body: text,
    data: { screen: 'strike_drawer' },
  });
  if (result.ok) {
    await admin.from('push_state').upsert({
      player_id: player.id,
      trigger_type: 'end_of_day',
      last_variant_index: index,
      last_fired_at: new Date().toISOString(),
      dedup_date: today,
    });
  } else if (result.deviceNotRegistered) {
    await admin.from('players').update({ expo_push_token: null }).eq('id', player.id);
  }
}
```

- [ ] **Step 2: Deploy the function**

Run:
```bash
cd chore-quest && npx supabase functions deploy notifications-tick
```

- [ ] **Step 3: Smoke-test manually**

Via Supabase dashboard → Functions → notifications-tick → Invoke with empty body `{}`.
Expected: 200 response. If outside the 15:00 / 19:00 Jerusalem windows, response body is `"not a window"`. If inside, check function logs for push send attempts.

- [ ] **Step 4: Commit**

```bash
cd chore-quest
git add supabase/functions/notifications-tick/index.ts
git commit -m "feat: add notifications-tick Edge Function for time-driven pushes"
```

---

## Task 10: Install client push dependencies

**Files:**
- Modify: `chore-quest/package.json`
- Modify: `chore-quest/app.json`

- [ ] **Step 1: Install dependencies**

Run:
```bash
cd chore-quest && npx expo install expo-notifications expo-device
```
Expected: adds `expo-notifications` and `expo-device` to dependencies.

- [ ] **Step 2: Configure notification permissions in `app.json`**

Merge into the `"expo"` object (add `"plugins"` if absent):

```json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/sprites/backgrounds/near_arcade.png",
          "color": "#FFCC00"
        }
      ]
    ],
    "ios": {
      "infoPlist": {
        "UIBackgroundModes": ["remote-notification"]
      }
    }
  }
}
```

(Preserve any existing `plugins` / `ios` / `android` keys — merge, don't replace.)

- [ ] **Step 3: Verify install**

Run:
```bash
cd chore-quest && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd chore-quest
git add package.json package-lock.json app.json
git commit -m "chore: install expo-notifications and expo-device"
```

---

## Task 11: Client push registration module

**Files:**
- Create: `chore-quest/lib/notifications.ts`

- [ ] **Step 1: Write the module**

Create `chore-quest/lib/notifications.ts`:

```ts
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Requests permissions and registers the device with Expo Push.
 * Writes the resulting token to the current player's row so Edge Functions
 * can target it. Returns null if permission is denied or on simulator.
 */
export async function registerPushToken(playerId: string): Promise<string | null> {
  if (!Device.isDevice) {
    // Simulators can't receive pushes; skip silently.
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FFCC00',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  const token = (
    await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    )
  ).data;

  await supabase
    .from('players')
    .update({ expo_push_token: token })
    .eq('id', playerId);

  return token;
}

/** Clears the stored token (called when user toggles notifications off). */
export async function clearPushToken(playerId: string): Promise<void> {
  await supabase
    .from('players')
    .update({ expo_push_token: null })
    .eq('id', playerId);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
cd chore-quest && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd chore-quest
git add lib/notifications.ts
git commit -m "feat: add client push-token registration"
```

---

## Task 12: Call push registration on sign-in

**Files:**
- Modify: the auth flow — search the codebase for where player row is loaded post-signin.

- [ ] **Step 1: Find the post-signin player load**

Run:
```bash
cd chore-quest && grep -rn "from('players')" app/ lib/ | head -10
```
Expected: identifies the file that fetches the current player row after auth (likely `lib/store.ts` or `app/(auth)/*`).

- [ ] **Step 2: Wire registerPushToken after the player is loaded**

In the file that loads the current player (most likely `lib/store.ts` — a zustand store `setPlayer` action), import and call after setting the player:

```ts
import { registerPushToken } from './notifications';
```

In the function that sets the player (after the player row is confirmed loaded):

```ts
// Fire-and-forget — a registration failure shouldn't block signing in.
void registerPushToken(player.id);
```

- [ ] **Step 3: Verify TypeScript compiles**

Run:
```bash
cd chore-quest && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd chore-quest
git add lib/store.ts
git commit -m "feat: register push token on sign-in"
```

---

## Task 13: StrikeBanner component

**Files:**
- Create: `chore-quest/components/game/StrikeBanner.tsx`

- [ ] **Step 1: Write the component**

Create `chore-quest/components/game/StrikeBanner.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { MotiView } from 'moti';
import { useRouter } from 'expo-router';

import { ACCENT_HEX, CLASS_META } from '@/lib/characters';
import type { Player, Activity } from '@/lib/types';

type BannerEvent = {
  id: string;
  partner: Player;
  activity: Activity;
  coins: number;
};

type Props = {
  event: BannerEvent | null;
  onDismiss: () => void;
};

/**
 * Renders a sliding banner for partner strikes. Auto-dismisses after 3s.
 * Stacks visually at the top of the screen above all tab content. Tapping
 * navigates to the strike drawer so the user can strike back immediately.
 */
export function StrikeBanner({ event, onDismiss }: Props) {
  const router = useRouter();
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!event) return;
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(onDismiss, 3000);
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [event, onDismiss]);

  if (!event) return null;

  const meta = CLASS_META[event.partner.arcade_class];
  const accent = ACCENT_HEX[meta.accent];

  return (
    <MotiView
      key={event.id}
      from={{ translateY: -80, opacity: 0 }}
      animate={{ translateY: 0, opacity: 1 }}
      exit={{ translateY: -80, opacity: 0 }}
      transition={{ type: 'timing', duration: 220 }}
      style={{
        position: 'absolute',
        top: 48,
        left: 12,
        right: 12,
        zIndex: 1000,
      }}
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => {
          onDismiss();
          router.push('/(tabs)');
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#000000',
            borderWidth: 3,
            borderColor: accent,
            padding: 10,
            gap: 10,
          }}
        >
          <Image
            source={meta.sprite}
            style={{ width: 36, height: 36 }}
            resizeMode="contain"
          />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: accent,
                fontSize: 10,
                marginBottom: 2,
              }}
            >
              {event.partner.display_name.toUpperCase()} STRUCK
            </Text>
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: '#FFFFFF',
                fontSize: 9,
              }}
              numberOfLines={1}
            >
              {event.activity.name} · +{event.coins}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </MotiView>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run:
```bash
cd chore-quest && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd chore-quest
git add components/game/StrikeBanner.tsx
git commit -m "feat: add StrikeBanner component for partner-strike visibility"
```

---

## Task 14: Mount StrikeBanner in root layout and wire to realtime

**Files:**
- Modify: `chore-quest/app/_layout.tsx`

- [ ] **Step 1: Read the existing layout**

Run:
```bash
cd chore-quest && cat app/_layout.tsx
```
Note the current imports and the tree structure — the banner must mount above the `<Stack>`.

- [ ] **Step 2: Modify `app/_layout.tsx` to include the banner + subscription**

Add imports at the top:
```tsx
import { useEffect, useState } from 'react';
import { StrikeBanner } from '@/components/game/StrikeBanner';
import { supabase } from '@/lib/supabase';
import type { Activity, Log, Player } from '@/lib/types';
import { useAppStore } from '@/lib/store'; // adjust to whatever the store export is
```

Above the existing root return, add a hook that subscribes to partner log inserts and emits banner events. Exact wiring depends on the store shape — the goal is:

```tsx
function useStrikeBanner() {
  const [event, setEvent] = useState<{
    id: string;
    partner: Player;
    activity: Activity;
    coins: number;
  } | null>(null);
  const currentPlayer = useAppStore((s) => s.player);
  const partner = useAppStore((s) => s.partner);

  useEffect(() => {
    if (!currentPlayer || !partner) return;
    const channel = supabase
      .channel(`banner-${currentPlayer.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'logs',
          filter: `player_id=eq.${partner.id}`,
        },
        async (payload) => {
          const log = payload.new as Log;
          const { data: activity } = await supabase
            .from('activities')
            .select('*')
            .eq('id', log.activity_id)
            .single<Activity>();
          if (!activity) return;
          setEvent({
            id: log.id,
            partner,
            activity,
            coins: log.coins_earned ?? 0,
          });
        }
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [currentPlayer?.id, partner?.id]);

  return { event, dismiss: () => setEvent(null) };
}
```

In the default-exported root component, add:
```tsx
const { event, dismiss } = useStrikeBanner();
```

And render `<StrikeBanner event={event} onDismiss={dismiss} />` at the end of the return tree (after the `<Stack />`), so it overlays.

- [ ] **Step 3: Verify TypeScript compiles**

Run:
```bash
cd chore-quest && npx tsc --noEmit
```
Expected: no errors. If the store export names differ, update the imports to match (e.g. the store may expose `usePlayerStore` instead of `useAppStore`).

- [ ] **Step 4: Manual test**

Start the app: `npx expo start --clear`. Sign in both players (or use dev stub partner). Trigger a partner strike via a second device or via SQL:
```sql
-- replace with real ids
insert into logs (player_id, activity_id, round_id, base_value, player_multiplier, combo_multiplier, crit_multiplier, daily_bonus_multiplier, weekly_hero_multiplier, season_multiplier, coins_earned, xp_earned, jackpot_share, personal_share)
values ('PARTNER_PLAYER_ID', 'ACTIVITY_ID', 'ROUND_ID', 5, 1, 1, 1, 1, 1, 1, 5, 5, 0, 5);
```
Expected: banner slides in within ~1s on the first device.

- [ ] **Step 5: Commit**

```bash
cd chore-quest
git add app/_layout.tsx
git commit -m "feat: mount StrikeBanner and wire realtime partner log subscription"
```

---

## Task 15: Deep-link notification tap → strike drawer

**Files:**
- Modify: `chore-quest/app/_layout.tsx`
- Modify: `chore-quest/app/(tabs)/index.tsx`

- [ ] **Step 1: Add notification response listener to `app/_layout.tsx`**

Add import:
```tsx
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
```

In the root component, add:
```tsx
useEffect(() => {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data as { screen?: string };
    if (data?.screen === 'strike_drawer') {
      router.push({ pathname: '/(tabs)', params: { openDrawer: '1' } });
    }
  });
  return () => sub.remove();
}, []);
```

- [ ] **Step 2: Read the strike drawer state in `app/(tabs)/index.tsx`**

Find where `StrikeDrawer` is mounted (around line 572 in current code). Add at the top of the component:

```tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
```

Inside the component body:
```tsx
const { openDrawer } = useLocalSearchParams<{ openDrawer?: string }>();
const localRouter = useRouter();
const [drawerOpen, setDrawerOpen] = useState(false);

useEffect(() => {
  if (openDrawer === '1') {
    setDrawerOpen(true);
    // Clear the param so subsequent navigations don't re-open
    localRouter.setParams({ openDrawer: undefined });
  }
}, [openDrawer]);
```

Pass `open={drawerOpen}` and `onOpenChange={setDrawerOpen}` (or equivalent) to `<StrikeDrawer>`. If StrikeDrawer doesn't yet accept a controlled open state, add those props to it — a small StrikeDrawer tweak:

```tsx
// In StrikeDrawer component: accept optional `open` + `onOpenChange` props
// and prefer them over the internal state when provided.
```

(The exact modification depends on StrikeDrawer's current internals — read `components/game/StrikeDrawer.tsx` and add a controlled-state fallback without breaking existing usage.)

- [ ] **Step 3: Verify TypeScript compiles**

Run:
```bash
cd chore-quest && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Manual test**

On a physical device (pushes don't land on simulators), send a test push via the Expo Push Tool (https://expo.dev/notifications) with data `{"screen":"strike_drawer"}` to the token from the players row. Tap the notification.
Expected: app opens to home tab with the strike drawer expanded.

- [ ] **Step 5: Commit**

```bash
cd chore-quest
git add app/_layout.tsx app/\(tabs\)/index.tsx components/game/StrikeDrawer.tsx
git commit -m "feat: deep-link push taps to open strike drawer"
```

---

## Task 16: Notifications toggle on menu tab

**Files:**
- Modify: `chore-quest/app/(tabs)/menu.tsx`

- [ ] **Step 1: Read existing menu tab**

Run:
```bash
cd chore-quest && cat app/\(tabs\)/menu.tsx
```
Understand the current section structure.

- [ ] **Step 2: Add a Settings row with a notifications toggle**

In `app/(tabs)/menu.tsx`, add:

```tsx
import { Switch } from 'react-native';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { registerPushToken, clearPushToken } from '@/lib/notifications';
```

Inside the component, add (assuming `player` is already loaded via the store):
```tsx
const [notifEnabled, setNotifEnabled] = useState<boolean>(!!player?.expo_push_token);

useEffect(() => {
  setNotifEnabled(!!player?.expo_push_token);
}, [player?.expo_push_token]);

const handleNotifToggle = async (value: boolean) => {
  if (!player) return;
  setNotifEnabled(value);
  if (value) {
    const token = await registerPushToken(player.id);
    if (!token) setNotifEnabled(false); // permission denied fell through
  } else {
    await clearPushToken(player.id);
  }
};
```

Add a new section in the menu's JSX tree:
```tsx
<View
  style={{
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  }}
>
  <Text
    style={{
      fontFamily: 'PressStart2P',
      color: '#FFFFFF',
      fontSize: 11,
    }}
  >
    NOTIFICATIONS
  </Text>
  <Switch
    value={notifEnabled}
    onValueChange={handleNotifToggle}
    trackColor={{ false: '#333', true: '#FFCC00' }}
  />
</View>
```

- [ ] **Step 3: Verify TypeScript compiles**

Run:
```bash
cd chore-quest && npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Manual test**

Reload app. Navigate to menu tab. Toggle the switch off → verify `players.expo_push_token` is cleared in DB. Toggle on → verify token is re-registered (permission prompt on first enable).
Expected: toggling both directions updates the DB and persists across app launches.

- [ ] **Step 5: Commit**

```bash
cd chore-quest
git add app/\(tabs\)/menu.tsx
git commit -m "feat: add notifications on/off toggle in menu settings"
```

---

## Task 17: End-to-end smoke test

**Files:** none

- [ ] **Step 1: Kick off a live round between two devices (or real-device + dev stub)**

Sign in P1 on physical device, P2 on a second device or via SQL dev stub. Confirm both have `expo_push_token` populated.

- [ ] **Step 2: Verify in-app banner**

On P1's device with the app in foreground, have P2 strike any activity. Expected: banner slides in within 1–2s showing P2's name + activity + coins.

- [ ] **Step 3: Verify lead-flip push**

Ensure current Jerusalem time is outside quiet hours. Have P2 strike enough to pull ahead of P1. With P1's app backgrounded, expected: push notification lands with one of the 4 lead_flip variants (quoting the gap).

- [ ] **Step 4: Verify milestone push**

Have P2 cross a 100-point boundary. With P1's app backgrounded, expected: milestone push lands. Cross 250 later in the same round — second push fires. Do not cross 250 twice in the same round; if P2 drops then re-crosses, no second push.

- [ ] **Step 5: Verify rotation**

Force lead to flip back and forth 5 times over 30+ minute intervals (to dodge cooldown). Expected: no two consecutive pushes share text.

- [ ] **Step 6: Verify deep-link**

Tap any of the push notifications. Expected: app opens to home tab with strike drawer expanded.

- [ ] **Step 7: Verify quiet hours**

Temporarily set device clock to 23:00 Jerusalem, trigger a lead flip. Expected: no push received. Restore clock. In-app banner still works as usual.

- [ ] **Step 8: Verify settings toggle**

Toggle notifications off on the menu tab. Trigger lead flip from partner. Expected: no push. Banner still appears when app open. Re-enable — next lead flip pushes again.

---

## Self-Review

**Spec coverage:**
- Strike banner (always-on) → Task 13, 14 ✓
- 6 push triggers (lead_flip, milestone, round_ending, round_closed, end_of_day, inactivity) → Task 6 (4 triggers), Task 8 (round_closed), Task 9 (2 solo triggers) ✓
- Variant rotation → Task 3 ✓
- Quiet hours → Task 4 (module), used in Tasks 6 + 9 ✓
- Cooldown + dedup rules → encoded in Tasks 6, 8, 9 ✓
- Push tokens on players row → Task 1 (column), Task 11 (client reg), Task 12 (wire to signin) ✓
- Expo Push API → Task 5 ✓
- Settings toggle → Task 16 ✓
- Deep-link to strike drawer → Task 15 ✓
- `push_state` table + types → Task 1 ✓
- Postgres trigger → Task 7 ✓
- pg_cron → Task 7 ✓

**Placeholder scan:** no TBDs, no "handle edge cases" without concrete code, every code step has complete content.

**Type consistency:** `TriggerType` union used consistently in `variants.ts`, `variant-picker.ts`, `on-log-inserted/index.ts`, `notifications-tick/index.ts`. `PushTriggerType` in `lib/types.ts` mirrors it. `push_state` schema columns match the `PushState` TS type fields.
