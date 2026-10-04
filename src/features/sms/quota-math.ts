/**
 * Le quota de SMS, cote calcul.
 *
 * Module NEUTRE : aucune lecture de base, donc utilisable depuis un composant
 * client comme depuis un test. La lecture vit dans `quota.ts` (serveur) et le
 * blocage dans `services/sms-log.ts`.
 *
 * Le modele : un nombre de SMS inclus par mois, un complement eventuellement
 * accorde, puis blocage. Pas de facture surprise — ni pour l'ecole, ni pour
 * l'editeur qui paie l'operateur.
 *
 * CE QUI N'EST JAMAIS BLOQUE : les identifiants de connexion. Un quota epuise
 * ne doit pas empecher un enseignant de recevoir ses codes — ce serait punir
 * l'ecole deux fois.
 */

export type SmsQuota = {
  /** Inclus par la formule souscrite, ou le defaut de la plateforme. */
  included: number;
  /** Accorde en plus pour le mois en cours. */
  granted: number;
  /** SMS factures depuis le 1er du mois (les echecs ne comptent pas). */
  used: number;
  limit: number;
  remaining: number;
  /** Aucune limite n'est posee : tout passe. */
  unlimited: boolean;
  /** Part consommee, de 0 a 1. */
  ratio: number;
};

/** Au-dela, l'ecran previent que le quota s'epuise. */
export const WARN_RATIO = 0.8;

export function buildQuota(included: number, granted: number, used: number): SmsQuota {
  const limit = Math.max(0, included) + Math.max(0, granted);
  // Zero inclus et rien d'accorde : aucune limite n'a ete posee, donc rien ne
  // bloque. Un etablissement ne doit pas devenir muet parce que l'editeur n'a
  // pas encore rempli ses formules.
  const unlimited = limit <= 0;
  return {
    included,
    granted,
    used,
    limit,
    remaining: unlimited ? Number.POSITIVE_INFINITY : Math.max(0, limit - used),
    unlimited,
    ratio: unlimited ? 0 : Math.min(1, used / limit),
  };
}

/** Rien n'est pose, rien ne bloque. */
export const QUOTA_LIBRE = buildQuota(0, 0, 0);

export type LigneQuota = { included: number; granted: number; used: number };

/** La seule ligne que renvoie la fonction en base, ou rien. */
export function premiereLigneQuota(data: unknown): LigneQuota | null {
  const lignes = (data ?? []) as LigneQuota[];
  return Array.isArray(lignes) && lignes.length > 0 ? (lignes[0] ?? null) : null;
}

export function ligneEnQuota(ligne: LigneQuota): SmsQuota {
  return buildQuota(Number(ligne.included), Number(ligne.granted), Number(ligne.used));
}

/** Le quota permet-il d'envoyer encore `parts` SMS ? */
export function quotaAllows(quota: SmsQuota, parts = 1): boolean {
  return quota.unlimited || quota.used + parts <= quota.limit;
}

/** Ce qu'on affiche. */
export function quotaLabel(quota: SmsQuota): string {
  if (quota.unlimited) return 'Aucune limite de SMS n’est posée sur cet établissement.';
  return `${quota.used.toLocaleString('fr-FR')} SMS utilisés sur ${quota.limit.toLocaleString('fr-FR')} ce mois-ci.`;
}

/** Le premier jour du mois en cours, tel que la base l'attend. */
export function currentMonth(now = new Date()): string {
  const m = `${now.getMonth() + 1}`.padStart(2, '0');
  return `${now.getFullYear()}-${m}-01`;
}
