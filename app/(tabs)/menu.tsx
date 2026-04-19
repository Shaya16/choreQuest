import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { ActionFeed } from '@/components/game/ActionFeed';
import { CLASS_META } from '@/lib/characters';
import { useRoundView } from '@/lib/useRoundView';
import { useSession } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { clearPushToken, registerPushToken } from '@/lib/notifications';
import type { Player } from '@/lib/types';

/**
 * Pause-menu modal presented from Home. Combines the action feed (history)
 * with profile + couple info and dev tools. Slides in from the bottom.
 */
export default function MenuScreen() {
  const player = useSession((s) => s.player);
  const couple = useSession((s) => s.couple);
  const view = useRoundView(couple);
  const { p1, p2, recentLogs } = view;

  const [stubBusy, setStubBusy] = useState(false);
  const [stubInfo, setStubInfo] = useState<string | null>(null);

  const [notifEnabled, setNotifEnabled] = useState<boolean>(!!player?.expo_push_token);

  useEffect(() => {
    setNotifEnabled(!!player?.expo_push_token);
  }, [player?.expo_push_token]);

  async function handleNotifToggle(value: boolean) {
    if (!player) return;
    setNotifEnabled(value);
    if (value) {
      const token = await registerPushToken(player.id);
      if (!token) setNotifEnabled(false); // permission denied or simulator — fell through
    } else {
      await clearPushToken(player.id);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function summonStub() {
    if (!player || !couple) {
      setStubInfo('Join a couple first.');
      return;
    }
    setStubBusy(true);
    setStubInfo(null);
    const { data, error } = await supabase.rpc('dev_summon_stub_partner', {
      p_display_name: 'Kessy',
      p_arcade_class: 'kessy',
    });
    setStubBusy(false);
    if (error || !data) {
      Alert.alert('Summon failed', error?.message ?? 'Unknown error.');
      return;
    }
    const stub = data as Player;
    setStubInfo(`Summoned ${stub.display_name} (${stub.arcade_class}).`);
  }

  async function banishStub() {
    if (!couple) return;
    setStubBusy(true);
    setStubInfo(null);
    const { data, error } = await supabase.rpc('dev_banish_stub_partner', {});
    setStubBusy(false);
    if (error) {
      Alert.alert('Banish failed', error.message);
      return;
    }
    const removed = typeof data === 'number' ? data : 0;
    setStubInfo(removed ? `Banished ${removed} stub.` : 'No stub to banish.');
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      {/* ============ MENU HEADER ============ */}
      <View
        style={{
          backgroundColor: '#FFCC00',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#000000',
            fontSize: 12,
            letterSpacing: 2,
          }}
        >
          ◆ PAUSE MENU ◆
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={{
            backgroundColor: '#000000',
            borderWidth: 2,
            borderColor: '#000000',
            paddingHorizontal: 10,
            paddingVertical: 4,
          }}
        >
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFCC00',
              fontSize: 11,
              letterSpacing: 1,
            }}
          >
            ✕ CLOSE
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 10, paddingBottom: 32 }}>
        {/* ============ HISTORY ============ */}
        <SectionLabel label="HISTORY" accent="#9EFA00" />
        <ActionFeed logs={recentLogs} p1={p1} p2={p2} />

        {/* ============ PROFILE ============ */}
        <View style={{ height: 14 }} />
        <SectionLabel label="PLAYER" accent="#00DDFF" />
        <View
          style={{
            borderWidth: 2,
            borderColor: '#00DDFF',
            padding: 10,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {player && (
              <Image
                source={CLASS_META[player.arcade_class].sprite}
                style={{ width: 56, height: 56 }}
                resizeMode="contain"
              />
            )}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text
                style={{
                  fontFamily: 'PressStart2P',
                  color: '#FFFFFF',
                  fontSize: 11,
                }}
              >
                {player?.display_name ?? '—'}
              </Text>
              <Text
                style={{
                  fontFamily: 'Silkscreen',
                  color: '#4A4A4A',
                  fontSize: 10,
                  marginTop: 3,
                  letterSpacing: 1,
                }}
              >
                {player ? CLASS_META[player.arcade_class].label : ''} · LVL{' '}
                {player?.player_level ?? 1}
              </Text>
            </View>
          </View>
          <View style={{ height: 8 }} />
          <MenuButton
            label="CHANGE CHARACTER"
            bg="#00DDFF"
            fg="#000000"
            onPress={() => router.push('/(tabs)/character')}
          />
        </View>

        {/* ============ COUPLE ============ */}
        <View style={{ height: 14 }} />
        <SectionLabel label="COUPLE" accent="#FFB8DE" />
        <View
          style={{
            borderWidth: 2,
            borderColor: '#FFB8DE',
            padding: 10,
          }}
        >
          <Text
            style={{
              fontFamily: 'Silkscreen',
              color: '#4A4A4A',
              fontSize: 10,
              letterSpacing: 1,
            }}
          >
            INVITE CODE
          </Text>
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFFFFF',
              fontSize: 14,
              marginTop: 3,
              letterSpacing: 4,
            }}
          >
            {couple?.invite_code ?? '—'}
          </Text>
          <Text
            style={{
              fontFamily: 'Silkscreen',
              color: '#4A4A4A',
              fontSize: 10,
              marginTop: 6,
              letterSpacing: 1,
            }}
          >
            LVL {couple?.couple_level ?? 1} · {couple?.couple_xp ?? 0} XP
          </Text>
        </View>

        {/* ============ SETTINGS ============ */}
        <View style={{ height: 14 }} />
        <SectionLabel label="SETTINGS" accent="#FFCC00" />
        <View
          style={{
            borderWidth: 2,
            borderColor: '#FFCC00',
            padding: 10,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: '#FFFFFF',
              fontSize: 10,
              letterSpacing: 1,
            }}
          >
            NOTIFICATIONS
          </Text>
          <Switch
            value={notifEnabled}
            onValueChange={handleNotifToggle}
            trackColor={{ false: '#333', true: '#FFCC00' }}
          />
        </View>

        {/* ============ DEV TOOLS ============ */}
        <View style={{ height: 14 }} />
        <SectionLabel label="DEV TOOLS" accent="#FF3333" />
        <View style={{ borderWidth: 2, borderColor: '#FF3333', padding: 10 }}>
          <Text
            style={{
              fontFamily: 'Silkscreen',
              color: '#FFFFFF',
              fontSize: 10,
              marginBottom: 8,
              letterSpacing: 1,
            }}
          >
            Solo testing: fake a Player 2 for 2P HUDs.
          </Text>
          <MenuButton
            label={stubBusy ? 'WORKING…' : 'SUMMON STUB PARTNER'}
            bg="#FFB8DE"
            fg="#000000"
            onPress={summonStub}
            disabled={stubBusy}
          />
          <View style={{ height: 6 }} />
          <MenuButton
            label="BANISH STUB"
            bg="#000000"
            fg="#4A4A4A"
            border="#4A4A4A"
            onPress={banishStub}
            disabled={stubBusy}
          />
          {stubInfo && (
            <Text
              style={{
                fontFamily: 'Silkscreen',
                color: '#00DDFF',
                fontSize: 10,
                marginTop: 8,
              }}
            >
              {stubInfo}
            </Text>
          )}
        </View>

        {/* ============ SIGN OUT ============ */}
        <View style={{ height: 18 }} />
        <MenuButton label="SIGN OUT" bg="#FF3333" fg="#FFFFFF" onPress={signOut} />
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionLabel({ label, accent }: { label: string; accent: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
        gap: 6,
      }}
    >
      <View style={{ width: 6, height: 6, backgroundColor: accent }} />
      <Text
        style={{
          fontFamily: 'PressStart2P',
          color: accent,
          fontSize: 10,
          letterSpacing: 2,
        }}
      >
        {label}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: accent, opacity: 0.4 }} />
    </View>
  );
}

function MenuButton({
  label,
  bg,
  fg,
  border,
  onPress,
  disabled,
}: {
  label: string;
  bg: string;
  fg: string;
  border?: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled}>
      {({ pressed }) => (
        <View
          style={{
            backgroundColor: bg,
            borderWidth: 2,
            borderColor: border ?? bg,
            paddingVertical: 10,
            paddingHorizontal: 12,
            alignItems: 'center',
            opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
          }}
        >
          <Text
            style={{
              fontFamily: 'PressStart2P',
              color: fg,
              fontSize: 10,
              letterSpacing: 2,
            }}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
