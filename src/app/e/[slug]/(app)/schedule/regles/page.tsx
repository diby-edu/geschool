import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { SimpleSubmit } from '@/components/ui/simple-submit';
import { listRules } from '@/features/schedule/constraints/service';
import { listTargets } from '@/features/schedule/constraints/targets';
import { CONSTRAINT_BY_CODE, SCOPE_LABELS, SEVERITY_LABELS } from '@/features/schedule/constraints/catalog';
import { RuleForm } from '@/features/schedule/constraints/components/RuleForm';
import { createRuleAction, deleteRuleAction, toggleRuleAction } from '@/features/schedule/constraints/actions';

export const metadata: Metadata = { title: 'Règles de l’emploi du temps' };

/**
 * Les règles que la génération devra respecter.
 *
 * Tout ce qui est listé ici est appliqué : une règle affichée mais inerte
 * serait pire que pas de règle du tout. D'où la distinction visible entre
 * obligatoire — jamais violée — et préférence, respectée si possible.
 */
export default async function ScheduleRulesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'schedule.view');

  const canManage = hasPermission(ctx, 'schedule.manage_constraints');
  const [rules, targets] = await Promise.all([listRules(ctx), listTargets(ctx)]);

  const hard = rules.filter((r) => r.severity === 'HARD');
  const soft = rules.filter((r) => r.severity === 'SOFT');

  const targetName = (scopeType: string, scopeId: string | null): string => {
    if (scopeType === 'SCHOOL') return 'tout l’établissement';
    const list = targets[scopeType as keyof typeof targets] ?? [];
    return list.find((t) => t.id === scopeId)?.name ?? '— supprimé —';
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Règles de l’emploi du temps"
        description="Ce que la génération devra respecter, et ce qu’elle essaiera de respecter."
        action={
          <Link href={`/e/${slug}/schedule`} className="text-sm text-[color:var(--muted-foreground)] hover:underline">
            Retour à l’emploi du temps
          </Link>
        }
      />

      {typeof sp.ajoutee === 'string' ? <Alert tone="success">Règle ajoutée.</Alert> : null}
      {typeof sp.supprimee === 'string' ? <Alert tone="success">Règle supprimée.</Alert> : null}
      {typeof sp.desactivee === 'string' ? (
        <Alert tone="info">Règle désactivée : elle reste dans la liste mais n’est plus appliquée.</Alert>
      ) : null}
      {typeof sp.activee === 'string' ? <Alert tone="success">Règle réactivée.</Alert> : null}

      {!ctx.academicYear ? (
        <Alert tone="info">
          Activez une année scolaire : les règles appartiennent à une année, comme l’emploi du temps lui-même.
        </Alert>
      ) : null}

      {rules.length === 0 ? (
        <EmptyState
          title="Aucune règle"
          hint="Sans règle, la génération ne respecte que l’évidence : un enseignant à un seul endroit, une classe à un seul cours, une salle à la fois."
        />
      ) : (
        <>
          <RuleList
            title="Obligatoires"
            subtitle="Jamais violées. Si elles rendent l’emploi du temps impossible, la génération le dira."
            rules={hard}
            slug={slug}
            canManage={canManage}
            targetName={targetName}
          />
          <RuleList
            title="Préférences"
            subtitle="Respectées si possible, sacrifiées si le reste l’exige. Le nombre indique leur importance."
            rules={soft}
            slug={slug}
            canManage={canManage}
            targetName={targetName}
          />
        </>
      )}

      {canManage && ctx.academicYear ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
            Ajouter une règle
          </h2>
          <RuleForm action={createRuleAction.bind(null, slug)} targets={targets} />
        </section>
      ) : null}
    </div>
  );
}

function RuleList({
  title,
  subtitle,
  rules,
  slug,
  canManage,
  targetName,
}: {
  title: string;
  subtitle: string;
  rules: Awaited<ReturnType<typeof listRules>>;
  slug: string;
  canManage: boolean;
  targetName: (scopeType: string, scopeId: string | null) => string;
}) {
  if (rules.length === 0) return null;

  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--muted-foreground)]">
          {title} <span className="tabular-nums">({rules.length})</span>
        </h2>
        <p className="text-xs text-[color:var(--muted-foreground)]">{subtitle}</p>
      </div>

      <ul className="space-y-2">
        {rules.map((r) => {
          const def = CONSTRAINT_BY_CODE.get(r.code);
          return (
            <li key={r.id}>
              <Card>
                <CardContent
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                  style={r.enabled ? undefined : { opacity: 0.55 }}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{r.summary}</p>
                    <p className="text-xs text-[color:var(--muted-foreground)]">
                      {SCOPE_LABELS[r.scopeType]} · {targetName(r.scopeType, r.scopeId)}
                      {r.severity === 'SOFT' ? ` · importance ${r.weight}` : ''}
                      {r.enabled ? '' : ' · désactivée'}
                    </p>
                    {def ? <p className="mt-0.5 text-xs text-[color:var(--muted-foreground)]">{def.description}</p> : null}
                  </div>

                  {canManage ? (
                    <div className="flex items-center gap-2">
                      <SimpleSubmit
                        action={toggleRuleAction.bind(null, slug, r.id, !r.enabled)}
                        label={r.enabled ? 'Désactiver' : 'Réactiver'}
                        small
                      />
                      <ConfirmSubmit
                        action={deleteRuleAction.bind(null, slug, r.id)}
                        label="Supprimer"
                        variant="secondary"
                        confirmMessage={`Supprimer la règle « ${r.summary} » ?`}
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-[color:var(--muted-foreground)]">{SEVERITY_LABELS[r.severity]}</span>
                  )}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
