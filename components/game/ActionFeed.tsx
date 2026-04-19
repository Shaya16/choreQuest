import { Text, View } from 'react-native';
import type { Log, Player } from '@/lib/types';

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

type Props = {
  logs: Log[];
  p1: Player | null;
  p2: Player | null;
};

export function ActionFeed({ logs, p1, p2 }: Props) {
  if (logs.length === 0) {
    return (
      <View
        style={{
          padding: 10,
          borderWidth: 2,
          borderColor: '#4A4A4A',
          backgroundColor: '#000000',
        }}
      >
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#4A4A4A',
            fontSize: 10,
            textAlign: 'center',
          }}
        >
          NO ACTIONS YET — HIT LOG TO STRIKE
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        borderWidth: 2,
        borderColor: '#FFFFFF',
        backgroundColor: '#000000',
      }}
    >
      <View
        style={{
          backgroundColor: '#FFCC00',
          paddingHorizontal: 8,
          paddingVertical: 4,
        }}
      >
        <Text
          style={{
            fontFamily: 'PressStart2P',
            color: '#000000',
            fontSize: 10,
          }}
        >
          ★ ACTION FEED ★
        </Text>
      </View>
      {logs.slice(0, 5).map((log, i) => {
        const isP1 = log.player_id === p1?.id;
        const isP2 = log.player_id === p2?.id;
        const label = isP1 ? 'P1' : isP2 ? 'P2' : '??';
        const color = isP1 ? '#FFCC00' : isP2 ? '#FF3333' : '#4A4A4A';
        return (
          <View
            key={log.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: '#4A4A4A',
            }}
          >
            <Text
              style={{
                fontFamily: 'PressStart2P',
                color,
                fontSize: 10,
                width: 32,
              }}
            >
              {label}
            </Text>
            <Text
              style={{
                fontFamily: 'Silkscreen',
                color: '#FFFFFF',
                fontSize: 12,
                flex: 1,
              }}
            >
              +{log.coins_earned} · ×{log.crit_multiplier?.toFixed(1) ?? '1.0'}
            </Text>
            <Text
              style={{
                fontFamily: 'Silkscreen',
                color: '#4A4A4A',
                fontSize: 11,
              }}
            >
              {timeAgo(log.logged_at)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
