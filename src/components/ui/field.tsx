import { Label } from '@/components/ui/input';

/**
 * Enveloppe d'un champ de formulaire : libelle, contenu, aide, et erreurs de
 * validation renvoyees par la Server Action. L'erreur est reliee au champ par
 * aria-describedby pour l'accessibilite.
 */
export function Field({
  label,
  htmlFor,
  hint,
  errors,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string | undefined;
  errors?: string[] | undefined;
  required?: boolean | undefined;
  children: React.ReactNode;
}) {
  const errorId = errors && errors.length > 0 ? `${htmlFor}-error` : undefined;
  return (
    <div>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-[color:var(--color-danger)]"> *</span> : null}
      </Label>
      {children}
      {hint && !errorId ? (
        <p className="mt-1 text-xs text-[color:var(--muted-foreground)]">{hint}</p>
      ) : null}
      {errorId ? (
        <p id={errorId} className="mt-1 text-xs text-[color:var(--color-danger)]">
          {errors!.join(' ')}
        </p>
      ) : null}
    </div>
  );
}
