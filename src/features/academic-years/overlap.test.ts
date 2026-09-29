import { describe, it, expect } from 'vitest';
import { findOverlap } from './overlap';

const t1 = { id: '1', name: '1er trimestre', starts_on: '2026-09-14', ends_on: '2026-12-04' };
const t2 = { id: '2', name: '2e trimestre', starts_on: '2026-12-07', ends_on: '2027-03-12' };
const periods = [t1, t2];

describe('findOverlap', () => {
  it('refuse un trimestre qui empiète sur un autre', () => {
    expect(findOverlap(periods, '2026-12-01', '2027-01-15', null)).toBe(t1);
    expect(findOverlap(periods, '2027-03-12', '2027-06-11', null)).toBe(t2);
  });

  it('accepte des trimestres qui se suivent', () => {
    expect(findOverlap(periods, '2027-03-15', '2027-06-11', null)).toBeNull();
  });

  it('ignore la période qu’on modifie elle-même', () => {
    expect(findOverlap(periods, '2026-09-01', '2026-12-05', '1')).toBeNull();
    expect(findOverlap(periods, '2026-09-01', '2026-12-08', '1')).toBe(t2);
  });
});
