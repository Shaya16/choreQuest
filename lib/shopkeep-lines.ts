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
