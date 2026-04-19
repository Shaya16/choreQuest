// =============================================================================
// Thin wrapper over Expo's push service. Handles the Expo response envelope
// and surfaces DeviceNotRegistered so callers can clear the dead token.
// Docs: https://docs.expo.dev/push-notifications/sending-notifications/
// =============================================================================

export type ExpoPushMessage = {
  to: string;
  title?: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  priority?: 'default' | 'normal' | 'high';
};

export type ExpoPushSendResult =
  | { ok: true }
  | { ok: false; deviceNotRegistered: boolean; error: string };

export async function sendPush(
  message: ExpoPushMessage
): Promise<ExpoPushSendResult> {
  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...message, sound: message.sound ?? 'default' }),
  });
  if (!response.ok) {
    const text = await response.text();
    return { ok: false, deviceNotRegistered: false, error: `HTTP ${response.status}: ${text}` };
  }
  const payload = await response.json();
  // Expo wraps single-message responses in { data: { status, details?: { error? } } }
  const data = payload?.data;
  if (data?.status === 'ok') return { ok: true };
  const errorCode = data?.details?.error ?? 'unknown';
  const errorMsg = data?.message ?? 'unknown error';
  return {
    ok: false,
    deviceNotRegistered: errorCode === 'DeviceNotRegistered',
    error: `${errorCode}: ${errorMsg}`,
  };
}
