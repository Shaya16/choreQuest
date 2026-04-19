import { assertEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { isQuietHours, jerusalemHourAt } from './quiet-hours.ts';

Deno.test('jerusalemHourAt returns the local Jerusalem hour from a UTC Date', () => {
  // 2026-04-19 UTC is summer time (IDT = UTC+3).
  // 10:00 UTC → 13:00 Jerusalem
  const d = new Date('2026-04-19T10:00:00Z');
  assertEquals(jerusalemHourAt(d), 13);
});

Deno.test('isQuietHours true between 22:00 and 07:00 Jerusalem', () => {
  // 23:00 Jerusalem = 20:00 UTC in summer
  assertEquals(isQuietHours(new Date('2026-04-19T20:00:00Z')), true);
  // 03:00 Jerusalem = 00:00 UTC in summer
  assertEquals(isQuietHours(new Date('2026-04-19T00:00:00Z')), true);
  // 07:00 Jerusalem = 04:00 UTC in summer (boundary — quiet ends at 07:00)
  assertEquals(isQuietHours(new Date('2026-04-19T04:00:00Z')), false);
});

Deno.test('isQuietHours false during daytime Jerusalem hours', () => {
  // 15:00 Jerusalem = 12:00 UTC in summer
  assertEquals(isQuietHours(new Date('2026-04-19T12:00:00Z')), false);
  // 19:00 Jerusalem = 16:00 UTC in summer
  assertEquals(isQuietHours(new Date('2026-04-19T16:00:00Z')), false);
});

Deno.test('isQuietHours boundary at 22:00 Jerusalem is quiet', () => {
  // 22:00 Jerusalem = 19:00 UTC in summer
  assertEquals(isQuietHours(new Date('2026-04-19T19:00:00Z')), true);
});
