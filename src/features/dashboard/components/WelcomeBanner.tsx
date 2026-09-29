/**
 * Bandeau d'accueil : qui est connecté, dans quel établissement, et les effectifs
 * en un coup d'œil. Fond dégradé de la palette de la marque, texte blanc.
 */
export function WelcomeBanner({
  name,
  roleText,
  schoolName,
  periodText,
  chips,
  schoolCode,
}: {
  name: string;
  roleText: string;
  schoolName: string;
  /** Année et période en cours. */
  periodText: string;
  chips: { label: string; value: number }[];
  /** Code école, à communiquer aux enseignants et aux parents (direction seulement). */
  schoolCode?: string | undefined;
}) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?';

  return (
    <section
      className="relative overflow-hidden rounded-2xl p-5 text-white shadow-sm sm:p-6"
      style={{ background: 'linear-gradient(115deg, #3730a3 0%, #6d28d9 55%, #a21caf 100%)' }}
      aria-label="Bienvenue"
    >
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full bg-white/10" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-white/[0.07]" />

      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/20 text-lg font-bold">{initials}</span>
          <div className="min-w-0">
            <p className="text-sm opacity-90">Bonjour,</p>
            <h2 className="truncate text-xl font-bold tracking-tight sm:text-2xl">{name}</h2>
            <p className="mt-0.5 text-xs opacity-90">
              <span className="font-semibold uppercase tracking-wide">{roleText}</span> · {schoolName}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium">{periodText}</span>
          {schoolCode ? (
            <span className="rounded-full bg-white px-3 py-1 text-xs text-[#3730a3]">
              Code école <b className="ml-1 font-mono text-sm tracking-widest">{schoolCode}</b>
            </span>
          ) : null}
        </div>
      </div>

      {chips.length > 0 ? (
        <ul className="relative mt-5 flex flex-wrap gap-2">
          {chips.map((c) => (
            <li key={c.label} className="flex items-baseline gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5">
              <span className="text-base font-bold tabular-nums">{c.value.toLocaleString('fr-FR')}</span>
              <span className="text-xs opacity-90">{c.label}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
