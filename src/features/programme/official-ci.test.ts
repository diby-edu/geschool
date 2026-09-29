import { describe, expect, it } from 'vitest';
import {
  OFFICIAL_CI_CYCLES,
  OFFICIAL_CI_LEVELS,
  OFFICIAL_CI_PROGRAMME,
  OFFICIAL_CI_SUBJECTS,
  mostFrequentCoefficient,
} from './official-ci';

/** Ligne TOTAL du document officiel (facultatifs compris). */
const DOCUMENT_TOTALS: Record<string, number> = {
  '6E': 19, '5E': 19, '4E': 21, '3E': 21,
  '2NDE-A': 23, '2NDE-C': 23,
  '1ERE-A1': 25, '1ERE-A2': 24, '1ERE-C': 25, '1ERE-D': 25,
  'TLE-A1': 28, 'TLE-A2': 26, 'TLE-C': 24, 'TLE-D': 24,
};

/**
 * Ligne TOTAL du document des HORAIRES, après arrondi à la séance supérieure.
 * Cinq niveaux gagnent une séance sur le document (les demi-séances de physique
 * et de SVT), deux en gagnent une demie arrondie, cinq sont inchangés.
 */
const DOCUMENT_SESSIONS: Record<string, number> = {
  '6E': 23, '5E': 23, '4E': 28, '3E': 29,
  '2NDE-A': 26, '2NDE-C': 29,
  '1ERE-A1': 28, '1ERE-A2': 27, '1ERE-C': 31, '1ERE-D': 30,
  'TLE-A1': 32, 'TLE-A2': 31, 'TLE-C': 33, 'TLE-D': 33,
};

const total = (level: string) =>
  Object.values(OFFICIAL_CI_PROGRAMME[level] ?? {}).reduce((sum, e) => sum + e.coefficient, 0);
const sessions = (level: string) =>
  Object.values(OFFICIAL_CI_PROGRAMME[level] ?? {}).reduce((sum, e) => sum + e.sessions, 0);

describe('grille officielle des coefficients (Côte d’Ivoire, secondaire général)', () => {
  it('retrouve le total de chaque niveau indiqué par le document', () => {
    for (const [level, expected] of Object.entries(DOCUMENT_TOTALS)) {
      expect({ level, total: total(level) }).toEqual({ level, total: expected });
    }
  });

  it('retrouve le nombre de séances hebdomadaires de chaque niveau', () => {
    for (const [level, expected] of Object.entries(DOCUMENT_SESSIONS)) {
      expect({ level, sessions: sessions(level) }).toEqual({ level, sessions: expected });
    }
  });

  it('ne compte que des séances entières : on ne place pas une demi-séance', () => {
    for (const entries of Object.values(OFFICIAL_CI_PROGRAMME)) {
      for (const [code, entry] of Object.entries(entries)) {
        expect({ code, entier: Number.isInteger(entry.sessions) }).toEqual({ code, entier: true });
        expect(entry.sessions).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('traite le français comme une seule matière, à tous les niveaux', () => {
    const codes = new Set(OFFICIAL_CI_SUBJECTS.map((s) => s.code));
    for (const detail of ['FR-EOL', 'FR-OG', 'FR-EE']) expect(codes.has(detail)).toBe(false);
    for (const level of OFFICIAL_CI_LEVELS) {
      expect({ level: level.code, fr: !!OFFICIAL_CI_PROGRAMME[level.code]?.FR }).toEqual({ level: level.code, fr: true });
    }
    // Le « Total Français » du document : 1+1+1 au premier cycle, 1+1+2 en 4e/3e.
    expect(OFFICIAL_CI_PROGRAMME['6E']!.FR).toEqual({ coefficient: 3, sessions: 5 });
    expect(OFFICIAL_CI_PROGRAMME['4E']!.FR).toEqual({ coefficient: 4, sessions: 6 });
  });

  it('note la conduite sans lui donner de séance', () => {
    for (const level of OFFICIAL_CI_LEVELS) {
      expect({ level: level.code, cond: OFFICIAL_CI_PROGRAMME[level.code]?.COND }).toEqual({
        level: level.code,
        cond: { coefficient: 1, sessions: 0 },
      });
    }
  });

  it('couvre exactement les niveaux déclarés, chacun rattaché à un cycle connu', () => {
    const cycles = new Set(OFFICIAL_CI_CYCLES.map((c) => c.code));
    expect(Object.keys(OFFICIAL_CI_PROGRAMME).sort()).toEqual(OFFICIAL_CI_LEVELS.map((l) => l.code).sort());
    for (const level of OFFICIAL_CI_LEVELS) expect(cycles.has(level.cycle)).toBe(true);
  });

  it("n'utilise que des matières déclarées, et chaque matière sert au moins une fois", () => {
    const declared = new Set(OFFICIAL_CI_SUBJECTS.map((s) => s.code));
    const used = new Set(Object.values(OFFICIAL_CI_PROGRAMME).flatMap((e) => Object.keys(e)));
    for (const code of used) expect(declared.has(code)).toBe(true);
    for (const code of declared) expect(used.has(code)).toBe(true);
  });

  it('respecte les formats de code acceptés par les formulaires (20 caractères, sans espace)', () => {
    for (const code of [...OFFICIAL_CI_SUBJECTS, ...OFFICIAL_CI_LEVELS, ...OFFICIAL_CI_CYCLES].map((x) => x.code)) {
      expect(code).toMatch(/^[A-Z0-9-]{1,20}$/);
    }
  });

  it('distingue A1 et A2 par les seules mathématiques', () => {
    expect(OFFICIAL_CI_PROGRAMME['1ERE-A1']!.MATH!.coefficient).toBe(3);
    expect(OFFICIAL_CI_PROGRAMME['1ERE-A2']!.MATH!.coefficient).toBe(2);
    expect(OFFICIAL_CI_PROGRAMME['TLE-A1']!.MATH!.coefficient).toBe(4);
    expect(OFFICIAL_CI_PROGRAMME['TLE-A2']!.MATH!.coefficient).toBe(2);
  });

  it('marque la LV2 facultative en 1ère et Terminale C et D', () => {
    for (const level of ['1ERE-C', '1ERE-D', 'TLE-C', 'TLE-D']) {
      expect(OFFICIAL_CI_PROGRAMME[level]!.LV2).toEqual({ coefficient: 1, sessions: 2, optional: true });
    }
    expect(OFFICIAL_CI_PROGRAMME['TLE-A1']!.LV2!.optional).toBeUndefined();
  });

  it('prend le coefficient le plus fréquent comme coefficient par défaut', () => {
    expect(mostFrequentCoefficient('EPS')).toBe(1);
    expect(mostFrequentCoefficient('HG')).toBe(2);
  });
});
