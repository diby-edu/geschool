/**
 * Pourquoi l'appel n'a pas ete fait.
 *
 * Module NEUTRE : le formulaire de qualification est un composant client.
 *
 * UN APPEL MANQUANT N'ACCUSE PERSONNE. L'enseignant peut etre absent, le cours
 * peut n'avoir pas eu lieu, le telephone peut avoir lache — ou l'appel a
 * simplement ete oublie. L'application liste et demande qu'on qualifie ; elle
 * ne conclut pas.
 *
 * La liste est un POINT DE DEPART, pas une loi : chaque etablissement la
 * complete, la renomme ou en retire ce qui ne lui parle pas.
 */

export type GapReason = {
  /** Code stable, garde en base. */
  code: string;
  label: string;
  /** Met-il l'enseignant en cause ? Sert a teinter l'affichage, rien de plus. */
  blamesTeacher?: boolean;
};

export const DEFAULT_GAP_REASONS: GapReason[] = [
  { code: 'TEACHER_ABSENT', label: 'Enseignant absent', blamesTeacher: true },
  { code: 'FORGOTTEN', label: 'Appel oublié', blamesTeacher: true },
  { code: 'CLASS_NOT_HELD', label: 'Cours non tenu (sortie, examen, grève…)' },
  { code: 'REPLACED', label: 'Cours assuré par un remplaçant' },
  { code: 'TECHNICAL', label: 'Problème technique' },
  { code: 'OTHER', label: 'Autre' },
];

export const REASON_CODE_MAX = 40;
export const GAP_NOTE_MAX = 500;

/**
 * Le code d'un motif ajoute par l'etablissement.
 *
 * Derive du libelle, puis FIGE : renommer « Sortie » en « Sortie scolaire » ne
 * doit pas orpheliner les creneaux deja qualifies.
 */
export function slugReason(label: string): string {
  const sans = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (sans || 'MOTIF').slice(0, REASON_CODE_MAX);
}

export function reasonLabel(reasons: GapReason[], code: string): string {
  return reasons.find((r) => r.code === code)?.label ?? code;
}

export function reasonsProblem(reasons: GapReason[]): string | null {
  if (reasons.length === 0) return 'Gardez au moins un motif, sinon rien ne pourra être qualifié.';
  if (reasons.length > 20) return 'Vingt motifs suffisent : au-delà, personne ne choisit plus.';
  const codes = new Set<string>();
  for (const r of reasons) {
    if (!r.code || r.code.length > REASON_CODE_MAX) return 'Un code de motif est vide ou trop long.';
    if (!r.label.trim()) return `Le motif « ${r.code} » n’a pas de libellé.`;
    if (codes.has(r.code)) return `Le code « ${r.code} » apparaît deux fois.`;
    codes.add(r.code);
  }
  return null;
}

/** Nettoie ce qui vient des réglages : une liste inutilisable ferait écran blanc. */
export function cleanReasons(raw: unknown): GapReason[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_GAP_REASONS;
  const out: GapReason[] = [];
  const vus = new Set<string>();
  for (const brut of raw) {
    const o = (brut && typeof brut === 'object' ? brut : {}) as Record<string, unknown>;
    const code = typeof o.code === 'string' ? o.code.trim().slice(0, REASON_CODE_MAX) : '';
    const label = typeof o.label === 'string' ? o.label.trim().slice(0, 80) : '';
    if (!code || !label || vus.has(code)) continue;
    vus.add(code);
    out.push({ code, label, ...(o.blamesTeacher === true ? { blamesTeacher: true } : {}) });
  }
  return out.length > 0 ? out : DEFAULT_GAP_REASONS;
}

/** Un creneau termine dont l'appel n'a pas ete soumis. */
export type MissingCall = {
  occurrenceId: string;
  date: string;
  startsAt: string;
  endsAt: string;
  subject: string;
  klass: string;
  teacherId: string | null;
  teacher: string | null;
  /** La qualification deja posee, s'il y en a une. */
  reason: string | null;
  note: string | null;
  reviewedAt: string | null;
};

export type TeacherGapSummary = {
  teacherId: string | null;
  teacher: string;
  total: number;
  /** Pas encore qualifies : c'est la seule colonne qui appelle une action. */
  pending: number;
};

/**
 * Qui, et combien de fois.
 *
 * Sur une semaine, un etablissement entier produit des centaines de creneaux
 * sans appel : une liste brute ne se lit pas. Le resume dit l'essentiel —
 * cette personne n'a pas fait l'appel douze fois — sans conclure pour autant :
 * la colonne qui compte est celle des creneaux NON QUALIFIES.
 */
export function summarizeByTeacher(rows: MissingCall[]): TeacherGapSummary[] {
  const parProf = new Map<string, TeacherGapSummary>();
  for (const r of rows) {
    const cle = r.teacherId ?? '—';
    const ligne = parProf.get(cle) ?? {
      teacherId: r.teacherId,
      teacher: r.teacher ?? 'Enseignant non renseigné',
      total: 0,
      pending: 0,
    };
    ligne.total += 1;
    if (!r.reason) ligne.pending += 1;
    parProf.set(cle, ligne);
  }
  return [...parProf.values()].sort((a, b) => b.pending - a.pending || b.total - a.total || a.teacher.localeCompare(b.teacher, 'fr'));
}

/**
 * L'appel a-t-il ete fait ?
 *
 * Un registre reste « ouvert » quand l'enseignant a commence sans finir : pour
 * la vie scolaire, c'est un appel manquant tout autant qu'une absence de
 * registre — les eleves n'y sont ni presents ni absents.
 */
export function callWasMade(registerStatus: string | null | undefined): boolean {
  return registerStatus === 'SUBMITTED' || registerStatus === 'VALIDATED';
}

/** Au-dela, la liste ne se lit plus et la requete coute cher pour rien. */
export const MAX_WINDOW_DAYS = 31;

export function windowProblem(from: string, to: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return 'Dates incorrectes.';
  if (from > to) return 'La date de début vient après la date de fin.';
  const jours = (Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / 86_400_000;
  if (jours > MAX_WINDOW_DAYS) return `Choisissez une période d’au plus ${MAX_WINDOW_DAYS} jours.`;
  return null;
}
