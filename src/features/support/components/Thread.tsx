/** Le fil d'une demande : la plateforme d'un côté, l'école de l'autre (lot 5). */
export function Thread({
  messages,
  mineLabel,
}: {
  messages: { id: string; fromPlatform: boolean; authorName: string; body: string; createdAt: string }[];
  mineLabel: string;
}) {
  return (
    <div className="space-y-3">
      {messages.map((m) => (
        <div
          key={m.id}
          className={`max-w-[85%] rounded-2xl border p-4 text-sm ${m.fromPlatform ? '' : 'ml-auto'}`}
          style={{
            borderColor: 'var(--border)',
            background: m.fromPlatform ? 'var(--color-brand-muted)' : 'var(--surface)',
          }}
        >
          <div className="mb-1 text-xs font-bold text-[color:var(--muted-foreground)]">
            {m.fromPlatform ? 'La plateforme' : `${m.authorName} · ${mineLabel}`} ·{' '}
            {new Date(m.createdAt).toLocaleString('fr-FR', { timeZone: 'Africa/Abidjan', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </div>
          <p className="whitespace-pre-line">{m.body}</p>
        </div>
      ))}
    </div>
  );
}
