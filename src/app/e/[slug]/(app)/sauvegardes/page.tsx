import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccessAny } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { listSchoolBackups, listYears, type SchoolBackup } from '@/features/school-backup/queries';
import { createBackupAction } from '@/features/school-backup/actions';
import { BACKUP_CATEGORIES } from '@/features/school-backup/catalog';
import { AutoRefresh, CreateBackupForm, UploadBackup } from '@/features/school-backup/components/BackupForms';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { BlocHead, Card, Pill } from '@/features/dashboard/components/ui';

export const metadata: Metadata = { title: 'Sauvegardes' };
export const dynamic = 'force-dynamic';

const quand = (iso: string) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Africa/Abidjan', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const mo = (b: number | null) => (b === null ? '—' : `${(b / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`);
const TRIGGER: Record<SchoolBackup['trigger'], string> = {
  MANUAL: '',
  YEAR_CLOSE: 'automatique · clôture de l’année',
  BEFORE_RESTORE: 'automatique · avant une remise',
  UPLOAD: 'fichier envoyé',
};

/** Sauvegardes de l'école (0156, maquette docs/maquettes/ecole-sauvegardes.html). */
export default async function SchoolBackupsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccessAny(ctx, ['backup.manage', 'backup.restore']);
  const canManage = hasPermission(ctx, 'backup.manage');
  const canRestore = hasPermission(ctx, 'backup.restore');
  const [all, years] = await Promise.all([listSchoolBackups(ctx.school.id), listYears(ctx)]);
  const base = `/e/${slug}/sauvegardes`;

  if (!all) {
    return (
      <div className="mx-auto max-w-4xl">
        <Alert tone="warning">Cette page attend la migration 0156 (« pnpm db:migrate »).</Alert>
      </div>
    );
  }
  const backups = all.filter((b) => b.kind === 'BACKUP');
  const restores = all.filter((b) => b.kind === 'RESTORE');
  const { restoreRunning } = await import('@/services/school-backup');
  const running = all.some((b) => b.status === 'RUNNING') || Boolean(sp.remise) || (await restoreRunning(ctx.school.id).catch(() => false));
  const labelOf = new Map(BACKUP_CATEGORIES.map((c) => [c.key, c.label]));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {running ? <AutoRefresh /> : null}
      <PageHeader title="Sauvegardes" description="Une copie de toutes les données de l’école, à garder ou à remettre si un problème arrive." />
      {sp.lancee ? <Alert tone="success">Sauvegarde lancée : elle apparaît ci-dessous dans 1 à 3 minutes (actualisez la page).</Alert> : null}
      {sp.remise ? <Alert tone="warning">Remise lancée : une copie de l’état actuel est faite d’abord, puis la sauvegarde est remise. Merci de ne rien saisir pendant ce temps.</Alert> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {canManage ? (
          <Card>
            <BlocHead title="Faire une sauvegarde" />
            <div className="mt-3">
              <CreateBackupForm action={createBackupAction.bind(null, slug)} years={years} />
            </div>
          </Card>
        ) : null}
        <Card>
          <BlocHead title="Sauvegardes automatiques" right={<Pill tone="good">Active</Pill>} />
          <p className="mt-3 text-sm">
            À la <b>clôture de chaque année scolaire</b>, une sauvegarde de l’année est faite toute seule et gardée, pour l’archive.
          </p>
          <BlocHead title="Ce que contient une sauvegarde" />
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[color:var(--muted-foreground)]">
            <li>
              <b>Tout</b> : {BACKUP_CATEGORIES.map((c) => c.label.toLowerCase()).join(', ')}.
            </li>
            <li>
              <b>Sauf</b> les mots de passe (les comptes de connexion restent tels qu’ils sont), l’abonnement, les paiements et les SMS (gérés par la plateforme), le journal des
              actions et les notifications.
            </li>
          </ul>
        </Card>
      </div>

      <Card>
        <BlocHead title="Les sauvegardes de l’école" sub="Gardées sur le serveur : les 10 dernières faites à la main, les 3 dernières d’avant remise, toutes celles de fin d’année" />
        {backups.length === 0 ? (
          <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">Aucune sauvegarde pour l’instant.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[color:var(--muted-foreground)]">
                  <th className="py-1.5 pr-3">Quand</th>
                  <th className="py-1.5 pr-3">Contenu</th>
                  <th className="py-1.5 pr-3">Faite par</th>
                  <th className="py-1.5 pr-3">Taille</th>
                  <th className="py-1.5" />
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.id} className="border-t align-top" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-2 pr-3">{quand(b.createdAt)}</td>
                    <td className="py-2 pr-3">{b.scope === 'YEAR' ? `Année ${b.yearName ?? ''}` : 'Toute l’école'}</td>
                    <td className="py-2 pr-3">
                      {TRIGGER[b.trigger] ? <Pill tone="muted">{TRIGGER[b.trigger]}</Pill> : (b.createdBy ?? '—')}
                    </td>
                    <td className="py-2 pr-3">{mo(b.sizeBytes)}</td>
                    <td className="py-2 text-right">
                      {b.status === 'RUNNING' ? (
                        <Pill tone="warn">en préparation…</Pill>
                      ) : b.status === 'FAILED' ? (
                        <span className="text-xs text-[color:var(--color-danger)]">échouée : {b.error}</span>
                      ) : (
                        <span className="inline-flex flex-wrap justify-end gap-3">
                          {canManage ? (
                            <a href={`${base}/${b.id}/telecharger`} className="font-bold text-[color:var(--color-brand)] hover:underline">
                              Télécharger
                            </a>
                          ) : null}
                          {canRestore ? (
                            <Link href={`${base}/${b.id}/remettre`} className="font-bold text-[color:var(--color-danger)] hover:underline">
                              Remettre
                            </Link>
                          ) : null}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">Conseil : téléchargez de temps en temps une sauvegarde et gardez-la sur votre ordinateur ou une clé USB.</p>
          </div>
        )}
      </Card>

      {canRestore ? (
        <Card>
          <BlocHead title="Remettre une sauvegarde depuis un fichier" />
          <div className="mt-3">
            <UploadBackup slug={slug} />
          </div>
        </Card>
      ) : null}

      {restores.length > 0 ? (
        <Card>
          <BlocHead title="Remises de sauvegarde" />
          <div className="mt-3 space-y-2">
            {restores.map((r) => {
              const report = r.counts as { categories?: { label: string; restored: number; removed: number; skipped: number }[]; seconds?: number };
              return (
                <div key={r.id} className="rounded-xl border p-3 text-sm" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex flex-wrap justify-between gap-2">
                    <span>
                      <b>{quand(r.createdAt)}</b> · {r.createdBy ?? 'la plateforme'} · {r.categories.map((k) => labelOf.get(k) ?? k).join(', ')}
                    </span>
                    <Pill tone={r.status === 'OK' ? 'good' : r.status === 'FAILED' ? 'bad' : 'warn'}>
                      {r.status === 'OK' ? `réussie${report.seconds ? ` · ${Math.max(1, Math.round(report.seconds / 60))} min` : ''}` : r.status === 'FAILED' ? 'échouée' : 'en cours…'}
                    </Pill>
                  </div>
                  {r.error ? <p className="mt-1 text-xs text-[color:var(--color-danger)]">{r.error} Rien n’a été changé.</p> : null}
                  {report.categories ? (
                    <ul className="mt-1 text-xs text-[color:var(--muted-foreground)]">
                      {report.categories.map((c) => (
                        <li key={c.label}>
                          {c.label} : {c.restored.toLocaleString('fr-FR')} remise(s), {c.removed.toLocaleString('fr-FR')} retirée(s)
                          {c.skipped ? `, ${c.skipped.toLocaleString('fr-FR')} non remise(s) (lien manquant)` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
