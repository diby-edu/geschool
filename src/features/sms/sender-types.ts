/**
 * Le nom d'expéditeur d'un établissement, et où en est sa validation.
 *
 * Letexto fait valider chaque nom à la main, et cela prend jusqu'à dix jours.
 * Pendant ce temps, l'école doit pouvoir envoyer : elle emprunte alors le nom
 * déjà approuvé de la plateforme.
 *
 * Module NEUTRE : le formulaire de réglage est un composant client.
 */

export const SENDER_STATUSES = ['NONE', 'REQUESTED', 'APPROVED', 'REJECTED'] as const;
export type SenderStatus = (typeof SENDER_STATUSES)[number];

export const SENDER_STATUS_LABELS: Record<SenderStatus, { title: string; hint: string }> = {
  NONE: {
    title: 'Pas encore demandé',
    hint: 'Les SMS partent sous le nom de la plateforme.',
  },
  REQUESTED: {
    title: 'En cours de validation',
    hint: 'Letexto valide à la main, comptez jusqu’à dix jours. Les SMS partent sous le nom de la plateforme en attendant.',
  },
  APPROVED: {
    title: 'Approuvé',
    hint: 'Les SMS partent sous le nom de l’établissement.',
  },
  REJECTED: {
    title: 'Refusé',
    hint: 'Corrigez le dossier et renvoyez-le. Les SMS continuent de partir sous le nom de la plateforme.',
  },
};

/** Règle Letexto, confirmée : de 3 à 11 caractères, espaces compris. */
export const SENDER_MIN = 3;
export const SENDER_MAX = 11;

export type SchoolSender = {
  /** Le nom souhaité par l'établissement. */
  name: string;
  status: SenderStatus;
  /** Date d'envoi du dossier, en ISO. Sert à compter les jours d'attente. */
  requestedOn: string | null;
  /** Motif du refus, tel que Letexto l'a donné. */
  rejectionReason: string | null;
  /** L'école préfère rester sous le nom de la plateforme, même une fois le sien approuvé. */
  usePlatform: boolean;
};

export const DEFAULT_SENDER: SchoolSender = {
  name: '',
  status: 'NONE',
  requestedOn: null,
  rejectionReason: null,
  usePlatform: false,
};

/** Ce qui empêche un nom d'être accepté. */
export function senderProblem(name: string): string | null {
  const n = name.trim();
  if (n.length < SENDER_MIN) return `Le nom d’expéditeur fait au moins ${SENDER_MIN} caractères.`;
  if (n.length > SENDER_MAX) {
    return `Le nom d’expéditeur fait ${SENDER_MAX} caractères au maximum, espaces compris (le vôtre en fait ${n.length}).`;
  }
  // Les opérateurs refusent tout ce qui sort de l'alphabet latin simple.
  if (!/^[A-Za-z0-9 ]+$/.test(n)) {
    return 'Le nom d’expéditeur ne prend que des lettres sans accent, des chiffres et des espaces.';
  }
  if (!/[A-Za-z]/.test(n)) return 'Le nom d’expéditeur doit contenir au moins une lettre.';
  return null;
}

/**
 * Sous quel nom part un SMS de cet établissement.
 *
 * Tant que le sien n'est pas approuvé — ou s'il préfère ne pas l'utiliser —
 * c'est celui de la plateforme. Jamais de nom vide : un SMS sans expéditeur
 * est refusé par l'opérateur.
 */
export function effectiveSender(sender: SchoolSender, platformSender: string): string {
  if (sender.usePlatform) return platformSender;
  if (sender.status === 'APPROVED' && sender.name.trim()) return sender.name.trim();
  return platformSender;
}

/** Depuis combien de jours le dossier attend-il ? */
export function waitingDays(requestedOn: string | null, now = new Date()): number | null {
  if (!requestedOn) return null;
  const d = new Date(requestedOn);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86_400_000));
}
