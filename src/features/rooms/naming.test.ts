import { describe, it, expect } from 'vitest';
import { letterSuffix, planRooms, roomCode } from './naming';

describe('codes de salle', () => {
  it('se déduisent du nom, sans accent ni ponctuation', () => {
    expect(roomCode('Salle de classe 3')).toBe('SALLE-DE-CLASSE-3');
    expect(roomCode('Atelier mécanique')).toBe('ATELIER-MECANIQUE');
  });

  it('ne dépassent jamais vingt caractères', () => {
    expect(roomCode('Salle polyvalente du bâtiment principal').length).toBeLessThanOrEqual(20);
  });
});

describe('création en série', () => {
  it('une seule salle garde son nom', () => {
    expect(planRooms({ baseName: 'Laboratoire SVT', mode: 'ONE' })).toEqual([
      { code: 'LABORATOIRE-SVT', name: 'Laboratoire SVT' },
    ]);
  });

  it('dix salles numérotées', () => {
    const plan = planRooms({ baseName: 'Salle', mode: 'MANY', count: 10, numbering: 'DIGITS' });
    expect(plan).toHaveLength(10);
    expect(plan[0]!.name).toBe('Salle 1');
    expect(plan[9]!.name).toBe('Salle 10');
  });

  it('numérotation en lettres, et démarrage choisi', () => {
    expect(planRooms({ baseName: 'Bloc', mode: 'MANY', count: 3, numbering: 'LETTERS' }).map((r) => r.name)).toEqual([
      'Bloc A',
      'Bloc B',
      'Bloc C',
    ]);
    expect(planRooms({ baseName: 'Salle', mode: 'MANY', count: 2, startAt: 11 }).map((r) => r.name)).toEqual([
      'Salle 11',
      'Salle 12',
    ]);
    expect(letterSuffix(26)).toBe('AA');
  });

  it('aucun nom, aucune salle', () => {
    expect(planRooms({ baseName: '   ', mode: 'MANY', count: 5 })).toEqual([]);
  });

  it('aucun doublon dans une série', () => {
    const plan = planRooms({ baseName: 'Salle', mode: 'MANY', count: 30, numbering: 'LETTERS' });
    expect(new Set(plan.map((r) => r.code)).size).toBe(30);
  });
});
