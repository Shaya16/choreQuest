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
  | 'inactivity'
  | 'round_won'
  | 'round_lost'
  | 'round_tied'
  | 'tribute_picked'
  | 'tribute_paid'
  | 'purchase_made'
  | 'redemption_requested'
  | 'delivery_confirmed';

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
  round_won: [
    "🥊 K.O. you took round {{n}} by {{margin}}. pick your tribute.",
    "🏆 round {{n}}: yours. {{margin}} margin. {{partner}} owes you something.",
    "👑 round {{n}} done. you up {{margin}}. claim it.",
    "round {{n}}: locked in. {{margin}} margin. tribute time.",
  ],
  round_lost: [
    "💀 round {{n}} over. {{partner}} won by {{margin}}. they're picking.",
    "you ate it. {{partner}} took round {{n}} by {{margin}}. brace.",
    "💀 round {{n}}: cooked. {{margin}} down. tribute incoming.",
    "{{partner}} just claimed round {{n}}. {{margin}} margin. owe up.",
  ],
  round_tied: [
    "🤝 round {{n}} tied. nobody owes nobody. round {{next}} live.",
    "🤝 even score on round {{n}}. handshake. round {{next}} starts now.",
    "round {{n}}: dead heat. respect. fight again, round {{next}}.",
    "🤝 {{n}}-all stalemate. round {{next}} drops fresh.",
  ],
  tribute_picked: [
    "💀 {{partner}} picked: {{tribute}}. you owe.",
    "tribute set: {{tribute}}. clock's on you.",
    "🍽️ {{partner}} called it: {{tribute}}. get to it.",
    "{{partner}} chose your fate: {{tribute}}.",
  ],
  tribute_paid: [
    "✓ {{partner}} marked {{tribute}} as paid. round closed clean.",
    "tribute settled: {{tribute}}. respect. next round.",
    "✓ {{partner}} got their {{tribute}}. you're square.",
    "paid in full: {{tribute}}. on to the next.",
  ],
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
