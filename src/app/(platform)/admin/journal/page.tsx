import type { Metadata } from 'next';
import Link from 'next/link';
import { listGlobalAudit, listSchoolsForAdmin } from '@/features/platform/admin';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Journal' };
export const dynamic = 'force-dynamic';

/**
 * Journal de toute la plateforme : les 200 derniers gestes, tous établissements
 * confondus. Chaque école a déjà le sien ; celui-ci sert au support, quand on
 * ne sait pas encore où chercher.
 */
export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const schoolId = typeof sp.ecole === 'string' ? sp.ecole : undefined;
  const [rows, schools] = await Promise.all([listGlobalAudit(schoolId), listSchoolsForAdmin()]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Journal de la plateforme" description={`${rows.length} dernier(s) événement(s)`} />

      <Card>
        <CardContent className="py-3">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Établissement</span>
              <select
                name="ecole"
                defaultValue={schoolId ?? ''}
                className="h-10 cursor-pointer rounded-[--radius-card] border bg-[color:var(--surface)] px-3 text-sm"
              >
                <option value="">Tous</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="h-10 cursor-pointer rounded-[--radius-card] border px-4 text-sm font-semibold"
              style={{ backgroundColor: 'var(--surface)' }}
            >
              Filtrer
            </button>
          </form>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <EmptyState title="Rien à afficher" hint="Aucun événement enregistré pour ce filtre." />
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span>
                    {r.label}
                    {r.byPlatform ? (
                      <span className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ backgroundColor: 'var(--color-brand-muted)' }}>
                        plateforme
                      </span>
                    ) : null}
                    <br />
                    <span className="text-xs text-[color:var(--muted-foreground)]">
                      {r.schoolName ?? 'Sans établissement'} · {r.module}
                    </span>
                  </span>
                  <span className="text-xs tabular-nums text-[color:var(--muted-foreground)]">
                    {new Date(r.at).toLocaleString('fr-FR')}
                  </span>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-[color:var(--muted-foreground)]">
        Le journal détaillé d’un établissement reste dans son espace :{' '}
        <Link href="/admin/etablissements" className="hover:underline">
          ouvrez sa fiche
        </Link>{' '}
        pour y accéder.
      </p>
    </div>
  );
}
