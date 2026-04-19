import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { Activity, Couple, Player } from './types';

interface SessionState {
  session: Session | null;
  player: Player | null;
  couple: Couple | null;
  loading: boolean;
  activities: Activity[];
  activitiesLoadedAt: number | null;

  setSession: (session: Session | null) => void;
  setPlayer: (player: Player | null) => void;
  setCouple: (couple: Couple | null) => void;
  setLoading: (loading: boolean) => void;
  setActivities: (activities: Activity[]) => void;
  reset: () => void;
}

export const useSession = create<SessionState>((set) => ({
  session: null,
  player: null,
  couple: null,
  loading: true,
  activities: [],
  activitiesLoadedAt: null,

  setSession: (session) => set({ session }),
  setPlayer: (player) => set({ player }),
  setCouple: (couple) => set({ couple }),
  setLoading: (loading) => set({ loading }),
  setActivities: (activities) =>
    set({ activities, activitiesLoadedAt: Date.now() }),
  reset: () =>
    set({
      session: null,
      player: null,
      couple: null,
      loading: false,
      activities: [],
      activitiesLoadedAt: null,
    }),
}));
