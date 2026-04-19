import { useEffect, useMemo, useState } from 'react';
import {
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
import { router } from 'expo-router';

import { AnimatedSprite } from '@/components/game/AnimatedSprite';
import { Stage } from '@/components/game/Stage';
import { StatBar } from '@/components/ui/StatBar';
import { PixelButton } from '@/components/ui/PixelButton';
import {
  ACCENT_HEX,
  CLASS_META,
  CLASS_ORDER,
  DEFAULT_SHEET_FRAME_H,
  DEFAULT_SHEET_FRAME_W,
} from '@/lib/characters';
import { useSession } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import type { ArcadeClass, Player } from '@/lib/types';

export default function CharacterScreen() {
  const player = useSession((s) => s.player);
  const setPlayer = useSession((s) => s.setPlayer);

  const initialClassIndex = useMemo(() => {
    if (!player) return 0;
    const idx = CLASS_ORDER.indexOf(player.arcade_class);
    return idx >= 0 ? idx : 0;
  }, [player]);

  const [classIndex, setClassIndex] = useState(initialClassIndex);
  const [displayName, setDisplayName] = useState(player?.display_name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const arcadeClass: ArcadeClass = CLASS_ORDER[classIndex]!;
  const meta = CLASS_META[arcadeClass];
  const accentHex = ACCENT_HEX[meta.accent];

  const trimmedName = displayName.trim();
  const dirty =
    !!player &&
    (trimmedName !== player.display_name || arcadeClass !== player.arcade_class);

  function cycle(delta: number) {
    const next = (classIndex + delta + CLASS_ORDER.length) % CLASS_ORDER.length;
    setClassIndex(next);
  }

  async function onConfirm() {
    if (!player || !dirty || busy) return;
    if (!trimmedName) {
      setError('Pick a name.');
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: updateError } = await supabase
      .from('players')
      .update({ display_name: trimmedName, arcade_class: arcadeClass })
      .eq('id', player.id)
      .select('*')
      .single<Player>();
    if (updateError || !data) {
      setBusy(false);
      setError(updateError?.message ?? 'Could not save changes.');
      return;
    }
    setPlayer(data);
    setBusy(false);
    router.back();
  }

  useEffect(() => {
    // Defensive: the modal is only reachable from tabs, which requires a
    // paired player. If somehow we land here without one, dismiss.
    if (!player) router.back();
  }, [player]);

  if (!player) {
    return <SafeAreaView className="flex-1 bg-bg" />;
  }

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
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
              ◆ CHARACTER SELECT ◆
            </Text>
            <Pressable
              onPress={() => {
                if (busy) return;
                router.back();
              }}
              disabled={busy}
              style={{
                backgroundColor: '#000000',
                borderWidth: 2,
                borderColor: '#000000',
                paddingHorizontal: 10,
                paddingVertical: 4,
                opacity: busy ? 0.5 : 1,
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

          <View style={{ paddingHorizontal: 8, paddingTop: 8 }}>
            <Stage accentHex={accentHex} height={420}>
              {/* Left / right cursor arrows */}
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

              {/* Stats panel */}
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

              {/* P1 flag */}
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

              {/* Sprite + shadow */}
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
                <MotiView
                  key={`${arcadeClass}-hero-entry`}
                  from={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'timing', duration: 250 }}
                  style={{ marginBottom: 14 }}
                >
                  <MotiView
                    from={{ translateY: 0 }}
                    animate={{ translateY: -8 }}
                    transition={{
                      type: 'timing',
                      duration: 900,
                      loop: true,
                      repeatReverse: true,
                    }}
                  >
                    {meta.idleSheet ? (
                      <AnimatedSprite
                        sheet={meta.idleSheet.source}
                        frameCount={meta.idleSheet.frames}
                        sourceFrameWidth={meta.idleSheet.frameW ?? DEFAULT_SHEET_FRAME_W}
                        sourceFrameHeight={meta.idleSheet.frameH ?? DEFAULT_SHEET_FRAME_H}
                        displayWidth={220}
                        frameDurationMs={meta.idleSheet.durationMs ?? 220}
                      />
                    ) : meta.walkSheet ? (
                      <AnimatedSprite
                        sheet={meta.walkSheet.source}
                        frameCount={meta.walkSheet.frames}
                        sourceFrameWidth={meta.walkSheet.frameW ?? DEFAULT_SHEET_FRAME_W}
                        sourceFrameHeight={meta.walkSheet.frameH ?? DEFAULT_SHEET_FRAME_H}
                        displayWidth={220}
                        frameDurationMs={meta.walkSheet.durationMs ?? 120}
                      />
                    ) : (
                      <Image
                        source={meta.sprite}
                        style={{ width: 220, height: 220 }}
                        resizeMode="contain"
                      />
                    )}
                  </MotiView>
                </MotiView>
              </View>
            </Stage>
          </View>

          <View style={{ paddingHorizontal: 8 }}>
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
          </View>

          <View style={{ paddingHorizontal: 8, marginTop: 14 }}>
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color: '#00DDFF',
                fontSize: 10,
                letterSpacing: 2,
                marginBottom: 6,
              }}
            >
              FIGHTER NAME
            </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'stretch',
                borderWidth: 2,
                borderColor: '#FFFFFF',
                backgroundColor: '#000000',
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
                editable={!busy}
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
          </View>

          <View style={{ paddingHorizontal: 8, marginTop: 16 }}>
            <PixelButton
              onPress={onConfirm}
              color="yellow"
              disabled={!dirty || busy}
            >
              {busy ? 'SAVING…' : dirty ? 'CONFIRM' : 'NO CHANGES'}
            </PixelButton>
            {error && (
              <Text
                style={{
                  fontFamily: 'Silkscreen',
                  color: '#FF3333',
                  fontSize: 11,
                  marginTop: 8,
                  textAlign: 'center',
                }}
              >
                {error}
              </Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
