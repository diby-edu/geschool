import { describe, expect, it } from 'vitest';
import { blocksOf, moveProblems, spanOf, type SlotChoice } from './move-check';
import type { ValidatorSession } from '@/lib/schedule/validator';

const grid: SlotChoice[] = [
  { id: 'l1', dayOfWeek: 1, startsAt: '08:00', endsAt: '09:00' },
  { id: 'l2', dayOfWeek: 1, startsAt: '09:00', endsAt: '10:00' },
  { id: 'l3', dayOfWeek: 1, startsAt: '10:15', endsAt: '11:15' },
  { id: 'm1', dayOfWeek: 2, startsAt: '08:00', endsAt: '09:00' },
];

describe('un cours de 2 h se déplace en entier', () => {
  it('spanOf : un cours de l1 à l2 occupe 2 créneaux', () => {
    expect(spanOf(grid, 'l1', 'l2')).toBe(2);
    expect(spanOf(grid, 'l1', null)).toBe(1);
    expect(spanOf(grid, 'inconnu', null)).toBe(1);
  });

  it('blocksOf : seuls les départs où 2 créneaux tiennent dans la journée', () => {
    expect(blocksOf(grid, 2)).toEqual([
      { id: 'l1', endId: 'l2', dayOfWeek: 1, startsAt: '08:00', endsAt: '10:00' },
      { id: 'l2', endId: 'l3', dayOfWeek: 1, startsAt: '09:00', endsAt: '11:15' },
    ]);
  });

  it('un conflit dans la DEUXIÈME heure du bloc est vu', () => {
    const sessions: ValidatorSession[] = [
      { id: 'maths', label: 'Maths', dayOfWeek: 2, startMin: 480, endMin: 600, teacherIds: ['yao'], classIds: ['4eA'], groupIds: [], roomIds: [] },
      { id: 'pc', label: 'PC', dayOfWeek: 1, startMin: 540, endMin: 600, teacherIds: ['yao'], classIds: ['4eB'], groupIds: [], roomIds: [] },
    ];
    const block = blocksOf(grid, 2)[0]!; // lundi 8h-10h ; Yao est pris de 9h à 10h
    expect(moveProblems(sessions, 'maths', block, null, [])).toHaveLength(1);
  });
});
