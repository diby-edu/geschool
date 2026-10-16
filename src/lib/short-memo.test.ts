import { describe, expect, it, vi } from 'vitest';
import { createShortMemo } from './short-memo';

describe('createShortMemo', () => {
  it('rend le même résultat pendant la durée, sans recalculer', async () => {
    let t = 0;
    const memo = createShortMemo<number>(1000, () => t);
    const compute = vi.fn(async () => 42);
    expect(await memo('a', compute)).toBe(42);
    t = 999;
    expect(await memo('a', compute)).toBe(42);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('recalcule une fois la durée passée', async () => {
    let t = 0;
    const memo = createShortMemo<number>(1000, () => t);
    let n = 0;
    await memo('a', async () => ++n);
    t = 1000;
    expect(await memo('a', async () => ++n)).toBe(2);
  });

  it('deux demandes simultanées : un seul calcul', async () => {
    const memo = createShortMemo<number>(1000, () => 0);
    const compute = vi.fn(() => new Promise<number>((r) => setTimeout(() => r(7), 5)));
    const [a, b] = await Promise.all([memo('a', compute), memo('a', compute)]);
    expect([a, b]).toEqual([7, 7]);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it('les clés sont séparées (un utilisateur ne reçoit pas le résultat d’un autre)', async () => {
    const memo = createShortMemo<string>(1000, () => 0);
    expect(await memo('u1', async () => 'un')).toBe('un');
    expect(await memo('u2', async () => 'deux')).toBe('deux');
  });

  it('une erreur n’est jamais gardée', async () => {
    const memo = createShortMemo<number>(1000, () => 0);
    await expect(memo('a', async () => Promise.reject(new Error('lent')))).rejects.toThrow('lent');
    expect(await memo('a', async () => 5)).toBe(5);
  });
});
