import '../global.css';
import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { BootScreen } from '@/components/game/BootScreen';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/store';
import { loadActivities } from '@/lib/logger';
import { preloadAssets } from '@/lib/preload';
import { registerPushToken } from '@/lib/notifications';
import type { Player, Couple } from '@/lib/types';

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

    if (group !== '(tabs)') router.replace('/(tabs)');
  }, [loading, fontsLoaded, fontError, session, couple, segments, router]);

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

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
      </Stack>
    </>
  );
}
