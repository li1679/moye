import { test, expect } from '@playwright/test';
import { planReadBatches, commitInBatches, READ_LIMITS, type Row, type Storage } from '../app/data/storage';

test('planReadBatches 的边界情况', () => {
  // 总数正好 1 000 000 时仍为一批
  // 总数正好 1 000 000 时仍为一批
  const exact = planReadBatches([
    { id: 'a', size: 300_000 }, { id: 'b', size: 300_000 }, { id: 'c', size: 300_000 }, { id: 'd', size: 100_000 },
  ]);
  expect(exact.batches).toEqual([['a', 'b', 'c', 'd']]);
  expect(exact.large).toEqual([]);
  // 501 个小行分成两批
  const many = planReadBatches(Array.from({ length: 501 }, (_, index) => ({ id: 'row' + index, size: 10 })));
  expect(many.batches).toHaveLength(2);
  expect(many.batches[0]).toHaveLength(500);
  expect(many.batches[1]).toEqual(['row500']);
  // 一个 500 000 字符的行进入 large
  const large = planReadBatches([{ id: 'big', size: 500_000 }, { id: 'small', size: 100 }]);
  expect(large.large).toEqual([{ id: 'big', size: 500_000 }]);
  expect(large.batches).toEqual([['small']]);
  // 空表时 batches 和 large 都为空
  expect(planReadBatches([])).toEqual({ batches: [], large: [] });
});

test('commitInBatches 把 schema 行和 deletes 留到最后一批', async () => {
  const calls: { upserts: Row[]; deletes: string[] }[] = [];
  const fake: Storage = {
    async read() { return new Map(); },
    async commit(upserts, deletes) { calls.push({ upserts, deletes }); },
  };
  const upserts: Row[] = [
    { id: 'chapter:a', value: 'x'.repeat(400_000) },
    { id: 'chapter:b', value: 'y'.repeat(400_000) },
    { id: 'chapter:c', value: 'z'.repeat(400_000) },
    { id: 'schema', value: '3' },
  ];
  const deletes = ['recovery', 'orphan:1'];
  await commitInBatches(fake, upserts, deletes);
  expect(calls.length).toBeGreaterThan(1);
  for (const call of calls) {
    expect(call.upserts.reduce((sum, row) => sum + row.value.length, 0)).toBeLessThanOrEqual(1_000_000);
  }
  expect(calls.at(-1)!.deletes).toEqual(deletes);
  expect(calls.at(-1)!.upserts.at(-1)).toEqual({ id: 'schema', value: '3' });
  for (const call of calls.slice(0, -1)) expect(call.deletes).toEqual([]);
  expect(calls.flatMap(call => call.upserts.map(row => row.id))).toEqual(['chapter:a', 'chapter:b', 'chapter:c', 'schema']);
});

test('READ_LIMITS 与方案一致', () => {
  expect(READ_LIMITS).toEqual({ maxChars: 1_000_000, maxIds: 500, largeRow: 400_000 });
});
