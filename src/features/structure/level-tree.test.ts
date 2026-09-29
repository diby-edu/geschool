import { describe, it, expect } from 'vitest';
import { groupLevels, suggestLevelCode } from './level-tree';

const l = (id: string, track: string | null, diploma: string | null = null) => ({
  id,
  name: id,
  code: id.toUpperCase(),
  track,
  diploma,
});

describe('groupLevels', () => {
  it('range par ordre : général, puis technique, puis professionnel', () => {
    const groups = groupLevels([l('a', 'PROFESSIONNEL', 'BT'), l('b', 'GENERAL'), l('c', 'TECHNIQUE')]);
    expect(groups.map((g) => g.track)).toEqual(['GENERAL', 'TECHNIQUE', 'PROFESSIONNEL']);
  });

  it('un ordre absent ne crée pas de groupe vide', () => {
    expect(groupLevels([l('b', 'GENERAL')]).map((g) => g.track)).toEqual(['GENERAL']);
  });

  it('le professionnel se range par diplôme, du plus court au plus long', () => {
    const groups = groupLevels([
      l('1', 'PROFESSIONNEL', 'BT'),
      l('2', 'PROFESSIONNEL', 'CAP'),
      l('3', 'PROFESSIONNEL', null),
      l('4', 'PROFESSIONNEL', 'BEP'),
    ]);
    expect(groups[0]!.subs.map((s) => s.key)).toEqual(['CAP', 'BEP', 'BT', 'AUTRES']);
    expect(groups[0]!.total).toBe(4);
  });

  it('le général et le technique restent en une seule liste', () => {
    const groups = groupLevels([l('a', 'TECHNIQUE'), l('b', 'TECHNIQUE')]);
    expect(groups[0]!.subs).toHaveLength(1);
    expect(groups[0]!.subs[0]!.label).toBeNull();
  });

  it('un niveau sans ordre compte comme général', () => {
    expect(groupLevels([l('a', null)])[0]!.track).toBe('GENERAL');
  });
});

describe('suggestLevelCode', () => {
  it('abrège les niveaux du général comme les codes officiels', () => {
    expect(suggestLevelCode('Terminale D')).toBe('TLE-D');
    expect(suggestLevelCode('Première A1')).toBe('1ERE-A1');
    expect(suggestLevelCode('Quatrième')).toBe('4E');
    expect(suggestLevelCode('Sixième')).toBe('6E');
  });

  it('garde le reste tel quel, sans accent ni ponctuation', () => {
    expect(suggestLevelCode('1 BT Compta-Com')).toBe('1-BT-COMPTA-COM');
    expect(suggestLevelCode('  ')).toBe('');
  });

  it('ne dépasse jamais 20 caractères', () => {
    expect(suggestLevelCode('Niveau au nom vraiment tres long').length).toBeLessThanOrEqual(20);
  });
});
