import type { Metadata } from 'next';
import Link from 'next/link';
import { daysWithoutText, getPlatformCockpit, isAtRisk, RISK_SCHOOL_DAYS, type SchoolHealth } from '@/features/platform-dashboard/cockpit';
import { formatDate } from '@/features/academic-years/labels';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Pill, fr, plural } from '@/features/dashboard/components/ui';

export const metadata: Metadata = { title: 'Santé des écoles' };
export const dynamic = 'force-dynamic';

/**
 * Santé des écoles : qui utilise vraiment l'application. Une école est « à risque »
 * après 2 jours de cours sans activité (décidé le 2026-10-25) : ni appel, ni note,
 * ni action de son personnel, ni connexion. Les jours de cours viennent de son
 * emploi du temps publié (les congés n'en ont pas) ; sans emploi du temps, du
 * lundi au vendredi hors congés de son calendrier.
 */

function state(h: SchoolHealth): { label: string; tone: 'good' | 'warn' | 'bad' } {
  if (isAtRisk(h)) return { label: 'À risque', tone: 'bad' };
  if (h.sessions5d > 0 && h.calls5d / h.sessions5d < 0.5) return { label: 'Faible', tone: 'warn' };
  return { label: 'Bien', tone: 'good' };
}

export default async function SchoolHealthPage() {
  const { data, missing } = await getPlatformCockpit();
  if (!data) {
    return (
      <div className="mx-auto max-w-5xl">
        <Alert tone="warning">{missing ? 'Cette page attend la migration 0140 (« pnpm db:migrate »).' : 'Calcul impossible pour l’instant : recharge la page.'}</Alert>
      </div>
    );
  }
  const rows = data.health;
  const risky = rows.filter(isAtRisk).length;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Santé des écoles"
        description={`Qui utilise vraiment l’application. À risque : ${rows[0]?.riskDays ?? RISK_SCHOOL_DAYS} jours de cours ou plus sans activité (appel, note, action du personnel ou connexion). Les congés ne comptent pas.`}
      />
      <p className="text-sm">
        <b>{fr(rows.length)}</b> {plural(rows.length, 'école active', 'écoles actives')} ·{' '}
        <b className={risky > 0 ? 'text-[color:var(--color-danger)]' : ''}>{fr(risky)}</b> à risque
      </p>

      {rows.length === 0 ? (
        <EmptyState title="Aucune école active" />
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--muted)] text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">École</th>
                <th className="px-3 py-2">État</th>
                <th className="px-3 py-2 text-right">Jours sans activité</th>
                <th className="px-3 py-2 text-right">Appels faits (5 j de cours)</th>
                <th className="px-3 py-2 text-right">Notes saisies (7 j)</th>
                <th className="px-3 py-2">Direction connectée (7 j)</th>
                <th className="px-3 py-2">Dernière activité</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => {
                const st = state(h);
                const calls = h.sessions5d > 0 ? `${Math.round((h.calls5d / h.sessions5d) * 100)} % (${fr(h.calls5d)} / ${fr(h.sessions5d)})` : 'pas de cours prévu';
                return (
                  <tr key={h.id} className="border-t">
                    <td className="px-3 py-2">
                      <Link href={`/admin/etablissements/${h.id}`} className="font-semibold hover:underline">
                        {h.name}
                      </Link>
                      <span className="block text-xs text-[color:var(--muted-foreground)]">{fr(h.students)} élèves</span>
                    </td>
                    <td className="px-3 py-2"><Pill tone={st.tone}>{st.label}</Pill></td>
                    <td className="px-3 py-2 text-right tabular-nums">{daysWithoutText(h, data.today)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{calls}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fr(h.grades7d)}</td>
                    <td className="px-3 py-2">{h.directionSeen7d ? 'oui' : <span className="text-[color:var(--color-danger)]">non</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{h.lastActivity ? formatDate(h.lastActivity) : 'jamais'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
