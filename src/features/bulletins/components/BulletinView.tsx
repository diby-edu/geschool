import type { BulletinDetail } from '@/features/bulletins/types';

const fmt = (v: number | null) => (v == null ? '—' : v.toFixed(2));

/**
 * Document bulletin, optimisé pour l'impression (Imprimer → Enregistrer en PDF).
 * Le style d'impression masque la navigation et met la page en A4.
 */
export function BulletinView({ b }: { b: BulletinDetail }) {
  const totalCoef = b.items.reduce((s, i) => s + i.coefficient, 0);
  const totalWeighted = b.items.reduce((s, i) => s + (i.weighted ?? 0), 0);

  return (
    <article className="bulletin mx-auto max-w-3xl rounded-[--radius-card] border bg-white p-6 text-black">
      <header className="mb-4 border-b pb-3 text-center">
        <h1 className="text-lg font-bold">{b.school}</h1>
        <p className="text-sm">Bulletin de notes — {b.period}</p>
      </header>

      <div className="mb-4 grid grid-cols-2 gap-2 text-sm">
        <div><span className="text-gray-500">Élève :</span> <strong>{b.student}</strong></div>
        <div><span className="text-gray-500">Matricule :</span> {b.matricule}</div>
        <div><span className="text-gray-500">Classe :</span> {b.klass}</div>
        <div><span className="text-gray-500">Effectif :</span> {b.class_size ?? '—'}</div>
      </div>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y bg-gray-50 text-left">
            <th className="px-2 py-1">Matière</th>
            <th className="px-2 py-1 text-center">Coef.</th>
            <th className="px-2 py-1 text-center">Moy.</th>
            <th className="px-2 py-1 text-center">Points</th>
            <th className="px-2 py-1 text-center">Moy. classe</th>
            <th className="px-2 py-1 text-center">Min</th>
            <th className="px-2 py-1 text-center">Max</th>
            <th className="px-2 py-1 text-center">Rang</th>
          </tr>
        </thead>
        <tbody>
          {b.items.map((it, i) => (
            <tr key={i} className="border-b">
              <td className="px-2 py-1">{it.subject}</td>
              <td className="px-2 py-1 text-center">{it.coefficient}</td>
              <td className="px-2 py-1 text-center font-medium">{fmt(it.average)}</td>
              <td className="px-2 py-1 text-center">{fmt(it.weighted)}</td>
              <td className="px-2 py-1 text-center">{fmt(it.class_average)}</td>
              <td className="px-2 py-1 text-center">{fmt(it.class_min)}</td>
              <td className="px-2 py-1 text-center">{fmt(it.class_max)}</td>
              <td className="px-2 py-1 text-center">{it.rank ?? '—'}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-y font-medium">
            <td className="px-2 py-1">Total</td>
            <td className="px-2 py-1 text-center">{totalCoef}</td>
            <td className="px-2 py-1" />
            <td className="px-2 py-1 text-center">{totalWeighted.toFixed(2)}</td>
            <td colSpan={4} />
          </tr>
        </tfoot>
      </table>

      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div className="rounded border p-2 text-center">
          <div className="text-gray-500">Moyenne générale</div>
          <div className="text-xl font-bold">{fmt(b.general_average)}</div>
        </div>
        <div className="rounded border p-2 text-center">
          <div className="text-gray-500">Rang</div>
          <div className="text-xl font-bold">{b.rank ?? '—'}{b.class_size ? ` / ${b.class_size}` : ''}</div>
        </div>
        <div className="rounded border p-2 text-center">
          <div className="text-gray-500">Moyenne de classe</div>
          <div className="text-xl font-bold">{fmt(b.class_average)}</div>
        </div>
      </div>

      <p className="mt-3 text-sm">
        <span className="text-gray-500">Absences :</span> {b.absences} · <span className="text-gray-500">Retards :</span> {b.lateness}
      </p>

      {b.head_teacher_comment ? (
        <p className="mt-3 text-sm"><span className="text-gray-500">Appréciation :</span> {b.head_teacher_comment}</p>
      ) : null}

      <style>{`
        @media print {
          body { background: #fff; }
          .app-nav, .app-shell-nav, nav, header.app-header { display: none !important; }
          .no-print { display: none !important; }
          .bulletin { border: none !important; box-shadow: none !important; max-width: 100% !important; }
          @page { size: A4; margin: 14mm; }
        }
      `}</style>
    </article>
  );
}
