/**
 * Ce qu'un SMS coûte vraiment, et comment éviter de payer double.
 *
 * Un SMS tient 160 caractères — mais un seul caractère hors de l'alphabet GSM
 * fait tomber la limite à 70. En français, les coupables ne sont pas les
 * accents courants : `é è à ù ç ä ö ñ ü` passent. Ce sont `ê î ô û â ë ï`,
 * l'apostrophe courbe `’`, les guillemets `« »` et le tiret long `—`.
 *
 * « Votre enfant a été absent ce matin. » = 1 SMS.
 * « Votre enfant a été absent — merci de nous contacter. » = 2 SMS, pour un
 * seul tiret. À 15 F l'unité et quelques milliers d'envois, cela compte.
 *
 * Module NEUTRE : le compteur s'affiche pendant la rédaction, côté navigateur.
 */

/** L'alphabet GSM 03.38 de base, plus l'extension (qui compte double). */
const GSM_BASE =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXTENDED = '^{}\\[~]|€';

export const SMS_GSM_LIMIT = 160;
export const SMS_UNICODE_LIMIT = 70;
/** Au-delà d'un SMS, chaque morceau perd quelques caractères d'en-tête. */
const GSM_PART = 153;
const UNICODE_PART = 67;

/** Remplacements évidents : même sens, sans faire basculer le message. */
const REMPLACEMENTS: [RegExp, string][] = [
  [/[‘’‛]/g, "'"],
  // Les guillemets français s'écrivent avec une espace à l'intérieur ; les
  // guillemets droits non. Sans cela, « absent » donnerait " absent ".
  [/«\s*/g, '"'],
  [/\s*»/g, '"'],
  [/[“”]/g, '"'],
  [/[–—−]/g, '-'],
  [/…/g, '...'],
  [/ | /g, ' '],
  [/œ/g, 'oe'],
  [/Œ/g, 'OE'],
  [/[êëē]/g, 'e'],
  [/[ÊË]/g, 'E'],
  [/[îïī]/g, 'i'],
  [/[ÎÏ]/g, 'I'],
  [/[ôõō]/g, 'o'],
  [/[ÔÕ]/g, 'O'],
  [/[ûū]/g, 'u'],
  [/[ÛÙ]/g, 'U'],
  [/[âãā]/g, 'a'],
  [/[ÂÃÀ]/g, 'A'],
  [/[ÉÈ]/g, 'E'],
  // Piège : l'alphabet GSM contient Ç majuscule, mais PAS ç minuscule.
  // Un seul « ça » fait basculer tout le message à 70 caractères.
  [/ç/g, 'c'],
];

/** Le texte bascule-t-il en Unicode (donc 70 caractères au lieu de 160) ? */
export function isUnicode(text: string): boolean {
  for (const c of text) {
    if (!GSM_BASE.includes(c) && !GSM_EXTENDED.includes(c)) return true;
  }
  return false;
}

export type SmsCount = {
  unicode: boolean;
  /** Longueur facturée : les caractères étendus GSM comptent double. */
  length: number;
  parts: number;
  limit: number;
  /** Les caractères qui font basculer le message, pour les montrer. */
  offenders: string[];
};

export function countSms(text: string): SmsCount {
  const unicode = isUnicode(text);
  let length = 0;
  const offenders = new Set<string>();
  for (const c of text) {
    if (unicode) {
      // En UCS-2, un emoji ou un caractère rare occupe deux unités.
      length += c.codePointAt(0)! > 0xffff ? 2 : 1;
    } else {
      length += GSM_EXTENDED.includes(c) ? 2 : 1;
    }
    if (!GSM_BASE.includes(c) && !GSM_EXTENDED.includes(c)) offenders.add(c);
  }
  const limit = unicode ? SMS_UNICODE_LIMIT : SMS_GSM_LIMIT;
  const part = unicode ? UNICODE_PART : GSM_PART;
  const parts = length === 0 ? 0 : length <= limit ? 1 : Math.ceil(length / part);
  return { unicode, length, parts, limit, offenders: [...offenders] };
}

/**
 * Nettoie le texte pour qu'il tienne en 160 caractères.
 *
 * On ne touche qu'à ce qui ne change pas le sens : les apostrophes et
 * guillemets typographiques, les tirets longs, et les accents absents de
 * l'alphabet GSM. `é è à ù ç` restent intacts — ils passent.
 */
export function toGsm(text: string): string {
  let out = text;
  for (const [de, vers] of REMPLACEMENTS) out = out.replace(de, vers);
  // Ce qui reste hors alphabet après remplacement serait facturé double :
  // on le retire plutôt que de laisser le message coûter deux fois.
  return [...out].map((c) => (GSM_BASE.includes(c) || GSM_EXTENDED.includes(c) ? c : '')).join('');
}

/**
 * Le numéro au format attendu par la plupart des passerelles ivoiriennes :
 * indicatif pays collé, sans le `+`. « +2250747094746 » devient
 * « 2250747094746 ».
 */
export function toLocalDialing(e164: string): string {
  return e164.replace(/[^\d]/g, '');
}
