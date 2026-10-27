import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isAppError } from '@/lib/errors';
import { formatPhoneForDisplay } from '@/lib/auth/identifier';
import { roleLabel, type RoleCode } from '@/lib/permissions/roles';
import { getAccountSheet } from '@/features/platform/account-sheet';
import {
  reactivateInSchoolAction,
  suspendEverywhereAction,
  suspendInSchoolAction,
  unlockAccountPlatformAction,
  changeLoginPlatformAction,
  signOutPlatformAction,
} from '@/features/platform/account-actions';
import { ChangeLoginForm } from '@/features/access/components/ChangeLoginForm';
import { revealPersonCredentialsAction } from '@/features/platform/school-sheet-actions';
import { RevealCredentials } from '@/features/staff/components/RevealCredentials';
import { actionLabel } from '@/features/audit/labels';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { SimpleSubmit } from '@/components/ui/simple-submit';
import { BlocHead, Card, Pill } from '@/features/dashboard/components/ui';

export const metadata: Metadata = { title: 'Compte — plateforme' };
export const dynamic = 'force-dynamic';

const KIND: Record<string, string> = { STAFF: 'Personnel', TEACHER: 'Enseignant', GUARDIAN: 'Parent', STUDENT: 'Élève' };
const jour = (iso: string | null) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
const heure = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { timeZone: 'Africa/Abidjan', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const shown = (id: string) => (id.startsWith('+') ? formatPhoneForDisplay(id, 'CI') : id);

/**
 * La fiche d'un compte (lot 4, maquette docs/maquettes/super-admin-comptes.html).
 * Une carte par école : l'état de l'accès et les actions. Les actions passent
 * par le contexte de l'école, donc les mêmes règles et le même journal.
 */
export default async function PlatformAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  let a;
  try {
    a = await getAccountSheet(id);
  } catch (error) {
    if (isAppError(error) && error.code === 'NOT_FOUND') notFound();
    throw error;
  }
  const suspendable = a.schools.filter((s) => s.access && s.access.accountStatus !== 'SUSPENDED');
  const anyLocked = a.schools.some((s) => s.locked);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section
        className="relative overflow-hidden rounded-[1.75rem] p-6 text-white shadow-sm"
        style={{ background: 'linear-gradient(115deg, #3730a3 0%, #6d28d9 52%, #c026d3 100%)' }}
      >
        <p className="text-xs font-bold uppercase tracking-wider opacity-80">Compte créé le {jour(a.createdAt)}</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{a.name}</h1>
        <p className="mt-1 text-sm opacity-90">{[a.email, a.phone ? shown(a.phone) : null].filter(Boolean).join(' · ') || 'Ni e-mail ni téléphone'}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Pill>{a.lastLogin ? `Dernière connexion : ${jour(a.lastLogin)}` : 'Jamais connecté'}</Pill>
          {anyLocked ? <Pill>Bloqué après 5 essais ratés</Pill> : null}
          <Pill>
            {a.schools.length} école{a.schools.length > 1 ? 's' : ''}
          </Pill>
        </div>
        <div className="absolute right-5 top-5">
          <Link href="/admin/comptes">
            <Button variant="secondary" size="sm">
              Retour
            </Button>
          </Link>
        </div>
      </section>

      {sp.debloque ? <Alert tone="success">Compte débloqué : la personne peut réessayer tout de suite.</Alert> : null}
      {sp.suspendu ? <Alert tone="success">Accès suspendu : la personne ne peut plus se connecter.</Alert> : null}
      {sp.reactive ? <Alert tone="success">Accès réactivé.</Alert> : null}
      {sp.identifiant ? (
        <Alert tone="success">Identifiant corrigé : la personne se connecte maintenant avec le nouveau, avec le même mot de passe.</Alert>
      ) : null}
      {sp.deconnecte ? <Alert tone="success">Déconnecté de tous ses appareils : la personne devra se reconnecter avec son mot de passe.</Alert> : null}

      {a.schools.length === 0 ? (
        <Alert tone="warning">Ce compte n’est rattaché à aucune école. Il se supprime depuis la liste, filtre « Sans école ».</Alert>
      ) : null}

      {a.schools.map((s) => {
        const acc = s.access;
        const suspended = acc?.accountStatus === 'SUSPENDED';
        return (
          <Card key={s.schoolId}>
            <BlocHead
              title={s.name}
              sub={s.roles.map((r) => roleLabel(r as RoleCode)).join(', ') || 'Aucune fonction'}
              right={
                <Link href={`/admin/etablissements/${s.schoolId}?onglet=personnes`} className="text-sm font-bold text-[color:var(--color-brand)] hover:underline">
                  Fiche de l’école
                </Link>
              }
            />
            {acc ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3 border-b pb-2" style={{ borderColor: 'var(--border)' }}>
                    <span className="text-[color:var(--muted-foreground)]">Se connecte avec</span>
                    <b className="text-right">{shown(acc.identifier)}</b>
                  </div>
                  <div className="flex justify-between gap-3 border-b pb-2" style={{ borderColor: 'var(--border)' }}>
                    <span className="text-[color:var(--muted-foreground)]">Type de compte</span>
                    <b>{KIND[acc.kind] ?? acc.kind}</b>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span className="text-[color:var(--muted-foreground)]">Accès</span>
                    <span className="flex flex-wrap justify-end gap-1">
                      {suspended ? (
                        <Pill tone="bad">Suspendu</Pill>
                      ) : acc.activationStatus === 'ACTIVATED' ? (
                        <Pill tone="good">Actif</Pill>
                      ) : (
                        <Pill tone="warn">Jamais activé</Pill>
                      )}
                      {s.locked ? <Pill tone="bad">Bloqué (essais ratés)</Pill> : null}
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap content-start justify-end gap-2">
                  {s.locked ? <SimpleSubmit action={unlockAccountPlatformAction.bind(null, a.id, s.slug)} label="Débloquer" /> : null}
                  <ChangeLoginForm
                    action={changeLoginPlatformAction.bind(null, a.id, s.slug)}
                    current={shown(acc.identifier)}
                    byPhone={acc.identifier.startsWith('+')}
                  />
                  {acc.activationStatus === 'ACTIVATED' ? (
                    <ConfirmSubmit
                      action={signOutPlatformAction.bind(null, a.id, s.slug)}
                      label="Déconnecter partout"
                      variant="secondary"
                      confirmMessage={`Déconnecter ${a.name} de tous ses appareils ? La personne devra se reconnecter avec son mot de passe.`}
                    />
                  ) : null}
                  {!suspended ? (
                    <RevealCredentials
                      action={revealPersonCredentialsAction.bind(null, s.slug, a.id)}
                      activated={acc.activationStatus === 'ACTIVATED'}
                      name={a.name}
                      schoolName={s.name}
                    />
                  ) : null}
                  {suspended ? (
                    <SimpleSubmit action={reactivateInSchoolAction.bind(null, a.id, s.slug)} label="Réactiver" />
                  ) : (
                    <ConfirmSubmit
                      action={suspendInSchoolAction.bind(null, a.id, s.slug)}
                      label="Suspendre"
                      variant="secondary"
                      confirmMessage={
                        a.schools.length > 1
                          ? `Suspendre l’accès de ${a.name} à ${s.name} ? Ses autres écoles ne sont pas touchées.`
                          : `Suspendre l’accès de ${a.name} à ${s.name} ? La personne ne pourra plus se connecter jusqu’à réactivation.`
                      }
                    />
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">Pas d’accès de connexion dans cette école.</p>
            )}
          </Card>
        );
      })}

      {suspendable.length > 1 ? (
        <Card>
          <BlocHead title="Suspendre partout" sub={`Dans ses ${suspendable.length} écoles d’un coup. Chaque école le voit dans son journal.`} />
          <div className="mt-3">
            <ConfirmSubmit
              action={suspendEverywhereAction.bind(null, a.id)}
              label="Suspendre partout"
              variant="secondary"
              confirmMessage={`Suspendre l’accès de ${a.name} dans ses ${suspendable.length} écoles ?`}
            />
          </div>
        </Card>
      ) : null}

      <Card>
        <BlocHead title="Ce qui a été fait sur ce compte" sub="Les 15 dernières actions, toutes écoles confondues" />
        {a.history.length === 0 ? (
          <p className="mt-3 text-sm text-[color:var(--muted-foreground)]">Rien pour l’instant.</p>
        ) : (
          <div className="mt-3 divide-y text-sm" style={{ borderColor: 'var(--border)' }}>
            {a.history.map((h, i) => (
              <div key={i} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {actionLabel(h.action)}
                  {h.byPlatform ? <span className="text-[color:var(--muted-foreground)]"> · par la plateforme</span> : null}
                </span>
                <span className="text-[color:var(--muted-foreground)]">
                  {h.school ? `${h.school} · ` : ''}
                  {heure(h.at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
