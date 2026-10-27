import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ACTION_LABELS } from './labels';
import { ACTIVITY_LABELS } from '@/lib/audit/labels';

/**
 * Toute action écrite au journal a un libellé lisible. Le 2026-10-25, 90 actions
 * s'affichaient en code brut (« reports · reports.matrix_view ») dans le Journal
 * et l'activité récente du tableau de bord.
 */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('Libellés du journal', () => {
  it('chaque action écrite au journal a un libellé', () => {
    const root = join(__dirname, '..', '..');
    const actions = new Set<string>();
    for (const file of sources(root)) {
      // Toute la ligne de « action: » : un nom choisi par une condition (« enabled ? 'x.on' : 'x.off' ») compte aussi.
      for (const line of readFileSync(file, 'utf8').matchAll(/action: ([^\n]+)/g)) {
        for (const m of line[1]!.matchAll(/['`]([a-z_]+\.[a-z_.]+)['`]/g)) actions.add(m[1]!);
      }
    }
    expect(actions.size).toBeGreaterThan(100);
    const missing = [...actions].filter((a) => !(a in ACTION_LABELS) && !(a in ACTIVITY_LABELS)).sort();
    expect(missing).toEqual([]);
  });
});
