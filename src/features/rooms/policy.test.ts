import { describe, it, expect } from 'vitest';
import { assignsRooms, checkCapacity, DEFAULT_ROOM_POLICY, readRoomPolicy, roomPolicyPatch } from './policy';

describe('réglage des salles', () => {
  it('sans réglage enregistré, le mélange et un simple avertissement', () => {
    expect(readRoomPolicy(null)).toEqual(DEFAULT_ROOM_POLICY);
    expect(readRoomPolicy({})).toEqual(DEFAULT_ROOM_POLICY);
  });

  it('lit ce qui a été enregistré', () => {
    expect(readRoomPolicy({ rooms: { mode: 'DEDICATED', capacity: 'BLOCK' } })).toEqual({
      mode: 'DEDICATED',
      capacity: 'BLOCK',
    });
  });

  it('une valeur abîmée retombe sur la valeur par défaut', () => {
    expect(readRoomPolicy({ rooms: { mode: 'N’IMPORTE QUOI', capacity: 42 } })).toEqual(DEFAULT_ROOM_POLICY);
  });

  it('aller-retour lecture / écriture', () => {
    const policy = { mode: 'ROTATION', capacity: 'BLOCK' } as const;
    expect(readRoomPolicy(roomPolicyPatch(policy))).toEqual(policy);
  });

  it('en rotation, on n’affecte pas de salle aux classes', () => {
    expect(assignsRooms({ mode: 'ROTATION', capacity: 'WARN' })).toBe(false);
    expect(assignsRooms({ mode: 'DEDICATED', capacity: 'WARN' })).toBe(true);
    expect(assignsRooms({ mode: 'MIXED', capacity: 'WARN' })).toBe(true);
  });
});

describe('capacité', () => {
  const warn = { mode: 'MIXED', capacity: 'WARN' } as const;
  const block = { mode: 'MIXED', capacity: 'BLOCK' } as const;

  it('salle assez grande : rien à signaler', () => {
    expect(checkCapacity(warn, 40, 45, 'B12')).toEqual({ ok: true, blocking: false, message: null });
  });

  it('capacité inconnue (zéro) : on ne bloque pas sur du vide', () => {
    expect(checkCapacity(block, 40, 0, 'B12').ok).toBe(true);
  });

  it('salle trop petite : avertissement qui laisse passer', () => {
    const r = checkCapacity(warn, 60, 30, 'B12');
    expect(r.ok).toBe(true);
    expect(r.message).toContain('30 places pour 60 élèves');
  });

  it('salle trop petite en mode refus : affectation impossible', () => {
    const r = checkCapacity(block, 60, 30, 'B12');
    expect(r.ok).toBe(false);
    expect(r.blocking).toBe(true);
  });
});
