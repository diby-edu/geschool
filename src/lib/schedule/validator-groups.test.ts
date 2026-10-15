import { describe, expect, it } from 'vitest';
import { detectConflicts, overlappingGroupPairs, type GroupContext, type ValidatorSession } from './validator';

function s(p: Partial<ValidatorSession> & { id: string }): ValidatorSession {
  return { label: p.id, dayOfWeek: 1, startMin: 480, endMin: 540, teacherIds: [], classIds: [], groupIds: [], roomIds: [], ...p };
}

describe('groupes : toutes leurs classes, et leurs élèves', () => {
  it('un groupe réunissant 4e A et 4e B gêne aussi la 4e B (plus seulement la première classe)', () => {
    const groups: GroupContext = { classesOf: new Map([['ALL', ['4eA', '4eB']]]) };
    const c = detectConflicts([s({ id: 'allemand', groupIds: ['ALL'] }), s({ id: 'maths-4eB', classIds: ['4eB'] })], groups);
    expect(c.map((x) => x.kind)).toEqual(['CLASS']);
  });

  it('Espagnol et option Latin, avec un élève en commun, à la même heure : conflit', () => {
    const groups: GroupContext = {
      classesOf: new Map(),
      studentsOf: new Map([
        ['ESP', new Set(['koffi', 'awa'])],
        ['LAT', new Set(['koffi'])],
      ]),
    };
    const c = detectConflicts([s({ id: 'espagnol', groupIds: ['ESP'] }), s({ id: 'latin', groupIds: ['LAT'] })], groups);
    expect(c).toHaveLength(1);
    expect(c[0]!.message).toContain('élèves en commun');
  });

  it('Espagnol et Allemand, sans élève en commun : pas de conflit (cas normal des langues)', () => {
    const groups: GroupContext = {
      classesOf: new Map(),
      studentsOf: new Map([
        ['ESP', new Set(['koffi'])],
        ['ALL', new Set(['awa'])],
      ]),
    };
    expect(detectConflicts([s({ id: 'esp', groupIds: ['ESP'] }), s({ id: 'all', groupIds: ['ALL'] })], groups)).toEqual([]);
  });

  it('l’ancienne forme (un groupe -> une classe) marche toujours', () => {
    const c = detectConflicts([s({ id: 'g', groupIds: ['G'] }), s({ id: 'c', classIds: ['C1'] })], new Map([['G', 'C1']]));
    expect(c.map((x) => x.kind)).toEqual(['CLASS']);
  });

  it('overlappingGroupPairs : seuls les groupes qui partagent un élève', () => {
    const pairs = overlappingGroupPairs({
      classesOf: new Map(),
      studentsOf: new Map([
        ['ESP', new Set(['koffi'])],
        ['ALL', new Set(['awa'])],
        ['LAT', new Set(['koffi', 'awa'])],
      ]),
    });
    expect(pairs).toEqual([
      ['ESP', 'LAT'],
      ['ALL', 'LAT'],
    ]);
  });
});
