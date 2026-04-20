// components/game/AmnestyConfirmModal.tsx — confirm amnesty cancel + call RPC.

import { Modal, Pressable, Text, View } from 'react-native';
import { useState } from 'react';
import { purchaseAmnesty } from '../../lib/shop';

export type AmnestyConfirmModalProps = {
  visible: boolean;
  purchaseId: string | null;
  itemName: string;
  itemCost: number;
  spendable: number;
  onClose: () => void;
  onResolved: () => void; // caller refetches debt state + wallet
};

export function AmnestyConfirmModal(props: AmnestyConfirmModalProps) {
  const { visible, purchaseId, itemName, itemCost, spendable, onClose, onResolved } = props;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fee = Math.ceil(itemCost * 1.5);
  const insufficient = spendable < fee;

  async function confirm() {
    if (!purchaseId) return;
    setSubmitting(true);
    setError(null);
    const r = await purchaseAmnesty(purchaseId);
    setSubmitting(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    onResolved();
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#000', borderWidth: 3, borderColor: '#FFA63F', padding: 16, gap: 10 }}>
          <Text style={{ fontFamily: 'PressStart2P', fontSize: 10, color: '#FFA63F' }}>
            CANCEL "{itemName.toUpperCase()}"?
          </Text>
          <Text style={{ fontFamily: 'PressStart2P', fontSize: 8, color: '#FFFFFF' }}>
            COST: {fee}¢ FROM YOU
          </Text>
          <Text style={{ fontFamily: 'PressStart2P', fontSize: 8, color: '#FFFFFF' }}>
            PARTNER REFUNDED: {itemCost}¢
          </Text>
          {insufficient && (
            <Text style={{ fontFamily: 'PressStart2P', fontSize: 7, color: '#FF3333' }}>
              NEED {fee - spendable}¢ MORE
            </Text>
          )}
          {error && (
            <Text style={{ fontFamily: 'PressStart2P', fontSize: 7, color: '#FF3333' }}>
              {error.toUpperCase()}
            </Text>
          )}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8, justifyContent: 'flex-end' }}>
            <Pressable onPress={onClose} disabled={submitting}>
              <Text style={{ fontFamily: 'PressStart2P', fontSize: 8, color: '#FFFFFF' }}>NEVERMIND</Text>
            </Pressable>
            <Pressable
              onPress={confirm}
              disabled={submitting || insufficient}
              style={{ backgroundColor: insufficient ? '#4A4A4A' : '#FFA63F', paddingHorizontal: 10, paddingVertical: 5 }}
            >
              <Text style={{ fontFamily: 'PressStart2P', fontSize: 8, color: '#000' }}>
                {submitting ? 'CANCELLING...' : 'CANCEL OBLIGATION'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
