import { describe, it, expect } from 'vitest';
import type { PermissionCode } from '@/lib/permissions';
import { BLOCK_NEEDS, FOCUS_LAYOUT, FUNCTION_FOCUS, KPI_NEEDS, focusesFor, planDashboard, usesFullDashboard } from './profiles';
import { STAFF_FUNCTIONS } from '@/lib/permissions/roles';
import { CATALOG_CODES } from '@/lib/permissions/catalog';

const rights = (...codes: string[]) => (c: PermissionCode) => codes.includes(c);
const everything = () => true;

describe('Qui garde le tableau complet', () => {
  it('le fondateur, même s’il cumule une autre fonction', () => {
    expect(usesFullDashboard(['SCHOOL_ADMIN'])).toBe(true);
    expect(usesFullDashboard(['SCHOOL_ADMIN', 'CENSOR'])).toBe(true);
  });

  it('une personne sans fonction qui ait un angle propre (Super Admin, comptable)', () => {
    expect(usesFullDashboard([])).toBe(true);
    expect(usesFullDashboard(['ACCOUNTANT'])).toBe(true);
  });

  it('pas les autres fonctions du personnel', () => {
    for (const f of STAFF_FUNCTIONS) expect(usesFullDashboard([f])).toBe(false);
  });
});

describe('Chaque fonction a ses propres indicateurs', () => {
  it('toute fonction attribuable a un angle', () => {
    for (const f of STAFF_FUNCTIONS) expect(FUNCTION_FOCUS[f]).toBeDefined();
  });

  it('deux angles différents n’affichent pas les mêmes indicateurs', () => {
    const seen = new Map<string, string>();
    for (const [focus, layout] of Object.entries(FOCUS_LAYOUT)) {
      const key = [...layout.kpis].sort().join(',');
      expect(seen.get(key), `${focus} et ${seen.get(key)} identiques`).toBeUndefined();
      seen.set(key, focus);
    }
  });

  it('censeur : l’assiduité en premier', () => {
    const p = planDashboard(focusesFor(['CENSOR']), everything);
    expect(p.groups[0]).toMatchObject({ focus: 'attendance', primary: true });
    expect(p.kpis[0]).toBe('callsToday');
    expect(p.blocks[0]).toBe('day');
  });

  it('secrétaire sans droit sur les présences : pas l’appel du jour', () => {
    const p = planDashboard(focusesFor(['SECRETARY']), rights('students.view', 'access_accounts.view'));
    expect(p.kpis).toContain('newEnrollments');
    expect(p.kpis).not.toContain('callsToday');
  });
});

describe('Un droit coché fait apparaître son indicateur, quelle que soit la fonction', () => {
  it('censeur à qui l’on coche « Consulter toutes les notes » : les moyennes s’ajoutent, après l’assiduité', () => {
    const avant = planDashboard(focusesFor(['CENSOR']), rights('attendance.view_all'));
    expect(avant.blocks).not.toContain('classAverages');
    expect(avant.kpis).not.toContain('schoolAverage');

    const apres = planDashboard(focusesFor(['CENSOR']), rights('attendance.view_all', 'grades.view_all'));
    expect(apres.blocks).toContain('classAverages');
    expect(apres.kpis).toContain('schoolAverage');
    expect(apres.kpis.indexOf('callsToday')).toBeLessThan(apres.kpis.indexOf('schoolAverage'));
    const moyennes = apres.groups.find((g) => g.kpis.includes('schoolAverage'))!;
    expect(moyennes.primary).toBe(false);
  });

  it('secrétaire à qui l’on coche « Consulter toutes les présences » : l’appel du jour s’ajoute', () => {
    const p = planDashboard(focusesFor(['SECRETARY']), rights('students.view', 'attendance.view_all'));
    expect(p.kpis).toContain('callsToday');
    expect(p.blocks).toContain('day');
    expect(p.groups[0]!.focus).toBe('enrollment');
  });

  it('un bloc sans indicateur garde son groupe (journal seul)', () => {
    const p = planDashboard(focusesFor(['SECRETARY']), rights('audit.view'));
    expect(p.blocks).toEqual(['activity']);
    expect(p.groups).toEqual([{ focus: 'accounts', primary: false, kpis: [], blocks: ['activity'] }]);
  });
});

describe('Les droits décident', () => {
  it('décocher « Consulter toutes les présences » retire tous les indicateurs d’appel du censeur', () => {
    const p = planDashboard(focusesFor(['CENSOR']), (c) => c !== 'attendance.view_all');
    for (const k of ['callsToday', 'missedCalls', 'absentToday', 'lateToday', 'lowClasses', 'absentStudents30d'] as const) {
      expect(p.kpis).not.toContain(k);
    }
    for (const b of ['day', 'watch', 'topAbsentees'] as const) expect(p.blocks).not.toContain(b);
  });

  it('sans aucun droit : rien', () => {
    const p = planDashboard(focusesFor(['CENSOR']), () => false);
    expect(p).toMatchObject({ kpis: [], blocks: [], groups: [] });
  });

  it('un indicateur n’apparaît qu’avec son droit', () => {
    for (const [key, need] of Object.entries(KPI_NEEDS)) {
      const without = (need.all ?? need.any ?? [])[0]!;
      const focus = Object.entries(FOCUS_LAYOUT).find(([, l]) => (l.kpis as readonly string[]).includes(key))![0];
      const p = planDashboard([focus as never], (c) => c !== without && !(need.any ?? []).includes(c));
      expect(p.kpis, `${key} sans ${without}`).not.toContain(key);
    }
  });

  it('les justificatifs exigent aussi « Voir les élèves » (sans lui, la base n’en renvoie aucun)', () => {
    const p = planDashboard(['schoolLife'], rights('attendance.justify', 'attendance.view_all'));
    expect(p.kpis).not.toContain('pendingJustifications');
    const q = planDashboard(['schoolLife'], rights('attendance.justify', 'students.view'));
    expect(q.kpis).toContain('pendingJustifications');
  });

  it('chaque droit exigé existe dans le catalogue de « Rôles et droits »', () => {
    const catalog = CATALOG_CODES;
    for (const need of [...Object.values(KPI_NEEDS), ...Object.values(BLOCK_NEEDS)]) {
      for (const c of [...(need.all ?? []), ...(need.any ?? [])]) expect(catalog.has(c), c).toBe(true);
    }
  });
});

describe('Plusieurs fonctions : l’union, sans doublon', () => {
  it('surveillant général + éducateur : absences une seule fois', () => {
    const p = planDashboard(focusesFor(['SUPERVISOR', 'HEAD_SUPERVISOR']), everything);
    expect(p.kpis.filter((k) => k === 'absentToday')).toHaveLength(1);
    expect(p.kpis).toContain('credentialsToSend'); // de l'éducateur
    expect(p.kpis).toContain('absentStudents30d'); // du surveillant général
    expect(new Set(p.blocks).size).toBe(p.blocks.length);
    const all = p.groups.flatMap((g) => g.kpis);
    expect(new Set(all).size).toBe(all.length);
  });

  it('l’ordre suit la fonction la plus proche de la direction', () => {
    expect(focusesFor(['SECRETARY', 'CENSOR', 'DIRECTOR'])).toEqual(['pedagogy', 'attendance', 'enrollment']);
  });
});
