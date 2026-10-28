import type { Metadata } from 'next';
import Link from 'next/link';
import { getServerStatus, getTechnicalStatus, overallLight, RESTARTS_WARN, type Light, type ServerStatus, type TechnicalStatus } from '@/features/platform/technical';
import { clearErrorsAction, runAllTasksAction, runTaskAction } from '@/features/platform/technical-actions';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { BlocHead, Card, Pill } from '@/features/dashboard/components/ui';
import { getAlertsView, getQueueView, type QueueView } from '@/features/platform/alerts';
import { ALERT_CHECKS, type AlertSettings } from '@/features/platform/alerts-core';
import { saveAlertSettingsAction, sendTestAlertAction } from '@/features/platform/alerts-actions';
import { KeepForm } from '@/features/platform/components/KeepForm';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { MiniBars, MiniLine } from '@/features/platform/components/MiniChart';
import { getActivity, getSecurity, getSeries, PERIODS, type Activity, type PeriodKey, type Security, type SeriesPoint } from '@/features/platform/insights';
import { dbGrowth } from '@/features/platform/growth';
import { actionLabel } from '@/features/audit/labels';

export const metadata: Metadata = { title: 'Technique — plateforme' };
export const dynamic = 'force-dynamic';

const COLOR: Record<Light, string> = { green: 'var(--color-success)', orange: 'var(--color-warning)', red: 'var(--color-danger)' };
const WORD: Record<Light, string> = { green: 'Tout va bien', orange: 'À surveiller', red: 'À corriger' };
const TONE: Record<Light, 'good' | 'warn' | 'bad'> = { green: 'good', orange: 'warn', red: 'bad' };
const worst = (...l: Light[]): Light => (l.includes('red') ? 'red' : l.includes('orange') ? 'orange' : 'green');

const TABS = [
  { key: 'ensemble', label: 'Vue d’ensemble' },
  { key: 'serveur', label: 'Serveur' },
  { key: 'base', label: 'Base et sauvegardes' },
  { key: 'activite', label: 'Activité' },
  { key: 'securite', label: 'Sécurité' },
  { key: 'taches', label: 'Tâches' },
  { key: 'alertes', label: 'Alertes' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const quand = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { timeZone: 'Africa/Abidjan', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'jamais';
const mo = (b: number) => `${Math.round(b / 1024 / 1024).toLocaleString('fr-FR')} Mo`;
const go = (b: number) => `${(b / 1024 ** 3).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go`;
const pct = (a: number | null, b: number | null) => (a !== null && b ? Math.round((a / b) * 100) : null);
const ms = (v: number | null) => (v === null ? 'sans réponse' : `${v.toLocaleString('fr-FR')} ms`);

function depuis(iso: string | null): string {
  if (!iso) return '—';
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'à l’instant';
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`;
}

function duree(seconds: number): string {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  return d > 0 ? `${d} j ${h} h` : `${h} h ${Math.floor((seconds % 3600) / 60)} min`;
}

function Dot({ light }: { light: Light }) {
  return <span className="mr-2 inline-block size-2.5 shrink-0 rounded-full" style={{ background: COLOR[light] }} aria-label={WORD[light]} />;
}

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-t py-2 text-sm first:border-t-0" style={{ borderColor: 'var(--border)' }}>
      <span className="text-[color:var(--muted-foreground)]">{label}</span>
      <span className="text-right font-semibold">{children}</span>
    </div>
  );
}

function Gauge({ value, warn = 70, bad = 90 }: { value: number | null; warn?: number; bad?: number }) {
  if (value === null) return null;
  const light: Light = value >= bad ? 'red' : value >= warn ? 'orange' : 'green';
  return (
    <div className="mb-1 h-2 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
      <div className="h-full" style={{ width: `${Math.min(100, value)}%`, background: COLOR[light] }} />
    </div>
  );
}

/** La page Technique : un voyant par partie de l'application, en quatre onglets (lot A, 0153). */
export default async function TechnicalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === sp.onglet) ? (sp.onglet as Tab) : 'ensemble';
  const period: PeriodKey = PERIODS.some((x) => x.key === sp.periode) ? (sp.periode as PeriodKey) : '24h';
  const [s, srv] = await Promise.all([getTechnicalStatus(), getServerStatus().catch(() => null)]);
  if (!s) {
    return (
      <div className="mx-auto max-w-5xl">
        <Alert tone="warning">Cette page attend la migration 0151 (« pnpm db:migrate »).</Alert>
      </div>
    );
  }
  const all = srv ? worst(overallLight(s), ...Object.values(srv.lights)) : overallLight(s);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Technique"
        description={`Est-ce que tout tourne ? En ce moment : ${WORD[all].toLowerCase()}.${srv?.takenAt ? ` Dernier relevé ${depuis(srv.takenAt)}.` : ''}`}
      />
      {typeof sp.resultat === 'string' ? <Alert tone="success">Tâche lancée : {sp.resultat}.</Alert> : null}
      {typeof sp.resultats === 'string' ? (
        <Alert tone="success">
          <b>Tâches lancées :</b>
          <ul className="mt-1 list-disc pl-5">
            {sp.resultats.split('\n').map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
      {sp.vide ? <Alert tone="success">Journal des erreurs vidé.</Alert> : null}
      {!srv ? <Alert tone="warning">Les onglets Serveur et Sauvegardes attendent la migration 0153 (« pnpm db:migrate »).</Alert> : null}

      <nav className="flex flex-wrap gap-2" aria-label="Onglets">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/technique?onglet=${t.key}`}
            className="rounded-xl border px-3 py-1.5 text-sm font-semibold"
            style={
              t.key === tab
                ? { background: 'var(--color-brand)', color: '#fff', borderColor: 'var(--color-brand)' }
                : { borderColor: 'var(--border)', background: 'var(--surface)' }
            }
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'ensemble' ? <Overview s={s} srv={srv} period={period} series={await getSeries(PERIODS.find((x) => x.key === period)!.hours)} /> : null}
      {tab === 'serveur' ? <ServerTab srv={srv} /> : null}
      {tab === 'base' ? <DatabaseTab s={s} srv={srv} series={await getSeries(168)} /> : null}
      {tab === 'activite' ? <ActivityTab activity={await getActivity()} /> : null}
      {tab === 'securite' ? <SecurityTab security={await getSecurity()} s={s} /> : null}
      {tab === 'taches' ? <TasksTab s={s} queue={await getQueueView()} /> : null}
      {tab === 'alertes' ? <AlertsTab view={await getAlertsView()} sp={sp} /> : null}
    </div>
  );
}

function Overview({ s, srv, period, series }: { s: TechnicalStatus; srv: ServerStatus | null; period: PeriodKey; series: SeriesPoint[] | null }) {
  const snap = srv?.snapshot ?? null;
  const tasksLight: Light = worst(...s.tasks.map((t) => t.light));
  const lastBackup = srv?.backups.find((b) => b.status === 'OK') ?? null;
  const geschool = snap?.processes?.filter((p) => p.name.startsWith('geschool')) ?? [];
  const tiles: { label: string; value: string; light: Light; tab: Tab }[] = [
    { label: 'Site', value: snap ? ms(snap.timings.site) : '—', light: srv?.lights.site ?? 'orange', tab: 'serveur' },
    { label: 'Serveur', value: snap ? `mémoire ${pct(snap.memUsed, snap.memTotal)} %` : '—', light: srv?.lights.server ?? 'orange', tab: 'serveur' },
    {
      label: 'Programmes du VPS',
      value: snap?.processes ? `${snap.processes.filter((p) => p.status === 'online').length} / ${snap.processes.length}` : '—',
      light: srv?.lights.processes ?? 'orange',
      tab: 'serveur',
    },
    { label: 'Solveur', value: snap ? (snap.solverOk ? 'prêt' : 'sans réponse') : '—', light: srv?.lights.solver ?? 'orange', tab: 'serveur' },
    { label: 'Base de données', value: `${Math.round((s.db.bytes / s.db.limitBytes) * 100)} %`, light: s.db.light, tab: 'base' },
    { label: 'Dernière sauvegarde', value: lastBackup ? depuis(lastBackup.startedAt) : 'aucune', light: srv?.lights.backup ?? 'orange', tab: 'base' },
    { label: 'Tâches de nuit', value: `${s.tasks.filter((t) => t.light === 'green').length} / ${s.tasks.length} à jour`, light: tasksLight, tab: 'taches' },
    { label: 'SMS', value: s.sms.balance === null ? s.sms.provider : `${s.sms.balance.toLocaleString('fr-FR')} SMS`, light: s.sms.light, tab: 'ensemble' },
    { label: 'Connexions', value: `${s.security.lockedNow} bloqué(s)`, light: s.security.light, tab: 'ensemble' },
    { label: 'Erreurs (7 j)', value: String(s.errors7d), light: s.errorsLight, tab: 'ensemble' },
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map((t) => (
          <Link
            key={t.label}
            href={`/admin/technique?onglet=${t.tab}`}
            className="rounded-2xl border p-4 hover:shadow-sm"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
          >
            <div className="flex items-center text-sm font-extrabold">
              <Dot light={t.light} />
              {t.value}
            </div>
            <div className="mt-1 text-xs text-[color:var(--muted-foreground)]">{t.label}</div>
          </Link>
        ))}
      </div>

      <Curves period={period} series={series} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <BlocHead title="SMS" right={<Pill tone={TONE[s.sms.light]}>{WORD[s.sms.light]}</Pill>} />
          <div className="mt-3">
            <Row label="Opérateur">{s.sms.configured ? s.sms.provider : 'console : rien ne part vraiment'}</Row>
            <Row label="Crédit chez l’opérateur">{s.sms.balance === null ? '—' : `${s.sms.balance.toLocaleString('fr-FR')} SMS`}</Row>
            <Row label="Envoyés (7 jours)">
              {s.sms.sent7d} · {s.sms.failed7d} échec(s)
            </Row>
            <Row label="En attente d’accusé de réception">{s.sms.pending}</Row>
            <Row label="Dernier échec">{s.sms.lastFailure ? `${quand(s.sms.lastFailure.at)} · ${s.sms.lastFailure.error ?? ''}` : '—'}</Row>
            <div className="pt-2 text-sm">
              <Link href="/admin/sms" className="font-bold text-[color:var(--color-brand)] hover:underline">
                Page SMS
              </Link>
            </div>
          </div>
        </Card>

        <Card>
          <BlocHead title="Connexions et configuration" right={<Pill tone={TONE[s.security.light]}>{WORD[s.security.light]}</Pill>} />
          <div className="mt-3">
            <Row label="Mots de passe ratés (24 h)">{s.security.loginFailures24h}</Row>
            <Row label="Comptes bloqués en ce moment">
              {s.security.lockedNow > 0 ? <Link href="/admin/comptes?f=LOCKED" className="underline">{s.security.lockedNow}</Link> : 0}
            </Row>
            <Row label="Comptes Super Admin">{s.security.platformAdmins}</Row>
            {geschool.map((p) => (
              <Row key={p.name} label={`Programme ${p.name}`}>
                {p.status === 'online' ? 'en ligne' : p.status} · {mo(p.memory)}
              </Row>
            ))}
            {s.config.map((c) => (
              <Row key={c.label} label={c.label}>
                <span className="inline-flex items-center gap-2">
                  <Pill tone={c.ok ? 'good' : 'warn'}>{c.ok ? 'OK' : 'À faire'}</Pill>
                  <span className="text-xs font-normal text-[color:var(--muted-foreground)]">{c.hint}</span>
                </span>
              </Row>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <BlocHead
          title="Erreurs de l’application"
          sub={`${s.errors7d} erreur(s) ces 7 derniers jours · gardées 30 jours`}
          right={
            s.errors.length > 0 ? (
              <ConfirmSubmit action={clearErrorsAction} label="Vider le journal" variant="secondary" confirmMessage="Vider le journal des erreurs ? À faire une fois les erreurs corrigées." />
            ) : null
          }
        />
        {s.errors.length === 0 ? (
          <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">Aucune erreur notée.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {s.errors.map((e) => (
              <details key={e.id} className="rounded-xl border p-3 text-sm" style={{ borderColor: 'var(--border)' }}>
                <summary className="flex cursor-pointer flex-wrap justify-between gap-2">
                  <span>
                    <b>{e.message}</b>
                    <span className="block text-xs text-[color:var(--muted-foreground)]">
                      {e.path ?? '—'} · dernière fois : {quand(e.lastSeen)}
                    </span>
                  </span>
                  <Pill tone="muted">{e.occurrences} fois</Pill>
                </summary>
                {e.detail ? <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-xs text-[color:var(--muted-foreground)]">{e.detail}</pre> : null}
              </details>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function ServerTab({ srv }: { srv: ServerStatus | null }) {
  const snap = srv?.snapshot ?? null;
  const relever = (
    <ConfirmSubmit
      action={runTaskAction.bind(null, 'platform-metrics')}
      label="Relever maintenant"
      variant="secondary"
      confirmMessage="Faire un relevé du serveur maintenant ? Il est fait tout seul toutes les 5 minutes."
    />
  );
  if (!snap) {
    return (
      <Card>
        <BlocHead title="Serveur" right={relever} />
        <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">
          Aucun relevé pour l’instant. Le worker en fait un toutes les 5 minutes sur le VPS ; « Relever maintenant » en fait un tout de suite.
        </p>
      </Card>
    );
  }
  const mem = pct(snap.memUsed, snap.memTotal);
  const disk = pct(snap.diskUsed, snap.diskTotal);
  const procs = [...(snap.processes ?? [])].sort((a, b) => Number(b.name.startsWith('geschool')) - Number(a.name.startsWith('geschool')) || b.memory - a.memory);

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <BlocHead title="Ressources" sub={`Relevé ${depuis(srv?.takenAt ?? null)} · ${snap.host}`} right={<Pill tone={TONE[srv!.lights.server]}>{WORD[srv!.lights.server]}</Pill>} />
          <div className="mt-3">
            <Row label={`Processeur (${snap.cores} cœur${snap.cores > 1 ? 's' : ''})`}>{snap.cpu === null ? '—' : `${snap.cpu} % · moyenne 5 min`}</Row>
            <Gauge value={snap.cpu} warn={80} bad={95} />
            <Row label="Mémoire">{mem === null ? '—' : `${go(snap.memUsed)} / ${go(snap.memTotal)} (${mem} %)`}</Row>
            <Gauge value={mem} warn={85} bad={95} />
            <Row label="Disque">{disk === null ? '—' : `${go(snap.diskUsed!)} / ${go(snap.diskTotal!)} (${disk} %)`}</Row>
            <Gauge value={disk} warn={85} bad={95} />
            <Row label="Swap utilisé">{snap.swapUsed === null ? '—' : `${mo(snap.swapUsed)} / ${go(snap.swapTotal ?? 0)}`}</Row>
            <Row label="Allumé depuis">{duree(snap.uptimeSeconds)}</Row>
          </div>
        </Card>

        <Card>
          <BlocHead title="Temps de réponse" sub="Mesuré sur le serveur lui-même" right={relever} />
          <div className="mt-3">
            <Row label={<><Dot light={srv!.lights.site} />Page de connexion</>}>{ms(snap.timings.site)}</Row>
            <Row label="Sonde de santé">{ms(snap.timings.health)}</Row>
            <Row label="Base de données">{ms(snap.timings.db)}</Row>
            <Row label={<><Dot light={srv!.lights.solver} />Solveur des emplois du temps</>}>{ms(snap.timings.solver)}</Row>
            <p className="pt-2 text-xs text-[color:var(--muted-foreground)]">Orange au-delà de 1 s, rouge au-delà de 3 s ou sans réponse.</p>
          </div>
        </Card>

        <Card>
          <BlocHead title="Base de données (relevé)" />
          <div className="mt-3">
            {snap.db ? (
              <>
                <Row label="Connexions ouvertes">
                  {snap.db.connections} / {snap.db.maxConnections}
                </Row>
                <Row label="Lectures servies par le cache">{snap.db.cacheHit === null ? '—' : `${snap.db.cacheHit.toLocaleString('fr-FR')} %`}</Row>
                <Row label="Taille">{mo(snap.db.bytes)}</Row>
              </>
            ) : (
              <p className="text-sm text-[color:var(--muted-foreground)]">La base n’a pas répondu au relevé.</p>
            )}
          </div>
        </Card>
      </div>

      <Card>
        <BlocHead
          title={snap.processes ? `Les ${snap.processes.length} programmes du VPS` : 'Programmes du VPS'}
          sub="Tes autres projets sont seulement lus, jamais touchés"
          right={<Pill tone={TONE[srv!.lights.processes]}>{WORD[srv!.lights.processes]}</Pill>}
        />
        {snap.processes ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[color:var(--muted-foreground)]">
                  <th className="py-1.5 pr-3">Programme</th>
                  <th className="py-1.5 pr-3">État</th>
                  <th className="py-1.5 pr-3">Mémoire</th>
                  <th className="py-1.5 pr-3">Redémarrages</th>
                  <th className="py-1.5">Démarré</th>
                </tr>
              </thead>
              <tbody>
                {procs.map((p) => {
                  const mine = p.name.startsWith('geschool');
                  const light: Light = p.status !== 'online' ? (mine ? 'red' : 'orange') : p.restarts > RESTARTS_WARN ? 'orange' : 'green';
                  return (
                    <tr key={p.name} className="border-t" style={{ borderColor: 'var(--border)', fontWeight: mine ? 700 : undefined }}>
                      <td className="py-1.5 pr-3">{p.name}</td>
                      <td className="py-1.5 pr-3">
                        <Pill tone={TONE[light]}>{p.status === 'online' ? 'en ligne' : p.status}</Pill>
                      </td>
                      <td className="py-1.5 pr-3">{mo(p.memory)}</td>
                      <td className="py-1.5 pr-3">{p.restarts}</td>
                      <td className="py-1.5">{depuis(p.since)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">
              Orange quand un programme a redémarré plus de {RESTARTS_WARN} fois : il peut ralentir tout le serveur, donc geschool aussi.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">PM2 n’est pas disponible sur cette machine (poste de développement).</p>
        )}
      </Card>
    </>
  );
}

function DatabaseTab({ s, srv, series }: { s: TechnicalStatus; srv: ServerStatus | null; series: SeriesPoint[] | null }) {
  const used = Math.round((s.db.bytes / s.db.limitBytes) * 100);
  const running = srv?.backups.some((b) => b.status === 'RUNNING') ?? false;
  return (
    <>
    <GrowthCard s={s} series={series} />
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <BlocHead title="Base de données" right={<Pill tone={TONE[s.db.light]}>{WORD[s.db.light]}</Pill>} />
        <div className="mt-3">
          <Row label="Taille">
            {mo(s.db.bytes)} sur {mo(s.db.limitBytes)} ({used} %)
          </Row>
          <Gauge value={used} />
          <p className="pb-2 text-xs text-[color:var(--muted-foreground)]">
            Les plus grosses tables : {s.db.tables.map((t) => `${t.name} (${mo(t.bytes)})`).join(', ')}
          </p>
          <Row label="Mises à jour de la base (migrations)">
            {s.db.migrations} appliquées{s.db.lastMigration ? ` · dernière : ${s.db.lastMigration.replace(/\.sql$/, '')}` : ''}
          </Row>
          <Row label="Connexions ouvertes">{s.db.connections}</Row>
          <p className="pt-1 text-xs text-[color:var(--muted-foreground)]">
            La taille permise se règle dans{' '}
            <Link href="/admin/reglages" className="underline">
              Réglages
            </Link>{' '}
            (offre Supabase).
          </p>
        </div>
      </Card>

      <Card>
        <BlocHead
          title="Sauvegardes"
          sub="Copie complète chaque nuit à 2 h, sur le VPS · gardées : 7 dernières nuits, 4 semaines, 6 mois"
          right={srv ? <Pill tone={TONE[srv.lights.backup]}>{WORD[srv.lights.backup]}</Pill> : null}
        />
        {!srv ? null : (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              <ConfirmSubmit
                action={runTaskAction.bind(null, 'db-backup')}
                label={running ? 'Sauvegarde en cours…' : 'Sauvegarder maintenant'}
                variant="secondary"
                confirmMessage="Copier toute la base maintenant ? Cela prend quelques minutes ; le site reste utilisable."
              />
            </div>
            {srv.backups.length === 0 ? (
              <p className="text-sm text-[color:var(--muted-foreground)]">Aucune sauvegarde pour l’instant. La première se fera cette nuit à 2 h, ou maintenant avec le bouton.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[color:var(--muted-foreground)]">
                      <th className="py-1.5 pr-3">Quand</th>
                      <th className="py-1.5 pr-3">État</th>
                      <th className="py-1.5 pr-3">Taille</th>
                      <th className="py-1.5 pr-3">Durée</th>
                      <th className="py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {srv.backups.map((b) => (
                      <tr key={b.id} className="border-t align-top" style={{ borderColor: 'var(--border)' }}>
                        <td className="py-1.5 pr-3">
                          {quand(b.startedAt)}
                          <span className="block text-xs text-[color:var(--muted-foreground)]">{b.trigger === 'NIGHT' ? 'la nuit' : 'à la main'}</span>
                        </td>
                        <td className="py-1.5 pr-3">
                          <Pill tone={b.status === 'OK' ? 'good' : b.status === 'FAILED' ? 'bad' : 'warn'}>
                            {b.status === 'OK' ? 'réussie' : b.status === 'FAILED' ? 'échouée' : 'en cours'}
                          </Pill>
                          {b.error ? <span className="block max-w-xs text-xs text-[color:var(--color-danger)]">{b.error}</span> : null}
                        </td>
                        <td className="py-1.5 pr-3">{b.sizeBytes ? mo(b.sizeBytes) : '—'}</td>
                        <td className="py-1.5 pr-3">{b.durationMs ? `${Math.round(b.durationMs / 1000)} s` : '—'}</td>
                        <td className="py-1.5 text-right">
                          {b.status === 'OK' && b.onDisk && b.fileName ? (
                            <a href={`/admin/technique/sauvegarde/${b.fileName}`} className="font-bold text-[color:var(--color-brand)] hover:underline">
                              Télécharger
                            </a>
                          ) : b.status === 'OK' ? (
                            <span className="text-xs text-[color:var(--muted-foreground)]">effacée</span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-[color:var(--muted-foreground)]">
              Place prise sur le VPS : {mo(srv.backupsBytes)}. Rouge si la dernière copie a échoué ou date de plus d’un jour. Télécharger une copie permet de la garder aussi
              ailleurs. La restauration ne se fait jamais d’un clic : elle suit une procédure écrite, avec moi.
            </p>
          </div>
        )}
      </Card>
    </div>
    </>
  );
}

function Curves({ period, series }: { period: PeriodKey; series: SeriesPoint[] | null }) {
  if (!series) {
    return (
      <Card>
        <BlocHead title="Courbes" />
        <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">Les courbes attendent la migration 0155 (« pnpm db:migrate »).</p>
      </Card>
    );
  }
  const pts = (pick: (p: SeriesPoint) => number | null) => series.map((p) => ({ t: p.t, v: pick(p) }));
  return (
    <Card>
      <BlocHead
        title="Courbes"
        sub="D’après les relevés du worker (toutes les 5 minutes). Survoler une courbe donne la valeur exacte."
        right={
          <span className="flex gap-1">
            {PERIODS.map((x) => (
              <Link
                key={x.key}
                href={`/admin/technique?onglet=ensemble&periode=${x.key}`}
                className="rounded-lg border px-2 py-0.5 text-xs font-semibold"
                style={
                  x.key === period
                    ? { background: 'var(--color-brand)', color: '#fff', borderColor: 'var(--color-brand)' }
                    : { borderColor: 'var(--border)' }
                }
              >
                {x.label}
              </Link>
            ))}
          </span>
        }
      />
      <div className="mt-3 grid gap-5 md:grid-cols-3">
        <div>
          <p className="mb-1 text-sm font-bold">Temps de réponse du site</p>
          <MiniLine
            label="Temps de réponse du site"
            points={pts((p) => (p.siteDown > 0 && p.siteMs === null ? null : p.siteMs))}
            format={(v) => `${Math.round(v).toLocaleString('fr-FR')} ms`}
            threshold={{ value: 1000, label: '1 s' }}
          />
        </div>
        <div>
          <p className="mb-1 text-sm font-bold">Mémoire du serveur</p>
          <MiniLine label="Mémoire du serveur" points={pts((p) => p.memPct)} format={(v) => `${Math.round(v)} %`} max={100} threshold={{ value: 90, label: '90 %' }} />
        </div>
        <div>
          <p className="mb-1 text-sm font-bold">Processeur</p>
          <MiniLine label="Processeur" points={pts((p) => p.cpuPct)} format={(v) => `${Math.round(v)} %`} max={100} threshold={{ value: 80, label: '80 %' }} />
        </div>
      </div>
    </Card>
  );
}

function GrowthCard({ s, series }: { s: TechnicalStatus; series: SeriesPoint[] | null }) {
  if (!series) return null;
  const g = dbGrowth(
    series.map((p) => ({ t: p.t, bytes: p.dbBytes })),
    s.db.limitBytes,
  );
  const reach = g.ready && g.reachOn ? new Date(`${g.reachOn}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  const light: Light = g.ready && g.daysLeft !== null ? (g.daysLeft < 30 ? 'red' : g.daysLeft < 90 ? 'orange' : 'green') : 'green';
  return (
    <Card>
      <BlocHead title="Croissance de la base" sub="D’après les relevés des 7 derniers jours" right={g.ready ? <Pill tone={TONE[light]}>{WORD[light]}</Pill> : null} />
      <div className="mt-3 grid gap-5 md:grid-cols-[1fr_2fr]">
        <div>
          {g.ready ? (
            <>
              <Row label="Croissance">{g.mbPerDay.toLocaleString('fr-FR')} Mo par jour</Row>
              <Row label="Taille permise atteinte vers le">{reach ?? 'jamais à ce rythme'}</Row>
              <Row label="Dans">{g.daysLeft === null ? '—' : `${g.daysLeft} jours`}</Row>
            </>
          ) : (
            <p className="text-sm text-[color:var(--muted-foreground)]">
              Pas encore assez de recul : il faut au moins 24 heures de relevés ({g.spanHours} h pour l’instant). La projection apparaîtra ensuite toute seule.
            </p>
          )}
        </div>
        <MiniLine
          label="Taille de la base"
          points={series.map((p) => ({ t: p.t, v: p.dbBytes }))}
          format={(v) => `${Math.round(v / 1024 / 1024).toLocaleString('fr-FR')} Mo`}
          max={s.db.limitBytes}
          threshold={{ value: s.db.limitBytes * 0.85, label: '85 % de la taille permise' }}
          color="var(--color-warning)"
        />
      </div>
    </Card>
  );
}

function ActivityTab({ activity }: { activity: Activity | null }) {
  if (!activity) {
    return (
      <Card>
        <BlocHead title="Activité" />
        <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">L’activité attend la migration 0155 (« pnpm db:migrate »).</p>
      </Card>
    );
  }
  const sum = (k: 'logins' | 'registers' | 'grades' | 'sms') => activity.schools.reduce((n, x) => n + x[k], 0);
  const active = activity.schools.filter((x) => x.logins + x.registers + x.grades > 0).length;
  // Un jour de classe (lundi à vendredi), passé 10 h, sans rien du tout : c'est anormal.
  const now = new Date();
  const weekday = now.getUTCDay() >= 1 && now.getUTCDay() <= 5;
  const lateEnough = now.getUTCHours() >= 10;
  const tiles = [
    { v: sum('logins'), l: 'Personnes connectées aujourd’hui' },
    { v: `${active} / ${activity.schools.length}`, l: 'Écoles actives aujourd’hui' },
    { v: sum('registers'), l: 'Appels faits' },
    { v: sum('grades'), l: 'Notes saisies' },
    { v: sum('sms'), l: 'SMS envoyés' },
  ];
  return (
    <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.l} className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <div className="text-lg font-extrabold">{typeof t.v === 'number' ? t.v.toLocaleString('fr-FR') : t.v}</div>
            <div className="text-xs text-[color:var(--muted-foreground)]">{t.l}</div>
          </div>
        ))}
      </div>

      <Card>
        <BlocHead title="Par école, aujourd’hui" sub="Un jour de classe sans aucune activité après 10 h passe en orange" />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[color:var(--muted-foreground)]">
                <th className="py-1.5 pr-3">École</th>
                <th className="py-1.5 pr-3">Connectés</th>
                <th className="py-1.5 pr-3">Appels</th>
                <th className="py-1.5 pr-3">Notes</th>
                <th className="py-1.5 pr-3">SMS</th>
                <th className="py-1.5 pr-3">Dernière action</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody>
              {activity.schools.map((x) => {
                const busy = x.logins + x.registers + x.grades > 0;
                const tone = busy ? 'good' : weekday && lateEnough ? 'warn' : 'muted';
                return (
                  <tr key={x.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-1.5 pr-3">
                      <Link href={`/admin/etablissements/${x.id}`} className="hover:underline">
                        {x.name}
                      </Link>
                    </td>
                    <td className="py-1.5 pr-3">{x.logins}</td>
                    <td className="py-1.5 pr-3">{x.registers}</td>
                    <td className="py-1.5 pr-3">{x.grades.toLocaleString('fr-FR')}</td>
                    <td className="py-1.5 pr-3">{x.sms}</td>
                    <td className="py-1.5 pr-3">{depuis(x.lastAction)}</td>
                    <td className="py-1.5">
                      <Pill tone={tone}>{busy ? 'active' : 'silencieuse'}</Pill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <BlocHead title="Les 7 derniers jours" sub="Toutes écoles confondues · survoler une barre donne le nombre exact" />
        <div className="mt-3 grid gap-6 md:grid-cols-3">
          <div>
            <p className="mb-1 text-sm font-bold">Appels faits</p>
            <MiniBars label="Appels faits" days={activity.days.map((d) => ({ d: d.d, v: d.registers }))} />
          </div>
          <div>
            <p className="mb-1 text-sm font-bold">Notes saisies</p>
            <MiniBars label="Notes saisies" days={activity.days.map((d) => ({ d: d.d, v: d.grades }))} />
          </div>
          <div>
            <p className="mb-1 text-sm font-bold">SMS envoyés</p>
            <MiniBars label="SMS envoyés" days={activity.days.map((d) => ({ d: d.d, v: d.sms }))} />
          </div>
        </div>
      </Card>
    </>
  );
}

function SecurityTab({ security, s }: { security: Security | null; s: TechnicalStatus }) {
  if (!security) {
    return (
      <Card>
        <BlocHead title="Sécurité" />
        <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">La sécurité attend la migration 0155 (« pnpm db:migrate »).</p>
      </Card>
    );
  }
  const attack = security.failuresLastHour > 50;
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <BlocHead
          title="Connexions ratées (24 h)"
          sub={`${security.failuresLastHour} dans la dernière heure`}
          right={<Pill tone={attack ? 'bad' : 'good'}>{attack ? 'Attaque probable' : 'Normal'}</Pill>}
        />
        {security.failures.length === 0 ? (
          <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">Aucune connexion ratée ces dernières 24 heures.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[color:var(--muted-foreground)]">
                  <th className="py-1.5 pr-3">Identifiant visé</th>
                  <th className="py-1.5 pr-3">Essais</th>
                  <th className="py-1.5 pr-3">Dernier</th>
                  <th className="py-1.5">État</th>
                </tr>
              </thead>
              <tbody>
                {security.failures.map((f, i) => (
                  <tr key={`${f.who}-${i}`} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-1.5 pr-3">
                      {f.who}
                      {f.school ? <span className="block text-xs text-[color:var(--muted-foreground)]">{f.school}</span> : null}
                    </td>
                    <td className="py-1.5 pr-3">
                      {f.n}
                      {f.ips > 1 ? <span className="block text-xs text-[color:var(--muted-foreground)]">{f.ips} adresses IP</span> : null}
                    </td>
                    <td className="py-1.5 pr-3">{quand(f.last)}</td>
                    <td className="py-1.5">{f.locked ? <Pill tone="bad">bloqué 15 min</Pill> : <Pill tone="muted">—</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">
          Identifiants en partie masqués. Un compte est bloqué 15 minutes après 5 essais ratés ; l’informaticien de l’école peut le débloquer.
        </p>
      </Card>

      <Card>
        <BlocHead title="Changements sensibles (7 jours)" sub="Comptes Super Admin, droits, responsables, suspensions, entrées dans une école" />
        <div className="mt-3">
          <Row label="Comptes Super Admin">{s.security.platformAdmins}</Row>
          {security.changes.length === 0 ? (
            <p className="mt-2 text-sm text-[color:var(--muted-foreground)]">Aucun changement sensible ces 7 derniers jours.</p>
          ) : (
            <div className="mt-2 max-h-96 overflow-y-auto">
              {security.changes.map((c, i) => (
                <div key={`${c.at}-${i}`} className="border-t py-2 text-sm first:border-t-0" style={{ borderColor: 'var(--border)' }}>
                  <b>{actionLabel(c.action)}</b>
                  <span className="block text-xs text-[color:var(--muted-foreground)]">
                    {quand(c.at)} · {c.actor ?? 'inconnu'}
                    {c.school ? ` · ${c.school}` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="pt-2 text-xs">
            <Link href="/admin/journal" className="font-bold text-[color:var(--color-brand)] hover:underline">
              Tout le journal
            </Link>
          </p>
        </div>
      </Card>
    </div>
  );
}

function TasksTab({ s, queue }: { s: TechnicalStatus; queue: QueueView | null }) {
  return (
    <>
    <Card>
      <BlocHead
        title="Tâches de nuit"
        sub="Faites par le worker, à heure fixe"
        right={
          <ConfirmSubmit
            action={runAllTasksAction}
            label="Tout lancer maintenant"
            variant="secondary"
            confirmMessage="Lancer toutes les tâches maintenant, pour toutes les écoles ? Les alertes d’absence peuvent envoyer de vrais SMS aux parents ; la sauvegarde part en arrière-plan."
          />
        }
      />
      {!s.workerSeen ? (
        <div className="mt-3">
          <Alert tone="warning">Le worker n’a jamais tourné sur cette base : il démarrera avec la mise en ligne. En attendant, lancez les tâches ici quand il le faut.</Alert>
        </div>
      ) : null}
      <div className="mt-3 space-y-3">
        {s.tasks.map((t) => (
          <div key={t.name} className="rounded-xl border p-3 text-sm" style={{ borderColor: 'var(--border)' }}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span className="flex items-start">
                <Dot light={t.light} />
                <span>
                  <b>{t.label}</b>
                  <span className="block text-xs text-[color:var(--muted-foreground)]">
                    {t.when} · dernier passage : {quand(t.lastRun)}
                    {t.lastManual ? ` · lancée à la main : ${quand(t.lastManual)}` : ''}
                    {t.failed7d > 0 ? ` · ${t.failed7d} échec(s) en 7 jours` : ''}
                  </span>
                </span>
              </span>
              <ConfirmSubmit
                action={runTaskAction.bind(null, t.name)}
                label="Lancer maintenant"
                variant="secondary"
                confirmMessage={`Lancer « ${t.label} » maintenant ? C’est le même travail que la nuit, pour toutes les écoles.`}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
    <QueueCard queue={queue} />
    </>
  );
}

function QueueCard({ queue }: { queue: QueueView | null }) {
  if (!queue) {
    return (
      <Card>
        <BlocHead title="File d’attente" />
        <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">La file attend la migration 0154 (« pnpm db:migrate »).</p>
      </Card>
    );
  }
  const failed = queue.byTask.reduce((n, t) => n + t.failed, 0);
  return (
    <Card>
      <BlocHead
        title="File d’attente"
        sub="Ce que le worker a fait ces 7 derniers jours"
        right={<Pill tone={failed > 0 ? 'warn' : 'good'}>{failed > 0 ? `${failed} échec(s)` : 'Aucun échec'}</Pill>}
      />
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[color:var(--muted-foreground)]">
              <th className="py-1.5 pr-3">Tâche</th>
              <th className="py-1.5 pr-3">Réussies</th>
              <th className="py-1.5 pr-3">Échouées</th>
              <th className="py-1.5 pr-3">En attente</th>
              <th className="py-1.5">En cours</th>
            </tr>
          </thead>
          <tbody>
            {queue.byTask.map((t) => (
              <tr key={t.name} className="border-t" style={{ borderColor: 'var(--border)' }}>
                <td className="py-1.5 pr-3">{t.label}</td>
                <td className="py-1.5 pr-3">{t.completed.toLocaleString('fr-FR')}</td>
                <td className="py-1.5 pr-3" style={t.failed > 0 ? { color: 'var(--color-danger)', fontWeight: 700 } : undefined}>
                  {t.failed}
                </td>
                <td className="py-1.5 pr-3">{t.waiting}</td>
                <td className="py-1.5">{t.active}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {queue.failed.length > 0 ? (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--muted-foreground)]">Dernières tâches échouées</p>
          {queue.failed.map((f) => (
            <div key={f.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border p-3 text-sm" style={{ borderColor: 'var(--border)' }}>
              <span>
                <b>{f.label}</b> · {quand(f.at)}
                {f.error ? <span className="block text-xs text-[color:var(--color-danger)]">{f.error}</span> : null}
              </span>
              {f.retryable ? (
                <ConfirmSubmit
                  action={runTaskAction.bind(null, f.name as Parameters<typeof runTaskAction>[0])}
                  label="Relancer"
                  variant="secondary"
                  confirmMessage={`Relancer « ${f.label} » maintenant ? C’est le même travail, pour toutes les écoles.`}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function AlertsTab({ view, sp }: { view: Awaited<ReturnType<typeof getAlertsView>>; sp: Record<string, string | string[] | undefined> }) {
  if (!view) {
    return (
      <Card>
        <BlocHead title="Alertes" />
        <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">Les alertes attendent la migration 0154 (« pnpm db:migrate »).</p>
      </Card>
    );
  }
  const st: AlertSettings = view.settings;
  const labelOf = new Map<string, string>(ALERT_CHECKS.map((c) => [c.key, c.label]));
  const th = st.thresholds;
  const num = (name: keyof AlertSettings['thresholds'], min: number, max: number) => (
    <Input name={name} type="number" min={min} max={max} defaultValue={th[name]} className="inline-block w-24" />
  );
  return (
    <>
      {sp.enregistre ? <Alert tone="success">Réglages des alertes enregistrés.</Alert> : null}
      {typeof sp.essai === 'string' ? <Alert tone="info">Alerte d’essai — {sp.essai}.</Alert> : null}

      <Card>
        <BlocHead
          title="En ce moment"
          right={<Pill tone={view.open.length > 0 ? 'bad' : 'good'}>{view.open.length > 0 ? `${view.open.length} problème(s)` : 'Aucun problème'}</Pill>}
        />
        {view.open.length === 0 ? (
          <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">Rien à signaler. Le worker vérifie tout après chaque relevé (toutes les 5 minutes).</p>
        ) : (
          <div className="mt-3 space-y-2">
            {view.open.map((a) => (
              <div key={a.id} className="rounded-xl border p-3 text-sm" style={{ borderColor: 'var(--color-danger)' }}>
                <b>{a.message}</b>
                <span className="block text-xs text-[color:var(--muted-foreground)]">
                  {labelOf.get(a.key) ?? a.key} · depuis {quand(a.openedAt)} ·{' '}
                  {a.channels.length ? `prévenu par ${a.channels.join(' et ')}` : 'aucun envoi (nuit calme ou canal non réglé)'}
                  {a.reminders ? ` · ${a.reminders} rappel(s)` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <KeepForm action={saveAlertSettingsAction} submit="Enregistrer" className="grid gap-5 lg:grid-cols-2">
        <Card>
          <BlocHead title="Où m’alerter" />
          <div className="mt-3 space-y-3 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="sms" defaultChecked={st.sms} className="size-4" /> Par SMS
            </label>
            <Field label="Numéro qui reçoit les SMS" htmlFor="phone">
              <Input id="phone" name="phone" type="tel" defaultValue={st.phone} placeholder="07 07 00 00 00" />
            </Field>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="email" defaultChecked={st.email} className="size-4" /> Par e-mail
            </label>
            <Field label="Adresse qui reçoit les e-mails" htmlFor="emailTo">
              <Input id="emailTo" name="emailTo" type="email" defaultValue={st.emailTo} placeholder="vous@exemple.ci" />
            </Field>
            {!view.emailReady ? (
              <Alert tone="warning">
                L’envoi d’e-mails n’est pas encore branché sur le serveur (Gmail : réglages SMTP à ajouter). En attendant, seules les alertes par SMS partent.
              </Alert>
            ) : null}
            <label className="flex items-start gap-2">
              <input type="checkbox" name="quietNight" defaultChecked={st.quietNight} className="mt-0.5 size-4" />
              <span>
                Pas de SMS la nuit (22 h – 6 h)
                <span className="block text-xs text-[color:var(--muted-foreground)]">Sauf site arrêté, worker arrêté ou attaque. L’e-mail part toujours.</span>
              </span>
            </label>
            <Field label="Rappel si le problème dure, toutes les (heures)" htmlFor="reminderHours">
              <Input id="reminderHours" name="reminderHours" type="number" min={1} max={72} defaultValue={st.reminderHours} className="w-24" />
            </Field>
          </div>
        </Card>

        <Card>
          <BlocHead title="Quand m’alerter" sub="Une alerte par problème, puis « réglé » quand il disparaît" />
          <div className="mt-3 space-y-2 text-sm">
            {ALERT_CHECKS.map((c) => (
              <label key={c.key} className="flex flex-wrap items-center gap-2">
                <input type="checkbox" name={`check_${c.key}`} defaultChecked={st.checks[c.key]} className="size-4" />
                <span>{c.label}</span>
                {c.key === 'site' ? <span className="text-[color:var(--muted-foreground)]">plus de {num('slowMs', 500, 60000)} ms</span> : null}
                {c.key === 'server' ? (
                  <span className="text-[color:var(--muted-foreground)]">
                    disque {num('diskPct', 50, 99)} % · mémoire {num('memPct', 50, 99)} %
                  </span>
                ) : null}
                {c.key === 'db' ? <span className="text-[color:var(--muted-foreground)]">au-dessus de {num('dbPct', 50, 99)} %</span> : null}
                {c.key === 'sms' ? <span className="text-[color:var(--muted-foreground)]">sous {num('smsCredit', 0, 1000000)} SMS</span> : null}
                {c.key === 'cert' ? <span className="text-[color:var(--muted-foreground)]">moins de {num('certDays', 1, 60)} jours</span> : null}
                {c.key === 'errors' ? <span className="text-[color:var(--muted-foreground)]">plus de {num('errorsPerHour', 1, 10000)} par heure</span> : null}
                {c.key === 'attack' ? <span className="text-[color:var(--muted-foreground)]">plus de {num('loginFailsPerHour', 5, 100000)} par heure</span> : null}
              </label>
            ))}
          </div>
        </Card>
      </KeepForm>

      <Card>
        <BlocHead
          title="Historique (30 jours)"
          right={
            <ConfirmSubmit
              action={sendTestAlertAction}
              label="Envoyer une alerte d’essai"
              variant="secondary"
              confirmMessage="Envoyer une alerte d’essai sur les canaux enregistrés ? (un SMS sur votre crédit, et/ou un e-mail)"
            />
          }
        />
        {view.history.length === 0 ? (
          <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">Aucune alerte ces 30 derniers jours.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[color:var(--muted-foreground)]">
                  <th className="py-1.5 pr-3">Quand</th>
                  <th className="py-1.5 pr-3">Problème</th>
                  <th className="py-1.5 pr-3">Envoyée par</th>
                  <th className="py-1.5">Réglée</th>
                </tr>
              </thead>
              <tbody>
                {view.history.map((a) => (
                  <tr key={a.id} className="border-t align-top" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-1.5 pr-3">{quand(a.openedAt)}</td>
                    <td className="py-1.5 pr-3">{a.message}</td>
                    <td className="py-1.5 pr-3">{a.channels.length ? a.channels.join(', ') : '—'}</td>
                    <td className="py-1.5">{a.resolvedAt ? quand(a.resolvedAt) : <Pill tone="bad">en cours</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
