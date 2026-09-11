import { describe, it, expect } from 'vitest';
import { detectKind, normalizeIdentifier, normalizePhone } from './identifier';

describe('detectKind', () => {
  it('reconnait un email', () => {
    expect(detectKind('directeur@ecole.ci')).toBe('EMAIL');
  });

  it('reconnait un telephone local', () => {
    expect(detectKind('0101010101')).toBe('PHONE');
  });

  it('reconnait un telephone international', () => {
    expect(detectKind('+225 01 01 01 01 01')).toBe('PHONE');
  });

  it('reconnait un matricule', () => {
    expect(detectKind('ELV-2026-008742')).toBe('MATRICULE');
  });
});

describe('normalizeIdentifier', () => {
  it('met l email en minuscule', () => {
    const r = normalizeIdentifier('  Directeur@Ecole.CI ', 'CI');
    expect(r).toEqual({ ok: true, kind: 'EMAIL', value: 'directeur@ecole.ci' });
  });

  it('normalise un telephone local en E.164', () => {
    const r = normalizeIdentifier('01 01 01 01 01', 'CI');
    expect(r).toEqual({ ok: true, kind: 'PHONE', value: '+2250101010101' });
  });

  it('accepte deja E.164 et le conserve', () => {
    const r = normalizeIdentifier('+2250101010101', 'CI');
    expect(r).toEqual({ ok: true, kind: 'PHONE', value: '+2250101010101' });
  });

  it('normalise le matricule en majuscules sans espaces', () => {
    const r = normalizeIdentifier(' elv 2026 008742 ', 'CI');
    // pas d'@, chiffres mais melange lettres -> MATRICULE
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe('MATRICULE');
      expect(r.value).toBe('ELV2026008742');
    }
  });

  it('rejette une saisie vide', () => {
    expect(normalizeIdentifier('   ', 'CI')).toEqual({ ok: false, reason: 'EMPTY' });
  });

  it('rejette un telephone invalide (forme telephone mais numero impossible)', () => {
    // Forme telephone (plus de 6 chiffres) mais trop court pour un numero
    // ivoirien valide.
    expect(normalizeIdentifier('+225 12 34 56', 'CI')).toEqual({
      ok: false,
      reason: 'INVALID_PHONE',
    });
  });

  it('deux ecritures du meme numero convergent', () => {
    const a = normalizeIdentifier('0101010101', 'CI');
    const b = normalizeIdentifier('+225 01-01-01-01-01', 'CI');
    const c = normalizeIdentifier('00225 0101010101', 'CI');
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });
});

describe('normalizePhone', () => {
  it('renvoie null sur un numero invalide', () => {
    expect(normalizePhone('abc', 'CI')).toBeNull();
  });
});
