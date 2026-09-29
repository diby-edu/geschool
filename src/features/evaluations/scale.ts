import 'server-only';

import type { TenantContext } from '@/lib/tenant/context';
import { readSettings } from '@/features/settings/school-settings';
import { getDefaultScale } from './config';
import { readOptionalMode, type OptionalMode } from './optional-mode';

export { OPTIONAL_MODES, OPTIONAL_MODE_LABELS, type OptionalMode } from './optional-mode';

/**
 * Les reglages de notation de l'etablissement, prets a passer aux fonctions SQL.
 *
 * Le bareme (`grading_scales`) etait saisissable depuis le debut — maximum,
 * nombre de decimales, mode d'arrondi, seuil de reussite — mais AUCUN calcul ne
 * s'en servait : les quatre appels aux fonctions de moyenne partaient avec les
 * valeurs par defaut de la base (/20, 2 decimales, HALF_UP). Une ecole notant
 * sur 10 ou voulant une seule decimale voyait son reglage ignore en silence.
 *
 * `absentCountsAsZero` vit dans l'espace de reglages « grading » : une absence
 * NON justifiee compte-t-elle un zero dans la moyenne ? Les fonctions SQL le
 * savaient faire depuis l'origine (p_absent_counts_as_zero), rien ne le leur
 * demandait. Par defaut non — c'est le comportement historique, et le plus
 * doux : l'absence est simplement ignoree.
 *
 * `optionalMode` decide du sort des matieres FACULTATIVES (la LV2 en 1ere et
 * Tle C et D, « 1 Fac » de la grille officielle). Le drapeau existait dans
 * `level_subjects.is_mandatory` et aucun calcul ne le regardait : une option
 * ratee faisait baisser la moyenne generale comme une matiere obligatoire.
 *
 * `countDraftGrades` decide ce qui COMPTE. Par defaut, tout ce qui est saisi :
 * la moyenne et le rang suivent la saisie, sans attendre que l'administration
 * cloture les evaluations une a une. La cloture reste un verrou sur la saisie.
 * Une ecole qui veut l'inverse — seules les evaluations validees comptent — le
 * decoche, et rien d'autre ne change dans l'application.
 */
export type GradingParams = {
  /** Echelle de sortie des moyennes (20 pour une note sur 20). */
  scaleMax: number;
  decimals: number;
  rounding: string;
  /** Seuil de reussite du bareme (10/20 par defaut) — mention, « admis ». */
  passing: number;
  absentCountsAsZero: boolean;
  /** Une note compte des sa saisie, sans attendre la cloture de l'evaluation. */
  countDraftGrades: boolean;
  /** Sort des matieres facultatives dans la moyenne generale. */
  optionalMode: OptionalMode;
};

export const DEFAULT_GRADING: GradingParams = {
  scaleMax: 20,
  decimals: 2,
  rounding: 'HALF_UP',
  passing: 10,
  absentCountsAsZero: false,
  countDraftGrades: true,
  optionalMode: 'COUNT',
};

export async function gradingParams(ctx: TenantContext): Promise<GradingParams> {
  const [scale, settings] = await Promise.all([getDefaultScale(ctx), readSettings(ctx, 'grading')]);
  return {
    scaleMax: scale ? Number(scale.max_score) : DEFAULT_GRADING.scaleMax,
    decimals: scale ? Number(scale.decimals) : DEFAULT_GRADING.decimals,
    rounding: scale?.rounding ?? DEFAULT_GRADING.rounding,
    passing: scale ? Number(scale.passing_score) : DEFAULT_GRADING.passing,
    absentCountsAsZero: settings.absentCountsAsZero === true,
    // Absent du reglage = en direct : c'est le comportement attendu par defaut.
    countDraftGrades: settings.countDraftGrades !== false,
    optionalMode: readOptionalMode(settings.optionalMode),
  };
}

/**
 * Les reglages d'UNE moyenne de matiere : le sort des matieres facultatives ne
 * s'y applique pas (il arbitre entre matieres, pas a l'interieur de l'une).
 */
export function subjectArgs(p: GradingParams): {
  p_scale_max: number;
  p_absent_counts_as_zero: boolean;
  p_decimals: number;
  p_rounding: string;
  p_include_draft: boolean;
} {
  const { p_optional_mode: _ignore, ...rest } = rpcArgs(p);
  return rest;
}

/** Les memes reglages, nommes comme les parametres des fonctions SQL. */
export function rpcArgs(p: GradingParams): {
  p_scale_max: number;
  p_absent_counts_as_zero: boolean;
  p_decimals: number;
  p_rounding: string;
  p_include_draft: boolean;
  p_optional_mode: OptionalMode;
} {
  return {
    p_scale_max: p.scaleMax,
    p_absent_counts_as_zero: p.absentCountsAsZero,
    p_decimals: p.decimals,
    p_rounding: p.rounding,
    p_include_draft: p.countDraftGrades,
    p_optional_mode: p.optionalMode,
  };
}
