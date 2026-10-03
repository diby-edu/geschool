import { describe, expect, it } from 'vitest';
import { countSms, isUnicode, toGsm, toLocalDialing } from './text';

describe('coût réel d’un SMS', () => {
  it('compte 160 caractères quand le texte reste dans l’alphabet GSM', () => {
    const c = countSms('Votre enfant a ete absent ce matin.');
    expect(c.unicode).toBe(false);
    expect(c.limit).toBe(160);
    expect(c.parts).toBe(1);
  });

  it('laisse passer les accents français courants', () => {
    // é è à ù ì ò ä ö ñ ü appartiennent à l'alphabet GSM : ils ne coûtent rien
    // de plus. C'est le contresens le plus répandu sur les SMS.
    expect(isUnicode('Votre enfant a été absent à 8h, et cela fait trois fois')).toBe(false);
  });

  it('bascule sur un ç minuscule, qui n’est pas dans l’alphabet GSM', () => {
    // Piège contre-intuitif : Ç majuscule y est, ç minuscule non.
    expect(isUnicode('ça fait trois fois')).toBe(true);
    expect(isUnicode('CA fait trois fois')).toBe(false);
  });

  it('bascule à 70 caractères pour un seul tiret long', () => {
    // 95 caractères : sous la limite GSM de 160, au-dessus des 70 de l'Unicode.
    const texte = 'Votre enfant a ete absent ce matin de 8h a 10h, merci de contacter la vie scolaire au plus vite';
    expect(texte.length).toBeGreaterThan(70);
    const sans = countSms(texte);
    const avec = countSms(texte.replace(', merci', ' — merci'));
    expect(sans.unicode).toBe(false);
    expect(sans.parts).toBe(1);
    expect(avec.unicode).toBe(true);
    expect(avec.limit).toBe(70);
    expect(avec.parts).toBe(2); // le même message, deux fois plus cher
  });

  it('dénonce les caractères fautifs', () => {
    expect(countSms('fenêtre').offenders).toEqual(['ê']);
    expect(countSms("l’élève").offenders).toEqual(['’']);
  });

  it('compte deux unités pour les caractères étendus GSM', () => {
    expect(countSms('[').length).toBe(2);
    expect(countSms('€').length).toBe(2);
  });

  it('ne compte rien pour un texte vide', () => {
    expect(countSms('')).toMatchObject({ parts: 0, length: 0 });
  });
});

describe('nettoyage du texte', () => {
  it('remplace les caractères typographiques sans changer le sens', () => {
    expect(toGsm('l’élève — « absent »')).toBe('l\'élève - "absent"');
  });

  it('ramène un message à un seul SMS', () => {
    const avant = 'L’élève était absent ce matin de 8h a 10h — merci d’appeler l’école avant ce soir.';
    expect(countSms(avant).parts).toBe(2);
    const apres = toGsm(avant);
    expect(countSms(apres).unicode).toBe(false);
    expect(countSms(apres).parts).toBe(1);
  });

  it('conserve les accents qui passent', () => {
    expect(toGsm('élève à Côte d’Ivoire')).toContain('élève à C');
    expect(toGsm('élève à Côte d’Ivoire')).toContain("d'Ivoire");
  });

  it('remplace ê î ô û par leur lettre nue', () => {
    expect(toGsm('fenêtre, maître, hôpital, août')).toBe('fenetre, maitre, hopital, aout');
  });
});

describe('format du numéro', () => {
  it('retire le + attendu par Letexto', () => {
    expect(toLocalDialing('+2250747094746')).toBe('2250747094746');
  });

  it('retire aussi les espaces de saisie', () => {
    expect(toLocalDialing('+225 07 47 09 47 46')).toBe('2250747094746');
  });
});
