import { describe, expect, it } from 'vitest';
import {
  parseBool,
  parseCount,
  parseDate,
  parseDiploma,
  parseEmployment,
  parseFunctions,
  parseGender,
  parseRelationship,
  parseTeacherStatus,
  splitFullName,
} from './values';
import { IMPORT_KINDS, IMPORT_KIND_ORDER, mapColumns, rowValues, templateCsv } from './kinds';
import { STUDENT_EXPORT_HEADER } from '@/features/students/export-columns';
import { parseCsv } from '@/lib/csv-parse';

describe('valeurs saisies dans un tableur', () => {
  it('lit les dates françaises, ISO et le format nombre d’Excel', () => {
    expect(parseDate('12/03/2014')).toBe('2014-03-12');
    expect(parseDate('1/9/2014')).toBe('2014-09-01');
    expect(parseDate('12-03-2014')).toBe('2014-03-12');
    expect(parseDate('2014-03-12')).toBe('2014-03-12');
    expect(parseDate('45000')).toBe('2023-03-15');
    expect(parseDate('')).toBe('');
    expect(parseDate('31/02/2014')).toBeUndefined();
    expect(parseDate('demain')).toBeUndefined();
  });

  it('reconnaît sexe, oui/non, nombres', () => {
    expect(parseGender('Masculin')).toBe('M');
    expect(parseGender('féminin')).toBe('F');
    expect(parseGender('')).toBe('');
    expect(parseGender('X')).toBeUndefined();
    expect(parseBool('Oui', false)).toBe(true);
    expect(parseBool('non', true)).toBe(false);
    expect(parseBool('', true)).toBe(true);
    expect(parseBool('peut-être', true)).toBeUndefined();
    expect(parseCount('60', 0)).toBe(60);
    expect(parseCount('', 40)).toBe(40);
    expect(parseCount('soixante', 0)).toBeUndefined();
  });

  it('traduit contrats, statuts, diplômes et liens de parenté', () => {
    expect(parseEmployment('Vacataire')).toBe('HOURLY');
    expect(parseEmployment('contractuel')).toBe('CONTRACT');
    expect(parseEmployment('PERMANENT')).toBe('PERMANENT');
    expect(parseEmployment('CDD')).toBe('CONTRACT');
    expect(parseEmployment('???')).toBeUndefined();
    expect(parseTeacherStatus('En congé')).toBe('ON_LEAVE');
    expect(parseTeacherStatus('')).toBe('ACTIVE');
    expect(parseDiploma('Baccalauréat')).toBe('BAC');
    expect(parseDiploma('capes')).toBe('CAPES');
    expect(parseDiploma('Maîtrise de lettres')).toBeUndefined();
    expect(parseRelationship('Père')).toBe('FATHER');
    expect(parseRelationship('Mère')).toBe('MOTHER');
    expect(parseRelationship('grand-mère')).toBe('TUTOR');
  });

  it('lit une ou plusieurs fonctions du personnel', () => {
    expect(parseFunctions('Secrétaire')).toEqual(['SECRETARY']);
    expect(parseFunctions('Directeur adjoint, Censeur')).toEqual(['DEPUTY_DIRECTOR', 'CENSOR']);
    expect(parseFunctions('Surveillant général / Éducateur')).toEqual(['HEAD_SUPERVISOR', 'SUPERVISOR']);
    expect(parseFunctions('IT_ADMIN')).toEqual(['IT_ADMIN']);
    expect(parseFunctions('Comptable')).toBeUndefined();
  });

  it('sépare NOM et prénoms', () => {
    expect(splitFullName('YAO Koffi Jean')).toEqual({ lastName: 'YAO', firstName: 'Koffi Jean' });
    expect(splitFullName('YAO')).toEqual({ lastName: 'YAO', firstName: '' });
  });
});

describe('colonnes des fichiers', () => {
  it('reconnaît les en-têtes sans tenir compte des accents, de la casse ni de l’ordre', () => {
    const m = mapColumns('students', ['PRENOMS', 'nom', 'Classe', 'Tél', 'Telephone du parent', 'Remarque']);
    expect(m.byIndex).toEqual(['firstName', 'lastName', 'class', null, 'guardianPhone', null]);
    expect(m.ignored).toEqual(['Tél', 'Remarque']);
    // Un fichier incomplet le dit colonne par colonne, plutôt que d'échouer ligne à ligne.
    expect(m.missingRequired).toEqual(['Matricule', 'Sexe', 'Date de naissance', 'Lieu de naissance', 'Redoublant', 'Statut']);
  });

  it('signale les colonnes obligatoires absentes', () => {
    expect(mapColumns('rooms', ['Nom']).missingRequired).toEqual(['Code']);
  });

  it('chaque modèle se relit : ses en-têtes sont toutes reconnues', () => {
    for (const kind of IMPORT_KIND_ORDER) {
      const { header, rows } = parseCsv(templateCsv(kind));
      const m = mapColumns(kind, header);
      expect(m.byIndex.every((k) => k !== null)).toBe(true);
      expect(Object.keys(rowValues(m, rows[0]!.cells))).toHaveLength(IMPORT_KINDS[kind].columns.length);
    }
  });

  it("relit l'export des élèves tel quel", () => {
    // Ce que l'application EXPORTE doit pouvoir être réimporté sans retouche :
    // l'en-tête vient du module partagé, pas d'une copie qui dériverait.
    const m = mapColumns('students', [...STUDENT_EXPORT_HEADER]);
    expect(m.ignored).toEqual([]);
    expect(m.missingRequired).toEqual([]);
  });
});
