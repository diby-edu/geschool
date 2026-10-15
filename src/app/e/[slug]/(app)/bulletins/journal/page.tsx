import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { hasPermission } from '@/lib/permissions';
import { createClient } from '@/lib/supabase/server';
import { termJournal } from '@/features/grading/head-teacher';
import { isHeadTeacherOf } from '@/features/reporting/matrix';
import { PageHeader, EmptyState } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Journal de fin de trimestre' };

/**
 * Tout ce qui s'est passé sur les notes d'une classe pendant la fin de
 * trimestre : notes saisies, modifiées ou effacées (avant → après), dispenses,
 * « J'ai fini », signalements et leur réponse, certification, déverrouillage.
 * Écrit par la base elle-même : rien n'y échappe, rien ne s'y efface.
 */
export default async function TermJournalPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  const classId = typeof sp.class === 'string' ? sp.class : '';
  const periodId = typeof sp.period === 'string' ? sp.period : '';
  if (!classId || !periodId) {
    return <EmptyState title="Classe et période manquantes" hint="Ouvrez le journal depuis la page Bulletins." />;
  }
  if (!hasPermission(ctx, 'grades.term_journal') && !(await isHeadTeacherOf(ctx, classId))) notFound();

  const supabase = await createClient();
  const [entries, { data: k }, { data: p }] = await Promise.all([
    termJournal(ctx, classId, periodId),
    supabase.from('classes').select('name').eq('school_id', ctx.school.id).eq('id', classId).maybeSingle(),
    supabase.from('academic_periods').select('name').eq('school_id', ctx.school.id).eq('id', periodId).maybeSingle(),
  ]);

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        title={`Journal de fin de trimestre — ${k?.name ?? ''}`}
        description={`${p?.name ?? ''} · ${entries.length} évènement(s), du plus récent au plus ancien`}
        action={
          <Link href={`/e/${slug}/bulletins?class=${classId}&period=${periodId}`}>
            <Button variant="ghost">Retour</Button>
          </Link>
        }
      />
      {entries.length === 0 ? (
        <EmptyState
          title="Rien pour l’instant"
          hint="Le journal commence à l’arrêt des notes : chaque correction, dispense, signalement ou certification y sera inscrit."
        />
      ) : (
        <div className="overflow-x-auto rounded-[--radius-card] border" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--muted)] text-left text-xs uppercase tracking-wide text-[color:var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">Quand</th>
                <th className="px-3 py-2">Qui</th>
                <th className="px-3 py-2">Quoi</th>
                <th className="px-3 py-2">Élève</th>
                <th className="px-3 py-2">Matière</th>
                <th className="px-3 py-2">Détail</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i} className="border-t align-top">
                  <td className="whitespace-nowrap px-3 py-1.5">
                    {new Date(e.at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-3 py-1.5">{e.actor}</td>
                  <td className="px-3 py-1.5">{e.action}</td>
                  <td className="px-3 py-1.5">{e.student ?? ''}</td>
                  <td className="px-3 py-1.5">{e.subject ?? ''}</td>
                  <td className="px-3 py-1.5">{e.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
