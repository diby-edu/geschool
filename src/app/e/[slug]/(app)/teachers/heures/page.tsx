import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { hasPermission } from '@/lib/permissions';
import { buildPayroll, readPayrollRates } from '@/features/teachers/payroll';
import { formatFcfa } from '@/features/teachers/payroll-core';
import { savePayrollRatesAction } from '@/features/teachers/payroll-actions';
import { PayrollRatesForm } from '@/features/teachers/components/PayrollRatesForm';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Heures faites et paie' };

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const shift = (m: string, by: number) => {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * Heures faites par les enseignants sur un mois, et ce qui se paie à l'heure :
 * toutes les heures d'un vacataire ; les heures supplémentaires d'un permanent
 * (au-delà de son quota hebdomadaire, semaine par semaine). Une heure faite
 * est un cours dont l'appel a été fait ; les cours sans appel sont montrés à
 * part, non payés.
 */
export default async function PayrollPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  if (!hasPermission(ctx, 'teachers.payroll')) notFound();

  const month = typeof sp.mois === 'string' && /^\d{4}-\d{2}$/.test(sp.mois) ? sp.mois : new Date().toISOString().slice(0, 7);
  const [rows, rates] = await Promise.all([buildPayroll(ctx, month), readPayrollRates(ctx)]);
  const base = `/e/${slug}/teachers/heures`;
  const detail = typeof sp.enseignant === 'string' ? rows.find((r) => r.teacherId === sp.enseignant) : undefined;
  const total = rows.reduce((a, r) => a + r.result.amount, 0);
  const doneTotal = rows.reduce((a, r) => a + r.result.doneHours, 0);
  const missingQuota = rows.filter((r) => r.result.missingQuota).length;

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        title="Heures faites et paie à l’heure"
        description="Un cours = une heure. Une heure faite est un cours dont l’appel a été fait."
        action={
          <div className="flex flex-wrap gap-2">
            <a href={`/e/${slug}/api/paie?mois=${month}`}>
              <Button variant="secondary" size="sm">Télécharger (Excel)</Button>
            </a>
            <Link href={`/e/${slug}/teachers`}>
              <Button variant="ghost" size="sm">Enseignants</Button>
            </Link>
          </div>
        }
      />

      <nav className="flex items-center gap-3 text-sm">
        <Link href={`${base}?mois=${shift(month, -1)}`} className="rounded-full border px-3 py-1">← {monthLabel(shift(month, -1))}</Link>
        <b className="capitalize">{monthLabel(month)}</b>
        <Link href={`${base}?mois=${shift(month, 1)}`} className="rounded-full border px-3 py-1">{monthLabel(shift(month, 1))} →</Link>
      </nav>

      {sp.taux ? <Alert tone="success">Taux enregistrés.</Alert> : null}
      <Card>
        <CardContent className="space-y-2 text-sm">
          <p className="text-[color:var(--muted-foreground)]">
            <b>Vacataire</b> : toutes ses heures faites sont payées. <b>Permanent</b> : seules les heures au-delà de son quota
            hebdomadaire (le maximum de son service, réglé dans{' '}
            <Link href={`/e/${slug}/teachers/service`} className="underline">Service des enseignants</Link> ou sur sa fiche) sont
            payées, semaine par semaine. Un enseignant peut avoir son propre taux sur sa fiche.
          </p>
          {hasPermission(ctx, 'settings.update') ? (
            <PayrollRatesForm
              action={savePayrollRatesAction.bind(null, slug, month)}
              vacationRate={rates.vacationRate}
              overtimeRate={rates.overtimeRate}
            />
          ) : (
            <p>
              Taux de l’école : vacataires {formatFcfa(rates.vacationRate)} / h · heures supplémentaires {formatFcfa(rates.overtimeRate)} / h.
            </p>
          )}
        </CardContent>
      </Card>

      {missingQuota > 0 ? (
        <Alert tone="info">
          {missingQuota} permanent(s) sans quota hebdomadaire : leurs heures supplémentaires ne peuvent pas être calculées. Fixez le
          maximum des permanents dans « Service des enseignants ».
        </Alert>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title="Aucun cours ce mois-ci" hint="Les heures apparaissent à mesure que les cours ont lieu." />
      ) : (
        <>
          <p className="text-sm">
            <b>{doneTotal} h</b> faites ce mois · <b>{formatFcfa(total)}</b> à payer à l’heure.
          </p>
          <div className="overflow-x-auto rounded-[--radius-card] border" style={{ borderColor: 'var(--border)' }}>
            <table className="w-full text-sm">
              <thead className="bg-[color:var(--muted)] text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
                <tr>
                  <th className="px-3 py-2">Enseignant</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2 text-right">Faites</th>
                  <th className="px-3 py-2 text-right">Sans appel</th>
                  <th className="px-3 py-2 text-right">Quota / sem.</th>
                  <th className="px-3 py-2 text-right">Payées</th>
                  <th className="px-3 py-2 text-right">Taux</th>
                  <th className="px-3 py-2 text-right">Montant</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.teacherId} className="border-t">
                    <td className="px-3 py-1.5">
                      <Link href={`${base}?mois=${month}&enseignant=${r.teacherId}`} className="font-medium underline-offset-2 hover:underline">
                        {r.name}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5">{r.kind === 'HOURLY' ? 'Vacataire' : 'Permanent'}</td>
                    <td className="px-3 py-1.5 text-right">{r.result.doneHours} h</td>
                    <td className="px-3 py-1.5 text-right" style={r.result.unattestedHours > 0 ? { color: 'var(--color-warning)' } : undefined}>
                      {r.result.unattestedHours ? `${r.result.unattestedHours} h` : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right">{r.kind === 'PERMANENT' ? (r.quota === null ? 'non fixé' : `${r.quota} h`) : '—'}</td>
                    <td className="px-3 py-1.5 text-right font-medium">
                      {r.result.payableHours} h{r.kind === 'PERMANENT' && r.result.payableHours > 0 ? ' sup.' : ''}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {formatFcfa(r.rate)}
                      {r.ownRate ? '*' : ''}
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold">{r.result.amount > 0 ? formatFcfa(r.result.amount) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[color:var(--muted-foreground)]">
            * taux propre à l’enseignant. « Sans appel » : cours passés dont l’appel n’a pas été fait — non payés tant qu’ils ne sont pas
            régularisés.
          </p>
        </>
      )}

      {detail ? (
        <section className="space-y-2" id="detail">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Détail — {detail.name}
          </h2>
          {detail.kind === 'PERMANENT' && detail.result.weeks.length > 0 ? (
            <ul className="rounded-[--radius-card] border text-sm" style={{ borderColor: 'var(--border)' }}>
              {detail.result.weeks.map((w) => (
                <li key={w.weekStart} className="flex justify-between border-t px-3 py-1.5 first:border-t-0">
                  <span>Semaine du {dayLabel(w.weekStart)}</span>
                  <span>
                    {w.hours} h faites{detail.quota !== null ? ` / quota ${detail.quota} h` : ''} ·{' '}
                    <b>{w.overtime} h sup.</b>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="rounded-[--radius-card] border text-sm" style={{ borderColor: 'var(--border)' }}>
            {detail.courses.map((c, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-2 border-t px-3 py-1.5 first:border-t-0">
                <span>
                  {dayLabel(c.date)} · {c.className ?? '—'} · {c.subject}
                </span>
                <span style={c.done ? undefined : { color: 'var(--color-warning)' }}>
                  {c.hours} h {c.done ? 'faite' : '— appel non fait'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
