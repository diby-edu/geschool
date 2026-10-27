import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, HeartPulse, Plus, Wallet } from 'lucide-react';
import { getPlatformOverview } from '@/features/platform-dashboard/queries';
import { getPlatformCockpit, isAtRisk, money } from '@/features/platform-dashboard/cockpit';
import { schoolsHref } from '@/features/platform-schools/filters';
import { smsBalance } from '@/features/sms/balance';
import { getAuthenticatedUser } from '@/lib/supabase/server';
import { Alert } from '@/components/ui/alert';
import { Hero, type HeroAction } from '@/features/dashboard/components/Hero';
import { dateFr } from '@/features/dashboard/components/DayBlock';
import { BlocHead, Card, Tile, fr, plural } from '@/features/dashboard/components/ui';
import {
  ByModuleCard,
  MoneyChart,
  RiskCard,
  SituationsCard,
  SmsCard,
  TodoCard,
  type TodoItem,
} from '@/features/platform-dashboard/components/CockpitBlocks';

export const metadata: Metadata = { title: 'Tableau de bord plateforme' };
export const dynamic = 'force-dynamic';

function formatWhen(iso: string): string {
  const hours = Math.round((Date.now() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return "à l'instant";
  if (hours < 24) return `il y a ${hours} h`;
  return `il y a ${Math.round(hours / 24)} j`;
}

/**
 * Poste de pilotage de la plateforme — variante A « l'argent d'abord », choisie
 * le 2026-10-25 (maquette docs/maquettes/super-admin-cockpit.html) : l'argent
 * reçu et la situation des écoles en tête, puis ce qui appelle un geste.
 */
export default async function PlatformDashboardPage() {
  const [overview, cockpit, user, balance] = await Promise.all([getPlatformOverview(), getPlatformCockpit(), getAuthenticatedUser(), smsBalance()]);
  const c = cockpit.data;
  const name = (user?.user_metadata?.display_name as string | undefined) ?? user?.email ?? 'Super Admin';

  if (!c) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <Alert tone="warning">
          {cockpit.missing
            ? 'Le tableau de bord attend une mise à jour de la base (migration 0140). Lance « pnpm db:migrate ».'
            : 'Le tableau de bord n’a pas pu être calculé (base trop lente ou indisponible). Recharge la page dans un instant.'}
        </Alert>
      </div>
    );
  }

  const cur = c.money.currency;
  const s = c.situations;
  const risky = c.health.filter(isAtRisk);
  const activeThisWeek = c.health.filter((h) => h.schoolDaysWithout === 0).length;

  // Ce qui appelle un geste, le plus urgent d'abord.
  const todo: TodoItem[] = [
    ...(s.expiredCut > 0 ? [{ label: `${s.expiredCut} ${plural(s.expiredCut, 'école a dépassé', 'écoles ont dépassé')} le délai de grâce`, href: schoolsHref({ abonnement: 'retard' }), action: 'Voir', tone: 'bad' as const }] : []),
    ...(s.counts.EXPIRED > 0 ? [{ label: `${s.counts.EXPIRED} ${plural(s.counts.EXPIRED, 'abonnement expiré', 'abonnements expirés')}`, href: '#paiement-des-ecoles', action: 'Relancer', tone: 'bad' as const }] : []),
    ...(risky.length > 0 ? [{ label: `${risky.length} ${plural(risky.length, 'école à risque', 'écoles à risque')} (2 jours de cours sans activité)`, href: '/admin/sante', action: 'Voir', tone: 'bad' as const }] : []),
    ...(overview.pendingPayments.count > 0 ? [{ label: `${overview.pendingPayments.count} ${plural(overview.pendingPayments.count, 'paiement déclaré', 'paiements déclarés')} à confirmer`, href: '/admin/paiements', action: 'Confirmer', tone: 'warn' as const }] : []),
    ...(overview.schools.pending > 0 ? [{ label: `${overview.schools.pending} ${plural(overview.schools.pending, 'école', 'écoles')} en attente d'activation`, href: schoolsHref({ statut: 'PENDING' }), action: 'Activer', tone: 'warn' as const }] : []),
    ...(c.sms.failedYesterday > 0 ? [{ label: `${c.sms.failedYesterday} SMS en échec hier`, href: '/admin/sms', action: 'Voir', tone: 'warn' as const }] : []),
    ...(s.trialsEndingSoon > 0 ? [{ label: `${s.trialsEndingSoon} ${plural(s.trialsEndingSoon, 'essai finit', 'essais finissent')} dans les 30 jours`, href: schoolsHref({ abonnement: 'essai-bientot' }), action: 'Voir', tone: 'info' as const }] : []),
    ...(c.sms.nearQuota.length > 0 ? [{ label: `${c.sms.nearQuota.length} ${plural(c.sms.nearQuota.length, 'école proche', 'écoles proches')} de son quota SMS`, href: '/admin/sms', action: 'Voir', tone: 'info' as const }] : []),
  ];

  const actions: HeroAction[] = [
    { label: 'Nouvel établissement', href: '/admin/schools/new', Icon: Plus, group: 'create' },
    { label: overview.pendingPayments.count > 0 ? `Confirmer les paiements (${overview.pendingPayments.count})` : 'Paiements', href: '/admin/paiements', Icon: Wallet, group: 'module' },
    { label: 'Établissements', href: '/admin/etablissements', Icon: Building2, group: 'module' },
    { label: 'Santé des écoles', href: '/admin/sante', Icon: HeartPulse, group: 'module' },
  ];

  // 7 sur 5 602 : « moins de 1 % », pas « 0 % » (qui laisserait croire qu'aucun ne l'est).
  const parentsPct = c.people.guardians > 0 ? (c.people.parentsConnected / c.people.guardians) * 100 : null;
  const parentsPctText = parentsPct === null ? null : parentsPct > 0 && parentsPct < 1 ? 'moins de 1 %' : `${Math.round(parentsPct)} %`;
  const y = Number(c.money.yearStart.slice(0, 4));

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <Hero
        name={name}
        roleText="Super Admin"
        schoolName={`Plateforme · ${fr(overview.schools.total)} ${plural(overview.schools.total, 'établissement', 'établissements')}`}
        dateText={dateFr(c.today)}
        periodText={`Année ${y}-${y + 1}`}
        chips={[]}
        actions={actions}
      />

      <section className="space-y-3">
        <BlocHead title="L'essentiel" sub="L'argent reçu et la situation des écoles" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile tone="indigo" label="Argent reçu cette année" value={money(c.money.receivedYear, cur)} size={26} min={132} sub={`dont ${money(c.money.receivedMonth, cur)} ce mois`} href="/admin/paiements?tout=1" />
          <Tile tone="green" label="Écoles abonnées" value={fr(s.counts.PAID)} min={132} sub="année payée" href={schoolsHref({ abonnement: 'actif' })} />
          <Tile tone="amber" label="En essai" value={fr(s.counts.TRIAL)} min={132} sub={s.trialsEndingSoon > 0 ? `${s.trialsEndingSoon} ${plural(s.trialsEndingSoon, 'finit', 'finissent')} sous 30 jours` : 'aucun ne finit sous 30 jours'} href={schoolsHref({ abonnement: 'essai-bientot' })} />
          <Tile tone="rose" label="Abonnement expiré" value={fr(s.counts.EXPIRED)} min={132} sub={`${s.expiredInGrace} en délai de grâce · ${s.expiredCut} ${plural(s.expiredCut, 'coupée', 'coupées')}`} href="#paiement-des-ecoles" />
          <Tile module="eleves" label="Élèves" value={fr(c.people.students)} min={132} size={c.people.students > 99999 ? 30 : 40} sub={`+${fr(c.people.studentsNewMonth)} ce mois · ${fr(c.people.teachers)} enseignants`} href="/admin/statistiques" />
          <Tile module="annonces" label="Parents connectés" value={fr(c.people.parentsConnected)} min={132} sub={parentsPctText === null ? 'aucun parent' : `${parentsPctText} des ${fr(c.people.guardians)} parents`} href="/admin/comptes" />
          <Tile module="presences" label="Écoles actives" value={`${fr(activeThisWeek)} / ${fr(c.health.length)}`} size={34} min={132} sub="ont travaillé au dernier jour de cours" href="/admin/sante" />
          <Tile module="bulletins" label="Écoles à risque" value={fr(risky.length)} min={132} sub="2 jours de cours sans activité" href="/admin/sante" />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <MoneyChart data={c.money} />
        <ByModuleCard data={c.money} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <TodoCard items={todo} />
        <RiskCard health={c.health} today={c.today} />
        <SmsCard sms={c.sms} balance={balance} currency={cur} />
      </div>

      <div id="paiement-des-ecoles" className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <SituationsCard s={s} />
        <Card>
          <BlocHead title="Activité récente" sub="Les dernières actions sur la plateforme" right={<Link href="/admin/journal" className="text-sm font-bold text-[color:var(--color-brand)] hover:underline">Tout le journal</Link>} />
          {overview.activity.length === 0 ? (
            <p className="mt-4 text-sm text-[color:var(--muted-foreground)]">Aucune activité récente.</p>
          ) : (
            <ul className="mt-4 divide-y" style={{ borderColor: 'var(--border)' }}>
              {overview.activity.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
                  <span className="min-w-0">
                    {item.label}
                    {item.schoolName ? <span className="text-[color:var(--muted-foreground)]"> · {item.schoolName}</span> : null}
                  </span>
                  <span className="shrink-0 text-xs text-[color:var(--muted-foreground)]">{formatWhen(item.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
