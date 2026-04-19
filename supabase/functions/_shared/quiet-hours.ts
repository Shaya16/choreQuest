/**
 * Quiet hours for push notifications: 22:00 to 07:00 Asia/Jerusalem.
 * DST-safe via Intl.DateTimeFormat with the IANA zone.
 */
export const PRIMARY_TZ = 'Asia/Jerusalem';

/** Returns the hour-of-day (0-23) in Jerusalem for a given UTC instant. */
export function jerusalemHourAt(now: Date = new Date()): number {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: PRIMARY_TZ,
    hour: 'numeric',
    hour12: false,
  }).format(now);
  // en-US with hour12:false renders "00" through "23".
  const hour = Number(formatted);
  return hour === 24 ? 0 : hour;
}

/** True if the given UTC instant falls inside 22:00–07:00 Jerusalem quiet hours. */
export function isQuietHours(now: Date = new Date()): boolean {
  const hour = jerusalemHourAt(now);
  return hour >= 22 || hour < 7;
}
