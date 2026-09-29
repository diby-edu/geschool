import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requireFeature } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { AuthorizationError } from '@/lib/errors';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { IMPORT_KINDS, IMPORT_KIND_ORDER, isImportKind, type ImportKind } from '@/features/import/kinds';
import { EXPORT_PERMISSION } from '@/features/import/export';
import { canImport } from '@/features/import/service';
import { ImportPanel } from '@/features/import/components/ImportPanel';
import { BackToSettings } from '@/features/settings/components/BackToSettings';

export const metadata: Metadata = { title: 'Import / export' };

/** Listes que l'année active conditionne (classes et élèves y sont rattachés). */
const NEEDS_YEAR: ImportKind[] = ['classes', 'students'];

/**
 * Import et export des listes de l'établissement (salles, classes, enseignants,
 * personnel, élèves). Chaque liste n'apparaît qu'à qui peut l'exporter ou
 * l'importer ; les droits sont revérifiés côté serveur à chaque action.
 */
export default async function ImportExportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requireFeature(ctx, 'import_export');

  const available = IMPORT_KIND_ORDER.filter((k) => canImport(ctx, k) || hasPermission(ctx, EXPORT_PERMISSION[k]));
  if (available.length === 0) throw new AuthorizationError('Aucune liste à importer ni exporter avec vos droits.');
  const requested = Array.isArray(sp.type) ? sp.type[0] : sp.type;
  const kind: ImportKind = isImportKind(requested) && available.includes(requested) ? requested : available[0]!;
  const def = IMPORT_KINDS[kind];
  const mayImport = canImport(ctx, kind);
  const mayExport = hasPermission(ctx, EXPORT_PERMISSION[kind]);
  const blockedByYear = NEEDS_YEAR.includes(kind) && !ctx.academicYear;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Import / export"
        description="Importez vos listes depuis Excel, ou exportez-les pour les retravailler. Format CSV, séparateur point-virgule."
      action={<BackToSettings ctx={ctx} />}
      />

      <nav className="flex flex-wrap gap-2" aria-label="Listes">
        {available.map((k) => (
          <Link
            key={k}
            href={`/e/${slug}/import?type=${k}`}
            className="rounded-full border px-4 py-1.5 text-sm font-medium"
            style={k === kind ? { backgroundColor: 'var(--color-brand)', color: 'var(--color-brand-foreground)', borderColor: 'var(--color-brand)' } : undefined}
            aria-current={k === kind ? 'page' : undefined}
          >
            {IMPORT_KINDS[k].label}
          </Link>
        ))}
      </nav>

      {blockedByYear ? (
        <Alert tone="info">
          Les {def.label.toLowerCase()} sont rattachées à l’année scolaire : activez d’abord une année dans{' '}
          <Link href={`/e/${slug}/academic-years`} className="font-medium underline">
            Années scolaires
          </Link>
          .
        </Alert>
      ) : null}

      {mayExport ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="text-sm">
              <h2 className="font-semibold">Exporter : {def.label.toLowerCase()}</h2>
              <p className="text-[color:var(--muted-foreground)]">
                Fichier CSV qui s’ouvre dans Excel. Mêmes colonnes que le modèle d’import : corrigé, il se réimporte tel quel.
              </p>
            </div>
            {blockedByYear ? null : (
              <a
                href={`/e/${slug}/export/${kind}`}
                className="inline-flex items-center justify-center rounded-[--radius-card] border px-4 py-2 text-sm font-medium hover:bg-[color:var(--color-brand-muted)]"
              >
                Exporter la liste
              </a>
            )}
          </CardContent>
        </Card>
      ) : null}

      {mayImport ? (
        <Card>
          <CardContent className="space-y-4 py-4">
            <div className="space-y-1 text-sm">
              <h2 className="font-semibold">Importer : {def.label.toLowerCase()}</h2>
              <p className="text-[color:var(--muted-foreground)]">{def.note}</p>
              <p className="text-[color:var(--muted-foreground)]">
                Le fichier est d’abord vérifié ligne par ligne, sans rien enregistrer ; vous importez ensuite les lignes prêtes.
                Rien d’existant n’est modifié.
              </p>
            </div>

            <details className="rounded-[--radius-card] border px-3 py-2 text-sm">
              <summary className="cursor-pointer font-medium">Colonnes attendues</summary>
              <table className="mt-2 w-full">
                <thead>
                  <tr className="text-left text-[color:var(--muted-foreground)]">
                    <th className="py-1 pr-3 font-medium">Colonne</th>
                    <th className="py-1 pr-3 font-medium">Exemple</th>
                    <th className="py-1 font-medium">Précision</th>
                  </tr>
                </thead>
                <tbody>
                  {def.columns.map((c) => (
                    <tr key={c.key} className="border-t align-top">
                      <td className="py-1 pr-3">
                        {c.label}
                        {c.required ? <span className="text-[color:var(--color-danger)]"> *</span> : null}
                      </td>
                      <td className="py-1 pr-3 text-[color:var(--muted-foreground)]">{c.example || '—'}</td>
                      <td className="py-1 text-[color:var(--muted-foreground)]">{c.hint ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">
                * obligatoire. L’ordre des colonnes et les accents de l’en-tête n’ont pas d’importance. Dates : jj/mm/aaaa.
              </p>
            </details>

            {blockedByYear ? null : <ImportPanel key={kind} slug={slug} kind={kind} />}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
