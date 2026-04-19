import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

import { KoOverlay } from '@/components/game/KoOverlay';
import { TributeCard } from '@/components/game/TributeCard';
import { HoldToCollect } from '@/components/game/HoldToCollect';
import { useSession } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import {
  ackKeyForRound,
  loadTributeCards,
  pickTribute,
  markTributePaid,
} from '@/lib/tribute';
import type { Round, ShopItem } from '@/lib/types';

type Mode = 'cinematic' | 'pick' | 'await' | 'collect' | 'tied' | 'acknowledge';

export default function RoundOverScreen() {
  const params = useLocalSearchParams<{ roundId?: string }>();
  const player = useSession((s) => s.player);
  const [round, setRound] = useState<Round | null>(null);
  const [tributeItem, setTributeItem] = useState<ShopItem | null>(null);
  const [cards, setCards] = useState<ShopItem[]>([]);
  const [mode, setMode] = useState<Mode>('cinematic');
  const [partnerName, setPartnerName] = useState<string>('???');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!player) {
      setLoadError('No player session.');
      return;
    }
    if (!params.roundId) {
      setLoadError('No roundId in route params.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data: r, error: rErr } = await supabase
          .from('rounds')
          .select('*')
          .eq('id', params.roundId!)
          .maybeSingle<Round>();
        if (cancelled) return;
        if (rErr) {
          setLoadError(`rounds query: ${rErr.message}`);
          return;
        }
        if (!r) {
          setLoadError(`Round ${params.roundId} not found (RLS or deleted).`);
          return;
        }
        setRound(r);

        // Load partner name
        const partnerId =
          r.winner_id === player.id ? r.loser_id : r.winner_id ?? null;
        if (partnerId) {
          const { data: p } = await supabase
            .from('players')
            .select('display_name')
            .eq('id', partnerId)
            .maybeSingle();
          if (!cancelled && p) setPartnerName(p.display_name);
        }

        // Load tribute item if picked
        if (r.tribute_shop_item_id) {
          const { data: it } = await supabase
            .from('shop_items')
            .select('*')
            .eq('id', r.tribute_shop_item_id)
            .maybeSingle<ShopItem>();
          if (!cancelled && it) setTributeItem(it);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(`exception: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.roundId, player?.id]);

  // Determine starting mode after cinematic completes.
  function onCinematicDone() {
    if (!round || !player) return;
    if (!round.winner_id) {
      setMode('tied');
      return;
    }
    if (round.winner_id === player.id) {
      // Winner path
      if (!round.tribute_shop_item_id) {
        // Need to pick. tribute_tier should be set when winner_id is set, but
        // fall back to 'knockout' defensively if it isn't (old row, race, etc.).
        const tier = round.tribute_tier ?? 'knockout';
        loadTributeCards(tier, round.id)
          .then((c) => setCards(c))
          .catch(() => setCards([]));
        setMode('pick');
      } else if (!round.tribute_paid_at) {
        // Already picked, awaiting collect.
        setMode('collect');
      } else {
        // Fully resolved — return home.
        finishAndGoHome();
      }
    } else {
      // Loser path
      setMode('acknowledge');
    }
  }

  async function handlePick(item: ShopItem) {
    if (!round) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTributeItem(item);
    await pickTribute(round.id, item.id);
    setMode('await');
  }

  async function handleCollectComplete() {
    if (!round) return;
    await markTributePaid(round.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    finishAndGoHome();
  }

  async function handleAcknowledge() {
    if (!round || !player) return;
    await AsyncStorage.setItem(ackKeyForRound(player.id, round.id), '1');
    finishAndGoHome();
  }

  function finishAndGoHome() {
    router.replace('/(tabs)');
  }

  if (loadError) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', padding: 24, justifyContent: 'center' }}>
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#FF3333',
            fontSize: 11,
            marginBottom: 16,
            textAlign: 'center',
          }}
        >
          ROUND-OVER LOAD FAILED
        </Text>
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#FFFFFF',
            fontSize: 8,
            marginBottom: 32,
            textAlign: 'center',
          }}
        >
          {loadError}
        </Text>
        <Text
          onPress={() => router.replace('/(tabs)')}
          style={{
            fontFamily: 'PressStart2P',
            color: '#9EFA00',
            fontSize: 10,
            borderWidth: 2,
            borderColor: '#9EFA00',
            padding: 12,
            textAlign: 'center',
          }}
        >
          ▶ BACK TO HOME
        </Text>
      </View>
    );
  }

  if (!round || !player) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', padding: 24, justifyContent: 'center', alignItems: 'center' }}>
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#4A4A4A',
            fontSize: 9,
          }}
        >
          LOADING ROUND…
        </Text>
      </View>
    );
  }

  const winnerScore = round.winner_id === player.id
    ? Math.max(round.p1_total ?? 0, round.p2_total ?? 0)
    : Math.max(round.p1_total ?? 0, round.p2_total ?? 0);
  const loserScore = round.winner_id === player.id
    ? Math.min(round.p1_total ?? 0, round.p2_total ?? 0)
    : Math.min(round.p1_total ?? 0, round.p2_total ?? 0);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {mode === 'cinematic' && (
        <KoOverlay
          tier={round.tribute_tier}
          margin={round.margin ?? 0}
          bonusCoins={round.winner_id === player.id ? round.winner_bonus_coins : 0}
          winnerScore={winnerScore}
          loserScore={loserScore}
          perspective={
            round.winner_id == null
              ? 'tied'
              : round.winner_id === player.id
              ? 'winner'
              : 'loser'
          }
          onComplete={onCinematicDone}
        />
      )}

      {mode === 'pick' && (
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            padding: 20,
            paddingTop: 60,
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFCC00',
              fontSize: 12,
              textAlign: 'center',
              marginBottom: 24,
            }}
          >
            CLAIM YOUR TRIBUTE
          </Text>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFFFFF',
              fontSize: 7,
              textAlign: 'center',
              marginBottom: 24,
            }}
          >
            TAP TO REVEAL · TAP AGAIN TO LOCK
          </Text>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: 16,
            }}
          >
            {cards.map((item) => (
              <TributeCard
                key={item.id}
                item={item}
                accentHex="#FFCC00"
                onLockIn={handlePick}
              />
            ))}
          </View>
        </ScrollView>
      )}

      {mode === 'await' && tributeItem && (
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontFamily: 'PressStart2P', color: '#FFCC00', fontSize: 10 }}>
            TRIBUTE LOCKED
          </Text>
          <Text style={{ fontSize: 64, marginVertical: 24 }}>
            {extractIcon(tributeItem.name)}
          </Text>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFFFFF',
              fontSize: 10,
              textAlign: 'center',
              maxWidth: 280,
            }}
          >
            {stripIcon(tributeItem.name).toUpperCase()}
          </Text>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#4A4A4A',
              fontSize: 8,
              marginTop: 16,
              textAlign: 'center',
            }}
          >
            AWAITING {partnerName.toUpperCase()} TO FULFILL
          </Text>
          <View style={{ marginTop: 32 }}>
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: '#4A4A4A',
                fontSize: 7,
              }}
              onPress={finishAndGoHome}
            >
              ▶ BACK TO HOME (COLLECT LATER)
            </Text>
          </View>
        </View>
      )}

      {mode === 'collect' && tributeItem && (
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontFamily: 'PressStart2P', color: '#FFCC00', fontSize: 10 }}>
            COLLECT TRIBUTE
          </Text>
          <Text style={{ fontSize: 64, marginVertical: 24 }}>
            {extractIcon(tributeItem.name)}
          </Text>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFFFFF',
              fontSize: 10,
              textAlign: 'center',
              maxWidth: 280,
              marginBottom: 32,
            }}
          >
            {stripIcon(tributeItem.name).toUpperCase()}
          </Text>
          <HoldToCollect
            label="HOLD TO COLLECT"
            accentHex="#9EFA00"
            onComplete={handleCollectComplete}
          />
        </View>
      )}

      {mode === 'acknowledge' && (
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' }}>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FF3333',
              fontSize: 16,
              textAlign: 'center',
              marginBottom: 24,
            }}
          >
            DEBT INCURRED
          </Text>
          {tributeItem ? (
            <>
              <Text style={{ fontSize: 48 }}>{extractIcon(tributeItem.name)}</Text>
              <Text
                style={{
                  fontFamily: 'PressStart2P',
                  color: '#FFFFFF',
                  fontSize: 10,
                  textAlign: 'center',
                  maxWidth: 280,
                  marginVertical: 16,
                }}
              >
                {stripIcon(tributeItem.name).toUpperCase()}
              </Text>
              <Text
                style={{
                  fontFamily: 'PressStart2P',
                  color: '#FFCC00',
                  fontSize: 8,
                  marginBottom: 32,
                }}
              >
                YOU OWE {partnerName.toUpperCase()}
              </Text>
            </>
          ) : (
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: '#FFFFFF',
                fontSize: 9,
                textAlign: 'center',
                marginBottom: 32,
              }}
            >
              {partnerName.toUpperCase()} IS PICKING…
            </Text>
          )}
          <Text
            onPress={handleAcknowledge}
            style={{
              fontFamily: 'PressStart2P',
              color: '#9EFA00',
              fontSize: 10,
              borderWidth: 2,
              borderColor: '#9EFA00',
              padding: 12,
            }}
          >
            ✓ ACKNOWLEDGE
          </Text>
        </View>
      )}

      {mode === 'tied' && (
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' }}>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#00DDFF',
              fontSize: 18,
              marginBottom: 16,
            }}
          >
            🤝
          </Text>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#00DDFF',
              fontSize: 14,
              textAlign: 'center',
              marginBottom: 32,
            }}
          >
            ROUND TIED
          </Text>
          <Text
            onPress={handleAcknowledge}
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFFFFF',
              fontSize: 10,
              borderWidth: 2,
              borderColor: '#FFFFFF',
              padding: 12,
            }}
          >
            ▶ CONTINUE
          </Text>
        </View>
      )}
    </View>
  );
}

function extractIcon(name: string): string {
  const match = name.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
  return match ? match[0] : '🎁';
}

function stripIcon(name: string): string {
  return name.replace(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})\s*/u, '').trim();
}
