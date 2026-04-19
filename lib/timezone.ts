import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { format, startOfWeek, endOfWeek, addDays } from 'date-fns';

// Israel timezone per the builder's locale. Change here if needed.
export const PRIMARY_TZ = 'Asia/Jerusalem';

export function todayInPrimaryTz(): string {
  return formatInTimeZone(new Date(), PRIMARY_TZ, 'yyyy-MM-dd');
}

// Rounds run Sunday → Saturday. `weekStartsOn: 0` = Sunday.
export function currentRoundBounds(now: Date = new Date()): {
  start: string;
  end: string;
} {
  const zoned = toZonedTime(now, PRIMARY_TZ);
  const start = startOfWeek(zoned, { weekStartsOn: 0 });
  const end = endOfWeek(zoned, { weekStartsOn: 0 });
  return {
    start: format(start, 'yyyy-MM-dd'),
    end: format(end, 'yyyy-MM-dd'),
  };
}

export function nextRoundStart(now: Date = new Date()): string {
  const zoned = toZonedTime(now, PRIMARY_TZ);
  const nextSunday = addDays(startOfWeek(zoned, { weekStartsOn: 0 }), 7);
  return format(nextSunday, 'yyyy-MM-dd');
}
