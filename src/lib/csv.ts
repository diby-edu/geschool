/**
 * Génération de CSV pour Excel (français) : séparateur `;`, fins de ligne CRLF,
 * UTF-8 avec BOM (sans lui, Excel affiche mal les accents).
 *
 * Sécurité : une cellule qui commence par `=`, `+`, `-`, `@`, tabulation ou
 * retour chariot est interprétée comme une FORMULE par Excel/LibreOffice
 * (« injection CSV » : un nom d'élève saisi `=HYPERLINK(...)` s'exécuterait chez
 * celui qui ouvre le fichier). On la neutralise en la préfixant d'une
 * apostrophe. Les téléphones, eux, sont des valeurs validées (E.164) : ils sortent
 * en texte forcé (`="+225…"`) pour qu'Excel n'en fasse ni un nombre tronqué ni
 * une formule.
 */

export type CsvValue = string | number | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;
const STRICT_PHONE = /^\+\d{6,15}$/;

/** Neutralise le début de formule, puis met entre guillemets si nécessaire. */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'number' ? String(value) : value;
  if (typeof value === 'string' && FORMULA_START.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Numéro E.164 validé : texte forcé. Toute autre valeur passe par csvCell. */
export function csvPhone(value: string | null | undefined): string {
  if (!value) return '';
  return STRICT_PHONE.test(value) ? `="${value}"` : csvCell(value);
}

/** Une ligne, déjà encodée par cellule (permet de mêler csvCell et csvPhone). */
export function csvRow(cells: string[]): string {
  return cells.join(';');
}

/** Fichier complet : BOM + en-tête + lignes, CRLF. */
export function buildCsv(header: string[], rows: string[][]): string {
  return '﻿' + [header.map(csvCell), ...rows].map(csvRow).join('\r\n') + '\r\n';
}

/** Date ISO (aaaa-mm-jj) → jj/mm/aaaa, sans conversion de fuseau. */
export function frenchDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
