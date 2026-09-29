import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { getStaffMember } from '@/features/staff/queries';
import { STATE_LABEL } from '@/features/staff/labels';
import {
  reactivateStaffAction,
  revealCredentialsAction,
  suspendStaffAction,
  updateStaffAction,
} from '@/features/staff/actions';
import { StaffForm } from '@/features/staff/components/StaffForm';
import { RevealCredentials } from '@/features/staff/components/RevealCredentials';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { SimpleSubmit } from '@/components/ui/simple-submit';

export const metadata: Metadata = { title: 'Fiche du personnel' };

const FLASH: Record<string, string> = {
  created: 'Personne ajoutée. Remettez-lui son mot de passe temporaire ci-dessous : elle se connecte avec le code école et son téléphone.',
  linked: 'Ce numéro avait déjà un accès dans l’établissement : les fonctions lui ont été ajoutées, sans nouveau compte ni nouveau mot de passe.',
  updated: 'Modifications enregistrées.',
  suspended: 'Accès suspendu : la personne ne peut plus se connecter.',
  reactivated: 'Accès réactivé.',
};

export default async function StaffMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; userId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug, userId } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'users.view');

  const person = await getStaffMember(ctx, userId);
  if (!person) notFound();

  const isSelf = person.userId === ctx.user.id;
  const canUpdate = hasPermission(ctx, 'users.update');
  const canAssign = hasPermission(ctx, 'users.assign_roles');
  const suspended = person.state === 'SUSPENDED';
  const canReveal = hasPermission(ctx, 'access_accounts.reset') && !isSelf && !person.isFounder && !suspended;
  const canSuspend = hasPermission(ctx, 'access_accounts.disable') && !isSelf && !person.isFounder && !suspended;
  const canReactivate = hasPermission(ctx, 'access_accounts.reactivate') && !isSelf && !person.isFounder && suspended;

  const flashKey = Object.keys(FLASH).find((k) => sp[k] === '1');
  const functionsLocked = person.isFounder || isSelf || !canAssign;
  const functionsNote = person.isFounder
    ? 'Le fondateur a tous les droits : sa fonction ne se modifie pas.'
    : isSelf
      ? 'Vous ne pouvez pas modifier vos propres fonctions.'
      : !canAssign
        ? 'Il vous faut le droit « Régler les droits des fonctions » pour changer les fonctions.'
        : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      {flashKey ? <Alert tone="success">{FLASH[flashKey]}</Alert> : null}
      <PageHeader
        title={person.name}
        description={person.functions.map((f) => f.label).join(' · ')}
        action={
          <Link href={`/e/${slug}/personnel`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour
          </Link>
        }
      />

      <Card>
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold tracking-tight">Accès de connexion</h2>
            <span className={suspended ? 'text-sm font-medium text-[color:var(--color-danger,#c0392b)]' : 'text-sm text-[color:var(--muted-foreground)]'}>
              {STATE_LABEL[person.state]}
            </span>
          </div>
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-3">
              <dt className="text-[color:var(--muted-foreground)]">Code école</dt>
              <dd className="font-mono">{ctx.school.loginCode}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-[color:var(--muted-foreground)]">Identifiant</dt>
              <dd className="font-mono">{person.identifierDisplay ?? '—'}</dd>
            </div>
          </dl>
          <p className="text-xs text-[color:var(--muted-foreground)]">
            {person.state === 'TO_ACTIVATE'
              ? 'Cette personne ne s’est pas encore connectée. Elle choisira son propre mot de passe à sa première connexion.'
              : suspended
                ? 'Accès suspendu : la personne ne peut plus se connecter dans aucun de ses espaces.'
                : person.isFounder
                  ? 'Accès du fondateur (connexion par e-mail).'
                  : 'Accès actif.'}
          </p>

          <div className="flex flex-wrap items-start gap-3">
            {canReveal ? (
              <RevealCredentials
                action={revealCredentialsAction.bind(null, slug, person.userId)}
                activated={person.state === 'ACTIVE'}
                name={person.name}
                schoolName={ctx.school.shortName ?? ctx.school.name}
              />
            ) : null}
            {canSuspend ? (
              <ConfirmSubmit
                action={suspendStaffAction.bind(null, slug, person.userId)}
                label="Suspendre l’accès"
                variant="secondary"
                confirmMessage={`Suspendre l’accès de ${person.name} ? La personne ne pourra plus se connecter jusqu’à réactivation.`}
              />
            ) : null}
            {canReactivate ? (
              <SimpleSubmit action={reactivateStaffAction.bind(null, slug, person.userId)} label="Réactiver l’accès" />
            ) : null}
          </div>
        </CardContent>
      </Card>

      {canUpdate ? (
        <StaffForm
          key={`${person.userId}:${flashKey ?? ''}`}
          action={updateStaffAction.bind(null, slug, person.userId)}
          mode="edit"
          submitLabel="Enregistrer"
          phoneDisplay={person.loginKind === 'PHONE' ? person.identifierDisplay : (person.identifierDisplay ?? null)}
          functionsLocked={functionsLocked}
          {...(functionsNote ? { functionsNote } : {})}
          defaultValues={{
            lastName: person.lastName,
            firstName: person.firstName,
            gender: person.gender ?? '',
            employmentType: person.employmentType ?? '',
            birthDate: person.birthDate ?? '',
            birthPlace: person.birthPlace ?? '',
            phone2: person.phone2 ?? '',
            email: person.email ?? '',
            diploma: person.diploma ?? '',
            diplomaDetail: person.diplomaDetail ?? '',
            staffNumber: person.staffNumber ?? '',
            hireDate: person.hireDate ?? '',
            functions: person.functions.map((f) => f.code).join(','),
          }}
        />
      ) : null}
    </div>
  );
}
