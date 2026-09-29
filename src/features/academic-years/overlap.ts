/** Période (ou congé) : bornes incluses, dates AAAA-MM-JJ. */
export type DatedRange = { id: string; name: string; starts_on: string; ends_on: string };

/** Première période qui chevauche [startsOn ; endsOn], en ignorant `exceptId` (celle qu'on modifie). */
export function findOverlap<T extends DatedRange>(ranges: readonly T[], startsOn: string, endsOn: string, exceptId: string | null): T | null {
  return ranges.find((r) => r.id !== exceptId && startsOn <= r.ends_on && endsOn >= r.starts_on) ?? null;
}
