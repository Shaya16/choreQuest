import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function JackpotScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <ScrollView contentContainerClassName="px-6 py-4">
        <Text className="font-arcade text-yellow text-lg mb-1">JACKPOT</Text>
        <Text className="font-arcadeSmall text-white text-sm mb-6">
          Shared goals fill here.
        </Text>
        <View className="border-2 border-gray p-4">
          <Text className="font-arcadeSmall text-gray text-sm">
            5 default goals auto-seed on pairing.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
