import { Text, View } from 'react-native';

type Props = {
  label: string;
  color: string;
  fontSize?: number; // default 10
};

/**
 * Chunky colored chip used as a section header throughout the Shop screen.
 * The accent color encodes the section's role (lime = your stuff, red =
 * urgent, shadow-gray = ambient, category color = catalog subsection).
 */
export function SectionBanner({ label, color, fontSize = 10 }: Props) {
  return (
    <View
      style={{
        backgroundColor: color,
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginBottom: 8,
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={{
          fontFamily: 'PressStart2P',
          color: '#000',
          fontSize,
          letterSpacing: 1,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
