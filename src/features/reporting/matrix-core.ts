/**
 * La matrice d'une classe : les élèves en lignes (ordre alphabétique), les
 * matières en colonnes (coefficient et moyenne de la classe en en-tête), la
 * moyenne et le rang de chaque élève par matière, puis la moyenne générale et
 * le rang général. La matrice du conseil ajoute le rappel des périodes
 * précédentes et, en fin d'année, la moyenne annuelle.
 *
 * Module pur (aucun accès à la base) : la page, l'impression et l'export
 * Excel lisent la même structure, et elle se teste seule.
 */

export type MatrixSubject = {
  id: string;
  name: string;
  coefficient: number;
  /** Moyenne de la classe dans la matière. */
  classAverage: number | null;
};

export type RankedValue = { average: number | null; rank: number | null; exAequo: boolean };

export type MatrixCell = RankedValue & { exempt: boolean };

export type MatrixRow = {
  studentId: string;
  name: string;
  female: boolean;
  cells: Record<string, MatrixCell>;
  /** Moyenne générale de la période. */
  general: RankedValue;
  /** Rappel des périodes précédentes (matrice du conseil), dans l'ordre. */
  recalls: RankedValue[];
  /** Moyenne annuelle (dernière période, matrice du conseil). */
  annual: RankedValue | null;
  /**
   * Pour chaque période rappelée : la moyenne vient-elle de l'établissement,
   * de l'ancienne école (élève arrivé en cours d'année), ou manque-t-elle ?
   */
  recallSources?: ('OURS' | 'PREVIOUS_SCHOOL' | 'NONE')[];
};

export type Matrix = {
  className: string;
  periodName: string;
  schoolName: string;
  yearName: string;
  headTeacher: string | null;
  subjects: MatrixSubject[];
  rows: MatrixRow[];
  /** Libellés des périodes rappelées (« 1er trim. »…). */
  recallLabels: string[];
  /** Identifiants des périodes rappelées, dans le même ordre. */
  recallPeriodIds?: string[];
  /** Règle de l'établissement pour l'élève arrivé en cours d'année. */
  newcomerMode?: 'ATTENDED' | 'PREVIOUS_SCHOOL';
  hasAnnual: boolean;
};

/** Rang « à la française » : 1, 1, 3 en cas d'égalité. Une valeur absente n'est pas classée. */
export function rankWithTies(values: readonly (number | null)[]): { rank: number | null; exAequo: boolean }[] {
  const order = values
    .map((v, i) => [v, i] as const)
    .filter((e): e is readonly [number, number] => e[0] !== null)
    .sort((a, b) => b[0] - a[0]);
  const ranks: (number | null)[] = values.map(() => null);
  order.forEach(([v, i], k) => {
    const prev = k > 0 ? order[k - 1]! : null;
    ranks[i] = prev && prev[0] === v ? ranks[prev[1]]! : k + 1;
  });
  const count = new Map<number, number>();
  for (const r of ranks) if (r !== null) count.set(r, (count.get(r) ?? 0) + 1);
  return ranks.map((r) => ({ rank: r, exAequo: r !== null && (count.get(r) ?? 0) > 1 }));
}

/** « 1er », « 1re », « 5e », « 21e ex ». */
export function ordinal(v: { rank: number | null; exAequo: boolean }, female: boolean): string {
  if (v.rank === null) return '';
  const base = v.rank === 1 ? (female ? '1re' : '1er') : `${v.rank}e`;
  return v.exAequo ? `${base} ex` : base;
}

/** « 13,75 » ; « — » sans valeur. */
export function fmt(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : n.toFixed(2).replace('.', ',');
}

export function statsOf(values: readonly (number | null)[]): { average: number | null; max: number | null; min: number | null } {
  const v = values.filter((x): x is number => x !== null);
  if (v.length === 0) return { average: null, max: null, min: null };
  return {
    average: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100,
    max: Math.max(...v),
    min: Math.min(...v),
  };
}

/**
 * Export « Excel » : CSV au séparateur point-virgule (Excel en français), avec
 * BOM UTF-8 pour que les accents s'affichent. Deux lignes d'en-tête comme la
 * matrice imprimée : matière (coef, moyenne de classe), puis Moy / Rang.
 */
export function matrixToCsv(m: Matrix): string {
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const line = (cells: string[]) => cells.map(esc).join(';');
  const head1 = ['N°', 'Nom et prénoms'];
  const head2 = ['', ''];
  for (const s of m.subjects) {
    head1.push(`${s.name} (coef ${s.coefficient}, moy. classe ${fmt(s.classAverage)})`, '');
    head2.push('Moy', 'Rang');
  }
  for (const label of m.recallLabels) {
    head1.push(label, '');
    head2.push('Moy', 'Rang');
  }
  head1.push(m.recallLabels.length > 0 ? m.periodName : 'Moyenne générale', '');
  head2.push('Moy', 'Rang');
  if (m.hasAnnual) {
    head1.push('Moyenne annuelle', '');
    head2.push('Moy', 'Rang');
  }
  const rows = m.rows.map((r, i) => {
    const out = [String(i + 1), r.name];
    for (const s of m.subjects) {
      const c = r.cells[s.id];
      if (c?.exempt) out.push('Dispensé', '');
      else out.push(fmt(c?.average ?? null), c ? ordinal(c, r.female) : '');
    }
    for (const v of r.recalls) out.push(fmt(v.average), ordinal(v, r.female));
    out.push(fmt(r.general.average), ordinal(r.general, r.female));
    if (m.hasAnnual && r.annual) out.push(fmt(r.annual.average), ordinal(r.annual, r.female));
    return line(out);
  });
  const title = line([`Matrice — ${m.className} — ${m.periodName} — ${m.schoolName} ${m.yearName}`]);
  return '﻿' + [title, line(head1), line(head2), ...rows].join('\r\n') + '\r\n';
}
