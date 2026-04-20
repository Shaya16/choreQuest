// components/game/DebtModal.tsx — lists open debts with action buttons.
// Action visibility depends on whether the viewer IS the debtor.

import { Modal, Pressable, Text, View, ScrollView } from 'react-native';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { DebtState, DebtSource } from '../../lib/debt';
import type { ShopItem } from '../../lib/types';

type ItemLookup = Record<string, { name: string; cost: number; icon_sprite: string | null }>;

export type DebtModalProps = {
  visible: boolean;
  onClose: () => void;
  debt: DebtState;
  viewerIsDebtor: boolean;
  onPay?: (src: DebtSource) => void;
  onAmnesty?: (src: Extract<DebtSource, { kind: 'purchase' }>) => void;
};

export function DebtModal(props: DebtModalProps) {
  const { visible, onClose, debt, viewerIsDebtor, onPay, onAmnesty } = props;
  const [items, setItems] = useState<ItemLookup>({});

  const neededIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of debt.sources) {
      if (s.kind === 'purchase') ids.add(s.shop_item_id);
      if (s.kind === 'tribute' && s.tribute_shop_item_id) ids.add(s.tribute_shop_item_id);
    }
    return Array.from(ids);
  }, [debt.sources]);

  useEffect(() => {
    if (neededIds.length === 0) {
      setItems({});
      return;
    }
    let cancelled = false;
    supabase
      .from('shop_items')
      .select('id, name, cost, icon_sprite')
      .in('id', neededIds)
      .then(({ data }) => {
        if (cancelled) return;
        const map: ItemLookup = {};
        for (const it of (data ?? []) as ShopItem[]) {
          map[it.id] = { name: it.name, cost: it.cost, icon_sprite: it.icon_sprite ?? null };
        }
        setItems(map);
      });
    return () => { cancelled = true; };
  }, [neededIds]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 24 }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            backgroundColor: '#000',
            borderWidth: 3,
            borderColor: '#FF3333',
            padding: 16,
            gap: 12,
          }}
        >
          <Text style={{ fontFamily: 'PressStart2P', fontSize: 10, color: '#FF3333', letterSpacing: 1 }}>
            {viewerIsDebtor ? 'YOU OWE' : 'THEY OWE'}
          </Text>

          <ScrollView style={{ maxHeight: 320 }}>
            {debt.sources.length === 0 && (
              <Text style={{ fontFamily: 'PressStart2P', fontSize: 8, color: '#4A4A4A' }}>
                NOTHING OPEN
              </Text>
            )}
            {debt.sources.map((src) => {
              const past24h = src.age_ms >= 24 * 60 * 60 * 1000;
              if (src.kind === 'purchase') {
                const item = items[src.shop_item_id];
                const name = item?.name ?? 'TOKEN';
                const cost = item?.cost ?? 0;
                const fee = Math.ceil(cost * 1.5);
                return (
                  <View key={src.purchase_id} style={rowStyle}>
                    <Text style={headerText(past24h)}>{name.toUpperCase()}</Text>
                    <Text style={ageText}>{formatAge(src.age_ms)}</Text>
                    {viewerIsDebtor && (
                      <View style={actionsRow}>
                        <Pressable onPress={() => onPay?.(src)} style={btn('#00DDFF')}>
                          <Text style={btnText('#000')}>PAY</Text>
                        </Pressable>
                        <Pressable onPress={() => onAmnesty?.(src)} style={btn('#FFA63F')}>
                          <Text style={btnText('#000')}>AMNESTY · {fee}¢</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                );
              }
              // tribute
              const tItem = src.tribute_shop_item_id ? items[src.tribute_shop_item_id] : null;
              const tName = tItem?.name ?? 'NOT PICKED';
              return (
                <View key={src.round_id} style={rowStyle}>
                  <Text style={headerText(past24h)}>TRIBUTE — {tName.toUpperCase()}</Text>
                  <Text style={ageText}>{formatAge(src.age_ms)}</Text>
                  {viewerIsDebtor && (
                    <Pressable onPress={() => onPay?.(src)} style={[btn('#00DDFF'), { marginTop: 4, alignSelf: 'flex-start' }]}>
                      <Text style={btnText('#000')}>MARK PAID</Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </ScrollView>

          <Pressable onPress={onClose} style={{ alignSelf: 'flex-end' }}>
            <Text style={{ fontFamily: 'PressStart2P', fontSize: 8, color: '#FFFFFF' }}>CLOSE</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const rowStyle = {
  borderBottomWidth: 1,
  borderBottomColor: '#4A4A4A',
  paddingVertical: 8,
  gap: 4 as const,
};
const actionsRow = { flexDirection: 'row' as const, gap: 8, marginTop: 4 };
const ageText = { fontFamily: 'PressStart2P', fontSize: 6, color: '#4A4A4A' };

function headerText(past24h: boolean) {
  return {
    fontFamily: 'PressStart2P',
    fontSize: 8,
    color: past24h ? '#FF3333' : '#FFCC00',
  };
}

function formatAge(ms: number): string {
  const h = Math.floor(ms / 3600000);
  if (h < 1) return 'JUST NOW';
  if (h < 24) return `${h}H`;
  const d = Math.floor(h / 24);
  return `${d}D ${h % 24}H`;
}

function btn(bg: string) {
  return { backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 4 };
}

function btnText(color: string) {
  return { fontFamily: 'PressStart2P' as const, fontSize: 7, color };
}
