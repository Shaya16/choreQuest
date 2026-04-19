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
import {
  forceCloseCurrentRound,
  loadTributeCards,
  markTributePaid,
  pickTribute,
} from '@/lib/tribute';
import { ensureActiveRound } from '@/lib/round';
import type { Activity, Log, Player, Round } from '@/lib/types';

/**
 * Pause-menu modal presented from Home. Combines the action feed (history)
 * with profile + couple info and dev tools. Slides in from the bottom.
 */
export default function MenuScreen() {
  const player = useSession((s) => s.player);
  const couple = useSession((s) => s.couple);
  const view = useRoundView(couple);
  const { p1, p2, recentLogs } = view;

  const activities = useSession((s) => s.activities);
  const [stubBusy, setStubBusy] = useState(false);
  const [stubInfo, setStubInfo] = useState<string | null>(null);
  const [closeBusy, setCloseBusy] = useState(false);
  const [injectBusy, setInjectBusy] = useState(false);
  const [fakePayBusy, setFakePayBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

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

  async function handleInjectLogs() {
    if (!couple || !player) {
      Alert.alert('Inject failed', 'Not paired yet.');
      return;
    }
    if (activities.length === 0) {
      Alert.alert('Inject failed', 'Activities not loaded yet.');
      return;
    }
    if (!p2 || p2.id === player.id) {
      Alert.alert(
        'Inject failed',
        'No partner / stub to log for. Summon a stub partner first.'
      );
      return;
    }
    setInjectBusy(true);
    try {
      // Ensure an active round exists before injecting (the RPC also checks,
      // but this path is quieter if the couple just closed their last round).
      const round = await ensureActiveRound(couple.id);
      if (!round) {
        Alert.alert('Inject failed', 'Could not resolve active round.');
        return;
      }
      // Pick 5 random activities and fire an insert for each via the RPC.
      const pool = activities.slice();
      const picks: Activity[] = [];
      for (let i = 0; i < 5 && pool.length > 0; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        picks.push(pool.splice(idx, 1)[0]);
      }
      let totalCoins = 0;
      let inserted = 0;
      let firstError: string | null = null;
      for (const a of picks) {
        const { data, error } = await supabase.rpc('dev_inject_stub_log', {
          p_activity_id: a.id,
        });
        if (error) {
          if (!firstError) firstError = error.message;
          continue;
        }
        const log = data as Log | null;
        if (log) {
          inserted++;
          totalCoins += log.coins_earned ?? 0;
        }
      }
      if (inserted === 0) {
        Alert.alert(
          'Inject failed',
          firstError ?? 'All inserts rejected (RLS / missing stub?).'
        );
        return;
      }
      Alert.alert(
        'Stub logs injected',
        `${inserted}/${picks.length} logs · +${totalCoins} coins for ${p2.display_name} into R${round.number}.`
      );
    } catch (e) {
      Alert.alert(
        'Inject failed',
        e instanceof Error ? e.message : String(e)
      );
    } finally {
      setInjectBusy(false);
    }
  }

  async function handleFakeStubCollect() {
    if (!couple || !player) {
      Alert.alert('Fake collect failed', 'Not paired yet.');
      return;
    }
    setFakePayBusy(true);
    try {
      // Clear ALL unpaid tribute rounds for the couple so the home OWED/
      // COLLECT tiles go away in one tap — testing produces stacks of stale
      // unresolved debts.
      const { data: rows } = await supabase
        .from('rounds')
        .select('id, number')
        .eq('couple_id', couple.id)
        .eq('status', 'closed')
        .not('tribute_shop_item_id', 'is', null)
        .is('tribute_paid_at', null);
      const unpaid = (rows ?? []) as { id: string; number: number }[];
      if (unpaid.length === 0) {
        Alert.alert('Fake collect', 'Nothing unpaid to clear.');
        return;
      }
      for (const r of unpaid) {
        await markTributePaid(r.id);
      }
      const numbers = unpaid.map((r) => `R${r.number}`).join(', ');
      Alert.alert(
        'Fake collect',
        `Marked paid: ${numbers}. Home should clear.`
      );
    } catch (e) {
      Alert.alert(
        'Fake collect failed',
        e instanceof Error ? e.message : String(e)
      );
    } finally {
      setFakePayBusy(false);
    }
  }

  async function handleResetTodayLogs() {
    if (!couple) {
      Alert.alert('Reset failed', 'Not paired yet.');
      return;
    }
    setResetBusy(true);
    try {
      const { data, error } = await supabase.rpc('dev_reset_today_logs');
      if (error) {
        Alert.alert('Reset failed', error.message);
        return;
      }
      const deleted = typeof data === 'number' ? data : 0;
      Alert.alert(
        'Reset',
        deleted > 0
          ? `Deleted ${deleted} log${deleted === 1 ? '' : 's'} from today. Ammo restored.`
          : 'Nothing logged today — nothing to delete.'
      );
    } catch (e) {
      Alert.alert(
        'Reset failed',
        e instanceof Error ? e.message : String(e)
      );
    } finally {
      setResetBusy(false);
    }
  }

  async function handleForceClose() {
    if (!couple || !player) {
      Alert.alert('Force close failed', 'Not paired yet.');
      return;
    }
    setCloseBusy(true);
    const { ok, error } = await forceCloseCurrentRound();
    setCloseBusy(false);
    if (!ok) {
      Alert.alert('Force close failed', error ?? 'Unknown error.');
      return;
    }

    // Find the most recent closed round that's still unresolved FOR THIS PLAYER
    // and navigate straight to round-over for it. We don't rely on the root
    // layout's redirect effect because its deps rarely change after force-close.
    const { data: closedRows, error: qErr } = await supabase
      .from('rounds')
      .select('*')
      .eq('couple_id', couple.id)
      .eq('status', 'closed')
      .order('number', { ascending: false })
      .limit(5);
    if (qErr) {
      Alert.alert('Force close: query failed', qErr.message);
      return;
    }
    const closed = (closedRows ?? []) as Round[];

    if (closed.length === 0) {
      Alert.alert(
        'Force close: no closed rounds found',
        `The function reported success but no rows have status='closed' for couple ${couple.id.slice(0, 8)}. The cron may have raced or RLS hid it.`
      );
      return;
    }

    const target = closed.find((r) => {
      if (r.winner_id === player.id) {
        return r.tribute_shop_item_id == null || r.tribute_paid_at == null;
      }
      // loser / tied path — redirect unconditionally; the screen handles ack
      return true;
    });

    if (!target) {
      // Dump what we found so we can see why none qualified.
      const summary = closed
        .map(
          (r) =>
            `R${r.number}: winner=${r.winner_id?.slice(0, 4) ?? 'null'} ` +
            `mine=${r.winner_id === player.id} ` +
            `picked=${r.tribute_shop_item_id != null} ` +
            `paid=${r.tribute_paid_at != null}`
        )
        .join('\n');
      Alert.alert(
        `Closed rounds (you=${player.id.slice(0, 4)})`,
        summary
      );
      return;
    }

    // If the STUB won and hasn't "picked" a tribute yet, auto-pick one
    // before navigating. Stubs can't tap through the card UI themselves, so
    // the loser-path flow on the user's side would stall forever otherwise.
    let autoPickedName: string | null = null;
    if (
      target.winner_id != null &&
      target.winner_id !== player.id &&
      target.tribute_tier != null &&
      target.tribute_shop_item_id == null
    ) {
      try {
        const cards = await loadTributeCards(target.tribute_tier, target.id);
        if (cards.length > 0) {
          const choice = cards[Math.floor(Math.random() * cards.length)];
          await pickTribute(target.id, choice.id);
          target.tribute_shop_item_id = choice.id;
          autoPickedName = choice.name;
        }
      } catch (e) {
        // Non-fatal: if auto-pick fails, the acknowledge screen will still
        // show the "partner is picking…" placeholder and we can retry later.
        console.warn('auto-pick stub tribute failed:', e);
      }
    }

    const winnerLabel =
      target.winner_id == null
        ? 'TIED (nobody)'
        : target.winner_id === player.id
        ? 'YOU'
        : 'partner';
    const autoPickSuffix = autoPickedName
      ? `\n\n${p2?.display_name ?? 'stub'} demands: ${autoPickedName}`
      : '';
    Alert.alert(
      'Navigating to round-over',
      `R${target.number} · winner=${winnerLabel} · tier=${target.tribute_tier ?? 'null'}${autoPickSuffix}`,
      [
        {
          text: 'Go',
          onPress: () =>
            router.replace({
              pathname: '/(round)/over',
              params: { roundId: target.id },
            }),
        },
      ]
    );
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
          <View style={{ height: 8 }} />
          <Pressable
            onPress={handleInjectLogs}
            disabled={injectBusy}
            style={{
              borderWidth: 2,
              borderColor: '#9EFA00',
              padding: 12,
              opacity: injectBusy ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: '#9EFA00',
                fontSize: 9,
                textAlign: 'center',
              }}
            >
              🛠 INJECT 5 STUB LOGS
            </Text>
          </Pressable>
          <View style={{ height: 8 }} />
          <Pressable
            onPress={handleForceClose}
            disabled={closeBusy}
            style={{
              borderWidth: 2,
              borderColor: '#FF3333',
              padding: 12,
              opacity: closeBusy ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: '#FF3333',
                fontSize: 9,
                textAlign: 'center',
              }}
            >
              🛠 FORCE CLOSE ROUND
            </Text>
          </Pressable>
          <View style={{ height: 8 }} />
          <Pressable
            onPress={handleFakeStubCollect}
            disabled={fakePayBusy}
            style={{
              borderWidth: 2,
              borderColor: '#FFCC00',
              padding: 12,
              opacity: fakePayBusy ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: '#FFCC00',
                fontSize: 9,
                textAlign: 'center',
              }}
            >
              🛠 FAKE STUB COLLECT (CLEAR DEBT)
            </Text>
          </Pressable>
          <View style={{ height: 8 }} />
          <Pressable
            onPress={handleResetTodayLogs}
            disabled={resetBusy}
            style={{
              borderWidth: 2,
              borderColor: '#00DDFF',
              padding: 12,
              opacity: resetBusy ? 0.5 : 1,
            }}
          >
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: '#00DDFF',
                fontSize: 9,
                textAlign: 'center',
              }}
            >
              🛠 RESET TODAY&apos;S LOGS
            </Text>
          </Pressable>
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
