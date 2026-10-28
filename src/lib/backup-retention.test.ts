import { describe, it, expect } from 'vitest';
import { backupsToKeep } from './backup-retention';

/** Une copie par nuit, à 2 h, du `from` au `to` inclus. */
function nightly(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(`${from}T02:00:00Z`); d <= new Date(`${to}T02:00:00Z`); d = new Date(d.getTime() + 86_400_000)) {
    const s = d.toISOString();
    out.push(`geschool-${s.slice(0, 4)}${s.slice(5, 7)}${s.slice(8, 10)}-0200.dump`);
  }
  return out;
}

describe('backupsToKeep', () => {
  it('moins de 7 copies : tout est gardé', () => {
    const names = nightly('2026-10-25', '2026-10-28');
    expect(backupsToKeep(names).size).toBe(4);
  });

  it('un an de copies quotidiennes : 7 + semaines + mois, jamais plus de 17', () => {
    const names = nightly('2025-10-28', '2026-10-28');
    const keep = backupsToKeep(names);
    expect(keep.size).toBeLessThanOrEqual(17);
    // les 7 dernières nuits
    for (const n of nightly('2026-10-22', '2026-10-28')) expect(keep.has(n)).toBe(true);
    // la plus récente de mai 2026 (dernier jour du mois), mais plus celles d'il y a un an
    expect(keep.has('geschool-20260531-0200.dump')).toBe(true);
    expect(keep.has('geschool-20251115-0200.dump')).toBe(false);
  });

  it('un fichier au nom inconnu n’est jamais effacé', () => {
    const keep = backupsToKeep([...nightly('2026-01-01', '2026-10-28'), 'geschool-copie-manuelle.dump']);
    expect(keep.has('geschool-copie-manuelle.dump')).toBe(true);
  });
});
