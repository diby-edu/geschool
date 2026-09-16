import * as React from 'react';
import { cn } from '@/lib/utils';

/** Interrupteur on/off — un <input type="checkbox"> habille, jamais un <button role="switch">
 * pour garder la soumission de formulaire native (checked -> "on" dans FormData).
 * Piste et curseur sont tous les deux des SIBLINGS directs de l'input (requis par
 * `peer-checked:`, qui ne traverse pas les descendants d'un sibling). */
export const Switch = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <label className={cn('relative inline-flex h-[26px] w-[46px] shrink-0 cursor-pointer', props.disabled && 'cursor-not-allowed opacity-60')}>
      <input ref={ref} type="checkbox" className="peer sr-only" {...props} />
      <span
        className={cn(
          'absolute inset-0 rounded-full bg-[color:var(--border)] transition-colors',
          'peer-checked:bg-[color:var(--color-success)]',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-[color:var(--color-brand)] peer-focus-visible:outline-offset-2',
          className,
        )}
      />
      <span className="pointer-events-none absolute left-[3px] top-[3px] size-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-5" />
    </label>
  ),
);
Switch.displayName = 'Switch';
