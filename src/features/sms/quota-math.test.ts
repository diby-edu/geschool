import { describe, expect, it } from 'vitest';
import {
  buildQuota,
  currentMonth,
  premiereLigneQuota,
  quotaAllows,
  quotaLabel,
  WARN_RATIO,
} from './quota-math';

/**
 * Le quota de SMS.
 *
 * Deux regles comptent plus que les autres : un quota non configure ne bloque
 * RIEN (sinon une ecole devient muette parce que l'editeur n'a pas rempli ses
 * formules), et un envoi de plusieurs parts ne doit pas pouvoir franchir la
 * limite en une fois.
 */

describe('buildQuota', () => {
  it('ne pose aucune limite quand rien n’est configuré', () => {
    const q = buildQuota(0, 0, 0);
    expect(q.unlimited).toBe(true);
    expect(q.remaining).toBe(Number.POSITIVE_INFINITY);
    expect(q.ratio).toBe(0);
  });

  it('ne pose aucune limite même si des SMS ont déjà été consommés', () => {
    // Le cas d'une ecole qui envoyait avant l'arrivee du quota : elle ne doit
    // pas se retrouver bloquee du jour au lendemain.
    const q = buildQuota(0, 0, 4_000);
    expect(q.unlimited).toBe(true);
    expect(quotaAllows(q)).toBe(true);
  });

  it('additionne l’inclus et le complément accordé', () => {
    const q = buildQuota(500, 200, 120);
    expect(q.limit).toBe(700);
    expect(q.remaining).toBe(580);
    expect(q.unlimited).toBe(false);
  });

  it('ne descend pas sous zéro quand la consommation dépasse', () => {
    const q = buildQuota(100, 0, 150);
    expect(q.remaining).toBe(0);
    expect(q.ratio).toBe(1);
  });

  it('ignore des nombres négatifs venus de la base', () => {
    const q = buildQuota(-50, -10, 0);
    expect(q.limit).toBe(0);
    expect(q.unlimited).toBe(true);
  });
});

describe('quotaAllows', () => {
  it('laisse passer tant que la limite n’est pas atteinte', () => {
    expect(quotaAllows(buildQuota(10, 0, 9))).toBe(true);
    expect(quotaAllows(buildQuota(10, 0, 10))).toBe(false);
  });

  it('compte les parts : un message long ne doit pas franchir la limite', () => {
    // Un message hors alphabet GSM est facture 2 SMS : avec 9 sur 10 utilises,
    // il ne passe pas.
    const q = buildQuota(10, 0, 9);
    expect(quotaAllows(q, 1)).toBe(true);
    expect(quotaAllows(q, 2)).toBe(false);
  });

  it('laisse tout passer quand aucune limite n’est posée', () => {
    expect(quotaAllows(buildQuota(0, 0, 10_000), 50)).toBe(true);
  });
});

describe('seuil d’avertissement', () => {
  it('se déclenche à 80 % et pas avant', () => {
    expect(buildQuota(100, 0, 79).ratio >= WARN_RATIO).toBe(false);
    expect(buildQuota(100, 0, 80).ratio >= WARN_RATIO).toBe(true);
  });
});

describe('quotaLabel', () => {
  it('dit franchement qu’aucune limite n’est posée', () => {
    expect(quotaLabel(buildQuota(0, 0, 0))).toContain('Aucune limite');
  });

  it('donne les deux nombres', () => {
    const texte = quotaLabel(buildQuota(500, 0, 312));
    expect(texte).toContain('312');
    expect(texte).toContain('500');
  });
});

describe('premiereLigneQuota', () => {
  it('rend null quand la base ne renvoie rien (droit absent)', () => {
    expect(premiereLigneQuota(null)).toBeNull();
    expect(premiereLigneQuota([])).toBeNull();
  });

  it('prend la première ligne', () => {
    expect(premiereLigneQuota([{ included: 1, granted: 2, used: 3 }])).toEqual({
      included: 1,
      granted: 2,
      used: 3,
    });
  });
});

describe('currentMonth', () => {
  it('rend le premier jour du mois, à deux chiffres', () => {
    expect(currentMonth(new Date(2026, 9, 4))).toBe('2026-10-01');
    expect(currentMonth(new Date(2026, 0, 31))).toBe('2026-01-01');
  });

  it('suit le fuseau local, pas UTC', () => {
    // Un 1er du mois a 00h30 locale ne doit pas basculer sur le mois d'avant.
    expect(currentMonth(new Date(2026, 10, 1, 0, 30))).toBe('2026-11-01');
  });
});
