import { describe, expect, it } from 'vitest';
import {
  callWasMade,
  cleanReasons,
  DEFAULT_GAP_REASONS,
  MAX_WINDOW_DAYS,
  reasonLabel,
  reasonsProblem,
  slugReason,
  summarizeByTeacher,
  windowProblem,
  type MissingCall,
} from './gap-types';

/**
 * Les creneaux sans appel.
 *
 * Deux regles tiennent tout : un registre OUVERT n'est pas un appel fait (les
 * eleves n'y sont ni presents ni absents), et le resume compte ce qu'il reste
 * A VERIFIER — pas des fautes.
 */

function creneau(over: Partial<MissingCall> = {}): MissingCall {
  return {
    occurrenceId: 'o1',
    date: '2026-10-02',
    startsAt: '08:00',
    endsAt: '09:00',
    subject: 'Maths',
    klass: '6ème 1',
    teacherId: 't1',
    teacher: 'KONE Awa',
    reason: null,
    note: null,
    reviewedAt: null,
    ...over,
  };
}

describe('callWasMade', () => {
  it('un appel soumis ou validé compte', () => {
    expect(callWasMade('SUBMITTED')).toBe(true);
    expect(callWasMade('VALIDATED')).toBe(true);
  });

  it('un registre resté OUVERT ne compte pas : personne n’y est renseigné', () => {
    expect(callWasMade('OPEN')).toBe(false);
  });

  it('aucun registre du tout ne compte pas', () => {
    expect(callWasMade(null)).toBe(false);
    expect(callWasMade(undefined)).toBe(false);
  });
});

describe('summarizeByTeacher', () => {
  it('compte le total et ce qui reste à vérifier', () => {
    const resume = summarizeByTeacher([
      creneau(),
      creneau({ occurrenceId: 'o2', reason: 'FORGOTTEN' }),
      creneau({ occurrenceId: 'o3' }),
    ]);
    expect(resume).toHaveLength(1);
    expect(resume[0]).toMatchObject({ teacher: 'KONE Awa', total: 3, pending: 2 });
  });

  it('met en tête celui qui a le plus de créneaux à vérifier', () => {
    const resume = summarizeByTeacher([
      creneau({ teacherId: 'a', teacher: 'A', reason: 'FORGOTTEN' }),
      creneau({ occurrenceId: 'o2', teacherId: 'a', teacher: 'A', reason: 'FORGOTTEN' }),
      creneau({ occurrenceId: 'o3', teacherId: 'b', teacher: 'B' }),
    ]);
    expect(resume.map((r) => r.teacher)).toEqual(['B', 'A']);
  });

  it('ne perd pas les créneaux sans enseignant renseigné', () => {
    const resume = summarizeByTeacher([creneau({ teacherId: null, teacher: null })]);
    expect(resume[0]?.teacher).toBe('Enseignant non renseigné');
  });
});

describe('windowProblem', () => {
  it('accepte une semaine', () => {
    expect(windowProblem('2026-09-27', '2026-10-04')).toBeNull();
  });

  it('refuse une période à l’envers', () => {
    expect(windowProblem('2026-10-04', '2026-09-27')).toContain('après');
  });

  it(`refuse au-delà de ${MAX_WINDOW_DAYS} jours`, () => {
    expect(windowProblem('2026-01-01', '2026-03-01')).toContain(String(MAX_WINDOW_DAYS));
  });

  it('refuse ce qui n’est pas une date', () => {
    expect(windowProblem('hier', '2026-10-04')).toBe('Dates incorrectes.');
  });
});

describe('les motifs', () => {
  it('retombe sur la liste par défaut quand rien n’est réglé', () => {
    expect(cleanReasons(null)).toEqual(DEFAULT_GAP_REASONS);
    expect(cleanReasons([])).toEqual(DEFAULT_GAP_REASONS);
    expect(cleanReasons([{ code: '', label: '' }])).toEqual(DEFAULT_GAP_REASONS);
  });

  it('écarte les doublons de code', () => {
    const r = cleanReasons([
      { code: 'A', label: 'Un' },
      { code: 'A', label: 'Un autre' },
    ]);
    expect(r).toHaveLength(1);
  });

  it('refuse une liste vide : rien ne pourrait plus être qualifié', () => {
    expect(reasonsProblem([])).toContain('au moins un');
  });

  it('refuse deux fois le même code', () => {
    expect(
      reasonsProblem([
        { code: 'A', label: 'Un' },
        { code: 'A', label: 'Deux' },
      ]),
    ).toContain('deux fois');
  });

  it('dérive un code lisible du libellé, sans accent', () => {
    expect(slugReason('Sortie pédagogique')).toBe('SORTIE_PEDAGOGIQUE');
    expect(slugReason('Grève !')).toBe('GREVE');
    expect(slugReason('   ')).toBe('MOTIF');
  });

  it('affiche le code brut si le motif a disparu des réglages', () => {
    // Un motif retire ne doit pas effacer ce qui a ete qualifie avec lui.
    expect(reasonLabel(DEFAULT_GAP_REASONS, 'ANCIEN_MOTIF')).toBe('ANCIEN_MOTIF');
  });
});
