import type { Metadata } from 'next';
import Link from 'next/link';
import { getPlatformStats } from '@/features/platform-dashboard/stats';
import { getHealth } from '@/features/platform/health';
import { GrowthChart } from '@/features/platform-dashboard/components/GrowthChart';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Statistiques — plateforme' };
export const dynamic = 'force-dynamic';

const STATUT: Record<string, string> = {
  ACTIVE: 'Active',
  PENDING: 'En attente',
  SUSPENDED: 'Suspendue',
  ARCHIVED: 'Archivée',
};

export default async function PlatformStatsPage() {
  const [stats, sante] = await Promise.all([getPlatformStats(), getHealth()]);
  const nombre = (n: number) => n.toLocaleString('fr-FR');
  const argent = (n: number) => `${nombre(Math.round(n))} ${stats.currency}`;

  const totalEleves = stats.schools.reduce((s, e) => s + e.students, 0);
  const actives = stats.schools.filter((s) => s.status === 'ACTIVE').length;

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader
        title="Statistiques"
        description="Est-ce que ça grandit, est-ce que ça sert, et qui paie."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <a href="/admin/export/etablissements" download>
              <Button variant="secondary" size="sm">
                Exporter les établissements
              </Button>
            </a>
            <a href="/admin/export/comptes" download>
              <Button variant="secondary" size="sm">
                Exporter les comptes
              </Button>
            </a>
            <Link href="/admin">
              <Button variant="ghost">Retour</Button>
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <Chiffre label="Établissements actifs" valeur={nombre(actives)} detail={`${stats.schools.length} au total`} />
        <Chiffre label="Élèves" valeur={nombre(totalEleves)} />
        <Chiffre label="Encaissé" valeur={argent(stats.cashedIn)} />
        <Chiffre
          label="Reste dû"
          valeur={argent(stats.outstanding)}
          alerte={stats.outstanding > 0}
        />
      </div>

      {stats.dormant > 0 ? (
        <Alert tone="error">
          <strong>{stats.dormant} établissement(s) actifs sans aucune connexion depuis plus de 30 jours.</strong> Ce
          sont ceux qui ne renouvelleront pas : appelez-les avant l’échéance.
        </Alert>
      ) : null}

      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm font-semibold">État de marche — 30 derniers jours</p>
          <div className="grid gap-3 sm:grid-cols-4 text-sm">
            <div>
              <p className="text-xs text-[color:var(--muted-foreground)]">SMS partis</p>
              <p className="font-semibold tabular-nums">{nombre(sante.sms.sent)}</p>
              <p className="text-xs text-[color:var(--muted-foreground)]">
                {nombre(sante.sms.delivered)} arrivés
                {sante.sms.cost > 0 ? ` · ${argent(sante.sms.cost)}` : ''}
              </p>
            </div>
            <div>
              <p className="text-xs text-[color:var(--muted-foreground)]">SMS en échec</p>
              <p
                className="font-semibold tabular-nums"
                style={sante.sms.recentFailures > 0 ? { color: 'var(--color-danger)' } : undefined}
              >
                {nombre(sante.sms.failed)}
              </p>
              {sante.sms.recentFailures > 0 ? (
                <p className="text-xs" style={{ color: 'var(--color-danger)' }}>
                  dont {nombre(sante.sms.recentFailures)} cette semaine
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-xs text-[color:var(--muted-foreground)]">Générations en échec</p>
              <p
                className="font-semibold tabular-nums"
                style={sante.jobs.recentFailures > 0 ? { color: 'var(--color-danger)' } : undefined}
              >
                {nombre(sante.jobs.failed)}
              </p>
              <p className="text-xs text-[color:var(--muted-foreground)]">
                {sante.jobs.recentFailures > 0 ? (
                  <span style={{ color: 'var(--color-danger)' }}>
                    dont {nombre(sante.jobs.recentFailures)} cette semaine
                  </span>
                ) : sante.jobs.lastFailure ? (
                  `le dernier le ${new Date(sante.jobs.lastFailure).toLocaleDateString('fr-FR')}`
                ) : (
                  'aucun'
                )}
              </p>
            </div>
            <div>
              <p className="text-xs text-[color:var(--muted-foreground)]">Connexions ratées (24 h)</p>
              <p className="font-semibold tabular-nums">{nombre(sante.failedLogins)}</p>
              <p className="text-xs text-[color:var(--muted-foreground)]">
                {nombre(sante.schoolsWithDisabledModules)} école(s) avec un module coupé
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm font-semibold">Les douze derniers mois</p>
          <GrowthChart months={stats.months} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <div>
            <p className="text-sm font-semibold">Ce qui sert vraiment</p>
            <p className="text-sm text-[color:var(--muted-foreground)]">
              Nombre d’établissements ayant produit des données dans chaque module — pas ce qui est activé, ce qui est
              utilisé.
            </p>
          </div>
          <ul className="space-y-1.5">
            {stats.moduleUse.map((m) => {
              const part = stats.schools.length > 0 ? Math.round((m.schools / stats.schools.length) * 100) : 0;
              return (
                <li key={m.module} className="flex items-center gap-3 text-sm">
                  <span className="w-40 shrink-0">{m.module}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--muted)' }}>
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${part}%`, backgroundColor: 'var(--color-brand)' }}
                    />
                  </span>
                  <span className="w-28 shrink-0 text-right text-xs text-[color:var(--muted-foreground)]">
                    {m.schools} / {stats.schools.length} écoles
                  </span>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3">
          <p className="text-sm font-semibold">Établissement par établissement</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
                  <th className="py-1.5">Établissement</th>
                  <th className="py-1.5">État</th>
                  <th className="py-1.5 text-right">Élèves</th>
                  <th className="py-1.5 text-right">Comptes</th>
                  <th className="py-1.5 text-right">Dernier signe de vie</th>
                </tr>
              </thead>
              <tbody>
                {stats.schools.map((s) => (
                  <tr key={s.id} className="border-b">
                    <td className="py-1.5">
                      <Link href={`/admin/etablissements/${s.id}`} className="font-medium hover:underline">
                        {s.name}
                      </Link>
                      {s.disabledModules > 0 ? (
                        <span className="ml-2 text-xs text-[color:var(--color-warning)]">
                          {s.disabledModules} module(s) coupé(s)
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 text-xs">{STATUT[s.status] ?? s.status}</td>
                    <td className="py-1.5 text-right tabular-nums">{nombre(s.students)}</td>
                    <td className="py-1.5 text-right tabular-nums">{nombre(s.staff)}</td>
                    <td className="py-1.5 text-right text-xs">
                      {s.idleDays === null ? (
                        <span className="text-[color:var(--color-danger)]">jamais vu</span>
                      ) : s.idleDays === 0 ? (
                        "aujourd'hui"
                      ) : (
                        <span className={s.idleDays > 30 ? 'text-[color:var(--color-danger)]' : ''}>
                          il y a {s.idleDays} j
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[color:var(--muted-foreground)]">
            « Dernier signe de vie » : la connexion la plus récente enregistrée pour cet établissement, sur les douze
            derniers mois.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Chiffre({
  label,
  valeur,
  detail,
  alerte,
}: {
  label: string;
  valeur: string;
  detail?: string;
  alerte?: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-3">
        <p className="text-xs font-medium text-[color:var(--muted-foreground)]">{label}</p>
        <p
          className="mt-1 text-xl font-bold tabular-nums"
          style={alerte ? { color: 'var(--color-danger)' } : undefined}
        >
          {valeur}
        </p>
        {detail ? <p className="text-xs text-[color:var(--muted-foreground)]">{detail}</p> : null}
      </CardContent>
    </Card>
  );
}
