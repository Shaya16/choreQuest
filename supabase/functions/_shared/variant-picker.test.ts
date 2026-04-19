import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { pickVariant } from './variant-picker.ts';

const pool = ['A', 'B', 'C', 'D'];

Deno.test('pickVariant never picks the last-used index', () => {
  for (let i = 0; i < 100; i++) {
    const result = pickVariant(pool, 2, {}, () => Math.random());
    assertNotEquals(result.index, 2, 'must exclude lastIndex');
  }
});

Deno.test('pickVariant falls through when lastIndex is null', () => {
  const seen = new Set<number>();
  for (let i = 0; i < 200; i++) {
    const result = pickVariant(pool, null, {}, () => Math.random());
    seen.add(result.index);
  }
  assertEquals(seen.size, pool.length, 'all indices reachable when no exclusion');
});

Deno.test('pickVariant is deterministic with a seeded rand', () => {
  const resultFirst = pickVariant(pool, 0, { x: 1 }, () => 0);
  assertEquals(resultFirst.index, 1, 'first candidate when lastIndex=0 is index 1');
  const resultLast = pickVariant(pool, 3, { x: 1 }, () => 0.999);
  assertEquals(resultLast.index, 2, 'last candidate when lastIndex=3 is index 2');
});

Deno.test('pickVariant interpolates template variables', () => {
  const result = pickVariant(
    ['hello {{who}}, score {{n}}'],
    null,
    { who: 'kessy', n: 42 },
    () => 0
  );
  assertEquals(result.text, 'hello kessy, score 42');
});

Deno.test('pickVariant handles single-variant pools', () => {
  const result = pickVariant(['only option'], 0, {}, () => 0);
  assertEquals(result.index, 0);
  assertEquals(result.text, 'only option');
});
