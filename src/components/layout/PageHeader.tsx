import Link from 'next/link';
import { PageThemeBadge, PageThemeEyebrow } from './ModuleScope';

/**
 * En-tête de page : bandeau aux couleurs du module (dégradé, pastille, intitulé),
 * dans le même esprit que le bandeau du tableau de bord. Les couleurs viennent de
 * ModuleScope (variables --mod-*) ; les boutons posés dans `action` prennent
 * l'habit du bandeau (blanc plein ou translucide, globals.css « .hero-actions »).
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="page-hero relative mb-6 overflow-hidden rounded-3xl px-5 py-5 sm:px-6">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-white/10" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 right-44 h-56 w-56 rounded-full bg-white/[0.06]" />
      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <PageThemeBadge />
          <div className="min-w-0">
            <PageThemeEyebrow />
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight">{title}</h1>
            {description ? <p className="mt-0.5 text-sm opacity-90">{description}</p> : null}
          </div>
        </div>
        {action ? <div className="hero-actions shrink-0">{action}</div> : null}
      </div>
    </section>
  );
}

/** État vide ; `action` : lien vers l'endroit où lever le blocage (ex. créer l'année scolaire). */
export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: { href: string; label: string } }) {
  return (
    <div className="mod-empty rounded-3xl border border-dashed px-6 py-10 text-center">
      <PageThemeBadge variant="soft" />
      <p className="text-base font-bold">{title}</p>
      {hint ? <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">{hint}</p> : null}
      {action ? (
        <Link
          href={action.href}
          className="mt-4 inline-flex items-center justify-center rounded-[--radius-card] bg-[color:var(--color-brand)] px-4 py-2 text-sm font-medium text-[color:var(--color-brand-foreground)] transition hover:opacity-90"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
