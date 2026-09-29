/**
 * Choix unique présenté en cartes (boutons radio natifs, donc clavier et lecteurs
 * d'écran fonctionnent) : plus visible qu'une liste déroulante quand le choix est
 * central dans le formulaire (type de contrat, par exemple).
 */
export function ChoiceCards({
  name,
  legend,
  options,
  defaultValue,
  required = false,
  error,
}: {
  name: string;
  legend: string;
  options: readonly { code: string; label: string; hint?: string }[];
  defaultValue?: string | undefined;
  required?: boolean;
  error?: string[] | undefined;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">
        {legend}
        {required ? <span aria-hidden className="ml-0.5 text-[color:var(--color-danger)]">*</span> : null}
      </legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {options.map((o) => (
          <label key={o.code} className="block cursor-pointer">
            <input
              type="radio"
              name={name}
              value={o.code}
              defaultChecked={defaultValue === o.code}
              required={required}
              className="peer sr-only"
            />
            <span
              className="block rounded-[--radius-card] border px-3 py-2 text-sm transition-colors hover:bg-[color:var(--color-brand-muted)] peer-checked:border-[color:var(--color-brand)] peer-checked:bg-[color:var(--color-brand-muted)] peer-checked:ring-1 peer-checked:ring-[color:var(--color-brand)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[color:var(--color-brand)]"
              style={{ backgroundColor: 'var(--surface)' }}
            >
              <span className="block font-medium">{o.label}</span>
              {o.hint ? <span className="block text-xs text-[color:var(--muted-foreground)]">{o.hint}</span> : null}
            </span>
          </label>
        ))}
      </div>
      {error?.length ? <p className="text-xs text-[color:var(--color-danger)]">{error.join(' ')}</p> : null}
    </fieldset>
  );
}
