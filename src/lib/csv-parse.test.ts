import { describe, expect, it } from 'vitest';
import { buildCsv, csvCell, csvPhone } from './csv';
import { cleanCell, decodeCsvBytes, normalizeHeader, parseCsv } from './csv-parse';

describe('parseCsv', () => {
  it('lit un CSV Excel français (point-virgule, CRLF, BOM)', () => {
    const r = parseCsv('﻿Code;Nom;Capacité\r\nS1;Salle 1;50\r\nS2;Salle 2;40\r\n');
    expect(r.header).toEqual(['Code', 'Nom', 'Capacité']);
    expect(r.rows).toEqual([
      { line: 2, cells: ['S1', 'Salle 1', '50'] },
      { line: 3, cells: ['S2', 'Salle 2', '40'] },
    ]);
  });

  it('détecte la virgule et la tabulation', () => {
    expect(parseCsv('a,b\n1,2').rows[0]!.cells).toEqual(['1', '2']);
    expect(parseCsv('a\tb\n1\t2').rows[0]!.cells).toEqual(['1', '2']);
  });

  it('gère guillemets, guillemets échappés, séparateur et saut de ligne dans une cellule', () => {
    const r = parseCsv('Nom;Note\n"KOFFI; Jean";"dit ""le grand""\nsur deux lignes"\nB;x');
    expect(r.rows[0]!.cells).toEqual(['KOFFI; Jean', 'dit "le grand"\nsur deux lignes']);
    expect(r.rows[1]).toEqual({ line: 4, cells: ['B', 'x'] });
  });

  it('ignore les lignes vides et garde le numéro de ligne réel', () => {
    const r = parseCsv('A;B\n\n;\nx;y\n');
    expect(r.rows).toEqual([{ line: 4, cells: ['x', 'y'] }]);
  });

  it('relit ses propres exports : téléphone forcé en texte, formule neutralisée', () => {
    const csv = buildCsv(['Nom', 'Téléphone'], [[csvCell('=HYPERLINK("x")'), csvPhone('+2250701020304')]]);
    const r = parseCsv(csv);
    expect(r.rows[0]!.cells).toEqual(['=HYPERLINK("x")', '+2250701020304']);
  });
});

describe('cleanCell / normalizeHeader / decodeCsvBytes', () => {
  it('nettoie les protections d’export', () => {
    expect(cleanCell(' ="+22507" ')).toBe('+22507');
    expect(cleanCell("'=1+1")).toBe('=1+1');
    expect(cleanCell("l'école")).toBe("l'école");
  });

  it('compare les en-têtes sans accents, casse ni ponctuation', () => {
    expect(normalizeHeader('  Téléphone du responsable ')).toBe('telephone du responsable');
    expect(normalizeHeader('Prénom(s)')).toBe('prenom s');
  });

  it('reprend un fichier Windows-1252 (Excel « CSV séparateur point-virgule »)', () => {
    const latin1 = new Uint8Array([0xc9, 0x6c, 0xe8, 0x76, 0x65]); // « Élève » en Windows-1252
    expect(decodeCsvBytes(latin1.buffer)).toBe('Élève');
    expect(decodeCsvBytes(new TextEncoder().encode('Élève').buffer as ArrayBuffer)).toBe('Élève');
  });
});
