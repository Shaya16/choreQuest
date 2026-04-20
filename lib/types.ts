// =============================================================================
// Chore Quest — TypeScript types mirroring the Supabase schema (migration 0001)
// =============================================================================
// Hand-rolled for Phase 1. When the Supabase CLI is wired up, these should be
// replaced with auto-generated types via:
//   npx supabase gen types typescript --project-id <ref> > lib/types.generated.ts
// =============================================================================
// IMPORTANT: these are `type` aliases, not `interface`. Supabase JS 2.100+
// constrains Row/Insert/Update to `Record<string, unknown>`, and that check
// only passes for type aliases — interfaces don't structurally conform.
// =============================================================================

export type World =
  | 'gym'
  | 'aerobics'
  | 'university'
  | 'diet'
  | 'household'
  | 'reading';

export type ArcadeClass =
  | 'gym_fighter'
  | 'vibe_queen'
  | 'sweepman'
  | 'chef_kong'
  | 'nerd_tron'
  | 'shay'
  | 'kessy';

export type HouseholdTier = 'daily' | 'weekly' | 'monthly';
export type ShopCategory = 'pampering' | 'meals' | 'chore_relief' | 'power' | 'wildcard';
export type RoundStatus = 'active' | 'closed' | 'inactive';
export type TributeTier = 'paper_cut' | 'knockout' | 'total_carnage' | 'flawless';
export type JackpotStatus = 'active' | 'achieved' | 'celebrated' | 'locked';
export type JackpotPriority = 'next_up' | 'queue' | 'someday';
export type PurchaseStatus =
  | 'pending'
  | 'redemption_requested'
  | 'redeemed'
  | 'cancelled';

export type Couple = {
  id: string;
  invite_code: string;
  couple_level: number;
  couple_xp: number;
  current_season_id: string | null;
  paired_at: string;
  created_at: string;
};

export type Player = {
  id: string;
  user_id: string;
  couple_id: string | null;
  display_name: string;
  arcade_class: ArcadeClass;
  avatar_sprite: string;
  mult_gym: number;
  mult_aerobics: number;
  mult_university: number;
  mult_diet: number;
  mult_household: number;
  mult_reading: number;
  current_combo_days: number;
  combo_multiplier: number;
  freezes_remaining: number;
  last_log_date: string | null;
  lifetime_score: number;
  personal_wallet: number;
  lifetime_xp: number;
  player_level: number;
  current_title: string;
  crowns: Record<World, number>;
  belts: number;
  instant_win_tokens: number;
  upgrades: string[];
  expo_push_token: string | null;
  created_at: string;
};

export type Activity = {
  id: string;
  world: World;
  tier: HouseholdTier | null;
  name: string;
  description: string | null;
  base_value: number;
  bonus: number;
  daily_cap: number;
  requires_photo: boolean;
  icon_sprite: string | null;
  is_custom: boolean;
  created_by_couple_id: string | null;
  is_active: boolean;
  round_value: number;
  archived_at: string | null;
};

export type Round = {
  id: string;
  couple_id: string;
  number: number;
  start_date: string;
  end_date: string;
  status: RoundStatus;
  p1_total: number | null;
  p2_total: number | null;
  margin: number | null;
  winner_id: string | null;
  loser_id: string | null;
  winner_bonus_coins: number;
  tribute_tier: TributeTier | null;
  tribute_selected: string | null;
  tribute_shop_item_id: string | null;
  tribute_paid: boolean;
  tribute_paid_at: string | null;
  crowns_json: Partial<Record<World, string>> | null;
  mvp_title: string | null;
  highlight_photo_url: string | null;
};

export type Log = {
  id: string;
  player_id: string;
  activity_id: string;
  round_id: string;
  base_value: number;
  player_multiplier: number;
  combo_multiplier: number;
  crit_multiplier: number;
  daily_bonus_multiplier: number;
  weekly_hero_multiplier: number;
  season_multiplier: number;
  coins_earned: number;
  xp_earned: number;
  jackpot_share: number;
  personal_share: number;
  round_value_earned: number;
  evidence_url: string | null;
  notes: string | null;
  logged_at: string;
};

export type ShopItem = {
  id: string;
  name: string;
  description: string | null;
  cost: number;
  category: ShopCategory;
  icon_sprite: string | null;
  is_active: boolean;
};

export type Purchase = {
  id: string;
  shop_item_id: string;
  buyer_id: string;
  target_id: string;
  purchased_at: string;
  redemption_requested_at: string | null;
  redeemed_at: string | null;
  status: PurchaseStatus;
  cancelled_via: 'amnesty' | 'buyer_cancel' | null;
};

export type JackpotGoal = {
  id: string;
  couple_id: string;
  name: string;
  description: string | null;
  target_coins: number;
  current_coins: number;
  status: JackpotStatus;
  priority: JackpotPriority;
  is_visible: boolean;
  season_id: string | null;
  icon_sprite: string | null;
  achieved_on: string | null;
};

export type AmnestyFee = {
  id: string;
  purchase_id: string;
  payer_id: string;
  amount: number;
  paid_at: string;
};

export type PushTriggerType =
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
  | 'delivery_confirmed'
  | 'purchase_amnesty';

export type PushState = {
  player_id: string;
  trigger_type: PushTriggerType;
  last_variant_index: number | null;
  last_fired_at: string | null;
  dedup_round_id: string | null;
  dedup_level: number | null;
  dedup_date: string | null;
};

// -----------------------------------------------------------------------------
// Supabase Database shape. Tables require Row/Insert/Update/Relationships, and
// the schema requires Views/Functions/Enums/CompositeTypes (empty is fine).
// -----------------------------------------------------------------------------

type NoRelationships = [];

export type Database = {
  public: {
    Tables: {
      couples: {
        Row: Couple;
        Insert: Partial<Couple> & Pick<Couple, 'invite_code'>;
        Update: Partial<Couple>;
        Relationships: NoRelationships;
      };
      players: {
        Row: Player;
        Insert: Partial<Player> &
          Pick<Player, 'user_id' | 'display_name' | 'arcade_class'>;
        Update: Partial<Player>;
        Relationships: NoRelationships;
      };
      activities: {
        Row: Activity;
        Insert: Partial<Activity> & Pick<Activity, 'world' | 'name' | 'base_value'>;
        Update: Partial<Activity>;
        Relationships: NoRelationships;
      };
      rounds: {
        Row: Round;
        Insert: Partial<Round> &
          Pick<Round, 'couple_id' | 'number' | 'start_date' | 'end_date'>;
        Update: Partial<Round>;
        Relationships: NoRelationships;
      };
      logs: {
        Row: Log;
        Insert: Omit<Log, 'id' | 'logged_at'> & { id?: string; logged_at?: string };
        Update: Partial<Log>;
        Relationships: NoRelationships;
      };
      shop_items: {
        Row: ShopItem;
        Insert: Partial<ShopItem> & Pick<ShopItem, 'name' | 'cost' | 'category'>;
        Update: Partial<ShopItem>;
        Relationships: NoRelationships;
      };
      purchases: {
        Row: Purchase;
        Insert: Partial<Purchase> &
          Pick<Purchase, 'shop_item_id' | 'buyer_id' | 'target_id'>;
        Update: Partial<Purchase>;
        Relationships: NoRelationships;
      };
      jackpot_goals: {
        Row: JackpotGoal;
        Insert: Partial<JackpotGoal> &
          Pick<JackpotGoal, 'couple_id' | 'name' | 'target_coins'>;
        Update: Partial<JackpotGoal>;
        Relationships: NoRelationships;
      };
      push_state: {
        Row: PushState;
        Insert: Partial<PushState> & Pick<PushState, 'player_id' | 'trigger_type'>;
        Update: Partial<PushState>;
        Relationships: NoRelationships;
      };
      amnesty_fees: {
        Row: AmnestyFee;
        Insert: Partial<AmnestyFee> &
          Pick<AmnestyFee, 'purchase_id' | 'payer_id' | 'amount'>;
        Update: Partial<AmnestyFee>;
        Relationships: NoRelationships;
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_couple_and_join: {
        Args: { p_invite_code: string };
        Returns: Couple;
      };
      join_couple_by_code: {
        Args: { p_invite_code: string };
        Returns: Couple;
      };
      dev_summon_stub_partner: {
        Args: { p_display_name: string; p_arcade_class: ArcadeClass };
        Returns: Player;
      };
      dev_banish_stub_partner: {
        Args: Record<string, never>;
        Returns: number;
      };
      dev_force_close_round: {
        Args: Record<string, never>;
        Returns: Round;
      };
      dev_inject_stub_log: {
        Args: { p_activity_id: string };
        Returns: Log;
      };
      dev_reset_today_logs: {
        Args: Record<string, never>;
        Returns: number;
      };
      dev_stub_incoming_deploy: {
        Args: Record<string, never>;
        Returns: string;
      };
      purchase_amnesty: {
        Args: { p_purchase_id: string };
        Returns: {
          fee: number;
          refund: number;
          target_spendable: number;
          buyer_id: string;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
