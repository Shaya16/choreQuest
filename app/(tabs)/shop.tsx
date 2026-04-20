import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AnimatePresence } from 'moti';

import { AmnestyConfirmModal } from '@/components/game/AmnestyConfirmModal';
import { ArsenalRow } from '@/components/game/ArsenalRow';
import { PurchaseCard } from '@/components/game/PurchaseCard';
import { QueueRow } from '@/components/game/QueueRow';
import { Shopkeep } from '@/components/game/Shopkeep';
import { WalletHUD } from '@/components/game/WalletHUD';
import { AffordabilityToast } from '@/components/ui/AffordabilityToast';
import { SectionBanner } from '@/components/ui/SectionBanner';
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
import { accentForCategory } from '@/lib/shop-format';
import { pickShopkeepLine } from '@/lib/shopkeep-lines';
import { useSession } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { useDebtState } from '@/lib/useDebtState';
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

const SCREEN_PADDING = 16;
const CARD_GAP = 12;
const CARD_WIDTH =
  (Dimensions.get('window').width - SCREEN_PADDING * 2 - CARD_GAP) / 2;

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
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { state: debtState, refetch: refetchDebt } = useDebtState(
    player?.id ?? null,
    couple?.id ?? null
  );
  const [itemLookup, setItemLookup] = useState<
    Record<string, { name: string; cost: number }>
  >({});
  const [amnestyFor, setAmnestyFor] = useState<{
    purchaseId: string;
    itemName: string;
    itemCost: number;
  } | null>(null);
  const [spendable, setSpendable] = useState(0);

  useEffect(() => {
    if (!player?.id) return;
    void getSpendableCoins(player.id).then(setSpendable);
  }, [player?.id, debtState.inDebt]);

  useEffect(() => {
    const ids = debtState.sources
      .filter((s): s is Extract<typeof s, { kind: 'purchase' }> => s.kind === 'purchase')
      .map((s) => s.shop_item_id);
    if (ids.length === 0) {
      setItemLookup({});
      return;
    }
    let cancelled = false;
    void supabase
      .from('shop_items')
      .select('id, name, cost')
      .in('id', ids)
      .then(({ data }) => {
        if (cancelled) return;
        const map: Record<string, { name: string; cost: number }> = {};
        for (const it of data ?? []) map[it.id] = { name: it.name, cost: it.cost };
        setItemLookup(map);
      });
    return () => {
      cancelled = true;
    };
  }, [debtState.sources]);

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

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  function flashToast(message: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMessage(message);
    toastTimer.current = setTimeout(() => setToastMessage(null), 1500);
  }

  const { pendingStacks, awaiting } = groupArsenal(arsenal);
  const tokenCount = pendingStacks.reduce((n, s) => n + s.count, 0);

  // Split queue rows into INCOMING (requested) and STOCKPILED (pending).
  const incoming = useMemo(
    () => queue.filter((p) => p.status === 'redemption_requested'),
    [queue]
  );
  const stockpiled = useMemo(
    () => queue.filter((p) => p.status === 'pending'),
    [queue]
  );

  // Shopkeep line — picked once per render cycle from current state.
  const shopkeepLine = useMemo(() => {
    if (!player) return '';
    return pickShopkeepLine({
      playerId: player.id,
      date: new Date(),
      coins,
      awaitingCount: awaiting.length,
      incomingCount: incoming.length,
    });
  }, [player?.id, coins, awaiting.length, incoming.length]);

  function handleBuy(item: ShopItem) {
    if (!player) return;
    if (!partner) {
      flashToast('PAIR A PARTNER FIRST');
      return;
    }
    if (coins < item.cost) {
      flashToast(`NEED ${item.cost - coins} MORE COINS`);
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

  function handleDeploy(item: ShopItem) {
    if (!player || !partner) return;
    Alert.alert(
      `Deploy ${item.name}?`,
      `${partner.display_name} will be notified now. No takebacks.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deploy',
          style: 'destructive',
          onPress: async () => {
            const { ok, error } = await requestRedemption(player.id, item.id);
            if (!ok) {
              Alert.alert('Deploy failed', error ?? 'Unknown error.');
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

      {/* Wallet + toast container (relative parent so toast can absolute-overlay) */}
      <View style={{ position: 'relative' }}>
        <WalletHUD
          coins={coins}
          tokenCount={tokenCount}
          awaitingCount={awaiting.length}
          inDebt={debtState.inDebt}
        />
        <AnimatePresence>
          <AffordabilityToast message={toastMessage} />
        </AnimatePresence>
      </View>

      {/* Shopkeep persona */}
      {player && <Shopkeep line={shopkeepLine} />}

      <ScrollView contentContainerStyle={{ padding: SCREEN_PADDING }}>
        {/* WHAT YOU OWE — purchase-token debts with PAY / AMNESTY actions */}
        {debtState.sources.some((s) => s.kind === 'purchase') && (
          <View style={{ paddingVertical: 12, gap: 8, marginBottom: 16 }}>
            <SectionBanner label="⚖️ WHAT YOU OWE" color="#FF3333" fontSize={11} />
            {debtState.sources
              .filter(
                (s): s is Extract<typeof s, { kind: 'purchase' }> =>
                  s.kind === 'purchase'
              )
              .map((s) => {
                const it = itemLookup[s.shop_item_id];
                if (!it) return null;
                const fee = Math.ceil(it.cost * 1.5);
                const ageLabel =
                  s.age_ms < 3600000
                    ? 'JUST NOW'
                    : s.age_ms < 86400000
                    ? `${Math.floor(s.age_ms / 3600000)}H`
                    : `${Math.floor(s.age_ms / 86400000)}D`;
                return (
                  <View
                    key={s.purchase_id}
                    style={{
                      padding: 8,
                      borderWidth: 2,
                      borderColor: s.age_ms >= 86400000 ? '#FF3333' : '#4A4A4A',
                      gap: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: 'PressStart2P',
                        fontSize: 8,
                        color: '#FFFFFF',
                      }}
                    >
                      {it.name.toUpperCase()}
                    </Text>
                    <Text
                      style={{
                        fontFamily: 'PressStart2P',
                        fontSize: 6,
                        color: '#4A4A4A',
                      }}
                    >
                      {ageLabel}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                      <Pressable
                        onPress={() => {
                          // PAY: v1 punts — user can redeem via INCOMING flow.
                          // A proper deep-link is deferred.
                        }}
                        style={{
                          backgroundColor: '#00DDFF',
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: 'PressStart2P',
                            fontSize: 7,
                            color: '#000',
                          }}
                        >
                          PAY
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          setAmnestyFor({
                            purchaseId: s.purchase_id,
                            itemName: it.name,
                            itemCost: it.cost,
                          })
                        }
                        style={{
                          backgroundColor: '#FFA63F',
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: 'PressStart2P',
                            fontSize: 7,
                            color: '#000',
                          }}
                        >
                          AMNESTY · {fee}¢
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
          </View>
        )}

        {/* ARSENAL */}
        {(pendingStacks.length > 0 || awaiting.length > 0) && (
          <View style={{ marginBottom: 24 }}>
            <SectionBanner label="▸ YOUR ARSENAL" color="#9EFA00" fontSize={11} />
            {pendingStacks.map((s) => (
              <ArsenalRow
                key={`pend-${s.item.id}`}
                variant="pending"
                item={s.item}
                count={s.count}
                onRedeem={handleDeploy}
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
        {(incoming.length > 0 || stockpiled.length > 0) && (
          <View style={{ marginBottom: 24 }}>
            {incoming.length > 0 && partner && (
              <View style={{ marginBottom: stockpiled.length > 0 ? 16 : 0 }}>
                <SectionBanner
                  label="🚨 INCOMING"
                  color="#FF3333"
                  fontSize={11}
                />
                {incoming.map((p) =>
                  p.shop_item ? (
                    <QueueRow
                      key={p.id}
                      variant="requested"
                      purchaseId={p.id}
                      item={p.shop_item}
                      requestedAt={p.redemption_requested_at ?? p.purchased_at}
                      partnerName={partner.display_name}
                      onDeliver={handleDeliver}
                    />
                  ) : null
                )}
              </View>
            )}

            {stockpiled.length > 0 && partner && (
              <View>
                <SectionBanner
                  label="💀 STOCKPILED ON YOU"
                  color="#4A4A4A"
                  fontSize={10}
                />
                {stockpiled.map((p) =>
                  p.shop_item ? (
                    <QueueRow
                      key={p.id}
                      variant="stockpiled"
                      item={p.shop_item}
                      count={1}
                      partnerName={partner.display_name}
                    />
                  ) : null
                )}
              </View>
            )}
          </View>
        )}

        {/* CATALOG */}
        <SectionBanner label="▸ CATALOG" color="#FFCC00" fontSize={11} />
        {categoryOrder.map((cat) => {
          const items = catalog[cat];
          if (!items || items.length === 0) return null;
          return (
            <View key={cat} style={{ marginBottom: 20 }}>
              <SectionBanner
                label={CATEGORY_LABELS[cat]}
                color={accentForCategory(cat)}
                fontSize={9}
              />
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: CARD_GAP,
                }}
              >
                {items.map((item) => {
                  const affordable = coins >= item.cost && !!partner;
                  const shortfall = Math.max(0, item.cost - coins);
                  return (
                    <PurchaseCard
                      key={item.id}
                      item={item}
                      width={CARD_WIDTH}
                      affordable={affordable}
                      disabledReason={
                        !partner ? 'partner' : coins < item.cost ? 'afford' : null
                      }
                      shortfall={shortfall}
                      onPress={handleBuy}
                    />
                  );
                })}
              </View>
            </View>
          );
        })}

        <View style={{ height: 60 }} />
      </ScrollView>

      <AmnestyConfirmModal
        visible={amnestyFor !== null}
        purchaseId={amnestyFor?.purchaseId ?? null}
        itemName={amnestyFor?.itemName ?? ''}
        itemCost={amnestyFor?.itemCost ?? 0}
        spendable={spendable}
        onClose={() => setAmnestyFor(null)}
        onResolved={() => {
          void refetchDebt();
          if (player?.id) void getSpendableCoins(player.id).then(setSpendable);
        }}
      />
    </SafeAreaView>
  );
}
