import { describe, expect, it } from 'vitest';
import { createSeedRandom, inBatches, seedId } from './seed-helpers.js';

describe('seedId', () => {
  it('gives the same valid UUID for the same parts, and another for different parts', () => {
    const id = seedId('project', 'demo', 1);
    expect(id).toBe(seedId('project', 'demo', 1));
    expect(id).not.toBe(seedId('project', 'demo', 2));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('createSeedRandom', () => {
  it('repeats for the same seed and differs for another', () => {
    const run = (seed: string) => {
      const random = createSeedRandom(seed);
      return [random.next(), random.int(1, 1000), random.float(5, 6)];
    };
    expect(run('a')).toEqual(run('a'));
    expect(run('a')).not.toEqual(run('b'));
  });

  it('stays inside the limits, with both ends of int reachable', () => {
    const random = createSeedRandom('limits');
    const seen = new Set(Array.from({ length: 500 }, () => random.int(1, 3)));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('sample gives different items and no more than exist', () => {
    const random = createSeedRandom('sample');
    const chosen = random.sample(['a', 'b', 'c', 'd'], 3);
    expect(new Set(chosen).size).toBe(3);
    expect(random.sample(['a'], 5)).toEqual(['a']);
  });
});

describe('inBatches', () => {
  it('splits a list without losing an item', () => {
    expect([...inBatches([1, 2, 3, 4, 5], 2)]).toEqual([[1, 2], [3, 4], [5]]);
    expect([...inBatches([], 2)]).toEqual([]);
  });
});
