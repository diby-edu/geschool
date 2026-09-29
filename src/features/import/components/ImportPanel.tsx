'use client';

import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { decodeCsvBytes, parseCsv, type ParsedCsv } from '@/lib/csv-parse';
import { importBatchAction, previewImportAction } from '@/features/import/actions';
import type { ImportPreview, RowOutcome } from '@/features/import/types';
import { IMPORT_KINDS, templateCsv, type ImportKind } from '@/features/import/kinds';

/**
 * Import d'un fichier CSV en deux temps : vérification (rien n'est écrit), puis
 * import des lignes prêtes par petits lots, avec une barre d'avancement. Chaque
 * lot est une requête courte : un gros fichier (800 élèves, un compte parent
 * chacun) ne se heurte à aucun délai d'attente, et une coupure réseau ne perd
 * que le lot en cours.
 */

const STATUS_LABEL: Record<RowOutcome['status'], string> = {
  ready: 'Prête',
  created: 'Importée',
  skip: 'Ignorée',
  error: 'Erreur',
};
const STATUS_COLOR: Record<RowOutcome['status'], string> = {
  ready: 'var(--color-info)',
  created: 'var(--color-success)',
  skip: 'var(--muted-foreground)',
  error: 'var(--color-danger)',
};

const FILTER_LABEL: Record<'all' | RowOutcome['status'], string> = {
  all: 'Toutes',
  ready: 'Prêtes',
  created: 'Importées',
  skip: 'Ignorées',
  error: 'Erreurs',
};

/** Lot par requête : petit quand chaque ligne crée un compte (élèves, personnel). */
const BATCH: Record<ImportKind, number> = { rooms: 50, classes: 50, teachers: 50, staff: 10, students: 10 };

type Filter = 'all' | RowOutcome['status'];

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportPanel({ slug, kind }: { slug: string; kind: ImportKind }) {
  const def = IMPORT_KINDS[kind];
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [results, setResults] = useState<Map<number, RowOutcome>>(new Map());
  const [busy, setBusy] = useState<'reading' | 'importing' | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  const reset = () => {
    setParsed(null);
    setPreview(null);
    setResults(new Map());
    setProgress(null);
    setError(null);
    setFilter('all');
  };

  async function onFile(file: File | undefined) {
    reset();
    if (!file) return;
    setFileName(file.name);
    if (!/\.(csv|txt)$/i.test(file.name)) {
      setError('Enregistrez d’abord le fichier au format CSV (Excel : Fichier > Enregistrer sous > CSV).');
      return;
    }
    setBusy('reading');
    try {
      const csv = parseCsv(decodeCsvBytes(await file.arrayBuffer()));
      if (csv.rows.length === 0) {
        setError('Le fichier ne contient aucune ligne après l’en-tête.');
        return;
      }
      setParsed(csv);
      const res = await previewImportAction(slug, kind, csv.header, csv.rows);
      if (res.ok) setPreview(res.data);
      else setError(res.error);
    } catch {
      setError('Fichier illisible.');
    } finally {
      setBusy(null);
    }
  }

  async function runImport() {
    if (!parsed || !preview) return;
    const readyLines = new Set(preview.rows.filter((r) => r.status === 'ready').map((r) => r.line));
    const todo = parsed.rows.filter((r) => readyLines.has(r.line));
    const size = BATCH[kind];
    setBusy('importing');
    setError(null);
    setProgress({ done: 0, total: todo.length });
    const acc = new Map(results);
    try {
      for (let i = 0; i < todo.length; i += size) {
        const batch = todo.slice(i, i + size);
        const res = await importBatchAction(slug, kind, parsed.header, batch);
        if (!res.ok) {
          setError(`${res.error} Import arrêté : ${i} ligne(s) traitée(s) sur ${todo.length}.`);
          break;
        }
        for (const r of res.data) acc.set(r.line, r);
        setResults(new Map(acc));
        setProgress({ done: Math.min(i + size, todo.length), total: todo.length });
      }
    } catch {
      setError('Connexion interrompue : relancez l’import, les lignes déjà importées seront ignorées.');
    } finally {
      setBusy(null);
    }
  }

  const rows = useMemo(
    () => (preview?.rows ?? []).map((r) => results.get(r.line) ?? r),
    [preview, results],
  );
  const counts = useMemo(() => {
    const c = { ready: 0, created: 0, skip: 0, error: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);
  const visible = filter === 'all' ? rows : rows.filter((r) => r.status === filter);
  const finished = progress !== null && progress.done === progress.total && busy === null;

  function reportCsv() {
    const lines = [['Ligne', 'Élément', 'Résultat', 'Détail'], ...rows.map((r) => [String(r.line), r.label, STATUS_LABEL[r.status], r.message ?? ''])];
    const cell = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    download(`rapport-import-${kind}.csv`, '﻿' + lines.map((l) => l.map(cell).join(';')).join('\r\n') + '\r\n');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv,.txt"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <Button type="button" onClick={() => input.current?.click()} disabled={busy !== null}>
          {fileName ? 'Choisir un autre fichier' : 'Choisir le fichier CSV'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => download(`modele-${kind}.csv`, templateCsv(kind))}>
          Télécharger le modèle
        </Button>
        {fileName ? <span className="text-sm text-[color:var(--muted-foreground)]">{fileName}</span> : null}
      </div>

      {busy === 'reading' ? <p className="text-sm text-[color:var(--muted-foreground)]">Vérification du fichier…</p> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      {preview ? (
        <div className="space-y-3">
          {preview.missingRequired.length > 0 ? (
            <Alert tone="error">
              Colonnes obligatoires absentes : {preview.missingRequired.join(', ')}. Partez du modèle, ou renommez l’en-tête
              de vos colonnes.
            </Alert>
          ) : null}
          {preview.ignored.length > 0 ? (
            <p className="text-xs text-[color:var(--muted-foreground)]">
              Colonnes non reconnues, laissées de côté : {preview.ignored.join(', ')}.
            </p>
          ) : null}

          {rows.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-2 text-sm" role="group" aria-label="Filtrer les lignes">
                {(['all', 'ready', 'created', 'skip', 'error'] as const).map((f) => {
                  const n = f === 'all' ? rows.length : counts[f];
                  if (f !== 'all' && n === 0) return null;
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className="rounded-full border px-3 py-1"
                      style={filter === f ? { backgroundColor: 'var(--color-brand-muted)', borderColor: 'var(--color-brand)' } : undefined}
                    >
                      {FILTER_LABEL[f]} · {n}
                    </button>
                  );
                })}
              </div>

              <div className="max-h-[28rem] overflow-auto rounded-[--radius-card] border" style={{ backgroundColor: 'var(--surface)' }}>
                <table className="w-full text-sm">
                  <thead className="sticky top-0" style={{ backgroundColor: 'var(--surface)' }}>
                    <tr className="border-b text-left text-[color:var(--muted-foreground)]">
                      <th className="px-3 py-2 font-medium">Ligne</th>
                      <th className="px-3 py-2 font-medium">{def.noun[0]!.toUpperCase() + def.noun.slice(1)}</th>
                      <th className="px-3 py-2 font-medium">Résultat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.slice(0, 1000).map((r) => (
                      <tr key={r.line} className="border-b align-top last:border-0">
                        <td className="px-3 py-1.5 tabular-nums text-[color:var(--muted-foreground)]">{r.line}</td>
                        <td className="px-3 py-1.5">{r.label}</td>
                        <td className="px-3 py-1.5">
                          <span className="font-medium" style={{ color: STATUS_COLOR[r.status] }}>
                            {STATUS_LABEL[r.status]}
                          </span>
                          {r.message ? <span className="text-[color:var(--muted-foreground)]"> — {r.message}</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {progress ? (
            <div className="space-y-1">
              <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--color-brand-muted)' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 100}%`, backgroundColor: 'var(--color-brand)' }}
                />
              </div>
              <p className="text-xs text-[color:var(--muted-foreground)]">
                {busy === 'importing'
                  ? `Import en cours : ${progress.done} / ${progress.total}. Gardez cette page ouverte.`
                  : `Terminé : ${counts.created} importée(s), ${counts.skip} ignorée(s), ${counts.error} en erreur.`}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {counts.ready > 0 && preview.missingRequired.length === 0 ? (
              <Button type="button" onClick={() => void runImport()} disabled={busy !== null}>
                {busy === 'importing' ? 'Import en cours…' : `Importer ${counts.ready} ligne(s) prête(s)`}
              </Button>
            ) : null}
            {rows.length > 0 && (finished || counts.error > 0) ? (
              <Button type="button" variant="secondary" onClick={reportCsv}>
                Télécharger le rapport
              </Button>
            ) : null}
          </div>
          {counts.ready === 0 && !progress && preview.missingRequired.length === 0 ? (
            <p className="text-sm text-[color:var(--muted-foreground)]">
              Aucune ligne à importer : corrigez les erreurs dans le fichier, puis choisissez-le à nouveau.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
