/**
 * Comment l'établissement occupe ses salles.
 *
 * Toutes les écoles ne fonctionnent pas pareil :
 *   - assez de salles   -> chaque classe a la sienne, les professeurs se déplacent ;
 *   - pas assez         -> les classes tournent, la salle se choisit cours par cours ;
 *   - le plus courant   -> un mélange des deux.
 *
 * Dans tous les cas, un cours peut exiger une salle particulière (laboratoire,
 * atelier, terrain) : cette exigence passe avant la salle de la classe.
 */

export type RoomMode = 'DEDICATED' | 'ROTATION' | 'MIXED';
/** Effectif supérieur à la capacité : avertir, ou refuser. */
export type CapacityRule = 'WARN' | 'BLOCK';

export type RoomPolicy = { mode: RoomMode; capacity: CapacityRule };

/** Par défaut : le mélange, et un simple avertissement — le cas le moins contraignant. */
export const DEFAULT_ROOM_POLICY: RoomPolicy = { mode: 'MIXED', capacity: 'WARN' };

export const ROOM_MODE_LABELS: Record<RoomMode, { title: string; hint: string }> = {
  DEDICATED: {
    title: 'Une salle par classe',
    hint: 'Chaque classe reste dans sa salle ; les professeurs se déplacent. Pour une école qui a assez de salles.',
  },
  ROTATION: {
    title: 'Rotation des salles',
    hint: 'Aucune salle attitrée : la salle se choisit cours par cours. Pour une école qui a moins de salles que de classes.',
  },
  MIXED: {
    title: 'Mélange des deux',
    hint: 'Certaines classes ont leur salle, les autres tournent. C’est le cas le plus fréquent.',
  },
};

export const CAPACITY_RULE_LABELS: Record<CapacityRule, { title: string; hint: string }> = {
  WARN: { title: 'Avertir', hint: 'La salle trop petite est signalée, mais l’affectation passe.' },
  BLOCK: { title: 'Refuser', hint: 'Impossible d’affecter une salle plus petite que l’effectif.' },
};

const isMode = (v: unknown): v is RoomMode => v === 'DEDICATED' || v === 'ROTATION' || v === 'MIXED';
const isRule = (v: unknown): v is CapacityRule => v === 'WARN' || v === 'BLOCK';

/** Lit le réglage dans l'espace « schedule » des paramètres, sans jamais échouer. */
export function readRoomPolicy(settings: Record<string, unknown> | null | undefined): RoomPolicy {
  const raw = (settings?.rooms ?? {}) as Record<string, unknown>;
  return {
    mode: isMode(raw.mode) ? raw.mode : DEFAULT_ROOM_POLICY.mode,
    capacity: isRule(raw.capacity) ? raw.capacity : DEFAULT_ROOM_POLICY.capacity,
  };
}

/** L'écriture correspondante : un objet imbriqué, pour ne pas encombrer l'espace. */
export function roomPolicyPatch(policy: RoomPolicy): Record<string, unknown> {
  return { rooms: { mode: policy.mode, capacity: policy.capacity } };
}

/** Affecte-t-on des salles aux classes dans ce mode ? En rotation, non. */
export function assignsRooms(policy: RoomPolicy): boolean {
  return policy.mode !== 'ROTATION';
}

export type CapacityCheck = { ok: boolean; blocking: boolean; message: string | null };

/**
 * Compare l'effectif à la capacité de la salle. `students` est le nombre
 * d'élèves inscrits ; à défaut, l'effectif maximum saisi sur la classe.
 */
export function checkCapacity(policy: RoomPolicy, students: number, roomCapacity: number, roomName: string): CapacityCheck {
  if (roomCapacity <= 0 || students <= roomCapacity) return { ok: true, blocking: false, message: null };
  const message = `« ${roomName} » compte ${roomCapacity} places pour ${students} élèves.`;
  return policy.capacity === 'BLOCK'
    ? { ok: false, blocking: true, message: `${message} Choisissez une salle plus grande.` }
    : { ok: true, blocking: false, message };
}
