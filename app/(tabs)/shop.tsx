import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { ArsenalRow } from '@/components/game/ArsenalRow';
import { PurchaseCard } from '@/components/game/PurchaseCard';
import { QueueRow } from '@/components/game/QueueRow';
import { WalletHUD } from '@/components/game/WalletHUD';
import {
  buyItem,
  confirmDelivery,
  groupArsenal,
  loadArsenal,
  loadCatalogGrouped,
  loadQueue,
  requestRedemption,
  type PurchaseWithItem,
} from '@/lib/shop';
import { useSession } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { getSpendableCoins } from '@/lib/wallet';
import type { Player, ShopCategory, ShopItem } from '@/lib/types';

const CATEGORY_LABELS: Record<ShopCategory, string> = {
  pampering: 'PAMPERING',
  meals: 'MEALS',
  chore_relief: 'CHORE RELIEF',
  power: 'POWER',
  wildcard: 'WILDCARD',
};

const EMPTY_CATALOG: Record<ShopCategory, ShopItem[]> = {
  pampering: [],
  meals: [],
  chore_relief: [],
  power: [],
  wildcard: [],
};

export default function ShopScreen() {
  const player = useSession((s) => s.player);
  const couple = useSession((s) => s.couple);
  const [partner, setPartner] = useState<Player | null>(null);
  const [coins, setCoins] = useState<number>(0);
  const [arsenal, setArsenal] = useState<PurchaseWithItem[]>([]);
  const [queue, setQueue] = useState<PurchaseWithItem[]>([]);
  const [catalog, setCatalog] = useState<Record<ShopCategory, ShopItem[]>>(
    EMPTY_CATALOG
  );

  const reload = useCallback(async () => {
    if (!player || !couple) return;
    const [{ data: partnerRow }, coinsVal, arsenalRows, queueRows, catalogRows] =
      await Promise.all([
        supabase
          .from('players')
          .select('*')
          .eq('couple_id', couple.id)
          .neq('id', player.id)
          .maybeSingle<Player>(),
        getSpendableCoins(player.id),
        loadArsenal(player.id),
        loadQueue(player.id),
        loadCatalogGrouped(),
      ]);
    setPartner(partnerRow ?? null);
    setCoins(coinsVal);
    setArsenal(arsenalRows);
    setQueue(queueRows);
    setCatalog(catalogRows);
  }, [player?.id, couple?.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const { pendingStacks, awaiting } = groupArsenal(arsenal);
  const tokenCount = pendingStacks.reduce((n, s) => n + s.count, 0);

  function handleBuy(item: ShopItem) {
    if (!player) return;
    if (!partner) {
      Alert.alert('No partner', 'Pair a partner first to buy from them.');
      return;
    }
    if (coins < item.cost) {
      Alert.alert('Not enough coins', `${item.cost}¢ needed. You have ${coins}¢.`);
      return;
    }
    Alert.alert(
      `Spend ${item.cost}¢?`,
      `${item.name}\n\nPurchase is permanent.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Buy',
          style: 'destructive',
          onPress: async () => {
            const { ok, error } = await buyItem(item.id, player.id, partner.id);
            if (!ok) {
              Alert.alert('Purchase failed', error ?? 'Unknown error.');
              return;
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await reload();
          },
        },
      ]
    );
  }

  function handleRedeem(item: ShopItem) {
    if (!player) return;
    Alert.alert(
      `Redeem ${item.name}?`,
      `Your partner will be notified NOW that you want this.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Redeem',
          style: 'destructive',
          onPress: async () => {
            const { ok, error } = await requestRedemption(player.id, item.id);
            if (!ok) {
              Alert.alert('Redeem failed', error ?? 'Unknown error.');
              return;
            }
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await reload();
          },
        },
      ]
    );
  }

  async function handleDeliver(purchaseId: string) {
    const { ok, error } = await confirmDelivery(purchaseId);
    if (!ok) {
      Alert.alert('Confirm failed', error ?? 'Unknown error.');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await reload();
  }

  const categoryOrder: ShopCategory[] = [
    'pampering',
    'meals',
    'chore_relief',
    'power',
    'wildcard',
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }} edges={['top']}>
      {/* Header with Close button */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderBottomWidth: 2,
          borderBottomColor: '#4A4A4A',
        }}
      >
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#FFCC00',
            fontSize: 14,
          }}
        >
          ◆ SHOP
        </Text>
        <Pressable onPress={() => router.back()}>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFFFFF',
              fontSize: 9,
            }}
          >
            × CLOSE
          </Text>
        </Pressable>
      </View>

      <WalletHUD
        coins={coins}
        tokenCount={tokenCount}
        awaitingCount={awaiting.length}
      />

      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* ARSENAL */}
        {(pendingStacks.length > 0 || awaiting.length > 0) && (
          <View style={{ marginBottom: 24 }}>
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: '#9EFA00',
                fontSize: 11,
                marginBottom: 12,
              }}
            >
              ▸ YOUR ARSENAL
            </Text>
            {pendingStacks.map((s) => (
              <ArsenalRow
                key={`pend-${s.item.id}`}
                variant="pending"
                item={s.item}
                count={s.count}
                onRedeem={handleRedeem}
              />
            ))}
            {awaiting.map((p) =>
              p.shop_item ? (
                <ArsenalRow
                  key={`awa-${p.id}`}
                  variant="awaiting"
                  item={p.shop_item}
                />
              ) : null
            )}
          </View>
        )}

        {/* QUEUE */}
        {queue.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: '#FF3333',
                fontSize: 11,
                marginBottom: 12,
              }}
            >
              ▸ THEY WANT NOW
            </Text>
            {queue.map((p) => {
              if (!p.shop_item || !partner) return null;
              if (p.status === 'redemption_requested') {
                return (
                  <QueueRow
                    key={p.id}
                    variant="requested"
                    purchaseId={p.id}
                    item={p.shop_item}
                    requestedAt={p.redemption_requested_at ?? p.purchased_at}
                    partnerName={partner.display_name}
                    onDeliver={handleDeliver}
                  />
                );
              }
              // Stockpiled: group by item_id manually for the target view.
              return (
                <QueueRow
                  key={p.id}
                  variant="stockpiled"
                  item={p.shop_item}
                  count={1}
                  partnerName={partner.display_name}
                />
              );
            })}
          </View>
        )}

        {/* CATALOG */}
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#FFCC00',
            fontSize: 11,
            marginBottom: 12,
          }}
        >
          ▸ CATALOG
        </Text>
        {categoryOrder.map((cat) => {
          const items = catalog[cat];
          if (!items || items.length === 0) return null;
          return (
            <View key={cat} style={{ marginBottom: 20 }}>
              <Text
                style={{
                  fontFamily: 'PressStart2P',
                  color: '#FFFFFF',
                  fontSize: 9,
                  marginBottom: 10,
                  letterSpacing: 1,
                }}
              >
                {CATEGORY_LABELS[cat]}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 12,
                }}
              >
                {items.map((item) => (
                  <PurchaseCard
                    key={item.id}
                    item={item}
                    affordable={coins >= item.cost && !!partner}
                    disabledReason={
                      !partner ? 'partner' : coins < item.cost ? 'afford' : null
                    }
                    onPress={handleBuy}
                  />
                ))}
              </View>
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
