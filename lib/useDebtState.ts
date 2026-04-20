// lib/useDebtState.ts — React hook that queries purchases + rounds
// and derives DebtState via the pure lib/debt.ts helper.
//
// Refreshes on window focus (handled by callers invoking refetch()) and
// on a 5-minute timer so the 24h-grace boundary flips without a manual
// reload.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { computeDebtState, type DebtState } from './debt';
import type { Purchase, Round } from './types';

const EMPTY: DebtState = {
  inDebt: false,
  debtMultiplier: 1.0,
  sources: [],
  activeSources: [],
};

export function useDebtState(
  playerId: string | null,
  coupleId: string | null
): { state: DebtState; refetch: () => Promise<void>; loading: boolean } {
  const [state, setState] = useState<DebtState>(EMPTY);
  const [loading, setLoading] = useState<boolean>(false);

  const refetch = useCallback(async () => {
    if (!playerId || !coupleId) {
      setState(EMPTY);
      return;
    }
    setLoading(true);
    try {
      const [{ data: purchases }, { data: rounds }] = await Promise.all([
        supabase
          .from('purchases')
          .select('*')
          .eq('target_id', playerId)
          .in('status', ['pending', 'redemption_requested']),
        supabase
          .from('rounds')
          .select('*')
          .eq('couple_id', coupleId)
          .eq('status', 'closed')
          .neq('winner_id', playerId)
          .eq('tribute_paid', false),
      ]);
      const s = computeDebtState({
        playerId,
        coupleId,
        purchases: (purchases ?? []) as Purchase[],
        rounds: (rounds ?? []) as Round[],
        now: new Date(),
      });
      setState(s);
    } finally {
      setLoading(false);
    }
  }, [playerId, coupleId]);

  useEffect(() => {
    void refetch();
    const t = setInterval(() => void refetch(), 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [refetch]);

  return { state, refetch, loading };
}
