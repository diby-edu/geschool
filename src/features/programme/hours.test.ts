import { describe, expect, it } from 'vitest';
import { formatHours, hoursValue, minutesFromSessions, parseHours, sessionsValue, toSessions } from './hours';

describe('formatHours', () => {
  it('rend les heures pleines sans minutes', () => {
    expect(formatHours(300)).toBe('5h');
    expect(formatHours(60)).toBe('1h');
  });

  it('rend les demi-heures', () => {
    expect(formatHours(90)).toBe('1h30');
    expect(formatHours(135)).toBe('2h15');
  });

  it('rend un volume inférieur à l’heure en minutes', () => {
    expect(formatHours(45)).toBe('45min');
  });

  it('dit « — » quand aucun volume n’est saisi', () => {
    expect(formatHours(0)).toBe('—');
    expect(formatHours(-10)).toBe('—');
  });
});

describe('hoursValue', () => {
  it('remplit le champ en heures', () => {
    expect(hoursValue(300)).toBe('5');
    expect(hoursValue(90)).toBe('1,5');
  });

  it('laisse le champ vide quand il n’y a pas de volume', () => {
    expect(hoursValue(0)).toBe('');
  });
});

describe('parseHours', () => {
  it('accepte les heures décimales, avec virgule ou point', () => {
    expect(parseHours('5')).toBe(300);
    expect(parseHours('1,5')).toBe(90);
    expect(parseHours('1.5')).toBe(90);
  });

  it('accepte la notation 1h30', () => {
    expect(parseHours('1h30')).toBe(90);
    expect(parseHours('2h')).toBe(120);
    expect(parseHours('2 h 15')).toBe(135);
  });

  it('accepte les minutes', () => {
    expect(parseHours('45min')).toBe(45);
  });

  it('rend 0 sur une saisie vide ou incompréhensible', () => {
    expect(parseHours('')).toBe(0);
    expect(parseHours('   ')).toBe(0);
    expect(parseHours('abc')).toBe(0);
    expect(parseHours('-3')).toBe(0);
  });

  it('plafonne à 3000 minutes, la limite de la base', () => {
    expect(parseHours('99')).toBe(3000);
  });
});

describe('séances', () => {
  it('convertit les minutes stockées en nombre de séances', () => {
    // Créneaux de 55 min : « 5 séances » vaut 275 minutes.
    expect(toSessions(275, 55)).toBe(5);
    expect(toSessions(330, 55)).toBe(6);
    expect(toSessions(440, 55)).toBe(8);
    // Créneaux d'une heure pleine.
    expect(toSessions(300, 60)).toBe(5);
  });

  it('retombe sur le bon compte même si le volume vient d’ailleurs', () => {
    // Un volume saisi en heures rondes avant le passage aux séances.
    expect(toSessions(300, 55)).toBe(5);
    expect(toSessions(360, 55)).toBe(7); // 6h d'horloge, c'est 7 séances de 55 min
  });

  it('rend un champ vide quand rien n’est enseigné', () => {
    expect(sessionsValue(0, 55)).toBe('');
    expect(sessionsValue(275, 55)).toBe('5');
  });

  it('retransforme la saisie en minutes', () => {
    expect(minutesFromSessions('5', 55)).toBe(275);
    expect(minutesFromSessions('5', 60)).toBe(300);
    expect(minutesFromSessions('', 55)).toBe(0);
    expect(minutesFromSessions('abc', 55)).toBe(0);
    expect(minutesFromSessions('-2', 55)).toBe(0);
  });

  it('fait l’aller-retour sans dérive', () => {
    for (const slot of [45, 50, 55, 60]) {
      for (const n of [1, 2, 3, 5, 6, 8]) {
        expect(toSessions(minutesFromSessions(String(n), slot), slot)).toBe(n);
      }
    }
  });
});
