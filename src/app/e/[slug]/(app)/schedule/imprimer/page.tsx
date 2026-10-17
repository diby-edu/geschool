import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess, requireFeature } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { getMyTeacherId } from '@/features/schedule/my-schedule';
import { buildPrintSheets, loadPrintChoices } from '@/features/schedule/print';
import { TimetableSheet, TimetableSheetStyles } from '@/features/schedule/components/TimetableSheet';
import { PrintButton } from '@/features/bulletins/components/PrintButton';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Télécharger les emplois du temps' };

type Sp = Record<string, string | string[] | undefined>;
const list = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]).filter(Boolean);

/**
 * Emplois du temps à télécharger : une, plusieurs ou toutes les classes, un,
 * plusieurs ou tous les enseignants — une feuille A4 paysage chacun.
 *
 * Comme les bulletins : pas de fichier fabriqué sur le serveur. La page est mise
 * en forme pour l'A4 et l'impression du navigateur produit le PDF (« Enregistrer
 * au format PDF »), un emploi du temps par page.
 */
export default async function PrintTimetablesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Sp> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requireFeature(ctx, 'schedule');
  const base = `/e/${slug}/schedule/imprimer`;

  // Un enseignant sans vue sur toute l'école télécharge le sien, et seulement le sien.
  if (!hasPermission(ctx, 'schedule.view_all')) {
    requirePageAccess(ctx, 'schedule.view');
    const myId = await getMyTeacherId(ctx);
    if (!myId) requirePageAccess(ctx, 'schedule.view_all');
    const { versionName, sheets } = await buildPrintSheets(ctx, { classIds: [], teacherIds: [myId!] });
    return <Sheets slug={slug} versionName={versionName} sheets={sheets} back={`/e/${slug}/schedule`} backLabel="Retour" />;
  }

  const choices = await loadPrintChoices(ctx);
  if (!choices.versionName) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <PageHeader title="Télécharger les emplois du temps" />
        <EmptyState title="Aucun emploi du temps en service" hint="Publiez d’abord un emploi du temps pour cette année." />
      </div>
    );
  }

  const tout = list(sp.tout);
  const classIds = tout.includes('classes') ? choices.classes.map((c) => c.id) : list(sp.c);
  const teacherIds = tout.includes('enseignants') ? choices.teachers.map((t) => t.id) : list(sp.t);

  if (classIds.length === 0 && teacherIds.length === 0) {
    const byLevel = new Map<string, typeof choices.classes>();
    for (const c of choices.classes) byLevel.set(c.level ?? 'Autres', [...(byLevel.get(c.level ?? 'Autres') ?? []), c]);
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <PageHeader
          title="Télécharger les emplois du temps"
          description={`Emploi du temps en service : ${choices.versionName}. Une page A4 paysage par classe ou par enseignant.`}
          action={
            <Link href={`/e/${slug}/schedule`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
              Retour
            </Link>
          }
        />
        <form method="get" className="space-y-6">
          <Card>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold">Classes</h2>
                <Button type="submit" name="tout" value="classes" variant="secondary" size="sm">
                  Toutes les classes ({choices.classes.length})
                </Button>
              </div>
              {[...byLevel.entries()].map(([level, cls]) => (
                <fieldset key={level}>
                  <legend className="mb-1 text-xs font-semibold uppercase text-[color:var(--muted-foreground)]">{level}</legend>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {cls.map((c) => (
                      <label key={c.id} className="inline-flex items-center gap-1.5 text-sm">
                        <input type="checkbox" name="c" value={c.id} /> {c.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-bold">Enseignants</h2>
                <Button type="submit" name="tout" value="enseignants" variant="secondary" size="sm">
                  Tous les enseignants ({choices.teachers.length})
                </Button>
              </div>
              <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
                {choices.teachers.map((t) => (
                  <label key={t.id} className="inline-flex items-center gap-1.5 text-sm">
                    <input type="checkbox" name="t" value={t.id} /> {t.name}
                    {t.detail ? <span className="text-xs text-[color:var(--muted-foreground)]">({t.detail})</span> : null}
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button type="submit">Préparer les emplois du temps cochés</Button>
          </div>
        </form>
      </div>
    );
  }

  const { sheets } = await buildPrintSheets(ctx, { classIds, teacherIds });
  return <Sheets slug={slug} versionName={choices.versionName} sheets={sheets} back={base} backLabel="Changer la sélection" />;
}

function Sheets({
  versionName,
  sheets,
  back,
  backLabel,
}: {
  slug: string;
  versionName: string | null;
  sheets: Awaited<ReturnType<typeof buildPrintSheets>>['sheets'];
  back: string;
  backLabel: string;
}) {
  if (!versionName) return <EmptyState title="Aucun emploi du temps en service" hint="Publiez d’abord un emploi du temps pour cette année." />;
  return (
    <div className="space-y-4">
      <TimetableSheetStyles />
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <strong>{sheets.length} emploi(s) du temps</strong> — {versionName}.
          <br />
          <span className="text-[color:var(--muted-foreground)]">
            Dans la fenêtre d’impression, choisissez « Enregistrer au format PDF ». Un emploi du temps par page, en paysage.
          </span>
        </p>
        <div className="flex gap-2">
          <PrintButton />
          <Link href={back}>
            <Button variant="ghost">{backLabel}</Button>
          </Link>
        </div>
      </div>
      <div className="space-y-6">
        {sheets.map((s) => (
          <TimetableSheet key={s.id} sheet={s} />
        ))}
      </div>
    </div>
  );
}
