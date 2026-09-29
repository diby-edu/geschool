import { describe, expect, it } from 'vitest';
import { CATALOG_CODES, PERMISSION_GROUPS, permissionLabel } from './catalog';
import { ROLE_CODES, STAFF_FUNCTIONS, roleLabel } from './roles';

describe('catalogue des droits proposés à cocher', () => {
  const all = PERMISSION_GROUPS.flatMap((g) => g.items);

  it('respecte le format module.action de la base', () => {
    for (const { code } of all) expect(code).toMatch(/^[a-z_]+(\.[a-z_]+)+$/);
  });

  it('ne contient aucun doublon (un droit dans un seul groupe)', () => {
    expect(new Set(all.map((i) => i.code)).size).toBe(all.length);
    expect(CATALOG_CODES.size).toBe(all.length);
  });

  it('donne à chaque droit un libellé lisible, différent de son code', () => {
    for (const { code, label } of all) {
      expect(label.trim().length).toBeGreaterThan(5);
      expect(label).not.toBe(code);
    }
  });

  it('ne propose aucun droit réservé à la plateforme', () => {
    for (const { code } of all) expect(code.startsWith('platform.')).toBe(false);
  });

  it('inclut la signature du bulletin et la gestion des rôles', () => {
    expect(CATALOG_CODES.has('reports.sign')).toBe(true);
    expect(CATALOG_CODES.has('users.assign_roles')).toBe(true);
  });

  it('renvoie le code lui-même pour un droit hors catalogue', () => {
    expect(permissionLabel('reports.sign')).toBe('Signer les bulletins');
    expect(permissionLabel('documents.upload')).toBe('documents.upload');
  });
});

describe('fonctions du personnel', () => {
  it('sont toutes des rôles connus, sans doublon', () => {
    expect(new Set(STAFF_FUNCTIONS).size).toBe(STAFF_FUNCTIONS.length);
    for (const code of STAFF_FUNCTIONS) expect(ROLE_CODES).toContain(code);
  });

  it('excluent le fondateur, le comptable, les enseignants, parents et élèves', () => {
    for (const code of ['SCHOOL_ADMIN', 'ACCOUNTANT', 'TEACHER', 'PARENT', 'STUDENT']) {
      expect(STAFF_FUNCTIONS as readonly string[]).not.toContain(code);
    }
  });

  it('comprennent les fonctions demandées', () => {
    for (const code of ['DIRECTOR', 'DEPUTY_DIRECTOR', 'CENSOR', 'EDUCATION_INSPECTOR', 'HEAD_SUPERVISOR', 'SUPERVISOR', 'SECRETARY', 'IT_ADMIN']) {
      expect(STAFF_FUNCTIONS as readonly string[]).toContain(code);
    }
  });

  it('ont un libellé français distinct pour chaque rôle', () => {
    const labels = ROLE_CODES.map((c) => roleLabel(c));
    expect(new Set(labels).size).toBe(labels.length);
    expect(roleLabel('SCHOOL_ADMIN')).toBe('Fondateur');
    expect(roleLabel('EDUCATION_INSPECTOR')).toBe('Inspecteur d’éducation'.replace('’', "'"));
  });
});
