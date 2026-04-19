import { Stack } from 'expo-router';

/**
 * This file used to render a bottom tab bar. We dropped tabs — Home is the
 * only permanent screen. Shop/Jackpot are pushed from the Control Panel;
 * Menu (history + settings) is a modal presented from the arena menu button.
 *
 * Kept as a route group so `/(tabs)/...` paths the rest of the codebase
 * already uses continue to resolve.
 */
export default function TabsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#000000' },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="shop" />
      <Stack.Screen name="jackpot" />
      <Stack.Screen
        name="menu"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="character"
        options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
      />
    </Stack>
  );
}
