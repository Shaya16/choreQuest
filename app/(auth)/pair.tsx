import { useEffect, useMemo, useState } from 'react';
import {
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MotiView } from 'moti';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/store';
import {
  generateInviteCode,
  isValidInviteCode,
  normalizeInviteCode,
} from '@/lib/invite-code';
import { ACCENT_HEX, CLASS_META, CLASS_ORDER } from '@/lib/characters';
import { Stage } from '@/components/game/Stage';
import { StatBar } from '@/components/ui/StatBar';
import { PixelButton } from '@/components/ui/PixelButton';
import type { ArcadeClass, Couple, Player } from '@/lib/types';

type Mode = 'menu' | 'create' | 'join';

export default function PairScreen() {
  const session = useSession((s) => s.session);
  const player = useSession((s) => s.player);
  const setPlayer = useSession((s) => s.setPlayer);
  const setCouple = useSession((s) => s.setCouple);

  const [displayName, setDisplayName] = useState('');
  const [classIndex, setClassIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('menu');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (player?.display_name) setDisplayName(player.display_name);
    if (player?.arcade_class) {
      const idx = CLASS_ORDER.indexOf(player.arcade_class);
      if (idx >= 0) setClassIndex(idx);
    }
  }, [player]);

  const arcadeClass: ArcadeClass = CLASS_ORDER[classIndex]!;
  const meta = CLASS_META[arcadeClass];
  const accentHex = ACCENT_HEX[meta.accent];
  const currentCode = useMemo(
    () => (mode === 'join' ? normalizeInviteCode(joinCode) : ''),
    [mode, joinCode]
  );

  const screenH = Dimensions.get('window').height;
  const stageH = Math.max(380, Math.min(460, screenH * 0.55));

  function cycle(delta: number) {
    const next = (classIndex + delta + CLASS_ORDER.length) % CLASS_ORDER.length;
    setClassIndex(next);
  }

  async function ensurePlayer(): Promise<Player | null> {
    if (!session?.user) {
      setError('Not signed in.');
      return null;
    }
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setError('Pick a display name.');
      return null;
    }

    if (player) {
      if (
        player.display_name !== trimmedName ||
        player.arcade_class !== arcadeClass
      ) {
        const { data: updated, error: updateError } = await supabase
          .from('players')
          .update({ display_name: trimmedName, arcade_class: arcadeClass })
          .eq('id', player.id)
          .select('*')
          .single<Player>();
        if (updateError || !updated) {
          setError(updateError?.message ?? 'Could not update player.');
          return null;
        }
        setPlayer(updated);
        return updated;
      }
      return player;
    }

    const { data: created, error: insertError } = await supabase
      .from('players')
      .insert({
        user_id: session.user.id,
        display_name: trimmedName,
        arcade_class: arcadeClass,
      })
      .select('*')
      .single<Player>();
    if (insertError || !created) {
      setError(insertError?.message ?? 'Could not create player.');
      return null;
    }
    setPlayer(created);
    return created;
  }

  async function refreshPlayerLink(): Promise<Player | null> {
    if (!session?.user) return null;
    const { data } = await supabase
      .from('players')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle<Player>();
    if (data) setPlayer(data);
    return data ?? null;
  }

  async function createCouple() {
    setError(null);
    setBusy(true);
    const currentPlayer = await ensurePlayer();
    if (!currentPlayer) {
      setBusy(false);
      return;
    }
    const code = generateInviteCode();
    const { data, error: rpcError } = await supabase.rpc(
      'create_couple_and_join',
      { p_invite_code: code }
    );
    if (rpcError || !data) {
      setBusy(false);
      setError(rpcError?.message ?? 'Could not create couple.');
      return;
    }
    await refreshPlayerLink();
    setCouple(data as Couple);
    setBusy(false);
  }

  async function joinCouple() {
    setError(null);
    const trimmed = normalizeInviteCode(joinCode);
    if (!isValidInviteCode(trimmed)) {
      setError('Invite codes are 6 characters.');
      return;
    }
    setBusy(true);
    const currentPlayer = await ensurePlayer();
    if (!currentPlayer) {
      setBusy(false);
      return;
    }
    const { data, error: rpcError } = await supabase.rpc(
      'join_couple_by_code',
      { p_invite_code: trimmed }
    );
    if (rpcError || !data) {
      setBusy(false);
      setError(rpcError?.message ?? 'No couple matches that code.');
      return;
    }
    await refreshPlayerLink();
    setCouple(data as Couple);
    setBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 8, paddingVertical: 8 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* ============ STAGE SCENE ============ */}
          <Stage accentHex={accentHex} height={stageH}>
            {/* Cursor arrows left/right — clickable edges of the stage */}
            <Pressable
              onPress={() => cycle(-1)}
              hitSlop={16}
              style={{
                position: 'absolute',
                left: 4,
                top: '45%',
                zIndex: 10,
                padding: 8,
              }}
            >
              <MotiView
                from={{ translateX: 0 }}
                animate={{ translateX: -4 }}
                transition={{
                  type: 'timing',
                  duration: 450,
                  loop: true,
                  repeatReverse: true,
                }}
              >
                <Text
                  style={{
                    fontFamily: 'PressStart2P',
                    color: '#FFCC00',
                    fontSize: 26,
                    textShadowColor: '#000000',
                    textShadowOffset: { width: 2, height: 2 },
                  }}
                >
                  ◀
                </Text>
              </MotiView>
            </Pressable>
            <Pressable
              onPress={() => cycle(1)}
              hitSlop={16}
              style={{
                position: 'absolute',
                right: 4,
                top: '45%',
                zIndex: 10,
                padding: 8,
              }}
            >
              <MotiView
                from={{ translateX: 0 }}
                animate={{ translateX: 4 }}
                transition={{
                  type: 'timing',
                  duration: 450,
                  loop: true,
                  repeatReverse: true,
                }}
              >
                <Text
                  style={{
                    fontFamily: 'PressStart2P',
                    color: '#FFCC00',
                    fontSize: 26,
                    textShadowColor: '#000000',
                    textShadowOffset: { width: 2, height: 2 },
                  }}
                >
                  ▶
                </Text>
              </MotiView>
            </Pressable>

            {/* Floating stats panel top-left */}
            <View
              style={{
                position: 'absolute',
                top: 8,
                left: 8,
                zIndex: 5,
                backgroundColor: 'rgba(0,0,0,0.85)',
                borderWidth: 2,
                borderColor: accentHex,
                paddingHorizontal: 8,
                paddingVertical: 6,
              }}
            >
              <Text
                style={{
                  fontFamily: 'PressStart2P',
                  color: accentHex,
                  fontSize: 8,
                  marginBottom: 6,
                }}
              >
                STATS
              </Text>
              <StatBar label="PWR" value={meta.stats.pwr} color="#FF3333" total={8} />
              <StatBar label="SPD" value={meta.stats.spd} color="#00DDFF" total={8} />
              <StatBar label="BRN" value={meta.stats.brn} color="#9EFA00" total={8} />
              <StatBar label="CHR" value={meta.stats.chr} color="#FFB8DE" total={8} />
            </View>

            {/* P1 READY flag top-right, blinking */}
            <MotiView
              from={{ opacity: 0.3 }}
              animate={{ opacity: 1 }}
              transition={{
                type: 'timing',
                duration: 500,
                loop: true,
                repeatReverse: true,
              }}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                zIndex: 5,
                backgroundColor: '#FFCC00',
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderWidth: 2,
                borderColor: '#000000',
              }}
            >
              <Text
                style={{
                  fontFamily: 'PressStart2P',
                  color: '#000000',
                  fontSize: 10,
                }}
              >
                P1
              </Text>
            </MotiView>

            {/* Character standing on ground, center */}
            <View
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                alignItems: 'center',
                justifyContent: 'flex-end',
                top: 0,
              }}
            >
              {/* Shadow beneath */}
              <MotiView
                from={{ scaleX: 1, opacity: 0.55 }}
                animate={{ scaleX: 0.75, opacity: 0.85 }}
                transition={{
                  type: 'timing',
                  duration: 900,
                  loop: true,
                  repeatReverse: true,
                }}
                style={{
                  position: 'absolute',
                  bottom: 8,
                  width: 140,
                  height: 10,
                  backgroundColor: accentHex,
                  opacity: 0.55,
                  borderRadius: 999,
                }}
              />
              {/* Sprite bobbing */}
              <MotiView
                key={`${arcadeClass}-hero`}
                from={{ translateY: 0, scale: 0.9, opacity: 0 }}
                animate={{ translateY: -8, scale: 1, opacity: 1 }}
                transition={{
                  type: 'timing',
                  duration: 900,
                  loop: true,
                  repeatReverse: true,
                }}
                style={{ marginBottom: 14 }}
              >
                <Image
                  source={meta.sprite}
                  style={{ width: 220, height: 220 }}
                  resizeMode="contain"
                />
              </MotiView>
            </View>
          </Stage>

          {/* ============ NAMEPLATE BANNER ============ */}
          <View
            style={{
              marginTop: -3,
              backgroundColor: accentHex,
              borderWidth: 3,
              borderTopWidth: 0,
              borderColor: accentHex,
              paddingVertical: 6,
              paddingHorizontal: 12,
            }}
          >
            <MotiView
              key={`${arcadeClass}-name`}
              from={{ translateX: -12, opacity: 0 }}
              animate={{ translateX: 0, opacity: 1 }}
              transition={{ type: 'timing', duration: 200 }}
            >
              <Text
                style={{
                  fontFamily: 'PressStart2P',
                  color: '#000000',
                  fontSize: 18,
                  textAlign: 'center',
                  letterSpacing: 2,
                }}
              >
                {meta.label}
              </Text>
            </MotiView>
            <Text
              style={{
                fontFamily: 'Silkscreen',
                color: '#000000',
                fontSize: 12,
                textAlign: 'center',
                marginTop: 2,
              }}
            >
              {meta.blurb}
            </Text>
          </View>

          {/* ============ PORTRAIT STRIP ============ */}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginTop: 12,
              marginBottom: 16,
              paddingHorizontal: 2,
            }}
          >
            {CLASS_ORDER.map((key, idx) => {
              const selected = idx === classIndex;
              const m = CLASS_META[key];
              const color = ACCENT_HEX[m.accent];
              return (
                <Pressable
                  key={key}
                  onPress={() => setClassIndex(idx)}
                  style={{ width: '19%' }}
                >
                  <View
                    style={{
                      aspectRatio: 1,
                      borderWidth: 3,
                      borderColor: selected ? color : '#4A4A4A',
                      backgroundColor: '#000000',
                      padding: 2,
                      opacity: selected ? 1 : 0.55,
                    }}
                  >
                    <Image
                      source={m.sprite}
                      style={{ flex: 1, width: undefined, height: undefined }}
                      resizeMode="contain"
                    />
                  </View>
                  {selected && (
                    <MotiView
                      from={{ translateY: 0 }}
                      animate={{ translateY: 3 }}
                      transition={{
                        type: 'timing',
                        duration: 350,
                        loop: true,
                        repeatReverse: true,
                      }}
                      style={{
                        position: 'absolute',
                        top: -16,
                        left: 0,
                        right: 0,
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: 'PressStart2P',
                          color: '#FFCC00',
                          fontSize: 12,
                        }}
                      >
                        ▼
                      </Text>
                    </MotiView>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* ============ NAME TAG + READY BUTTON (HUD BAR) ============ */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'stretch',
              borderWidth: 2,
              borderColor: '#FFFFFF',
              backgroundColor: '#000000',
              marginBottom: 12,
            }}
          >
            <View
              style={{
                backgroundColor: '#00DDFF',
                paddingHorizontal: 8,
                paddingVertical: 4,
                justifyContent: 'center',
                borderRightWidth: 2,
                borderRightColor: '#FFFFFF',
              }}
            >
              <Text
                style={{
                  fontFamily: 'PressStart2P',
                  color: '#000000',
                  fontSize: 10,
                }}
              >
                P1
              </Text>
            </View>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="YOUR NAME"
              placeholderTextColor="#4A4A4A"
              autoCapitalize="characters"
              maxLength={12}
              style={{
                flex: 1,
                fontFamily: 'PressStart2P',
                color: '#FFFFFF',
                fontSize: 14,
                paddingHorizontal: 10,
                paddingVertical: 12,
                letterSpacing: 2,
              }}
            />
          </View>

          {mode === 'menu' && (
            <View style={{ marginBottom: 12, flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <PixelButton onPress={() => setMode('create')} color="yellow">
                  HOST
                </PixelButton>
              </View>
              <View style={{ flex: 1 }}>
                <PixelButton onPress={() => setMode('join')} color="cyan">
                  JOIN
                </PixelButton>
              </View>
            </View>
          )}

          {mode === 'create' && (
            <View style={{ marginBottom: 12 }}>
              <Text
                style={{
                  fontFamily: 'Silkscreen',
                  color: '#FFFFFF',
                  fontSize: 12,
                  textAlign: 'center',
                  marginBottom: 10,
                }}
              >
                You'll get a 6-char code to share with P2.
              </Text>
              <MotiView
                from={{ scale: 1 }}
                animate={{ scale: 1.04 }}
                transition={{
                  type: 'timing',
                  duration: 600,
                  loop: true,
                  repeatReverse: true,
                }}
              >
                <PixelButton
                  onPress={createCouple}
                  disabled={busy}
                  color="yellow"
                >
                  {busy ? 'CREATING…' : '► READY ◄'}
                </PixelButton>
              </MotiView>
              <Pressable
                onPress={() => setMode('menu')}
                style={{ marginTop: 10 }}
              >
                <Text
                  style={{
                    fontFamily: 'Silkscreen',
                    color: '#4A4A4A',
                    fontSize: 12,
                    textAlign: 'center',
                  }}
                >
                  ← back
                </Text>
              </Pressable>
            </View>
          )}

          {mode === 'join' && (
            <View style={{ marginBottom: 12 }}>
              <View
                style={{
                  borderWidth: 2,
                  borderColor: '#00DDFF',
                  backgroundColor: '#000000',
                  marginBottom: 10,
                }}
              >
                <TextInput
                  value={currentCode}
                  onChangeText={setJoinCode}
                  placeholder="ABC123"
                  placeholderTextColor="#4A4A4A"
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={6}
                  style={{
                    fontFamily: 'PressStart2P',
                    color: '#FFFFFF',
                    fontSize: 22,
                    textAlign: 'center',
                    paddingVertical: 12,
                    letterSpacing: 6,
                  }}
                />
              </View>
              <PixelButton onPress={joinCouple} disabled={busy} color="cyan">
                {busy ? 'JOINING…' : '► READY ◄'}
              </PixelButton>
              <Pressable
                onPress={() => setMode('menu')}
                style={{ marginTop: 10 }}
              >
                <Text
                  style={{
                    fontFamily: 'Silkscreen',
                    color: '#4A4A4A',
                    fontSize: 12,
                    textAlign: 'center',
                  }}
                >
                  ← back
                </Text>
              </Pressable>
            </View>
          )}

          {error && (
            <MotiView
              from={{ translateX: -4 }}
              animate={{ translateX: 4 }}
              transition={{
                type: 'timing',
                duration: 80,
                loop: true,
                repeatReverse: true,
              }}
            >
              <Text
                style={{
                  fontFamily: 'Silkscreen',
                  color: '#FF3333',
                  fontSize: 12,
                  textAlign: 'center',
                  marginTop: 8,
                }}
              >
                {error}
              </Text>
            </MotiView>
          )}

          <Pressable onPress={signOut} style={{ marginTop: 24, marginBottom: 16 }}>
            <Text
              style={{
                fontFamily: 'Silkscreen',
                color: '#4A4A4A',
                fontSize: 11,
                textAlign: 'center',
              }}
            >
              sign out
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
