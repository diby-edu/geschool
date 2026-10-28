import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { listSchoolBackups } from '@/features/school-backup/queries';
import { restoreBackupAction } from '@/features/school-backup/actions';
import { BACKUP_CATEGORIES } from '@/features/school-backup/catalog';
import { RestoreForm } from '@/features/school-backup/components/BackupForms';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/features/dashboard/components/ui';

export const metadata: Metadata = { title: 'Remettre une sauvegarde' };
export const dynamic = 'force-dynamic';

const quand = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Africa/Abidjan', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Remettre une sauvegarde : choisir quoi, voir ce qui change, confirmer (0156, écran 2 de la maquette). */
export default async function RestoreBackupPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'backup.restore');
  const all = await listSchoolBackups(ctx.school.id);
  const b = all?.find((x) => x.id === id && x.kind === 'BACKUP' && x.status === 'OK');
  if (!b) notFound();

  const { countToday, categoryPulls } = await import('@/services/school-backup/restore');
  const [today, pullsOf] = await Promise.all([
    countToday(ctx.school.id, { scope: b.scope, yearId: b.yearId }).catch(() => ({}) as Record<string, number>),
    categoryPulls(),
  ]);
  const counts = b.counts as Record<string, number>;
  const categories = BACKUP_CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    hint: c.hint,
    mode: c.mode,
    inBackup: c.tables.reduce((n, t) => n + (Number(counts[t]) || 0), 0),
    today: today[c.key] ?? 0,
    pulls: pullsOf.get(c.key) ?? [],
  }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Remettre une sauvegarde"
        description={`Sauvegarde du ${quand(b.createdAt)} — ${b.scope === 'YEAR' ? `année ${b.yearName ?? ''}` : 'toute l’école'}.`}
        action={
          <Link href={`/e/${slug}/sauvegardes`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />
      <Alert tone="error">
        <b>Attention :</b> les catégories remises remplacent les données actuelles de l’école. Ce qui a été fait depuis le {quand(b.createdAt)} dans ces catégories sera perdu. Les
        autres écoles ne sont jamais touchées.
      </Alert>
      {b.scope === 'YEAR' ? (
        <Alert tone="info">Sauvegarde d’une seule année : seules les données de l’année {b.yearName} sont remplacées ; les autres années ne bougent pas.</Alert>
      ) : null}
      <Card>
        <RestoreForm action={restoreBackupAction.bind(null, slug, b.id)} categories={categories} schoolName={ctx.school.name} />
      </Card>
    </div>
  );
}
