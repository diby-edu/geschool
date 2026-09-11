import { describe, it, expect } from 'vitest';
import { evaluateLoad } from './load';

describe('evaluateLoad', () => {
  it('laisse passer quand la machine est au repos', () => {
    const d = evaluateLoad(1.2, 180, { load: 0.3, cores: 1 });
    expect(d.defer).toBe(false);
    expect(d.perCore).toBeCloseTo(0.3);
  });

  it('differe quand la charge atteint le seuil', () => {
    const d = evaluateLoad(1.2, 180, { load: 1.5, cores: 1 });
    expect(d.defer).toBe(true);
    if (d.defer) expect(d.retryAfterSeconds).toBe(180);
  });

  it('differe exactement au seuil, pas seulement au-dela', () => {
    expect(evaluateLoad(1.2, 180, { load: 1.2, cores: 1 }).defer).toBe(true);
  });

  it('rapporte la charge au coeur, pas la charge brute', () => {
    // 2.0 sur 4 coeurs = 0.5 par coeur : la machine n'est pas saturee
    const d = evaluateLoad(1.2, 180, { load: 2.0, cores: 4 });
    expect(d.defer).toBe(false);
    expect(d.perCore).toBeCloseTo(0.5);
  });

  it('ne differe jamais quand le garde-fou est desactive', () => {
    expect(evaluateLoad(0, 180, { load: 9.9, cores: 1 }).defer).toBe(false);
  });

  it("ne differe pas quand l'OS ne fournit pas la charge (Windows renvoie 0)", () => {
    expect(evaluateLoad(1.2, 180, { load: 0, cores: 1 }).defer).toBe(false);
  });
});
