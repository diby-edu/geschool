import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';

/**
 * Detection et normalisation d'un identifiant de connexion (ADR-005).
 *
 * Trois familles, une seule saisie :
 *   - email     (personnel)  -> tel quel, minuscule
 *   - telephone (parent)     -> E.164 canonique
 *   - matricule (eleve)      -> majuscule, espaces retires
 *
 * La normalisation est PURE et testee : elle est partagee par le formulaire de
 * connexion, l'inscription et la synchronisation hors ligne. Une seule
 * implementation, sinon les doublons et les echecs de connexion reviennent par
 * la porte de derriere (un « 01 01 01 01 01 » saisi ici et un « +2250101010101 »
 * stocke la ne se retrouveraient jamais).
 */

export type LoginKind = 'EMAIL' | 'PHONE' | 'MATRICULE';

export type NormalizedIdentifier =
  | { ok: true; kind: LoginKind; value: string }
  | { ok: false; reason: 'EMPTY' | 'INVALID_PHONE' };

// Un identifiant "telephone" ne contient que chiffres, espaces, +, -, ., ()
const PHONE_SHAPE_RE = /^[+()\d\s.-]+$/;

/** Devine la nature d'un identifiant sans le normaliser. */
export function detectKind(raw: string): LoginKind {
  const value = raw.trim();
  if (value.includes('@')) return 'EMAIL';
  if (PHONE_SHAPE_RE.test(value) && (value.match(/\d/g)?.length ?? 0) >= 6) return 'PHONE';
  return 'MATRICULE';
}

/**
 * Normalise un identifiant vers sa forme canonique de stockage.
 *
 * @param defaultCountry pays de l'etablissement, pour interpreter un numero
 *   saisi en format local (« 0101010101 » -> « +2250101010101 »).
 */
export function normalizeIdentifier(raw: string, defaultCountry: string): NormalizedIdentifier {
  const value = raw.trim();
  if (value === '') return { ok: false, reason: 'EMPTY' };

  const kind = detectKind(value);

  if (kind === 'EMAIL') {
    return { ok: true, kind, value: value.toLowerCase() };
  }

  if (kind === 'PHONE') {
    const normalized = normalizePhone(value, defaultCountry);
    if (!normalized) return { ok: false, reason: 'INVALID_PHONE' };
    return { ok: true, kind, value: normalized };
  }

  // Matricule : majuscules, espaces internes retires
  return { ok: true, kind, value: value.toUpperCase().replace(/\s+/g, '') };
}

/**
 * Numero de telephone vers E.164 (« +2250101010101 »), ou null si invalide.
 *
 * Utilise aussi directement lors de l'enregistrement d'un responsable legal.
 */
export function normalizePhone(raw: string, defaultCountry: string): string | null {
  const parsed = parsePhoneNumberFromString(raw.trim(), defaultCountry as CountryCode);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number; // format E.164
}

/**
 * Forme lisible d'un numero E.164 selon le pays (pour l'affichage seulement ;
 * le stockage reste toujours E.164).
 */
export function formatPhoneForDisplay(e164: string, defaultCountry: string): string {
  const parsed = parsePhoneNumberFromString(e164, defaultCountry as CountryCode);
  return parsed ? parsed.formatNational() : e164;
}
