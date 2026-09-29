/**
 * Nom d'une personne tel que l'école l'écrit : NOM en capitales, puis prénoms
 * (« KOFFI Diby Modeste »). Même ordre partout — en-tête, listes, journal —
 * pour qu'une personne se retrouve d'un écran à l'autre.
 *
 * Sans nom de famille connu, on retombe sur le nom affiché enregistré, puis sur
 * `fallback` (email, « — »…).
 */
export function personName(
  person: { first_name?: string | null; last_name?: string | null; display_name?: string | null } | null | undefined,
  fallback = '—',
): string {
  const last = person?.last_name?.trim();
  const first = person?.first_name?.trim();
  if (last) return [last.toUpperCase(), first].filter(Boolean).join(' ');
  return person?.display_name?.trim() || first || fallback;
}
