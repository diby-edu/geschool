/**
 * Lecture d'un fichier CSV fourni par un établissement (import de listes).
 *
 * Tolère ce que produisent Excel, LibreOffice et Google Sheets en français :
 *  - séparateur `;` (Excel français), `,` ou tabulation, détecté sur la 1re ligne ;
 *  - guillemets, `""` échappés, retours à la ligne dans une cellule ;
 *  - BOM UTF-8 en tête ;
 *  - cellules « forcées en texte » par nos propres exports : `="+225…"` et
 *    l'apostrophe de neutralisation des formules (`'=…`, lib/csv.ts).
 * Les lignes entièrement vides sont ignorées. Aucune dépendance : utilisable
 * côté navigateur (aperçu) comme côté serveur (import, qui revalide tout).
 */

export type ParsedCsv = { header: string[]; rows: { line: number; cells: string[] }[] };

export const CSV_MAX_ROWS = 5000;

function detectDelimiter(firstLine: string): string {
  const count = (ch: string) => {
    let n = 0;
    let quoted = false;
    for (const c of firstLine) {
      if (c === '"') quoted = !quoted;
      else if (c === ch && !quoted) n++;
    }
    return n;
  };
  const candidates = [';', ',', '\t'].map((d) => [d, count(d)] as const);
  candidates.sort((a, b) => b[1] - a[1]);
  return candidates[0]![1] > 0 ? candidates[0]![0] : ';';
}

/** Valeur d'une cellule débarrassée des protections d'export (="…", apostrophe anti-formule). */
export function cleanCell(raw: string): string {
  let v = raw.trim();
  const forced = /^="(.*?)"?$/.exec(v);
  if (forced) v = forced[1]!;
  if (/^'[=+\-@]/.test(v)) v = v.slice(1);
  return v.trim();
}

export function parseCsv(input: string): ParsedCsv {
  const text = input.replace(/^﻿/, '');
  const firstBreak = text.search(/\r?\n/);
  const delimiter = detectDelimiter(firstBreak === -1 ? text : text.slice(0, firstBreak));

  const records: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  const endCell = () => {
    cells.push(cleanCell(cell));
    cell = '';
  };
  const endRecord = () => {
    endCell();
    if (cells.some((c) => c !== '')) records.push({ line: recordLine, cells });
    cells = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else {
        if (c === '\n') line++;
        cell += c;
      }
      continue;
    }
    if (c === '"' && cell.trim() === '') {
      quoted = true;
      cell = '';
    } else if (c === '"' && /^=$/.test(cell.trim())) {
      // ="…" : Excel, texte forcé — on garde la forme pour cleanCell
      cell += c;
      quoted = true;
    } else if (c === delimiter) {
      endCell();
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      cell += c;
    }
  }
  if (cell !== '' || cells.length > 0) endRecord();

  const [head, ...rows] = records;
  return { header: head?.cells ?? [], rows: rows.slice(0, CSV_MAX_ROWS) };
}

/** En-tête comparable : minuscules, sans accents ni ponctuation (« Téléphone du responsable » -> « telephone du responsable »). */
export function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Texte d'un fichier : UTF-8 si le fichier l'est, sinon Windows-1252 (« CSV
 * (séparateur : point-virgule) » d'Excel sous Windows, qui n'est PAS en UTF-8 :
 * sans cette reprise, « Élève » deviendrait « �l�ve »).
 */
export function decodeCsvBytes(bytes: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  if (!utf8.includes('�')) return utf8;
  return new TextDecoder('windows-1252').decode(bytes);
}
