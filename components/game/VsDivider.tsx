import { Text, View } from 'react-native';
import { MotiView } from 'moti';

type Props = {
  margin: number; // p1 - p2
  leader: 'p1' | 'p2' | 'tied';
  countdownLabel: string;
  roundNumber: number;
};

export function VsDivider({ margin, leader, countdownLabel, roundNumber }: Props) {
  const absMargin = Math.abs(margin);
  const marginColor =
    leader === 'tied' ? '#FFFFFF' : leader === 'p1' ? '#FFCC00' : '#FF3333';

  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingHorizontal: 2,
        paddingTop: 6,
      }}
    >
      <Text
        style={{
          fontFamily: 'PressStart2P',
          color: '#FFFFFF',
          fontSize: 14,
          marginBottom: 6,
        }}
      >
        R{roundNumber}
      </Text>

      <MotiView
        from={{ scale: 0.9 }}
        animate={{ scale: 1.08 }}
        transition={{
          type: 'timing',
          duration: 800,
          loop: true,
          repeatReverse: true,
        }}
      >
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#FFCC00',
            fontSize: 56,
            lineHeight: 60,
            textShadowColor: '#FF3333',
            textShadowOffset: { width: 3, height: 3 },
            textShadowRadius: 0,
            marginBottom: 10,
          }}
        >
          VS
        </Text>
      </MotiView>

      <Text
        style={{
          fontFamily: 'PressStart2P',
          color: marginColor,
          fontSize: 18,
          marginBottom: 3,
        }}
      >
        {leader === 'tied' ? 'TIED' : `+${absMargin}`}
      </Text>
      <Text
        style={{
          fontFamily: 'Silkscreen',
          color: '#4A4A4A',
          fontSize: 12,
          letterSpacing: 1,
        }}
      >
        MARGIN
      </Text>

      <View
        style={{
          marginTop: 18,
          backgroundColor: '#000000',
          borderWidth: 2,
          borderColor: '#00DDFF',
          paddingHorizontal: 4,
          paddingVertical: 4,
          alignItems: 'center',
        }}
      >
        <Text
          style={{
            fontFamily: 'Silkscreen',
            color: '#00DDFF',
            fontSize: 9,
          }}
        >
          ENDS IN
        </Text>
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#FFFFFF',
            fontSize: 11,
            marginTop: 2,
          }}
        >
          {countdownLabel}
        </Text>
      </View>
    </View>
  );
}
