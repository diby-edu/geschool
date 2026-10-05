import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Step } from '@/features/onboarding/checklist';

/**
 * Le rappel de mise en route, sur le tableau de bord.
 *
 * Tant que l'essentiel manque, le tableau de bord mesure du vide : zero eleve,
 * zero appel, zero moyenne. Ce bandeau dit la seule chose utile a ce
 * moment-la — par ou commencer — et disparait tout seul quand tout est pret.
 */
export function StartupBanner({
  slug,
  done,
  total,
  steps,
}: {
  slug: string;
  done: number;
  total: number;
  steps: Step[];
}) {
  const restant = steps.filter((s) => !s.done);
  const prochaine = restant.find((s) => s.blocking) ?? restant[0];
  if (!prochaine) return null;

  return (
    <section
      className="flex flex-wrap items-center justify-between gap-3 rounded-[--radius-card] border px-4 py-3"
      style={{ borderColor: 'var(--color-warning)', backgroundColor: 'var(--surface)' }}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          Votre établissement n’est pas encore prêt — {done} point{done > 1 ? 's' : ''} sur {total}.
        </p>
        <p className="mt-0.5 text-sm text-[color:var(--muted-foreground)]">
          À suivre&nbsp;: <strong>{prochaine.label.toLowerCase()}</strong>. {prochaine.why}
        </p>
      </div>
      <Link
        href={`/e/${slug}/demarrage`}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white"
        style={{ backgroundColor: 'var(--color-brand)' }}
      >
        Mise en route <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}
