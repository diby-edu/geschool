import { describe, it, expect } from 'vitest';

/**
 * Règles de la liste des classes, isolées du reste : le tri et les filtres
 * décident de ce que l'écran montre, et ils doivent rester prévisibles.
 */
type Row = { id: string; code: string; levelSeq: number; track: string; enrolled: number; capacity: number };

const byLevelThenCode = (a: Row, b: Row) => a.levelSeq - b.levelSeq || a.code.localeCompare(b.code, 'fr', { numeric: true });

describe('tri des classes', () => {
  const rows: Row[] = [
    { id: '1', code: '6EME 10', levelSeq: 1, track: 'GENERAL', enrolled: 12, capacity: 40 },
    { id: '2', code: '6EME 2', levelSeq: 1, track: 'GENERAL', enrolled: 40, capacity: 40 },
    { id: '3', code: '1ERE A1 1', levelSeq: 5, track: 'GENERAL', enrolled: 0, capacity: 40 },
  ];

  it('les codes numérotés se suivent dans l’ordre humain', () => {
    expect([...rows].sort(byLevelThenCode).map((r) => r.code)).toEqual(['6EME 2', '6EME 10', '1ERE A1 1']);
  });

  it('le tri par niveau suit l’ordre pédagogique, pas l’alphabet', () => {
    const sorted = [...rows].sort(byLevelThenCode);
    expect(sorted[0]!.levelSeq).toBeLessThanOrEqual(sorted[2]!.levelSeq);
  });

  it('le remplissage se calcule sans division par zéro', () => {
    const pct = (r: Row) => (r.capacity > 0 ? Math.round((r.enrolled / r.capacity) * 100) : 0);
    expect(pct(rows[1]!)).toBe(100);
    expect(pct({ ...rows[2]!, capacity: 0 })).toBe(0);
  });
});
