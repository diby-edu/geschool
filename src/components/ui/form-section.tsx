/** Bloc titré d'un long formulaire (Identité, Poste, Formation…). */
export function FormSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {hint ? <p className="text-xs text-[color:var(--muted-foreground)]">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}
