/**
 * Le sort d'une matière FACULTATIVE dans la moyenne générale.
 *
 * Module neutre — ni serveur, ni client : le formulaire de réglage est un
 * composant client et ne peut donc pas importer `./scale`, qui est `server-only`
 * (il lirait Supabase et les cookies depuis le navigateur, et Next.js refuserait
 * la page entière).
 *
 * Les matières concernées sont celles marquées « Fac. » dans « Matières par
 * niveau » (`level_subjects.is_mandatory = false`) : la LV2 des séries C et D
 * de la grille officielle, par exemple.
 */
export const OPTIONAL_MODES = ['COUNT', 'BONUS', 'EXCLUDE'] as const;
export type OptionalMode = (typeof OPTIONAL_MODES)[number];

export const OPTIONAL_MODE_LABELS: Record<OptionalMode, { title: string; hint: string }> = {
  COUNT: {
    title: 'Elle compte comme les autres',
    hint: 'Son coefficient joue pleinement, en bien comme en mal : une option ratée fait baisser la moyenne.',
  },
  BONUS: {
    title: 'Elle ne compte que si elle fait monter la moyenne',
    hint: 'L’élève ne risque rien en prenant l’option : elle n’est retenue que quand elle l’avantage.',
  },
  EXCLUDE: {
    title: 'Elle reste au bulletin, hors moyenne générale',
    hint: 'La note s’affiche, mais elle n’entre ni dans la moyenne générale ni dans le rang.',
  },
};

/** Garde-fou : une valeur venue d'un formulaire ou d'un réglage stocké. */
export function readOptionalMode(value: unknown): OptionalMode {
  return (OPTIONAL_MODES as readonly string[]).includes(String(value)) ? (value as OptionalMode) : 'COUNT';
}
