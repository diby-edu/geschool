import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { formatDate } from '@/features/academic-years/labels';
import { BlocHead, Card, Pill, fr, plural } from '@/features/dashboard/components/ui';
import { daysWithoutText, isAtRisk, money, monthShort, type CockpitSchool, type PlatformCockpit, type SchoolHealth } from '../cockpit';

/**
 * Blocs du poste de pilotage (variante A, maquette super-admin-cockpit.html).
 * Mots choisis avec l'utilisateur : « argent reçu », « en essai », « abonnée »,
 * « abonnement expiré » — jamais « encaissé », « facturé » ni « reste dû ».
 */

function More({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-bold text-[color:var(--color-brand)] hover:underline">
      {children} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl px-3 py-4 text-sm text-[color:var(--muted-foreground)]" style={{ backgroundColor: 'color-mix(in oklch, var(--foreground) 4%, var(--surface))' }}>
      {children}
    </p>
  );
}

/** Argent reçu mois par mois (12 mois) : une barre par mois, le mois en cours en couleur pleine. */
export function MoneyChart({ data }: { data: PlatformCockpit['money'] }) {
  const max = Math.max(1, ...data.months.map((m) => m.amount));
  const total = data.months.reduce((a, m) => a + m.amount, 0);
  return (
    <Card>
      <BlocHead title="Argent reçu mois par mois" sub="Les 12 derniers mois. L'argent arrive surtout à la rentrée, puis au fil des fins d'essai." right={<More href="/admin/paiements?tout=1">Paiements</More>} />
      {total === 0 ? (
        <div className="mt-4">
          <Empty>Aucun paiement reçu sur les 12 derniers mois. Les paiements apparaissent ici dès que tu les confirmes.</Empty>
        </div>
      ) : (
        <div className="mt-4 grid h-48 grid-cols-12 items-end gap-1.5" role="img" aria-label="Argent reçu par mois">
          {data.months.map((m, i) => {
            const h = Math.round((m.amount / max) * 100);
            const last = i === data.months.length - 1;
            return (
              <div key={m.month} className="flex h-full min-w-0 flex-col items-center justify-end gap-1" title={`${monthShort(m.month)} : ${money(m.amount, data.currency)}`}>
                <div
                  className="w-full rounded-t-lg"
                  style={{ height: `${Math.max(h, m.amount > 0 ? 4 : 1)}%`, backgroundColor: last ? 'var(--color-brand)' : 'var(--color-brand-muted)' }}
                />
                <span className="text-[10px] text-[color:var(--muted-foreground)]">{monthShort(m.month)}</span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/** Argent reçu de l'année, réparti par module. */
export function ByModuleCard({ data }: { data: PlatformCockpit['money'] }) {
  const max = Math.max(1, ...data.byModule.map((m) => m.amount));
  return (
    <Card>
      <BlocHead title="Argent reçu par module" sub={`Depuis le ${formatDate(data.yearStart)}`} right={<More href="/admin/plans">Modules et prix</More>} />
      <div className="mt-4 space-y-3">
        {data.byModule.length === 0 ? (
          <Empty>Pas encore de paiement cette année.</Empty>
        ) : (
          data.byModule.map((m) => (
            <div key={m.module}>
              <div className="flex justify-between gap-3 text-sm">
                <span>{m.module}</span>
                <b className="tabular-nums">{money(m.amount, data.currency)}</b>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ backgroundColor: 'var(--color-brand-muted)' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.round((m.amount / max) * 100)}%`, backgroundColor: 'var(--color-brand)' }} />
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

export type TodoItem = { label: string; href: string; action: string; tone: 'bad' | 'warn' | 'info' };

export function TodoCard({ items }: { items: TodoItem[] }) {
  return (
    <Card>
      <BlocHead title="À traiter" sub={items.length ? `${items.length} ${plural(items.length, 'chose', 'choses')}, la plus urgente d'abord` : 'Rien en attente'} />
      <ul className="mt-4 space-y-2">
        {items.length === 0 ? (
          <Empty>Tout est à jour.</Empty>
        ) : (
          items.map((t) => (
            <li key={t.label} className="flex items-center justify-between gap-3 text-sm">
              <span>{t.label}</span>
              <Link href={t.href} className="shrink-0">
                <Pill tone={t.tone}>{t.action}</Pill>
              </Link>
            </li>
          ))
        )}
      </ul>
    </Card>
  );
}

function healthReason(h: SchoolHealth): string {
  if (h.sessions5d > 0 && h.calls5d === 0) return 'aucun appel sur les derniers jours de cours';
  if (!h.directionSeen7d) return 'la direction ne se connecte plus';
  return 'aucune activité';
}

/** Les écoles à risque : 2 jours de cours (ou plus) sans activité. */
export function RiskCard({ health, today }: { health: SchoolHealth[]; today: string }) {
  const risky = health.filter(isAtRisk).slice(0, 5);
  return (
    <Card>
      <BlocHead title="Écoles à risque" sub="2 jours de cours ou plus sans activité" right={<More href="/admin/sante">Santé des écoles</More>} />
      <ul className="mt-4 space-y-2.5">
        {risky.length === 0 ? (
          <Empty>Toutes les écoles ont travaillé ces derniers jours de cours.</Empty>
        ) : (
          risky.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0">
                <Link href={`/admin/etablissements/${h.id}`} className="font-semibold hover:underline">
                  {h.name}
                </Link>
                <span className="block text-xs text-[color:var(--muted-foreground)]">{healthReason(h)}</span>
              </span>
              <Pill tone={h.schoolDaysWithout >= 5 ? 'bad' : 'warn'}>{daysWithoutText(h, today)}</Pill>
            </li>
          ))
        )}
      </ul>
    </Card>
  );
}

export function SmsCard({ sms, balance, currency }: { sms: PlatformCockpit['sms']; balance: number | null; currency: string }) {
  const rate = sms.sent > 0 ? Math.round((sms.delivered / sms.sent) * 1000) / 10 : null;
  return (
    <Card>
      <BlocHead title="SMS du mois" sub="Identifiants, annonces, absences" right={<More href="/admin/sms">SMS</More>} />
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between gap-3"><dt>Envoyés</dt><dd className="font-bold tabular-nums">{fr(sms.sent)}</dd></div>
        <div className="flex justify-between gap-3"><dt>Bien reçus</dt><dd className="font-bold tabular-nums">{rate === null ? '—' : `${rate.toLocaleString('fr-FR')} %`}</dd></div>
        <div className="flex justify-between gap-3">
          <dt>En échec</dt>
          <dd>{sms.failed > 0 ? <Pill tone="bad">{fr(sms.failed)}</Pill> : <span className="font-bold">0</span>}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Écoles proches de leur quota</dt>
          <dd>{sms.nearQuota.length > 0 ? <Pill tone="warn">{sms.nearQuota.length}</Pill> : <span className="font-bold">0</span>}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Solde chez le fournisseur</dt>
          <dd className="font-bold tabular-nums">{balance === null ? 'non branché' : money(balance, currency)}</dd>
        </div>
      </dl>
    </Card>
  );
}

const SITUATION_LABEL: Record<CockpitSchool['situation'], string> = {
  TRIAL: 'En essai',
  PAID: 'Abonnée',
  EXPIRED: 'Abonnement expiré',
  STOPPED: 'Suspendue',
  NONE: 'Sans abonnement',
};

/** Les écoles à suivre : expirées (avec la fin du délai de grâce) puis essais qui finissent. */
export function SituationsCard({ s }: { s: PlatformCockpit['situations'] }) {
  const rows = s.schools.filter((x) => x.situation === 'EXPIRED' || x.situation === 'TRIAL' || x.situation === 'NONE').slice(0, 8);
  return (
    <Card>
      <BlocHead title="Paiement des écoles" sub={`Délai de grâce après expiration : ${s.graceDays} jours`} right={<More href="/admin/etablissements">Établissements</More>} />
      <ul className="mt-4 divide-y" style={{ borderColor: 'var(--border)' }}>
        {rows.length === 0 ? (
          <Empty>Toutes les écoles ont payé leur année.</Empty>
        ) : (
          rows.map((x) => (
            <li key={x.id} className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
              <span className="min-w-0">
                <Link href={`/admin/facturation/${x.id}`} className="font-semibold hover:underline">
                  {x.name}
                </Link>
                <span className="block text-xs text-[color:var(--muted-foreground)]">
                  {x.situation === 'EXPIRED'
                    ? `fini le ${formatDate(x.endsOn ?? '')}${x.graceEndsOn ? ` · coupure le ${formatDate(x.graceEndsOn)}` : ''}`
                    : x.situation === 'TRIAL'
                      ? x.endsOn
                        ? `essai jusqu'au ${formatDate(x.endsOn)}`
                        : 'essai sans date de fin'
                      : 'aucun abonnement enregistré'}
                </span>
              </span>
              <Pill tone={x.situation === 'EXPIRED' ? 'bad' : x.situation === 'TRIAL' ? 'warn' : 'muted'}>{SITUATION_LABEL[x.situation]}</Pill>
            </li>
          ))
        )}
      </ul>
    </Card>
  );
}
