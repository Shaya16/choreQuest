import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ShopScreen() {
  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <ScrollView contentContainerClassName="px-6 py-4">
        <Text className="font-arcade text-yellow text-lg mb-1">SHOP</Text>
        <Text className="font-arcadeSmall text-white text-sm mb-6">
          Spend personal coins on treats.
        </Text>
        <View className="border-2 border-gray p-4">
          <Text className="font-arcadeSmall text-gray text-sm">
            Shop grid lights up in Phase 1.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
