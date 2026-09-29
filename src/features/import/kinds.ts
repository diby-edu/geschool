import { normalizeHeader } from '@/lib/csv-parse';

/**
 * Listes importables / exportables et leurs colonnes. Les en-têtes du modèle
 * sont ceux des exports : un fichier exporté se réimporte tel quel. À l'import,
 * chaque en-tête est reconnu par son nom ou un synonyme courant, sans tenir
 * compte des accents, de la casse ni de l'ordre des colonnes.
 */

export type ImportKind = 'rooms' | 'classes' | 'teachers' | 'staff' | 'students';

export type ImportColumn = {
  key: string;
  label: string;
  aliases?: string[];
  required?: boolean;
  example: string;
  hint?: string;
};

export type ImportKindDef = {
  kind: ImportKind;
  label: string;
  /** Nom au singulier, pour les messages (« 12 salles créées »). */
  noun: string;
  columns: ImportColumn[];
  note: string;
};

export const IMPORT_KINDS: Record<ImportKind, ImportKindDef> = {
  rooms: {
    kind: 'rooms',
    label: 'Salles',
    noun: 'salle',
    note: 'Une salle déjà présente (même code) est laissée telle quelle. Un type de salle inconnu est créé.',
    columns: [
      { key: 'code', label: 'Code', required: true, example: 'S101', aliases: ['code salle', 'numero', 'numéro de salle'] },
      { key: 'name', label: 'Nom', required: true, example: 'Salle 101', aliases: ['salle', 'libelle', 'nom de la salle', 'designation'] },
      { key: 'type', label: 'Type', example: 'Salle de classe', aliases: ['type de salle', 'categorie'] },
      { key: 'capacity', label: 'Capacité', example: '60', aliases: ['places', 'nombre de places', 'effectif max'] },
      { key: 'building', label: 'Bâtiment', example: 'Bâtiment A', aliases: ['batiment', 'bloc'] },
      { key: 'floor', label: 'Étage', example: 'RDC', aliases: ['etage', 'niveau'] },
      { key: 'active', label: 'Active', example: 'Oui', aliases: ['actif', 'statut', 'en service'], hint: 'Oui / Non' },
    ],
  },
  classes: {
    kind: 'classes',
    label: 'Classes',
    noun: 'classe',
    note: "Classes de l'année active. Le niveau doit exister (code ou nom : « 6E » ou « 6ème »). Une classe déjà présente (même code) est laissée telle quelle.",
    columns: [
      { key: 'code', label: 'Code', required: true, example: '6E-1', aliases: ['code classe'] },
      { key: 'name', label: 'Nom', required: true, example: '6ème 1', aliases: ['classe', 'libelle', 'nom de la classe'] },
      { key: 'level', label: 'Niveau', required: true, example: '6ème', aliases: ['code niveau', 'niveau scolaire', 'serie'] },
      { key: 'capacity', label: 'Capacité', example: '60', aliases: ['effectif maximum', 'effectif max', 'places'] },
      { key: 'headTeacher', label: 'Professeur principal (matricule)', example: '', aliases: ['professeur principal', 'prof principal', 'titulaire', 'matricule du professeur principal'] },
      { key: 'room', label: 'Salle (code)', example: 'S101', aliases: ['salle', 'salle principale', 'code salle'] },
    ],
  },
  teachers: {
    kind: 'teachers',
    label: 'Enseignants',
    noun: 'enseignant',
    note: 'Le matricule identifie l’enseignant : un matricule déjà présent est laissé tel quel. Les accès se créent ensuite depuis Enseignants (« Créer les accès manquants »).',
    columns: [
      { key: 'staffNumber', label: 'Matricule', required: true, example: 'ENS-001', aliases: ['matricule enseignant', 'numéro matricule'] },
      { key: 'lastName', label: 'Nom', required: true, example: 'KOUASSI', aliases: ['nom de famille'] },
      { key: 'firstName', label: 'Prénoms', required: true, example: 'Yao Marcel', aliases: ['prenom', 'prenoms'] },
      { key: 'gender', label: 'Sexe', example: 'M', aliases: ['genre'], hint: 'M / F' },
      { key: 'birthDate', label: 'Date de naissance', example: '14/02/1985', aliases: ['ne le', 'naissance'] },
      { key: 'phone', label: 'Téléphone', example: '0701020304', aliases: ['telephone', 'contact', 'numéro de téléphone', 'tel', 'cellulaire'] },
      { key: 'email', label: 'Email', example: '', aliases: ['e mail', 'adresse email', 'courriel'] },
      { key: 'specialty', label: 'Spécialité', example: 'Mathématiques', aliases: ['specialite', 'discipline', 'matiere'] },
      { key: 'employmentType', label: 'Type de contrat', example: 'Permanent', aliases: ['contrat', 'statut contrat'], hint: 'Permanent, Contractuel, Vacataire, Stagiaire, Autre' },
      { key: 'status', label: 'Statut', example: 'Actif', aliases: ['etat', 'situation'], hint: 'Actif, En congé, Suspendu, Parti' },
      { key: 'diploma', label: 'Diplôme', example: 'CAPES', aliases: ['diplome', 'plus haut diplôme'] },
      { key: 'hireDate', label: 'Date de prise de fonction', example: '01/10/2015', aliases: ['prise de fonction', 'date d embauche', 'date d entree'] },
    ],
  },
  staff: {
    kind: 'staff',
    label: 'Personnel administratif',
    noun: 'membre du personnel',
    note: 'Chaque personne reçoit un accès (code école + téléphone) ; ses identifiants s’envoient ensuite depuis Gestion des accès. Un téléphone déjà présent dans le personnel est laissé tel quel.',
    columns: [
      { key: 'lastName', label: 'Nom', required: true, example: 'KONAN', aliases: ['nom de famille'] },
      { key: 'firstName', label: 'Prénoms', required: true, example: 'Affoué Clarisse', aliases: ['prenom', 'prenoms'] },
      { key: 'gender', label: 'Sexe', required: true, example: 'F', aliases: ['genre'], hint: 'M / F' },
      { key: 'functions', label: 'Fonction(s)', required: true, example: 'Secrétaire', aliases: ['fonction', 'fonctions', 'poste', 'role'], hint: 'Directeur, Directeur adjoint, Censeur, Inspecteur d’éducation, Surveillant général, Éducateur, Secrétaire, Informaticien (plusieurs : séparées par une virgule)' },
      { key: 'phone', label: 'Téléphone', required: true, example: '0505060708', aliases: ['telephone', 'contact', 'tel', 'téléphone principal'] },
      { key: 'email', label: 'Email', example: '', aliases: ['e mail', 'courriel'] },
      { key: 'employmentType', label: 'Type de contrat', required: true, example: 'Contractuel', aliases: ['contrat'], hint: 'Permanent, Contractuel, Vacataire, Stagiaire, Autre' },
      { key: 'staffNumber', label: 'Matricule', example: '', aliases: ['matricule agent'] },
      { key: 'birthDate', label: 'Date de naissance', example: '', aliases: ['ne le'] },
      { key: 'hireDate', label: 'Date de prise de fonction', example: '', aliases: ['prise de fonction', 'date d embauche'] },
    ],
  },
  students: {
    kind: 'students',
    label: 'Élèves',
    noun: 'élève',
    note: "Inscription dans l'année active. La classe doit exister (code ou nom). Le compte parent est créé à partir du téléphone du responsable. Un élève déjà inscrit (même nom, prénoms et date de naissance) est laissé tel quel.",
    columns: [
      { key: 'matricule', label: 'Matricule', required: true, example: 'CI-2026-00123', aliases: ['matricule élève', 'numéro matricule'], hint: 'Attribué par l’État' },
      { key: 'lastName', label: 'Nom', required: true, example: 'YAO', aliases: ['nom de famille', 'nom élève'] },
      { key: 'firstName', label: 'Prénoms', required: true, example: 'Aya Grâce', aliases: ['prenom', 'prenoms', 'prénoms élève'] },
      { key: 'gender', label: 'Sexe', required: true, example: 'F', aliases: ['genre'], hint: 'M / F' },
      { key: 'birthDate', label: 'Date de naissance', required: true, example: '12/03/2014', aliases: ['ne le', 'nee le', 'naissance'] },
      { key: 'birthPlace', label: 'Lieu de naissance', required: true, example: 'Abidjan', aliases: ['ne a', 'nee a', 'lieu'] },
      { key: 'class', label: 'Classe', required: true, example: '6ème 1', aliases: ['code classe', 'classe actuelle'] },
      { key: 'repeating', label: 'Redoublant', required: true, example: 'NON', aliases: ['redouble', 'redoublement'], hint: 'OUI / NON' },
      { key: 'stateAssigned', label: 'Statut', required: true, example: 'Affecté', aliases: ['affectation', 'affecte', 'statut affectation'], hint: 'Affecté / Non affecté' },
      { key: 'lv2', label: 'LV2', example: '', aliases: ['langue vivante 2', 'seconde langue', 'langue 2'], hint: 'Allemand, Espagnol… vide si le niveau n’en a pas' },
      { key: 'guardian', label: 'Responsable', example: 'YAO Koffi', aliases: ['nom du responsable', 'parent', 'tuteur', 'nom du parent'], hint: 'NOM Prénoms' },
      { key: 'relationship', label: 'Lien', example: 'Père', aliases: ['lien de parente', 'qualite', 'lien avec l élève'], hint: 'Père, Mère, Tuteur…' },
      { key: 'guardianPhone', label: 'Téléphone du responsable', example: '0707080910', aliases: ['téléphone du parent', 'téléphone parent', 'contact parent', 'telephone'] },
    ],
  },
};

export const IMPORT_KIND_ORDER: ImportKind[] = ['rooms', 'classes', 'teachers', 'staff', 'students'];

export function isImportKind(value: unknown): value is ImportKind {
  return typeof value === 'string' && value in IMPORT_KINDS;
}

export type ColumnMapping = {
  /** index de colonne du fichier -> clé */
  byIndex: (string | null)[];
  matched: string[];
  ignored: string[];
  missingRequired: string[];
};

/** Rattache chaque en-tête du fichier à une colonne connue. */
export function mapColumns(kind: ImportKind, header: string[]): ColumnMapping {
  const def = IMPORT_KINDS[kind];
  const names = new Map<string, string>();
  for (const col of def.columns) {
    for (const n of [col.label, col.key, ...(col.aliases ?? [])]) {
      const k = normalizeHeader(n);
      if (!names.has(k)) names.set(k, col.key);
    }
  }
  const used = new Set<string>();
  const byIndex = header.map((h) => {
    const key = names.get(normalizeHeader(h)) ?? null;
    if (!key || used.has(key)) return null;
    used.add(key);
    return key;
  });
  return {
    byIndex,
    matched: def.columns.filter((c) => used.has(c.key)).map((c) => c.label),
    ignored: header.filter((h, i) => h.trim() !== '' && byIndex[i] === null),
    missingRequired: def.columns.filter((c) => c.required && !used.has(c.key)).map((c) => c.label),
  };
}

/** Ligne du fichier -> valeurs par clé (chaîne vide si absente). */
export function rowValues(mapping: ColumnMapping, cells: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  mapping.byIndex.forEach((key, i) => {
    if (key) out[key] = (cells[i] ?? '').trim();
  });
  return out;
}

/** Modèle CSV : en-têtes + une ligne d'exemple (séparateur ; et BOM, comme les exports). */
export function templateCsv(kind: ImportKind): string {
  const cols = IMPORT_KINDS[kind].columns;
  const cell = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '﻿' + [cols.map((c) => cell(c.label)).join(';'), cols.map((c) => cell(c.example)).join(';')].join('\r\n') + '\r\n';
}
