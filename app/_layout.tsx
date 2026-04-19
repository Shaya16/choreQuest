import '../global.css';
import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { BootScreen } from '@/components/game/BootScreen';
import { StrikeBanner, type StrikeBannerEvent } from '@/components/game/StrikeBanner';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/store';
import { loadActivities } from '@/lib/logger';
import { preloadAssets } from '@/lib/preload';
import { registerPushToken } from '@/lib/notifications';
import { loadCouplePlayers } from '@/lib/round';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ackKeyForRound, loadUnresolvedClosedRounds } from '@/lib/tribute';
import type { Player, Couple, Activity, Log } from '@/lib/types';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PressStart2P: require('../assets/fonts/PressStart2P-Regular.ttf'),
    Silkscreen: require('../assets/fonts/Silkscreen-Regular.ttf'),
  });

  const session = useSession((s) => s.session);
  const player = useSession((s) => s.player);
  const couple = useSession((s) => s.couple);
  const loading = useSession((s) => s.loading);
  const activitiesLoadedAt = useSession((s) => s.activitiesLoadedAt);
  const setSession = useSession((s) => s.setSession);
  const setPlayer = useSession((s) => s.setPlayer);
  const setCouple = useSession((s) => s.setCouple);
  const setLoading = useSession((s) => s.setLoading);
  const setActivities = useSession((s) => s.setActivities);

  // Boot gate — stays true until BootScreen signals "READY PLAYER 1!" finishes.
  // Latched: once dismissed we never show it again in this session.
  const [bootDismissed, setBootDismissed] = useState(false);

  // Local asset-preload flag — flips once all bundled sprites/backgrounds are
  // resolved + warmed. Kept out of the Zustand store since it's boot-only.
  const [assetsReady, setAssetsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    preloadAssets()
      .catch(() => {})
      .finally(() => {
        if (mounted) setAssetsReady(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const router = useRouter();
  const segments = useSegments();

  // Subscribe to Supabase auth state. Hydrate player + couple whenever the
  // user id changes so the nav gating below has a complete picture.
  useEffect(() => {
    let mounted = true;

    async function hydrateFromUser(userId: string | null) {
      if (!userId) {
        setPlayer(null);
        setCouple(null);
        setLoading(false);
        return;
      }

      const { data: playerRow } = await supabase
        .from('players')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle<Player>();

      if (!mounted) return;
      setPlayer(playerRow ?? null);
      if (playerRow) {
        void registerPushToken(playerRow.id);
      }

      if (playerRow?.couple_id) {
        const { data: coupleRow } = await supabase
          .from('couples')
          .select('*')
          .eq('id', playerRow.couple_id)
          .maybeSingle<Couple>();
        if (!mounted) return;
        setCouple(coupleRow ?? null);
      } else {
        setCouple(null);
      }

      // Activities are effectively static (57 seed rows + any custom for this
      // couple). Load once per session so the Strike drawer is instant.
      loadActivities().then((rows) => {
        if (mounted) setActivities(rows);
      });

      setLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      hydrateFromUser(data.session?.user.id ?? null);
    });

    const { data: authSub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      hydrateFromUser(nextSession?.user.id ?? null);
    });

    return () => {
      mounted = false;
      authSub.subscription.unsubscribe();
    };
  }, [setSession, setPlayer, setCouple, setLoading, setActivities]);

  // Redirect based on: signed-in? → paired? → tabs. Expo Router needs this
  // in an effect (not render) so the Stack can mount first.
  useEffect(() => {
    if (loading) return;
    if (!fontsLoaded && !fontError) return;

    const parts = segments as string[];
    const group = parts[0];
    const leaf = parts[1];

    if (!session) {
      if (group !== '(auth)') router.replace('/(auth)/login');
      return;
    }

    if (!couple) {
      if (leaf !== 'pair') router.replace('/(auth)/pair');
      return;
    }

    // Allow (tabs) and (round) — both are valid post-auth surfaces. The
    // round-over flow lives in (round) and would otherwise get bounced back
    // here on every mount.
    if (group !== '(tabs)' && group !== '(round)') router.replace('/(tabs)');
  }, [loading, fontsLoaded, fontError, session, couple, segments, router]);

  // Round-over redirect: if there's a closed round whose flow is unresolved
  // for this player, force the round-over screen. Walks oldest-first via
  // `loadUnresolvedClosedRounds` ordering by round.number ascending.
  //
  // Only runs AFTER the boot screen has dismissed so we don't push routes
  // onto a Stack that hasn't mounted yet, and wraps the async body in a
  // try/catch so a transient DB/AsyncStorage error can't tear the app down
  // into a reload loop.
  useEffect(() => {
    if (!bootDismissed) return;
    if (loading || !session || !couple || !player) return;
    if (!fontsLoaded && !fontError) return;

    let cancelled = false;
    (async () => {
      try {
        const rounds = await loadUnresolvedClosedRounds(couple.id, player.id);
        for (const r of rounds) {
          if (cancelled) return;
          // Winner path: unresolved if no tribute picked OR not yet paid.
          if (r.winner_id === player.id) {
            if (r.tribute_shop_item_id == null || r.tribute_paid_at == null) {
              router.replace({
                pathname: '/(round)/over',
                params: { roundId: r.id },
              });
              return;
            }
            continue;
          }
          // Loser / tied participant path: unresolved if not yet locally ack'd.
          const ack = await AsyncStorage.getItem(
            ackKeyForRound(player.id, r.id)
          );
          if (cancelled) return;
          if (!ack) {
            router.replace({
              pathname: '/(round)/over',
              params: { roundId: r.id },
            });
            return;
          }
        }
      } catch (e) {
        // Don't let a redirect failure crash the app. Log and let user proceed
        // to home; the flow will retry next time a dep changes.
        console.warn('round-over redirect failed:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootDismissed, loading, fontsLoaded, fontError, session, couple?.id, player?.id, router]);

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  // Partner strike banner — fetches the partner once the couple resolves,
  // then subscribes to their log inserts via Supabase realtime.
  const [bannerEvent, setBannerEvent] = useState<StrikeBannerEvent | null>(null);
  const [partner, setPartner] = useState<Player | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!couple || !player) {
      setPartner(null);
      return () => {
        cancelled = true;
      };
    }
    loadCouplePlayers(couple.id).then(({ players }) => {
      if (cancelled) return;
      const other = players.find((p) => p.id !== player.id) ?? null;
      setPartner(other);
    });
    return () => {
      cancelled = true;
    };
  }, [couple?.id, player?.id]);

  useEffect(() => {
    if (!player || !partner) return;
    const channel = supabase
      .channel(`banner-${player.id}-${partner.id}`)
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
          setBannerEvent({
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
  }, [player?.id, partner?.id]);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as {
        screen?: string;
        round_id?: string;
      };
      if (data?.screen === 'strike_drawer') {
        router.push({ pathname: '/(tabs)', params: { openDrawer: '1' } });
      } else if (data?.screen === 'round_over' && data.round_id) {
        router.replace({
          pathname: '/(round)/over',
          params: { roundId: data.round_id },
        });
      }
    });
    return () => sub.remove();
  }, [router]);

  if (!fontsLoaded && !fontError) {
    // Fonts haven't landed yet — Expo's native splash still covers the screen.
    return <View className="flex-1 bg-bg" />;
  }

  // Signed-out users don't need the arsenal catalog — short-circuit that stage.
  const fontsReady = fontsLoaded || !!fontError;
  const sessionReady = !loading;
  const arsenalReady = !session || activitiesLoadedAt != null;

  if (!bootDismissed) {
    return (
      <>
        <StatusBar style="light" />
        <BootScreen
          fontsReady={fontsReady}
          sessionReady={sessionReady}
          arsenalReady={arsenalReady}
          assetsReady={assetsReady}
          onComplete={() => setBootDismissed(true)}
        />
      </>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000' } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="(round)"
          options={{
            presentation: 'fullScreenModal',
            animation: 'fade',
          }}
        />
      </Stack>
      <StrikeBanner
        event={bannerEvent}
        onDismiss={() => setBannerEvent(null)}
      />
    </>
  );
}
