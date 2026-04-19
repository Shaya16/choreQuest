# Live Partner Visibility — Design

**Date:** 2026-04-19
**Feature:** Live partner-strike visibility + behavioral push notifications
**Status:** Design approved, pending implementation plan

## Problem

Chore Quest's arena is two parallel scorecards. P1 and P2 each grind their own list — neither strike affects the other mechanically. The visual fighting game shell has no real interaction underneath. Partner strikes are invisible until you open the app and refresh, which kills the "live duel" fantasy and turns the game into a solo to-do tracker with two accounts.

## Goal

Make every partner strike *felt* in real time, and use push notifications as hooks that pull the user back into the app at moments that actually matter. No mechanical changes to scoring — this is purely a visibility + notification layer.

## Non-goals

- No attack/defend mechanics. Scoring math stays as-is. Player interaction beyond visibility is a separate future brainstorm (options A, C, D from the interaction brainstorm).
- No enforcement of log authenticity. The game remains honor-system; partner visibility creates the social check.
- No per-trigger notification toggles in settings. One master on/off only.
- No multi-timezone support. Both players are in Asia/Jerusalem.

---

## User-facing behavior

### Strike banner (in-app, always-on)

When partner strikes and the app is in foreground:

- A banner slides in from the top within ~1s of the log hitting Supabase realtime.
- Shows: partner's mini-sprite + accent color, their display name, activity name, coins delta.
- Auto-dismisses after 3 seconds.
- Tap → navigates to the strike drawer.
- Zero notifications when app is closed (that's what push is for).

### Push notifications (the big moments)

Push fires on lock screen regardless of app state. Tap → deep-links into the strike drawer, open and ready.

Six trigger types, listed below.

### Quiet hours

Default 10pm–7am Jerusalem time. Pushes suppressed and dropped — not queued. When the user wakes up and opens the app, they see current state (feed, score, round status). No backlog of stale trash-talk at 7am.

### Settings

A single toggle on the menu tab: **Notifications on/off**. When off, in-app banners still fire (they're part of the app, not the OS). When on, push notifications land per the trigger rules.

---

## Push triggers

Six triggers total. All respect quiet hours and a 30-min cooldown between pushes of the same type. All use the variant rotation described below.

### 1. Lead flip (partner-driven)

**Fires when:** Partner's strike causes the round leader to change from one player to the other.

**Dedup:** Lead can flip back and forth; every flip fires (subject to 30-min cooldown).

**Variants:**
- *"👑 {partner}'s cooking. you're {gap} behind. do something."*
- *"lead just flipped. {gap} down. pathetic. go fix it."*
- *"👑 you got lapped, bestie. {gap} point gap. move."*
- *"caught slipping. {partner}'s up {gap}. humbling."*

### 2. Milestone (partner-driven)

**Fires when:** Partner's round total crosses 100, 250, 500, or 1000.

**Dedup:** Each milestone level fires once per player per round, ever. A player who crosses 250, drops below, then crosses again in the same round does not re-fire.

**Variants (all interpolate {N} = milestone crossed, {Y} = your current score):**
- *"{partner} just crossed {N} 💅 you? {Y}. do math."*
- *"{N} for {partner}. {Y} for you. vibe check."*
- *"📈 {partner} touched {N}. you're at {Y}. respectfully: catch up."*
- *"locked in she is. locked out you are. {N} vs {Y}."*

### 3. Round ending soon (partner-driven)

**Fires when:** Less than 24 hours remain in the active round AND the user is behind by 50+ points. Checked at each partner strike.

**Dedup:** Fires once per round per user.

**Variants ({hours} rounded down to nearest hour, {gap} = points behind):**
- *"{hours}h left. {gap} to tie. clock's ticking, babe."*
- *"{hours}h on the clock, {gap} down. comeback arc or eulogy."*
- *"⏳ {hours}h. need {gap}. go or go home."*
- *"{hours}h. {gap} point deficit. panic or pull up?"*

### 4. Round closed (partner-driven)

**Fires when:** Round status transitions from `active` → `closed` and the other player won. Winner does not get this push.

**Dedup:** Once per round per loser.

**Variants ({N} = round number, {margin} = win margin):**
- *"🏆 {partner} took round {N} by {margin}. round {N+1} just opened. redemption arc?"*
- *"brutal. {partner} won round {N} ({margin} margin). round {N+1}'s fresh. don't miss twice."*
- *"round {N}: {partner}. round {N+1}: open. humble yourself and strike first."*
- *"🏆 {partner} 1, you 0. new round dropped. cook or be cooked."*

### 5. End-of-day reminder (solo, time-driven)

**Fires when:** At 7:00 PM Jerusalem time, if the user has 5+ unused daily strikes (summed from all activities with `daily_cap` where `today_count < daily_cap`).

**Dedup:** Once per day per user.

**Variants ({N} = unused strike count):**
- *"day ends in 5h. {N} strikes locked and loaded. unlock them."*
- *"{N} strikes expiring in 5h. a choice is being made."*
- *"☠️ 5h till reset. {N} untouched strikes. embarrassing."*
- *"your drawer has {N} unused strikes. clock says 7pm. act accordingly."*

### 6. Inactivity nudge (solo, time-driven)

**Fires when:** At 3:00 PM Jerusalem time, if the user has logged 0 strikes that day.

**Dedup:** Once per day per user. Does not fire on days the user has already struck.

**Variants ({partner_count} = partner's strike count today):**
- *"it's 3pm and you've struck nothing. are we ok."*
- *"haven't seen you in the arena today. something wrong?"*
- *"0 strikes. {partner}: {partner_count}. make this right."*
- *"3pm. 0 on the board. just checking in 👀"*

---

## Variant rotation

Problem: 3–4 variants per trigger. Without memory, repeats would happen and the voice would die.

**Approach:** server-tracked last-variant index per (player, trigger).

### Storage

New table:

```sql
create table push_state (
  player_id uuid references players(id) on delete cascade,
  trigger_type text not null,
  last_variant_index int,
  last_fired_at timestamptz,
  primary key (player_id, trigger_type)
);
```

`trigger_type` values: `lead_flip`, `milestone`, `round_ending`, `round_closed`, `end_of_day`, `inactivity`.

### Selection algorithm

On each push fire:

1. Load the row for (player_id, trigger_type). If absent, treat `last_variant_index` as -1.
2. From the variant list for that trigger, build the candidate set excluding `last_variant_index`.
3. Pick a random entry from the candidate set.
4. Upsert the row with the new index and `now()`.
5. Send the resulting text via Expo Push.

Guarantees:

- Never two identical texts back-to-back for the same trigger.
- Over time, all variants get used roughly evenly.
- Milestone's variant pool is shared across the 100/250/500/1000 sub-levels — the sub-level is just interpolated as {N}.

---

## Technical architecture

### In-app banner (client-side, realtime)

- New component `components/game/StrikeBanner.tsx` — receives partner log events from the existing `postgres_changes` subscription.
- Mounted inside the main tab layout (or at root) so it floats above all screens.
- Event queue: if multiple strikes arrive in <3s, queue them and show sequentially; drop if queue exceeds 5.
- Tap handler navigates to the strike drawer via expo-router.

### Push notifications (server-side)

Two firing paths share one variant picker and Expo Push client.

#### Event-driven triggers (1–4)

- Postgres trigger on `logs` INSERT calls Supabase Edge Function `on_log_inserted`.
- Edge Function, given the new log row:
  - Loads the round, both players' current totals, partner's push token, partner's `push_state`.
  - Computes whether the log caused: a lead flip, a milestone crossing (for the striker), a round-ending-soon condition (for the partner), or a round close.
  - For each eligible trigger, runs the variant picker and pushes to the partner (or the loser for round close).
  - Writes back updated `push_state` rows.

#### Time-driven triggers (5–6)

- `pg_cron` job `notifications_tick` runs every 30 minutes.
- On each tick:
  - Load current Jerusalem time.
  - For each player whose local hour is 15:00 (±15 min): evaluate inactivity nudge conditions.
  - For each player whose local hour is 19:00 (±15 min): evaluate end-of-day reminder.
  - Fire via the same variant-picker path.
- The ±15 min window catches players regardless of exact cron offset; dedup by day prevents duplicate fires.

### Push tokens

- `players.expo_push_token text` — nullable.
- Client, on successful sign-in: `Notifications.getExpoPushTokenAsync()` → write to current player row.
- Expo push sender gets the token from the target player's row. If null, push is silently skipped; in-app banner is unaffected.

### Quiet hours

Evaluated server-side before each push. Current Jerusalem hour ∈ [22, 7] → skip.

Skipped pushes do not queue — they're dropped. If 4 lead-flips happen overnight, the user wakes up to zero pushes and just sees the scoreboard on next app open.

### Deep-link handling

Push `data` payload: `{ "screen": "strike_drawer" }`.
Client listens to `Notifications.addNotificationResponseReceivedListener`, reads the screen key, and routes via expo-router. For `strike_drawer`, navigate to the home tab with a query param that forces the drawer open.

---

## Cooldown & dedup rules (summary)

| Rule | Scope |
|---|---|
| 30-min cooldown between same-type pushes | Per (player, trigger_type) |
| Milestone once per (player, round, milestone level) | Per round |
| Round-ending-soon once per (player, round) | Per round |
| Round-closed once per (loser, round) | Per round |
| End-of-day reminder once per player per day | Per day |
| Inactivity nudge once per player per day | Per day |
| Quiet hours 10pm–7am Jerusalem | Global suppression |

The 30-min cooldown is the outer guard; the per-round/per-day dedups are the inner guards. A push must pass both.

---

## Data model changes

New table: `push_state` (see Variant Rotation section).

New columns:
- `players.expo_push_token text` — nullable.

No changes to `activities`, `logs`, `rounds`, or any scoring logic.

---

## Edge cases

- **Partner without push token.** In-app banner still fires (client-to-client via realtime). Push silently skipped server-side.
- **Expired token.** Expo returns `DeviceNotRegistered`. Edge Function clears the `expo_push_token` column. Next app launch re-registers.
- **Single-player mode** (solo user without partner). Partner-driven triggers (1–4) never fire (no partner log events). Solo triggers (5–6) fire normally.
- **Round rollover during a push evaluation.** The Edge Function evaluates triggers against the round state at the moment the log row was inserted. A round that closes mid-evaluation doesn't change which triggers fire for that log.
- **Rapid-fire strikes.** One log can potentially fire multiple triggers at once (e.g., a single strike that crosses a milestone AND triggers a lead flip). Both fire as separate pushes if both pass their cooldown/dedup checks. This is intentional — the game getting spicier is the whole point.
- **Notifications disabled by user.** Master toggle gates push sending on the client (token is cleared when toggled off). In-app banner continues to work — it's not a push, it's a UI component.
- **Jerusalem DST transitions.** `pg_cron` runs in UTC; local-hour checks use `PRIMARY_TZ` constant. DST boundary days may shift the 3pm/7pm windows by an hour but the ±15 min tolerance absorbs it.

---

## Out of scope (future work)

- Per-trigger notification toggles (currently one master switch).
- Multi-timezone support.
- Partner combo push (discussed, cut for Phase 1 scope).
- Mechanical player interaction (options A/B/C/D from the interaction brainstorm) — visibility first, see how it plays, then decide.
- Long-term variant freshness (variant rotation prevents back-to-back repeats but over months players see each variant hundreds of times). Seasonal variant packs are a v2 consideration.
- Web / desktop clients. Expo Push covers iOS + Android.
