import { Stack } from 'expo-router';

export default function RoundLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#000' },
        // Force non-dismissible — this screen is the round-over modal flow.
        gestureEnabled: false,
      }}
    >
      <Stack.Screen name="over" />
    </Stack>
  );
}
