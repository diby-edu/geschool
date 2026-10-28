/**
 * Alertes de la page Technique (lot B, 0154) : les réglages, et la règle qui
 * dit ce qui est un problème. Pur (aucun accès réseau ni base) : testé dans
 * alerts-core.test.ts, appelé par services/platform-alerts.ts.
 */

export const ALERT_CHECKS = [
  { key: 'site', label: 'Site injoignable ou très lent', urgent: true },
  { key: 'worker', label: 'Worker arrêté (plus de relevé)', urgent: true },
  { key: 'tasks', label: 'Tâche de nuit échouée', urgent: false },
  { key: 'backup', label: 'Sauvegarde manquée ou échouée', urgent: false },
  { key: 'server', label: 'Disque ou mémoire presque pleins', urgent: false },
  { key: 'db', label: 'Base de données presque pleine', urgent: false },
  { key: 'sms', label: 'Crédit SMS bas', urgent: false },
  { key: 'cert', label: 'Certificat HTTPS bientôt expiré', urgent: false },
  { key: 'errors', label: 'Beaucoup d’erreurs en une heure', urgent: false },
  { key: 'attack', label: 'Attaque probable (connexions ratées)', urgent: true },
] as const;
export type AlertCheckKey = (typeof ALERT_CHECKS)[number]['key'];

export type AlertSettings = {
  sms: boolean;
  email: boolean;
  phone: string;
  emailTo: string;
  /** Pas de SMS entre 22 h et 6 h, sauf pour les problèmes urgents. */
  quietNight: boolean;
  /** Rappel si le problème dure, toutes les N heures. */
  reminderHours: number;
  checks: Record<AlertCheckKey, boolean>;
  thresholds: {
    slowMs: number;
    diskPct: number;
    memPct: number;
    dbPct: number;
    smsCredit: number;
    certDays: number;
    errorsPerHour: number;
    loginFailsPerHour: number;
  };
};

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  sms: true,
  email: false,
  phone: '',
  emailTo: '',
  quietNight: false,
  reminderHours: 6,
  checks: Object.fromEntries(ALERT_CHECKS.map((c) => [c.key, true])) as Record<AlertCheckKey, boolean>,
  thresholds: { slowMs: 3000, diskPct: 90, memPct: 90, dbPct: 85, smsCredit: 500, certDays: 15, errorsPerHour: 20, loginFailsPerHour: 50 },
};

const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v));
  return v !== '' && v !== null && v !== undefined && Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};

export function normalizeAlertSettings(raw: unknown): AlertSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const checks = (o.checks && typeof o.checks === 'object' ? o.checks : {}) as Record<string, unknown>;
  const th = (o.thresholds && typeof o.thresholds === 'object' ? o.thresholds : {}) as Record<string, unknown>;
  const d = DEFAULT_ALERT_SETTINGS;
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  return {
    sms: typeof o.sms === 'boolean' ? o.sms : d.sms,
    email: typeof o.email === 'boolean' ? o.email : d.email,
    phone: text(o.phone, 30),
    emailTo: text(o.emailTo, 160),
    quietNight: typeof o.quietNight === 'boolean' ? o.quietNight : d.quietNight,
    reminderHours: int(o.reminderHours, 1, 72, d.reminderHours),
    checks: Object.fromEntries(ALERT_CHECKS.map((c) => [c.key, typeof checks[c.key] === 'boolean' ? checks[c.key] : true])) as Record<AlertCheckKey, boolean>,
    thresholds: {
      slowMs: int(th.slowMs, 500, 60_000, d.thresholds.slowMs),
      diskPct: int(th.diskPct, 50, 99, d.thresholds.diskPct),
      memPct: int(th.memPct, 50, 99, d.thresholds.memPct),
      dbPct: int(th.dbPct, 50, 99, d.thresholds.dbPct),
      smsCredit: int(th.smsCredit, 0, 1_000_000, d.thresholds.smsCredit),
      certDays: int(th.certDays, 1, 60, d.thresholds.certDays),
      errorsPerHour: int(th.errorsPerHour, 1, 10_000, d.thresholds.errorsPerHour),
      loginFailsPerHour: int(th.loginFailsPerHour, 5, 100_000, d.thresholds.loginFailsPerHour),
    },
  };
}

/** Ce que l'on sait au moment de vérifier. `null` = mesure indisponible : jamais une alerte à elle seule. */
export type AlertInput = {
  now: Date;
  /** Les deux derniers relevés (le plus récent d'abord) : un site lent UNE fois n'alerte pas. */
  site: { lastMs: number | null; previousMs: number | null } | null;
  /** Âge du dernier relevé, en minutes (null : aucun relevé). */
  lastSnapshotMinutes: number | null;
  memPct: number | null;
  diskPct: number | null;
  dbPct: number | null;
  /** Tâches échouées dans l'heure, par nom lisible. */
  failedTasks: string[];
  /** Heures depuis la dernière sauvegarde réussie (null : aucune). */
  hoursSinceBackup: number | null;
  lastBackupFailed: boolean;
  smsCredit: number | null;
  certDaysLeft: number | null;
  errorsLastHour: number | null;
  loginFailsLastHour: number | null;
};

export type AlertCondition = { key: AlertCheckKey; message: string; urgent: boolean };

const URGENT = new Set<AlertCheckKey>(ALERT_CHECKS.filter((c) => c.urgent).map((c) => c.key));

/** Les problèmes en cours, d'après les réglages. Une sorte = au plus une condition. */
export function evaluateAlerts(input: AlertInput, s: AlertSettings): AlertCondition[] {
  const out: AlertCondition[] = [];
  const t = s.thresholds;
  const add = (key: AlertCheckKey, message: string) => {
    if (s.checks[key]) out.push({ key, message, urgent: URGENT.has(key) });
  };

  if (input.site) {
    const { lastMs, previousMs } = input.site;
    const bad = (v: number | null) => v === null || v > t.slowMs;
    // Deux relevés de suite (10 min) : un hoquet isolé ne réveille personne.
    if (bad(lastMs) && bad(previousMs)) {
      add('site', lastMs === null ? 'Le site ne répond plus.' : `Le site est très lent (${(lastMs / 1000).toLocaleString('fr-FR')} s).`);
    }
  }
  if (input.lastSnapshotMinutes === null || input.lastSnapshotMinutes > 20) {
    add('worker', input.lastSnapshotMinutes === null ? 'Aucun relevé du worker.' : `Le worker ne fait plus de relevé depuis ${input.lastSnapshotMinutes} min.`);
  }
  if (input.failedTasks.length > 0) add('tasks', `Tâche échouée : ${input.failedTasks.join(', ')}.`);
  // Copie à 2 h : on n'accuse une nuit manquée qu'après 26 h, pour laisser le temps à celle du jour.
  if (input.lastBackupFailed) add('backup', 'La dernière sauvegarde de la base a échoué.');
  else if (input.hoursSinceBackup === null || input.hoursSinceBackup > 26) {
    add('backup', input.hoursSinceBackup === null ? 'Aucune sauvegarde réussie de la base.' : `Pas de sauvegarde réussie depuis ${Math.round(input.hoursSinceBackup)} h.`);
  }
  const full: string[] = [];
  if (input.diskPct !== null && input.diskPct >= t.diskPct) full.push(`disque à ${Math.round(input.diskPct)} %`);
  if (input.memPct !== null && input.memPct >= t.memPct) full.push(`mémoire à ${Math.round(input.memPct)} %`);
  if (full.length > 0) add('server', `Serveur : ${full.join(', ')}.`);
  if (input.dbPct !== null && input.dbPct >= t.dbPct) add('db', `Base de données à ${Math.round(input.dbPct)} % de la taille permise.`);
  if (input.smsCredit !== null && input.smsCredit < t.smsCredit) add('sms', `Crédit SMS bas : ${input.smsCredit} SMS restants.`);
  if (input.certDaysLeft !== null && input.certDaysLeft < t.certDays) add('cert', `Le certificat HTTPS expire dans ${Math.max(0, Math.floor(input.certDaysLeft))} jour(s).`);
  if (input.errorsLastHour !== null && input.errorsLastHour > t.errorsPerHour) add('errors', `${input.errorsLastHour} erreurs en une heure.`);
  if (input.loginFailsLastHour !== null && input.loginFailsLastHour > t.loginFailsPerHour) {
    add('attack', `${input.loginFailsLastHour} connexions ratées en une heure : attaque probable.`);
  }
  return out;
}

/** Nuit à Abidjan (UTC) : de 22 h à 6 h. */
export const isNight = (d: Date) => d.getUTCHours() >= 22 || d.getUTCHours() < 6;

/** Ce SMS peut-il partir maintenant ? (l'e-mail part toujours) */
export const smsAllowedNow = (s: AlertSettings, c: { urgent: boolean }, now: Date) => s.sms && (!s.quietNight || c.urgent || !isNight(now));
