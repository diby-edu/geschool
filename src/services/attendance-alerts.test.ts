import { describe, expect, it } from 'vitest';

/**
 * Le comptage des absences, isolé de la base.
 *
 * La règle vaut d'être tenue : une absence est justifiée si l'appel la marque
 * EXCUSED, OU si une justification approuvée couvre sa date. Ne retenir que la
 * première ferait convoquer une famille qui a pourtant fourni un certificat.
 */

type Absence = { studentId: string; date: string; excused: boolean };
type Couverture = { from: string; to: string };

/** La même règle que dans le service, extraite pour être éprouvée. */
function compter(
  absences: Absence[],
  couvertures: Map<string, Couverture[]>,
): Map<string, { total: number; unjustified: number }> {
  const out = new Map<string, { total: number; unjustified: number }>();
  for (const a of absences) {
    const c = out.get(a.studentId) ?? { total: 0, unjustified: 0 };
    c.total += 1;
    const couverte =
      a.excused || (couvertures.get(a.studentId) ?? []).some((p) => a.date >= p.from && a.date <= p.to);
    if (!couverte) c.unjustified += 1;
    out.set(a.studentId, c);
  }
  return out;
}

const vide = new Map<string, Couverture[]>();

describe('comptage des absences', () => {
  it('compte chaque séance manquée', () => {
    const r = compter(
      [
        { studentId: 'a', date: '2026-10-01', excused: false },
        { studentId: 'a', date: '2026-10-02', excused: false },
      ],
      vide,
    );
    expect(r.get('a')).toEqual({ total: 2, unjustified: 2 });
  });

  it('ne compte pas comme non justifiée une absence marquée EXCUSED à l’appel', () => {
    const r = compter(
      [
        { studentId: 'a', date: '2026-10-01', excused: true },
        { studentId: 'a', date: '2026-10-02', excused: false },
      ],
      vide,
    );
    expect(r.get('a')).toEqual({ total: 2, unjustified: 1 });
  });

  it('justifie après coup une absence couverte par un certificat approuvé', () => {
    const couvertures = new Map([['a', [{ from: '2026-10-01', to: '2026-10-03' }]]]);
    const r = compter(
      [
        { studentId: 'a', date: '2026-10-02', excused: false },
        { studentId: 'a', date: '2026-10-05', excused: false },
      ],
      couvertures,
    );
    // Deux absences, une seule hors de la plage couverte.
    expect(r.get('a')).toEqual({ total: 2, unjustified: 1 });
  });

  it('respecte les bornes du certificat, jour inclus', () => {
    const couvertures = new Map([['a', [{ from: '2026-10-01', to: '2026-10-03' }]]]);
    const r = compter(
      [
        { studentId: 'a', date: '2026-10-01', excused: false },
        { studentId: 'a', date: '2026-10-03', excused: false },
        { studentId: 'a', date: '2026-10-04', excused: false },
      ],
      couvertures,
    );
    expect(r.get('a')).toEqual({ total: 3, unjustified: 1 });
  });

  it('ne mélange pas les élèves', () => {
    const couvertures = new Map([['a', [{ from: '2026-10-01', to: '2026-10-31' }]]]);
    const r = compter(
      [
        { studentId: 'a', date: '2026-10-02', excused: false },
        { studentId: 'b', date: '2026-10-02', excused: false },
      ],
      couvertures,
    );
    expect(r.get('a')).toEqual({ total: 1, unjustified: 0 });
    expect(r.get('b')).toEqual({ total: 1, unjustified: 1 });
  });
});

describe('franchissement des seuils', () => {
  const franchi = (heures: number, seuil: number) => seuil > 0 && heures >= seuil;

  it('déclenche à partir du seuil, pas au-dessus', () => {
    expect(franchi(5, 6)).toBe(false);
    expect(franchi(6, 6)).toBe(true);
    expect(franchi(7, 6)).toBe(true);
  });

  it('un seuil à zéro ne déclenche jamais', () => {
    expect(franchi(100, 0)).toBe(false);
  });
});
