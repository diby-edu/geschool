import type { Metadata } from 'next';
import Link from 'next/link';
import { getTechnicalStatus, overallLight, type Light } from '@/features/platform/technical';
import { clearErrorsAction, runTaskAction } from '@/features/platform/technical-actions';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { BlocHead, Card, Pill } from '@/features/dashboard/components/ui';

export const metadata: Metadata = { title: 'Technique — plateforme' };
export const dynamic = 'force-dynamic';

const COLOR: Record<Light, string> = { green: 'var(--color-success)', orange: 'var(--color-warning)', red: 'var(--color-danger)' };
const WORD: Record<Light, string> = { green: 'Tout va bien', orange: 'À surveiller', red: 'À corriger' };
const TONE: Record<Light, 'good' | 'warn' | 'bad'> = { green: 'good', orange: 'warn', red: 'bad' };

const quand = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { timeZone: 'Africa/Abidjan', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'jamais';
const mo = (b: number) => `${Math.round(b / 1024 / 1024).toLocaleString('fr-FR')} Mo`;

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

/** La page Technique (lot 7) : un voyant par partie de l'application. */
export default async function TechnicalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const s = await getTechnicalStatus();
  if (!s) {
    return (
      <div className="mx-auto max-w-5xl">
        <Alert tone="warning">Cette page attend la migration 0151 (« pnpm db:migrate »).</Alert>
      </div>
    );
  }
  const tasksLight: Light = s.tasks.some((t) => t.light === 'red') ? 'red' : s.tasks.some((t) => t.light === 'orange') ? 'orange' : 'green';
  const tiles: { label: string; light: Light }[] = [
    { label: 'Tâches de nuit', light: tasksLight },
    { label: 'SMS', light: s.sms.light },
    { label: 'Base de données', light: s.db.light },
    { label: 'Connexions', light: s.security.light },
    { label: 'Erreurs', light: s.errorsLight },
  ];
  const used = Math.round((s.db.bytes / s.db.limitBytes) * 100);
  const all = overallLight(s);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Technique" description={`Est-ce que tout tourne ? En ce moment : ${WORD[all].toLowerCase()}.`} />
      {typeof sp.resultat === 'string' ? <Alert tone="success">Tâche lancée : {sp.resultat}.</Alert> : null}
      {sp.vide ? <Alert tone="success">Journal des erreurs vidé.</Alert> : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
            <div className="flex items-center text-sm font-extrabold">
              <Dot light={t.light} />
              {WORD[t.light]}
            </div>
            <div className="mt-1 text-xs text-[color:var(--muted-foreground)]">{t.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <BlocHead title="Tâches de nuit" sub="Faites par le worker, à heure fixe" />
          {!s.workerSeen ? (
            <div className="mt-3">
              <Alert tone="warning">
                Le worker n’a jamais tourné sur cette base : il démarrera avec la mise en ligne. En attendant, lancez les tâches ici quand il le faut.
              </Alert>
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
          <BlocHead title="Base de données" right={<Pill tone={TONE[s.db.light]}>{WORD[s.db.light]}</Pill>} />
          <div className="mt-3">
            <Row label="Taille">
              {mo(s.db.bytes)} sur {mo(s.db.limitBytes)} ({used} %)
            </Row>
            <div className="my-2 h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
              <div className="h-full" style={{ width: `${Math.min(100, used)}%`, background: COLOR[s.db.light] }} />
            </div>
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
          <BlocHead title="Connexions et configuration" right={<Pill tone={TONE[s.security.light]}>{WORD[s.security.light]}</Pill>} />
          <div className="mt-3">
            <Row label="Mots de passe ratés (24 h)">{s.security.loginFailures24h}</Row>
            <Row label="Comptes bloqués en ce moment">
              {s.security.lockedNow > 0 ? <Link href="/admin/comptes?f=LOCKED" className="underline">{s.security.lockedNow}</Link> : 0}
            </Row>
            <Row label="Comptes Super Admin">{s.security.platformAdmins}</Row>
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
    </div>
  );
}
