import { describe, expect, it } from 'vitest';
import { ruleBasedAppreciation } from './rule-based';
import type { AppreciationInput } from './types';

const base: AppreciationInput = {
  studentName: 'ELEVE Ama',
  generalAverage: 15.5,
  classAverage: 13.75,
  rank: 1,
  classSize: 2,
  passingScore: 10,
  absences: 0,
  lateness: 0,
  subjects: [
    { name: 'Mathematiques', average: 15.5, classAverage: 13.75 },
    { name: 'Francais', average: 8, classAverage: 10 },
  ],
};

describe('ruleBasedAppreciation', () => {
  it('résume niveau, rang, points forts et faibles', () => {
    const text = ruleBasedAppreciation(base);
    expect(text).toContain('15.50');
    expect(text).toContain('rang 1 sur 2');
    expect(text).toContain('au-dessus de la moyenne de la classe');
    expect(text).toContain('Mathematiques'); // point fort (>= 12)
    expect(text).toContain('Francais'); // à consolider (< 10)
  });

  it('est déterministe', () => {
    expect(ruleBasedAppreciation(base)).toBe(ruleBasedAppreciation(base));
  });

  it('gère l’absence de moyenne', () => {
    const text = ruleBasedAppreciation({ ...base, generalAverage: null, subjects: [] });
    expect(text).toContain('pas encore de moyenne');
  });

  it('signale l’assiduité', () => {
    const text = ruleBasedAppreciation({ ...base, absences: 2, lateness: 1 });
    expect(text).toContain('2 absences');
    expect(text).toContain('1 retard');
  });

  it('demande plus de travail sous la moyenne', () => {
    const text = ruleBasedAppreciation({ ...base, generalAverage: 7, classAverage: 10 });
    expect(text).toContain('en deçà de la moyenne de la classe');
    expect(text.toLowerCase()).toContain('travail plus soutenu');
  });
});
