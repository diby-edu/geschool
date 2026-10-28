import { describe, it, expect } from 'vitest';
import { dbGrowth, maskIdentifier } from './growth';

const MB = 1024 * 1024;

describe('dbGrowth', () => {
  it('moins de 24 h de recul : pas de projection', () => {
    const g = dbGrowth([{ t: '2026-10-27T22:00:00Z', bytes: 370 * MB }, { t: '2026-10-28T08:00:00Z', bytes: 371 * MB }], 500 * MB);
    expect(g).toEqual({ ready: false, spanHours: 10 });
  });

  it('2 Mo par jour, 130 Mo restants : 65 jours', () => {
    const g = dbGrowth(
      [{ t: '2026-10-20T00:00:00Z', bytes: 356 * MB }, { t: '2026-10-27T00:00:00Z', bytes: 370 * MB }],
      500 * MB,
      new Date('2026-10-27T00:00:00Z'),
    );
    expect(g).toEqual({ ready: true, mbPerDay: 2, daysLeft: 65, reachOn: '2026-12-31' });
  });

  it('une base qui ne grossit pas n’atteint jamais la limite', () => {
    const g = dbGrowth([{ t: '2026-10-20T00:00:00Z', bytes: 370 * MB }, { t: '2026-10-27T00:00:00Z', bytes: 369 * MB }], 500 * MB);
    expect(g).toMatchObject({ ready: true, daysLeft: null, reachOn: null });
  });
});

describe('maskIdentifier', () => {
  it('masque un numéro et un e-mail', () => {
    expect(maskIdentifier('+2250707123412')).toBe('2250 •• •• 12');
    expect(maskIdentifier('konointer@gmail.com')).toBe('k•••@gmail.com');
  });
});
