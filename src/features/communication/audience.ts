/**
 * À qui s'adresse une annonce.
 *
 * Jusqu'ici : tout l'établissement, ou des fonctions. C'était trop large —
 * prévenir les parents d'une seule classe obligeait à écrire à tout le monde,
 * et personne ne lit ce qui ne le concerne pas.
 *
 * On ajoute donc les classes et les niveaux. Une audience peut combiner
 * plusieurs critères : « les parents des 6ᵉ » s'écrit avec la classe et la
 * fonction PARENT cochées ensemble.
 *
 * Module NEUTRE : le formulaire est un composant client.
 */

export type Audience = {
  all?: boolean;
  roles?: string[];
  /** Les classes visées : parents, élèves et enseignants rattachés. */
  classIds?: string[];
  /** Un niveau entier : toutes ses classes. */
  levelIds?: string[];
};

/** Une audience vide n'atteint personne : il faut le dire avant d'envoyer. */
export function audienceIsEmpty(a: Audience): boolean {
  if (a.all) return false;
  return (
    (a.roles ?? []).length === 0 && (a.classIds ?? []).length === 0 && (a.levelIds ?? []).length === 0
  );
}

export function audienceLabel(
  a: Audience,
  noms: { roles?: Record<string, string>; classes?: Record<string, string>; levels?: Record<string, string> } = {},
): string {
  if (a.all) return 'Tout l’établissement';
  const morceaux: string[] = [];
  for (const r of a.roles ?? []) morceaux.push(noms.roles?.[r] ?? r);
  for (const c of a.classIds ?? []) morceaux.push(noms.classes?.[c] ?? 'une classe');
  for (const l of a.levelIds ?? []) morceaux.push(noms.levels?.[l] ?? 'un niveau');
  return morceaux.length > 0 ? morceaux.join(', ') : '—';
}

/** Lecture défensive : l'audience vient d'une colonne JSON. */
export function readAudience(raw: unknown): Audience {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const liste = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
  return {
    all: o.all === true,
    roles: liste(o.roles),
    classIds: liste(o.classIds),
    levelIds: liste(o.levelIds),
  };
}
