import { describe, it, expect } from 'vitest';
import { detectConflicts, type ValidatorSession } from './validator';

function s(p: Partial<ValidatorSession> & { id: string }): ValidatorSession {
  return {
    label: p.id,
    dayOfWeek: 1,
    startMin: 480,
    endMin: 540,
    teacherIds: [],
    classIds: [],
    groupIds: [],
    roomIds: [],
    ...p,
  };
}

describe('detectConflicts', () => {
  it('un enseignant, deux cours simultanes -> conflit', () => {
    const c = detectConflicts([
      s({ id: 'a', teacherIds: ['T1'] }),
      s({ id: 'b', teacherIds: ['T1'] }),
    ]);
    expect(c.some((x) => x.kind === 'TEACHER')).toBe(true);
  });

  it('deux classes, deux enseignants -> pas de conflit', () => {
    const c = detectConflicts([
      s({ id: 'a', teacherIds: ['T1'], classIds: ['C1'], roomIds: ['R1'] }),
      s({ id: 'b', teacherIds: ['T2'], classIds: ['C2'], roomIds: ['R2'] }),
    ]);
    expect(c).toHaveLength(0);
  });

  it('meme classe, deux cours simultanes -> conflit', () => {
    const c = detectConflicts([
      s({ id: 'a', classIds: ['C1'] }),
      s({ id: 'b', classIds: ['C1'] }),
    ]);
    expect(c.some((x) => x.kind === 'CLASS')).toBe(true);
  });

  it('meme salle, deux cours simultanes -> conflit', () => {
    const c = detectConflicts([
      s({ id: 'a', roomIds: ['R1'] }),
      s({ id: 'b', roomIds: ['R1'] }),
    ]);
    expect(c.some((x) => x.kind === 'ROOM')).toBe(true);
  });

  it('deux groupes de langues d une meme classe, meme creneau -> autorise', () => {
    // Groupes differents, enseignants et salles differents : simultaneite OK
    const map = new Map([['G_ESP', 'C1'], ['G_ALL', 'C1']]);
    const c = detectConflicts(
      [
        s({ id: 'esp', groupIds: ['G_ESP'], teacherIds: ['T1'], roomIds: ['R1'] }),
        s({ id: 'all', groupIds: ['G_ALL'], teacherIds: ['T2'], roomIds: ['R2'] }),
      ],
      map,
    );
    expect(c).toHaveLength(0);
  });

  it('classe entiere + groupe de cette classe, meme creneau -> conflit (recouvrement)', () => {
    const map = new Map([['G_ESP', 'C1']]);
    const c = detectConflicts(
      [
        s({ id: 'maths', classIds: ['C1'], teacherIds: ['T1'], roomIds: ['R1'] }),
        s({ id: 'esp', groupIds: ['G_ESP'], teacherIds: ['T2'], roomIds: ['R2'] }),
      ],
      map,
    );
    expect(c.some((x) => x.kind === 'CLASS')).toBe(true);
  });

  it('memes ressources mais creneaux disjoints -> pas de conflit', () => {
    const c = detectConflicts([
      s({ id: 'a', teacherIds: ['T1'], startMin: 480, endMin: 540 }),
      s({ id: 'b', teacherIds: ['T1'], startMin: 540, endMin: 600 }),
    ]);
    expect(c).toHaveLength(0);
  });

  it('memes ressources mais jours differents -> pas de conflit', () => {
    const c = detectConflicts([
      s({ id: 'a', teacherIds: ['T1'], dayOfWeek: 1 }),
      s({ id: 'b', teacherIds: ['T1'], dayOfWeek: 2 }),
    ]);
    expect(c).toHaveLength(0);
  });
});
