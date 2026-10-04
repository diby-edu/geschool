import type { Metadata } from 'next';
import Link from 'next/link';
import { listSchoolsForAdmin } from '@/features/platform/admin';
import { enterSchoolAction } from '@/features/platform-schools/actions';
import { EnterSchoolForm } from '@/features/platform-schools/components/EnterSchoolForm';
import {
  ABONNEMENTS,
  ABONNEMENT_LABEL,
  SCHOOL_STATUSES,
  STATUS_LABEL,
  countSchools,
  filterSchools,
  filtreActif,
  parseSchoolFilters,
  schoolsHref,
  type AbonnementFilter,
  type SchoolFilters,
  type SchoolStatusFilter,
} from '@/features/platform-schools/filters';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { FilterPill } from '@/components/ui/filters';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const metadata: Metadata = { title: 'Établissements' };
export const dynamic = 'force-dynamic';

const ETAT_LABEL: Record<string, string> = {
  PENDING: 'En attente',
  ACTIVE: 'Actif',
  SUSPENDED: 'Suspendu',
  ARCHIVED: 'Archivé',
};

const ETAT_COLOR: Record<string, string> = {
  PENDING: 'var(--color-warning)',
  ACTIVE: 'var(--color-success)',
  SUSPENDED: 'var(--color-danger)',
  ARCHIVED: 'var(--muted-foreground)',
};

const SUB_LABEL: Record<string, string> = {
  ACTIVE: 'Abonné',
  TRIALING: 'En essai',
  PAST_DUE: 'Paiement en retard',
};

const jour = (iso: string | null) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : null);

/** Le champ de recherche doit garder le filtre en cours : il le repasse en clair. */
function ChampsCaches({ f }: { f: SchoolFilters }) {
  return (
    <>
      {f.statut ? <input type="hidden" name="statut" value={f.statut} /> : null}
      {f.abonnement ? <input type="hidden" name="abonnement" value={f.abonnement} /> : null}
      {f.modulesReduits ? <input type="hidden" name="modules" value="reduits" /> : null}
    </>
  );
}

/**
 * La liste des établissements, vue de la plateforme.
 *
 * Deux choses s'y jouent qui ne sautent pas aux yeux :
 *
 * 1. Les FILTRES sont les destinations des compteurs du tableau de bord. Un
 *    chiffre « Suspendus : 3 » doit mener à ces trois écoles — sinon c'est un
 *    chiffre qui appelle le clic pour rien.
 * 2. Entrer chez un client passe par le bouton TRACÉ, jamais par un lien direct
 *    vers /e/{slug} : la trace ne doit pas se contourner en un clic. Le filet
 *    de sécurité (lib/tenant/support-trace.ts) rattrape les autres chemins.
 */
export default async function PlatformSchoolsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const f = parseSchoolFilters(sp);

  const toutes = await listSchoolsForAdmin();
  const counts = countSchools(toutes);
  const list = filterSchools(toutes, f);

  // Les pastilles se CUMULENT (un état × un abonnement) et se désélectionnent :
  // cliquer celle qui est allumée retire ce seul critère, sans toucher aux autres.
  const href = (p: Partial<SchoolFilters>) => schoolsHref({ ...f, ...p });
  const hrefStatut = (s: SchoolStatusFilter) => href({ statut: f.statut === s ? null : s });
  const hrefAbo = (a: AbonnementFilter) => href({ abonnement: f.abonnement === a ? null : a });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Établissements"
        description={`${counts.total} au total · ${counts.statut.ACTIVE} actif${counts.statut.ACTIVE > 1 ? 's' : ''}`}
        action={
          <Link href="/admin/schools/new">
            <Button>Nouvel établissement</Button>
          </Link>
        }
      />

      <Card>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <FilterPill
              href={schoolsHref({ q: f.q })}
              label="Tous"
              value={counts.total}
              active={!f.statut && !f.abonnement && !f.modulesReduits}
            />
            {SCHOOL_STATUSES.map((s) => (
              <FilterPill
                key={s}
                href={hrefStatut(s)}
                label={STATUS_LABEL[s]}
                value={counts.statut[s]}
                active={f.statut === s}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {ABONNEMENTS.map((a) => (
              <FilterPill
                key={a}
                href={hrefAbo(a)}
                label={ABONNEMENT_LABEL[a]}
                value={counts.abonnement[a]}
                active={f.abonnement === a}
              />
            ))}
            <FilterPill
              href={href({ modulesReduits: !f.modulesReduits })}
              label="Formule réduite"
              value={counts.modulesReduits}
              active={f.modulesReduits}
            />
          </div>

          <form method="get" className="flex flex-wrap items-end gap-2">
            <ChampsCaches f={f} />
            <label className="min-w-48 flex-1">
              <span className="mb-1 block text-xs font-medium">Chercher</span>
              <Input name="q" defaultValue={f.q} placeholder="Nom, adresse de l’espace ou ville" />
            </label>
            <Button type="submit" variant="secondary">
              Chercher
            </Button>
            {filtreActif(f) ? (
              <Link href="/admin/etablissements" className="pb-2 text-sm text-[color:var(--color-brand)] hover:underline">
                Tout afficher
              </Link>
            ) : null}
          </form>
        </CardContent>
      </Card>

      {list.length === 0 ? (
        <EmptyState
          title={filtreActif(f) ? 'Aucun établissement pour ce filtre' : 'Aucun établissement'}
          hint={filtreActif(f) ? 'Changez de filtre, ou affichez tout.' : 'Créez-en un pour commencer.'}
        />
      ) : (
        <>
          {filtreActif(f) ? (
            <p className="text-sm text-[color:var(--muted-foreground)]">
              {list.length} établissement{list.length > 1 ? 's' : ''} sur {counts.total}
            </p>
          ) : null}

          <ul className="space-y-2">
            {list.map((s) => (
              <li key={s.id}>
                <Card>
                  <CardContent className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/admin/etablissements/${s.id}`} className="truncate font-medium hover:underline">
                          {s.name}
                        </Link>
                        <span className="text-xs font-semibold" style={{ color: ETAT_COLOR[s.status] }}>
                          {ETAT_LABEL[s.status] ?? s.status}
                        </span>
                      </div>
                      <p className="truncate text-xs text-[color:var(--muted-foreground)]">
                        /e/{s.slug}
                        {s.city ? ` · ${s.city}` : ''} · {s.students.toLocaleString('fr-FR')} élève
                        {s.students > 1 ? 's' : ''} · {s.teachers.toLocaleString('fr-FR')} enseignant
                        {s.teachers > 1 ? 's' : ''}
                        {s.disabledModules > 0 ? ` · ${s.disabledModules} module${s.disabledModules > 1 ? 's' : ''} coupé${s.disabledModules > 1 ? 's' : ''}` : ''}
                      </p>
                      <p className="truncate text-xs text-[color:var(--muted-foreground)]">
                        {s.subscription
                          ? `${s.subscription.plan} · ${SUB_LABEL[s.subscription.status] ?? s.subscription.status}${
                              s.subscription.status === 'TRIALING' && s.subscription.trialEndsOn
                                ? ` jusqu’au ${jour(s.subscription.trialEndsOn)}`
                                : s.subscription.endsOn
                                  ? ` · échéance ${jour(s.subscription.endsOn)}`
                                  : ''
                            }`
                          : 'Aucun abonnement'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        href={`/admin/facturation/${s.id}`}
                        className="text-sm text-[color:var(--color-brand)] hover:underline"
                      >
                        Facturation
                      </Link>
                      {/* Pas de lien vers /e/{slug} : on entre par le bouton tracé. */}
                      <EnterSchoolForm action={enterSchoolAction.bind(null, s.id, s.slug)} schoolName={s.name} />
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
