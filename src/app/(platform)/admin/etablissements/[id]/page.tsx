import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAppError } from '@/lib/errors';
import { formatPhoneForDisplay } from '@/lib/auth/identifier';
import { listSchoolFeatures } from '@/features/platform-schools/features';
import { SchoolStatusForm } from '@/features/platform/components/SchoolStatusForm';
import { setSchoolFeatureAction, enterSchoolAction } from '@/features/platform-schools/actions';
import { EnterSchoolForm } from '@/features/platform-schools/components/EnterSchoolForm';
import { FeatureToggle } from '@/features/platform-schools/components/FeatureToggle';
import { getSchoolSheet, listMembersWithoutFunction, listSchoolPeople } from '@/features/platform/school-sheet';
import {
  reactivatePersonAction,
  revealPersonCredentialsAction,
  suspendPersonAction,
  transferOwnerAction,
  updateSchoolIdentityPlatformAction,
} from '@/features/platform/school-sheet-actions';
import { OwnerTransferForm } from '@/features/platform/components/OwnerTransferForm';
import { IdentityForm } from '@/features/settings/components/IdentityForm';
import { RevealCredentials } from '@/features/staff/components/RevealCredentials';
import { STATE_LABEL } from '@/features/staff/labels';
import { daysWithoutText, isAtRisk, money } from '@/features/platform-dashboard/cockpit';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { SimpleSubmit } from '@/components/ui/simple-submit';
import { BlocHead, Card, Pill, Tile, fr } from '@/features/dashboard/components/ui';

export const metadata: Metadata = { title: 'Établissement' };
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = { PENDING: 'En attente', ACTIVE: 'Active', SUSPENDED: 'Suspendue', ARCHIVED: 'Archivée' };

const TABS = [
  { key: 'apercu', label: 'Vue d’ensemble' },
  { key: 'identite', label: 'Identité' },
  { key: 'personnes', label: 'Personnes' },
  { key: 'abonnement', label: 'Abonnement' },
  { key: 'modules', label: 'Modules' },
  { key: 'donnees', label: 'Données' },
  { key: 'journal', label: 'Journal' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const jour = (iso: string | null) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');

/** La situation réelle (0141), avec les mots choisis : en essai, abonnée, expirée. */
function subscriptionText(sub: { plan: string; status: string; endsOn: string | null; graceEndsOn: string | null } | null): string {
  if (!sub) return 'Aucun abonnement';
  const plan = sub.plan === '—' ? '' : `${sub.plan} · `;
  switch (sub.status) {
    case 'TRIALING':
      return `${plan}En essai${sub.endsOn ? ` jusqu’au ${jour(sub.endsOn)}` : ''}`;
    case 'ACTIVE':
      return `${plan}Abonnée${sub.endsOn ? ` jusqu’au ${jour(sub.endsOn)}` : ''}`;
    case 'PAST_DUE':
      return `${plan}Abonnement expiré${sub.endsOn ? ` depuis le ${jour(sub.endsOn)}` : ''}${sub.graceEndsOn ? ` · coupure le ${jour(sub.graceEndsOn)}` : ''}`;
    default:
      return `${plan}Suspendue`;
  }
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-t py-2 text-sm first:border-t-0" style={{ borderColor: 'var(--border)' }}>
      <span className="text-[color:var(--muted-foreground)]">{label}</span>
      <span className="text-right font-semibold">{children}</span>
    </div>
  );
}

/**
 * Fiche complète d'un établissement, vue de la plateforme (lot 3, maquette
 * docs/maquettes/super-admin-fiche-ecole.html) : sept onglets, de la vue
 * d'ensemble à l'export de toutes ses données. Pas de suppression définitive :
 * une école qui part est archivée (décidé le 2026-10-25).
 */
export default async function PlatformSchoolPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === sp.onglet) ? (sp.onglet as TabKey) : 'apercu';

  let data;
  try {
    data = await getSchoolSheet(id);
  } catch (error) {
    if (isAppError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  const { school, row, counts, health, payments } = data;
  const base = `/admin/etablissements/${id}`;
  const sub = row?.subscription ?? null;
  const situationTone = !sub ? 'muted' : sub.status === 'ACTIVE' ? 'good' : sub.status === 'PAST_DUE' ? 'bad' : 'warn';

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section
        className="relative overflow-hidden rounded-[1.75rem] p-6 text-white shadow-sm"
        style={{ background: 'linear-gradient(115deg, #3730a3 0%, #6d28d9 52%, #c026d3 100%)' }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide opacity-90">
              /e/{school.slug} · code école <b className="font-mono">{school.loginCode}</b> · créée le {jour(school.createdAt)}
            </p>
            <h1 className="mt-1 text-3xl font-extrabold leading-tight tracking-tight">{school.name}</h1>
            <p className="text-sm opacity-90">{[school.city, school.neighborhood].filter(Boolean).join(' · ') || 'Ville non renseignée'}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-white/20 px-3 py-1">{STATUS_LABEL[school.status] ?? school.status}</span>
              <span className="rounded-full bg-white/20 px-3 py-1">{subscriptionText(sub)}</span>
              {health ? <span className="rounded-full bg-white/20 px-3 py-1">Santé : {isAtRisk(health) ? `à risque (${daysWithoutText(health, new Date().toISOString().slice(0, 10))})` : 'bien'}</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <EnterSchoolForm action={enterSchoolAction.bind(null, school.id, school.slug)} schoolName={school.name} />
            <Link href="/admin/etablissements">
              <Button variant="secondary">Retour</Button>
            </Link>
          </div>
        </div>
      </section>

      <nav aria-label="Onglets" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`${base}?onglet=${t.key}`}
            aria-current={tab === t.key ? 'page' : undefined}
            className={`rounded-xl border px-3.5 py-1.5 text-sm font-semibold ${tab === t.key ? 'border-transparent bg-[color:var(--color-brand)] text-[color:var(--color-brand-foreground)]' : 'bg-[color:var(--surface)]'}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'apercu' ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile module="eleves" label="Élèves" value={fr(row?.students ?? 0)} min={120} size={34} sub={`${fr(counts.classes)} classes`} />
            <Tile module="enseignants" label="Enseignants" value={fr(row?.teachers ?? 0)} min={120} size={34} />
            <Tile module="personnel" label="Personnel" value={fr(counts.staff)} min={120} size={34} sub="direction et administration" href={`${base}?onglet=personnes`} />
            <Tile module="annonces" label="Parents connectés" value={`${fr(counts.parentsConnected)} / ${fr(counts.guardians)}`} min={120} size={26} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <BlocHead title="Santé" sub="Les 5 derniers jours de cours" right={<Link href="/admin/sante" className="text-sm font-bold text-[color:var(--color-brand)] hover:underline">Toutes les écoles</Link>} />
              <div className="mt-3">
                {health ? (
                  <>
                    <Fact label="Appels faits">
                      {health.sessions5d > 0 ? `${Math.round((health.calls5d / health.sessions5d) * 100)} % (${fr(health.calls5d)} / ${fr(health.sessions5d)})` : 'pas de cours prévu'}
                    </Fact>
                    <Fact label="Notes saisies (7 j)">{fr(health.grades7d)}</Fact>
                    <Fact label="Direction connectée (7 j)">{health.directionSeen7d ? 'oui' : 'non'}</Fact>
                    <Fact label="Dernière activité">{health.lastActivity ? jour(health.lastActivity) : 'jamais'}</Fact>
                    <Fact label="État">{isAtRisk(health) ? <Pill tone="bad">À risque</Pill> : <Pill tone="good">Bien</Pill>}</Fact>
                  </>
                ) : (
                  <p className="text-sm text-[color:var(--muted-foreground)]">École non active : pas de mesure.</p>
                )}
              </div>
            </Card>
            <Card>
              <BlocHead title="Abonnement et paiements" right={<Link href={`${base}?onglet=abonnement`} className="text-sm font-bold text-[color:var(--color-brand)] hover:underline">Détail</Link>} />
              <div className="mt-3">
                <Fact label="Situation"><Pill tone={situationTone}>{subscriptionText(sub)}</Pill></Fact>
                <Fact label="Argent reçu cette année">{money(payments.paidThisYear, payments.currency)}</Fact>
                <Fact label="Dernier paiement">{payments.lastPaidAt ? jour(payments.lastPaidAt) : '—'}</Fact>
                <Fact label="Paiements à confirmer">{payments.pending > 0 ? <Pill tone="warn">{payments.pending}</Pill> : '0'}</Fact>
                <Fact label="Modules coupés">{fr(row?.disabledModules ?? 0)}</Fact>
              </div>
            </Card>
          </div>
        </>
      ) : null}

      {tab === 'identite' ? (
        <>
          {sp.enregistre ? <Alert tone="success">Identité enregistrée. La modification est notée au journal de l’école.</Alert> : null}
          <Card>
            <Fact label="Code école">
              <span className="font-mono">{school.loginCode}</span>
            </Fact>
            <Fact label="Adresse de l’espace">
              <span className="font-mono">/e/{school.slug}</span>
            </Fact>
            <p className="mt-2 text-xs text-[color:var(--muted-foreground)]">
              Le code école et l’adresse ne changent jamais : le personnel et les parents les ont reçus pour se connecter.
            </p>
          </Card>
          <IdentityForm
            key={String(sp.enregistre ?? '')}
            action={updateSchoolIdentityPlatformAction.bind(null, school.id, school.slug)}
            educationTracks={school.educationTracks}
            defaultValues={{
              name: school.name,
              shortName: school.shortName ?? '',
              directorName: school.directorName ?? '',
              registrationNumber: school.registrationNumber ?? '',
              address: school.address ?? '',
              neighborhood: school.neighborhood ?? '',
              city: school.city ?? '',
              phone: school.phone ? formatPhoneForDisplay(school.phone, school.countryCode) : '',
              email: school.email ?? '',
              website: school.website ?? '',
            }}
          />
        </>
      ) : null}

      {tab === 'personnes' ? <PeopleTab schoolId={school.id} slug={school.slug} schoolName={school.shortName ?? school.name} countryCode={school.countryCode} sp={sp} /> : null}

      {tab === 'abonnement' ? (
        <Card>
          <BlocHead title="Abonnement" sub={subscriptionText(sub)} />
          <div className="mt-3">
            <Fact label="Argent reçu cette année">{money(payments.paidThisYear, payments.currency)}</Fact>
            <Fact label="Paiements à confirmer">{fr(payments.pending)}</Fact>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href={`/admin/facturation/${school.id}`}>
              <Button>Modules, échéance et reçus</Button>
            </Link>
            <Link href="/admin/paiements">
              <Button variant="secondary">Paiements à confirmer</Button>
            </Link>
          </div>
        </Card>
      ) : null}

      {tab === 'modules' ? <ModulesTab schoolId={school.id} saved={typeof sp.module === 'string'} /> : null}

      {tab === 'donnees' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <BlocHead title="Exporter toutes les données" sub="Un ZIP de tableaux Excel, un par sujet" />
            <div className="mt-3">
              <Fact label="Élèves et parents">
                {fr(row?.students ?? 0)} · {fr(counts.guardians)}
              </Fact>
              <Fact label="Enseignants et personnel">
                {fr(row?.teachers ?? 0)} · {fr(counts.staff)}
              </Fact>
              <Fact label="Classes, matières, évaluations, notes">{fr(counts.classes)} classes</Fact>
              <Fact label="Appels, absences et retards, bulletins">inclus</Fact>
            </div>
            <p className="mt-3 text-xs text-[color:var(--muted-foreground)]">
              Pour une école qui part, ou une sauvegarde. Une grande école (des centaines de milliers de notes) prend une à deux minutes : le fichier arrive au fil de l’eau.
            </p>
            <a href={`${base}/export`} className="mt-3 inline-block">
              <Button>Télécharger le ZIP</Button>
            </a>
          </Card>
          <Card>
            <BlocHead title="État de l’école" sub="Suspendre ou archiver — jamais de suppression définitive" />
            {sp.statut ? <div className="mt-3"><Alert tone="success">État mis à jour.</Alert></div> : null}
            <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">
              Suspendre bloque toute écriture dans son espace, sans rien supprimer. Archiver clôt le dossier : consultation seule. Les notes et bulletins gardent leur valeur légale.
            </p>
            <div className="mt-3">
              <SchoolStatusForm schoolId={school.id} current={school.status} />
            </div>
          </Card>
        </div>
      ) : null}

      {tab === 'journal' ? (
        <Card>
          <BlocHead title="Journal de l’école" sub="Toutes les actions dans l’école, et celles de la plateforme" />
          <Link href={`/admin/journal?ecole=${school.id}`} className="mt-3 inline-block">
            <Button>Ouvrir le journal</Button>
          </Link>
        </Card>
      ) : null}
    </div>
  );
}

async function ModulesTab({ schoolId, saved }: { schoolId: string; saved: boolean }) {
  const features = await listSchoolFeatures(schoolId);
  return (
    <section className="space-y-3">
      {saved ? <Alert tone="success">Module mis à jour.</Alert> : null}
      <p className="text-sm text-[color:var(--muted-foreground)]">
        Un module coupé disparaît du menu et de la page Paramètres de l’école, et ses écrans deviennent introuvables. Le socle — élèves, classes, structure, années, rôles et accès — ne se coupe pas.
      </p>
      <div className="space-y-2">
        {features.map((f) => (
          <FeatureToggle key={f.code} row={f} action={setSchoolFeatureAction.bind(null, schoolId, f.code)} />
        ))}
      </div>
    </section>
  );
}

async function PeopleTab({
  schoolId,
  slug,
  schoolName,
  countryCode,
  sp,
}: {
  schoolId: string;
  slug: string;
  schoolName: string;
  countryCode: string;
  sp: Record<string, string | string[] | undefined>;
}) {
  // Le téléphone de connexion, sinon le second numéro de la fiche.
  const phoneOf = (p: { identifier: string | null; phone2: string | null }) => {
    const n = p.identifier?.startsWith('+') ? p.identifier : p.phone2;
    return n ? formatPhoneForDisplay(n, countryCode) : null;
  };
  const [people, withoutFunction] = await Promise.all([listSchoolPeople(slug), listMembersWithoutFunction(schoolId)]);
  const founders = people.filter((p) => p.isFounder);
  const candidates = [
    ...people
      .filter((p) => !p.isFounder && p.state !== 'SUSPENDED')
      .map((p) => ({ userId: p.userId, name: p.name, functions: p.functions.map((f) => f.label).join(', ') })),
    ...withoutFunction.map((m) => ({ userId: m.userId, name: m.name, functions: 'aucune fonction' })),
  ];
  // Un fondateur sans autre fonction perd tout accès si on lui retire ce rôle.
  const foundersAlone = founders.filter((f) => f.functions.every((fn) => fn.code === 'SCHOOL_ADMIN')).map((f) => f.name);

  return (
    <>
      {sp.suspendu ? <Alert tone="success">Accès suspendu.</Alert> : null}
      {sp.reactive ? <Alert tone="success">Accès réactivé.</Alert> : null}
      <Card>
        <BlocHead title="Responsable de l’école" sub="Le fondateur : il a tous les droits dans l’école" />
        <div className="mt-3">
          {founders.length === 0 ? (
            <Alert tone="warning">Aucun responsable : désignez-en un ci-dessous.</Alert>
          ) : (
            founders.map((f) => (
              <Fact key={f.userId} label={f.identifierDisplay ?? f.email ?? ''}>
                {f.name}
              </Fact>
            ))
          )}
        </div>
        <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
          <OwnerTransferForm action={transferOwnerAction.bind(null, schoolId)} members={candidates} foundersAlone={foundersAlone} schoolId={schoolId} />
        </div>
      </Card>

      <Card>
        <BlocHead title={`Direction et personnel · ${fr(people.length + withoutFunction.length)}`} sub="Les enseignants et les parents sont dans « Comptes »" />
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
              <tr>
                <th className="px-2 py-2">Personne</th>
                <th className="px-2 py-2">Fonctions</th>
                <th className="px-2 py-2">Accès</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.userId} className="border-t align-top" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-2 py-2">
                    <b>{p.name}</b>
                    <span className="block text-xs text-[color:var(--muted-foreground)]">{p.email ?? '—'}</span>
                    <span className="block text-xs text-[color:var(--muted-foreground)]">{phoneOf(p) ?? 'Tél. non renseigné'}</span>
                  </td>
                  <td className="px-2 py-2">{p.functions.map((f) => f.label).join(', ') || '—'}</td>
                  <td className="px-2 py-2">
                    <Pill tone={p.state === 'ACTIVE' ? 'good' : p.state === 'SUSPENDED' ? 'bad' : 'warn'}>{STATE_LABEL[p.state]}</Pill>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap justify-end gap-2">
                      {p.state !== 'SUSPENDED' && !p.isFounder ? (
                        <RevealCredentials
                          action={revealPersonCredentialsAction.bind(null, slug, p.userId)}
                          activated={p.state === 'ACTIVE'}
                          name={p.name}
                          schoolName={schoolName}
                        />
                      ) : null}
                      {p.state === 'SUSPENDED' ? (
                        <SimpleSubmit action={reactivatePersonAction.bind(null, schoolId, slug, p.userId)} label="Réactiver" />
                      ) : !p.isFounder ? (
                        <ConfirmSubmit
                          action={suspendPersonAction.bind(null, schoolId, slug, p.userId)}
                          label="Suspendre"
                          variant="secondary"
                          confirmMessage={`Suspendre l’accès de ${p.name} ? La personne ne pourra plus se connecter jusqu’à réactivation.`}
                        />
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {withoutFunction.map((m) => (
                <tr key={m.userId} className="border-t align-top" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-2 py-2">
                    <b>{m.name}</b>
                    <span className="block text-xs text-[color:var(--muted-foreground)]">{m.email ?? '—'}</span>
                    <span className="block text-xs text-[color:var(--muted-foreground)]">{m.phone ? formatPhoneForDisplay(m.phone, countryCode) : 'Tél. non renseigné'}</span>
                  </td>
                  <td className="px-2 py-2 text-[color:var(--muted-foreground)]">Aucune fonction</td>
                  <td className="px-2 py-2">
                    <Pill tone="muted">Sans droits</Pill>
                  </td>
                  <td className="px-2 py-2 text-right text-xs text-[color:var(--muted-foreground)]">
                    Donnez-lui une fonction depuis l’espace de l’école, ou désignez-le responsable ci-dessus.
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
