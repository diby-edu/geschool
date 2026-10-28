import { describe, it, expect } from 'vitest';
import { DEFAULT_ALERT_SETTINGS, evaluateAlerts, normalizeAlertSettings, smsAllowedNow, type AlertInput } from './alerts-core';

const calm: AlertInput = {
  now: new Date('2026-10-28T10:00:00Z'),
  site: { lastMs: 240, previousMs: 210 },
  lastSnapshotMinutes: 3,
  memPct: 45,
  diskPct: 42,
  dbPct: 74,
  failedTasks: [],
  hoursSinceBackup: 8,
  lastBackupFailed: false,
  smsCredit: 4070,
  certDaysLeft: 88,
  errorsLastHour: 0,
  loginFailsLastHour: 2,
};
const keys = (i: Partial<AlertInput>, s = DEFAULT_ALERT_SETTINGS) => evaluateAlerts({ ...calm, ...i }, s).map((c) => c.key);

describe('evaluateAlerts', () => {
  it('tout va bien : aucune alerte (74 % de base reste sous le seuil de 85 %)', () => {
    expect(keys({})).toEqual([]);
  });

  it('site lent une seule fois : pas d’alerte ; deux relevés de suite : alerte', () => {
    expect(keys({ site: { lastMs: 4000, previousMs: 200 } })).toEqual([]);
    expect(keys({ site: { lastMs: 4000, previousMs: 3500 } })).toEqual(['site']);
    expect(keys({ site: { lastMs: null, previousMs: null } })).toEqual(['site']);
  });

  it('plus de relevé depuis 20 min : worker arrêté', () => {
    expect(keys({ lastSnapshotMinutes: 25 })).toEqual(['worker']);
    expect(keys({ lastSnapshotMinutes: null })).toEqual(['worker']);
  });

  it('sauvegarde : échouée, ou plus de 26 h sans copie réussie', () => {
    expect(keys({ lastBackupFailed: true })).toEqual(['backup']);
    expect(keys({ hoursSinceBackup: 30 })).toEqual(['backup']);
    expect(keys({ hoursSinceBackup: 25 })).toEqual([]);
  });

  it('seuils : disque, base, crédit SMS, certificat, erreurs, attaque', () => {
    expect(keys({ diskPct: 91 })).toEqual(['server']);
    expect(keys({ dbPct: 86 })).toEqual(['db']);
    expect(keys({ smsCredit: 120 })).toEqual(['sms']);
    expect(keys({ certDaysLeft: 9 })).toEqual(['cert']);
    expect(keys({ errorsLastHour: 50 })).toEqual(['errors']);
    expect(keys({ loginFailsLastHour: 300 })).toEqual(['attack']);
  });

  it('une mesure indisponible n’alerte jamais à elle seule', () => {
    expect(keys({ memPct: null, diskPct: null, dbPct: null, smsCredit: null, certDaysLeft: null, errorsLastHour: null, loginFailsLastHour: null })).toEqual([]);
  });

  it('une vérification décochée ne donne rien', () => {
    const s = normalizeAlertSettings({ checks: { db: false } });
    expect(keys({ dbPct: 99 }, s)).toEqual([]);
  });
});

describe('réglages et nuit', () => {
  it('des valeurs absurdes reviennent aux valeurs par défaut', () => {
    const s = normalizeAlertSettings({ reminderHours: 0, thresholds: { diskPct: 300, smsCredit: -5 } });
    expect(s.reminderHours).toBe(6);
    expect(s.thresholds.diskPct).toBe(90);
    expect(s.thresholds.smsCredit).toBe(500);
  });

  it('nuit calme : pas de SMS à 23 h, sauf urgence', () => {
    const s = normalizeAlertSettings({ quietNight: true });
    const night = new Date('2026-10-28T23:00:00Z');
    expect(smsAllowedNow(s, { urgent: false }, night)).toBe(false);
    expect(smsAllowedNow(s, { urgent: true }, night)).toBe(true);
    expect(smsAllowedNow(s, { urgent: false }, new Date('2026-10-28T09:00:00Z'))).toBe(true);
  });
});
