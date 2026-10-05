import { describe, expect, it } from 'vitest';
import { codeFromName, uniqueCode } from './code';

describe('codeFromName', () => {
  it('fait un repère lisible à partir du nom', () => {
    expect(codeFromName('Notes sur 20')).toBe('NOTES_SUR_20');
  });

  it('enlève les accents et la ponctuation', () => {
    expect(codeFromName('Évaluation écrite / contrôle')).toBe('EVALUATION_ECRITE_CONTROLE');
  });

  it('ne rend jamais un code vide', () => {
    expect(codeFromName('   ')).toBe('REPERE');
    expect(codeFromName('※')).toBe('REPERE');
  });
});

describe('uniqueCode', () => {
  it('garde le code quand il est libre', () => {
    expect(uniqueCode('Devoir', [])).toBe('DEVOIR');
  });

  it('suffixe plutôt que de refuser un nom déjà pris', () => {
    expect(uniqueCode('Devoir', ['DEVOIR'])).toBe('DEVOIR_2');
    expect(uniqueCode('Devoir', ['DEVOIR', 'DEVOIR_2'])).toBe('DEVOIR_3');
  });
});
