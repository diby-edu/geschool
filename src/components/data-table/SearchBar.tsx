import { Input } from '@/components/ui/input';

/**
 * Recherche serveur : un simple formulaire GET qui repousse `q` dans l'URL.
 * Fonctionne sans JavaScript et laisse la page (Server Component) refaire la
 * requete filtree. `hidden` conserve les autres parametres (tri) actifs.
 */
export function SearchBar({
  basePath,
  defaultValue,
  placeholder = 'Rechercher…',
  hidden = {},
}: {
  basePath: string;
  defaultValue: string;
  placeholder?: string;
  hidden?: Record<string, string>;
}) {
  return (
    <form action={basePath} method="get" className="flex max-w-sm gap-2">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Input name="q" defaultValue={defaultValue} placeholder={placeholder} aria-label="Rechercher" />
      <button
        type="submit"
        className="shrink-0 rounded-[--radius-card] border px-3 text-sm hover:bg-[color:var(--color-brand-muted)]"
      >
        Rechercher
      </button>
    </form>
  );
}
