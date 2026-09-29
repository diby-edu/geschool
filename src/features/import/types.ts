/** Types partagés par l'écran d'import (navigateur) et le service (serveur). */

export type ImportRow = { line: number; cells: string[] };

export type RowOutcome = {
  line: number;
  label: string;
  status: 'ready' | 'skip' | 'error' | 'created';
  message?: string;
};

export type ImportPreview = {
  matched: string[];
  ignored: string[];
  missingRequired: string[];
  counts: { ready: number; skip: number; error: number };
  rows: RowOutcome[];
};
