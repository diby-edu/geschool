import { describe, expect, it } from 'vitest';
import { moveProblems, type SlotChoice } from './move-check';
import type { ValidatorSession } from '@/lib/schedule/validator';
import type { ActiveRule, CourseScope } from './apply';

const session = (id: string, over: Partial<ValidatorSession> = {}): ValidatorSession => ({
  id,
  label: `cours ${id}`,
  dayOfWeek: 1,
  startMin: 480,
  endMin: 540,
  teacherIds: ['koffi'],
  classIds: ['6e1'],
  groupIds: [],
  roomIds: ['s12'],
  ...over,
});

const slot = (dayOfWeek: number, startsAt: string, endsAt: string, id = 'cible'): SlotChoice => ({
  id,
  dayOfWeek,
  startsAt,
  endsAt,
});

const scope: CourseScope = { subjectId: 'eps', classIds: ['6e1'], levelIds: ['6e'], teacherIds: ['koffi'] };

describe('moveProblems', () => {
  it('accepte un créneau libre', () => {
    const sessions = [session('a')];
    expect(moveProblems(sessions, 'a', slot(2, '08:00', '09:00'), null, [])).toEqual([]);
  });

  it('refuse quand l’enseignant est déjà pris', () => {
    const sessions = [
      session('a'),
      session('b', { dayOfWeek: 2, teacherIds: ['koffi'], classIds: ['5e1'], roomIds: ['s20'] }),
    ];
    const problems = moveProblems(sessions, 'a', slot(2, '08:00', '09:00'), null, []);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/cours/i);
  });

  it('refuse quand la classe a déjà cours', () => {
    const sessions = [
      session('a'),
      session('b', { dayOfWeek: 2, teacherIds: ['kone'], classIds: ['6e1'], roomIds: ['s20'] }),
    ];
    expect(moveProblems(sessions, 'a', slot(2, '08:00', '09:00'), null, [])).toHaveLength(1);
  });

  it('refuse quand la salle est occupée', () => {
    const sessions = [
      session('a'),
      session('b', { dayOfWeek: 2, teacherIds: ['kone'], classIds: ['5e1'], roomIds: ['s12'] }),
    ];
    expect(moveProblems(sessions, 'a', slot(2, '08:00', '09:00'), null, [])).toHaveLength(1);
  });

  it('ne signale pas un conflit entre deux AUTRES séances', () => {
    // Deux cours déjà en conflit ailleurs ne doivent pas empêcher ce déplacement.
    const sessions = [
      session('a'),
      session('b', { dayOfWeek: 3, teacherIds: ['kone'], classIds: ['5e1'], roomIds: ['s20'] }),
      session('c', { dayOfWeek: 3, teacherIds: ['kone'], classIds: ['4e1'], roomIds: ['s21'] }),
    ];
    expect(moveProblems(sessions, 'a', slot(2, '08:00', '09:00'), null, [])).toEqual([]);
  });

  it('refuse quand une règle de l’école l’interdit, et la nomme', () => {
    const regle: ActiveRule = {
      code: 'TIME_FORBIDDEN',
      scopeType: 'SUBJECT',
      scopeId: 'eps',
      params: { days: [3] },
      summary: 'Moment interdit — mercredi',
    };
    const problems = moveProblems([session('a')], 'a', slot(3, '08:00', '09:00'), scope, [regle]);
    expect(problems).toEqual(['Votre règle « Moment interdit — mercredi » l’interdit.']);
  });

  it('cumule les raisons plutôt que de s’arrêter à la première', () => {
    const regle: ActiveRule = {
      code: 'TIME_FORBIDDEN',
      scopeType: 'SCHOOL',
      scopeId: null,
      params: { days: [2] },
      summary: 'Moment interdit — mardi',
    };
    const sessions = [
      session('a'),
      session('b', { dayOfWeek: 2, teacherIds: ['koffi'], classIds: ['5e1'], roomIds: ['s20'] }),
    ];
    expect(moveProblems(sessions, 'a', slot(2, '08:00', '09:00'), scope, [regle])).toHaveLength(2);
  });

  it('dit simplement que la séance est introuvable', () => {
    expect(moveProblems([session('a')], 'zzz', slot(2, '08:00', '09:00'), null, [])).toEqual(['Séance introuvable.']);
  });
});
