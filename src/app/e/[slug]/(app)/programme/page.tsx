import type { Metadata } from 'next';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess } from '@/lib/permissions/guard';
import { hasPermission } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { listLevels } from '@/features/structure/queries';
import { listLevelSubjects } from '@/features/programme/queries';
import { upsertLevelSubjectAction, removeLevelSubjectAction } from '@/features/programme/actions';
import { LevelSubjectForm } from '@/features/programme/components/LevelSubjectForm';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { LevelPicker } from '@/features/programme/components/LevelPicker';

export const metadata: Metadata = { title: 'Programme par niveau' };

export default async function ProgrammePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'subjects.view');

  const levels = await listLevels(ctx);
  const selectedLevel = (Array.isArray(sp.level) ? sp.level[0] : sp.level) ?? levels[0]?.id ?? null;
  const canManage = hasPermission(ctx, 'subjects.update');

  const supabase = await createClient();
  const { data: subjectsData } = await supabase
    .from('subjects')
    .select('id, name, default_coefficient')
    .eq('school_id', ctx.school.id)
    .eq('is_active', true)
    .order('name');
  const subjects = (subjectsData ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    defaultCoefficient: s.default_coefficient,
  }));

  const rows = selectedLevel ? await listLevelSubjects(ctx, selectedLevel) : [];
  const base = `/e/${slug}/programme`;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Flash searchParams={sp} />
      <PageHeader
        title="Programme par niveau"
        description="Coefficients et volumes horaires. Ils ponderent les moyennes generales."
      />

      {levels.length === 0 ? (
        <EmptyState title="Aucun niveau" hint="Definissez d'abord des niveaux dans la structure pedagogique." />
      ) : (
        <>
          <LevelPicker
            basePath={base}
            levels={levels.map((l) => ({ id: l.id, name: l.name }))}
            selected={selectedLevel}
          />

          {rows.length === 0 ? (
            <EmptyState title="Aucune matiere au programme de ce niveau" />
          ) : (
            <div className="overflow-x-auto rounded-[--radius-card] border" style={{ backgroundColor: 'var(--surface)' }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[color:var(--muted-foreground)]">
                    <th className="px-3 py-2 font-medium">Matiere</th>
                    <th className="px-3 py-2 text-right font-medium">Coef.</th>
                    <th className="px-3 py-2 text-right font-medium">Volume</th>
                    <th className="px-3 py-2 font-medium">Obligatoire</th>
                    {canManage ? <th className="px-3 py-2" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="px-3 py-2">{r.subject_name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.coefficient}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.weekly_minutes ? `${Math.floor(r.weekly_minutes / 60)}h${String(r.weekly_minutes % 60).padStart(2, '0')}` : '—'}
                      </td>
                      <td className="px-3 py-2">{r.is_mandatory ? 'Oui' : 'Non'}</td>
                      {canManage ? (
                        <td className="px-3 py-2 text-right">
                          <ConfirmSubmit
                            action={removeLevelSubjectAction.bind(null, slug, selectedLevel!, r.id)}
                            label="Retirer"
                            variant="secondary"
                            confirmMessage={`Retirer « ${r.subject_name} » du programme ?`}
                          />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {canManage && selectedLevel && subjects.length > 0 ? (
            <LevelSubjectForm
              action={upsertLevelSubjectAction.bind(null, slug)}
              levelId={selectedLevel}
              subjects={subjects}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
