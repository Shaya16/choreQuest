import { Text, View } from 'react-native';
import { MotiView } from 'moti';

type Props = {
  message: string | null; // null = hidden
};

/**
 * Transient flash for "you tapped a locked catalog card" feedback. Parent
 * controls visibility via the message prop (null = hidden). Auto-dismiss
 * is the parent's job — see useTransientMessage in the Shop screen.
 *
 * Renders absolutely positioned. Parent wraps it in a relatively-positioned
 * container (the WalletHUD area) so the toast overlays without shoving
 * layout down.
 */
export function AffordabilityToast({ message }: Props) {
  if (!message) return null;
  return (
    <MotiView
      key={message} // force re-mount on each new message so animation replays
      from={{ opacity: 0, translateY: -8 }}
      animate={{ opacity: 1, translateY: 0 }}
      exit={{ opacity: 0, translateY: -8 }}
      transition={{ type: 'timing', duration: 200 }}
      style={{
        position: 'absolute',
        top: 8,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 10,
      }}
    >
      <View
        style={{
          backgroundColor: '#FF3333',
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderWidth: 2,
          borderColor: '#000',
        }}
      >
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#000',
            fontSize: 9,
            letterSpacing: 1,
          }}
        >
          {message}
        </Text>
      </View>
    </MotiView>
  );
}
