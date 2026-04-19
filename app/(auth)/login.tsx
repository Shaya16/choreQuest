import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

type Step = 'email' | 'code';

export default function LoginScreen() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes('@')) {
      setError('Enter a valid email.');
      return;
    }
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: true },
    });
    setBusy(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    setStep('code');
  }

  async function verifyCode() {
    setError(null);
    const trimmedCode = code.trim();
    if (trimmedCode.length < 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setBusy(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: trimmedCode,
      type: 'email',
    });
    setBusy(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    // Root layout's auth listener redirects to pair or tabs.
  }

  return (
    <SafeAreaView className="flex-1 bg-bg">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <View className="flex-1 px-6 justify-center">
          <Text className="font-arcade text-yellow text-xl mb-2">CHORE QUEST</Text>
          <Text className="font-arcadeSmall text-white text-sm mb-10">
            {step === 'email' ? 'Enter your email to begin.' : `Code sent to ${email}.`}
          </Text>

          {step === 'email' ? (
            <>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@email.com"
                placeholderTextColor="#4A4A4A"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                className="border-2 border-white text-white font-arcadeSmall text-base px-3 py-3 mb-4"
              />
              <Pressable
                onPress={sendCode}
                disabled={busy}
                className="bg-yellow border-2 border-white px-4 py-3"
              >
                <Text className="font-arcade text-bg text-xs text-center">
                  {busy ? 'SENDING…' : 'SEND CODE'}
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="12345678"
                placeholderTextColor="#4A4A4A"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="number-pad"
                maxLength={8}
                className="border-2 border-white text-white font-arcade text-2xl text-center px-3 py-3 mb-4 tracking-widest"
              />
              <Pressable
                onPress={verifyCode}
                disabled={busy}
                className="bg-cyan border-2 border-white px-4 py-3 mb-3"
              >
                <Text className="font-arcade text-bg text-xs text-center">
                  {busy ? 'VERIFYING…' : 'VERIFY'}
                </Text>
              </Pressable>
              <Pressable onPress={() => setStep('email')}>
                <Text className="font-arcadeSmall text-gray text-sm text-center">
                  ← use different email
                </Text>
              </Pressable>
            </>
          )}

          {error && (
            <Text className="font-arcadeSmall text-red text-sm mt-4 text-center">
              {error}
            </Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
