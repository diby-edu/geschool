import { describe, expect, it } from 'vitest';
import { buildCsv, csvCell, csvPhone, frenchDate } from './csv';

describe('csvCell', () => {
  it('laisse passer un texte simple et vide null/undefined', () => {
    expect(csvCell('Kouassi')).toBe('Kouassi');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(12)).toBe('12');
  });

  it('met entre guillemets ce qui contient le séparateur, un guillemet ou un saut de ligne', () => {
    expect(csvCell('a;b')).toBe('"a;b"');
    expect(csvCell('dit "oui"')).toBe('"dit ""oui"""');
    expect(csvCell('ligne1\nligne2')).toBe('"ligne1\nligne2"');
  });

  it('neutralise les débuts de formule (injection CSV)', () => {
    expect(csvCell('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(csvCell('+1+1')).toBe("'+1+1");
    expect(csvCell('-2')).toBe("'-2");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('\tcmd')).toBe("'\tcmd");
  });

  it('ne modifie pas un tiret ou un signe au milieu du texte', () => {
    expect(csvCell('ELV-2-000651')).toBe('ELV-2-000651');
    expect(csvCell("N'Guessan")).toBe("N'Guessan");
  });
});

describe('csvPhone', () => {
  it('force le texte pour un numéro E.164 validé', () => {
    expect(csvPhone('+2250708090001')).toBe('="+2250708090001"');
  });

  it('traite comme du texte ordinaire (donc neutralisé) tout ce qui n’est pas un E.164 strict', () => {
    expect(csvPhone('+225 07; 08')).toBe(`"'+225 07; 08"`);
    expect(csvPhone('=1+1')).toBe("'=1+1");
    expect(csvPhone('')).toBe('');
    expect(csvPhone(null)).toBe('');
  });
});

describe('buildCsv', () => {
  it('commence par le BOM, sépare par ; et termine chaque ligne par CRLF', () => {
    const out = buildCsv(['Nom', 'Classe'], [['Kouassi', '6ème 1'], ['Traoré', '5ème 2']]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out.slice(1)).toBe('Nom;Classe\r\nKouassi;6ème 1\r\nTraoré;5ème 2\r\n');
  });

  it('protège aussi l’en-tête', () => {
    expect(buildCsv(['=x'], []).slice(1)).toBe("'=x\r\n");
  });
});

describe('frenchDate', () => {
  it('convertit aaaa-mm-jj en jj/mm/aaaa sans décalage', () => {
    expect(frenchDate('2014-03-09')).toBe('09/03/2014');
    expect(frenchDate('2014-03-09T00:00:00+00:00')).toBe('09/03/2014');
  });
  it('renvoie vide pour une absence de date', () => {
    expect(frenchDate(null)).toBe('');
    expect(frenchDate(undefined)).toBe('');
  });
});
