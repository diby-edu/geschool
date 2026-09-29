/**
 * Les types de groupe, et ce qu'ils servent.
 *
 * Module neutre — ni serveur, ni client : les formulaires en ont besoin et ne
 * peuvent pas importer le service, qui est `server-only`.
 *
 * Un groupe rassemble des élèves venus d'UNE OU PLUSIEURS classes pour un
 * enseignement qui ne concerne pas toute la classe : la LV2 quand allemand et
 * espagnol cohabitent, une option, un demi-groupe de travaux pratiques, un
 * soutien. L'emploi du temps sait déjà lui faire cours à part, et deux groupes
 * d'une même classe peuvent tourner à la même heure dans deux salles.
 */
export const GROUP_KINDS = ['LANGUAGE', 'OPTION', 'PEDAGOGICAL', 'SUPPORT', 'ACTIVITY', 'OTHER'] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];

export const GROUP_KIND_LABELS: Record<GroupKind, { title: string; hint: string }> = {
  LANGUAGE: {
    title: 'Langue',
    hint: 'La LV2 quand une même classe suit deux langues : allemand d’un côté, espagnol de l’autre.',
  },
  OPTION: {
    title: 'Option',
    hint: 'Un enseignement choisi que toute la classe ne suit pas.',
  },
  PEDAGOGICAL: {
    title: 'Demi-groupe',
    hint: 'La classe coupée en deux : travaux pratiques, informatique, laboratoire.',
  },
  SUPPORT: {
    title: 'Soutien',
    hint: 'Un groupe de renforcement, ouvert à des élèves de plusieurs classes.',
  },
  ACTIVITY: {
    title: 'Activité',
    hint: 'Club, sport, chorale — hors programme obligatoire.',
  },
  OTHER: {
    title: 'Autre',
    hint: 'Tout regroupement qui n’entre dans aucune des cases précédentes.',
  },
};

export function readGroupKind(value: unknown): GroupKind {
  return (GROUP_KINDS as readonly string[]).includes(String(value)) ? (value as GroupKind) : 'OTHER';
}

/** Libellé court, pour une liste ou une cellule d'emploi du temps. */
export function groupKindLabel(kind: string): string {
  return GROUP_KIND_LABELS[readGroupKind(kind)].title;
}
