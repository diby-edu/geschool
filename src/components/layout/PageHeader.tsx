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
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div
      className="rounded-[--radius-card] border border-dashed p-8 text-center"
      style={{ backgroundColor: 'var(--surface)' }}
    >
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">{hint}</p> : null}
    </div>
  );
}
