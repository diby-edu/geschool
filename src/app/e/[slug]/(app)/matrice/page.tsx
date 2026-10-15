import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { audit } from '@/lib/audit';
import { buildMatrix, canSeeMatrix } from '@/features/reporting/matrix';
import { MatrixTable } from '@/features/reporting/components/MatrixTable';
import { PrintButton } from '@/features/bulletins/components/PrintButton';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/layout/PageHeader';

export const metadata: Metadata = { title: 'Matrice de la classe' };

/**
 * La matrice imprimable d'une classe (A4 paysage, recto-verso) : « Imprimer /
 * PDF » ouvre la fenêtre d'impression du navigateur. Le professeur principal
 * de la classe, ou toute fonction qui a « Tirer les matrices ».
 */
export default async function MatrixPrintPage({
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
  const back = typeof sp.retour === 'string' && sp.retour.startsWith(`/e/${slug}/`) ? sp.retour : `/e/${slug}/bulletins`;
  if (!classId || !periodId) {
    return <EmptyState title="Classe et période manquantes" hint="Ouvrez la matrice depuis les bulletins ou l’espace professeur principal." />;
  }
  if (!(await canSeeMatrix(ctx, classId))) notFound();

  const m = await buildMatrix(ctx, classId, periodId);
  await audit(ctx, { action: 'reports.matrix_view', module: 'reports', entityType: 'class', entityId: classId, after: { periodId } });
  const sup10 = m.rows.filter((r) => (r.general.average ?? -1) >= 10).length;
  const classes = m.rows.filter((r) => r.general.average !== null).length;

  return (
    <div className="space-y-3">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[color:var(--muted-foreground)]">
          Dans la fenêtre d’impression, choisissez « Enregistrer au format PDF », en paysage.
        </p>
        <div className="flex gap-2">
          <PrintButton />
          <a href={`/e/${slug}/api/matrice?class=${classId}&period=${periodId}`}>
            <Button variant="secondary" size="sm">Télécharger (Excel)</Button>
          </a>
          <Link href={back}>
            <Button variant="ghost" size="sm">Retour</Button>
          </Link>
        </div>
      </div>

      <div className="bg-white p-2 text-black">
        <div className="mb-1 flex items-end justify-between border-b-2 pb-1" style={{ borderColor: '#0b5b3e' }}>
          <div>
            <h1 className="text-lg font-bold" style={{ color: '#0b5b3e' }}>Matrice du professeur principal</h1>
            <p className="text-xs">{m.periodName} · vérification des moyennes avec les élèves et les professeurs</p>
          </div>
          <p className="text-right text-xs leading-snug">
            {m.schoolName}
            <br />
            Année scolaire {m.yearName}
            <br />
            Classe : <b>{m.className}</b> · Effectif : <b>{m.rows.length}</b>
            {m.headTeacher ? (
              <>
                <br />
                Professeur principal : <b>{m.headTeacher}</b>
              </>
            ) : null}
          </p>
        </div>

        <MatrixTable matrix={m} />

        <p className="mt-1 text-[10px] text-gray-600">
          Dispensé(e) : élève dispensé d’EPS, la matière ne compte pas dans sa moyenne générale. « — » : pas de moyenne
          (matière non suivie, ou aucune note). Rang ex æquo noté « ex ». Moyennes générales supérieures ou égales à 10 :{' '}
          <b>
            {sup10} / {classes}
          </b>
          {classes > 0 ? ` (${Math.round((sup10 / classes) * 100)} %)` : ''}.
        </p>
        <div className="mt-2 flex justify-between text-xs" style={{ breakInside: 'avoid' }}>
          {['Le professeur principal', 'Date de la vérification', 'Visa de la direction'].map((t) => (
            <div key={t} className="w-[30%] border-t pt-1" style={{ height: '22mm', borderColor: '#555' }}>
              {t}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
