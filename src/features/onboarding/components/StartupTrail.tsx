import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

/**
 * Le fil de la mise en route, en haut d'un ecran ou l'on vient d'etre envoye.
 *
 * Il dit deux choses : d'ou l'on vient, et qu'on y retournera tout seul une
 * fois l'etape faite. Sans lui, on se demande si l'on s'est perdu.
 */
export function StartupTrail({ slug, step, total, label }: { slug: string; step: number; total: number; label: string }) {
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-[--radius-card] border px-3 py-2 text-sm"
      style={{ borderColor: 'var(--color-brand)', backgroundColor: 'var(--color-brand-muted)' }}
    >
      <span>
        <strong>Mise en route</strong> · étape {step} sur {total} — {label}
      </span>
      <Link href={`/e/${slug}/demarrage`} className="inline-flex items-center gap-1.5 font-semibold underline">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Revenir à la liste
      </Link>
    </div>
  );
}
