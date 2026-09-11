import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-10 w-full rounded-[--radius-card] border bg-[color:var(--surface)] px-3 text-sm',
        'text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)]',
        'focus-visible:outline-2 focus-visible:outline-[color:var(--color-brand)]',
        'disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn('mb-1.5 block text-sm font-medium text-[color:var(--foreground)]', className)}
      {...props}
    />
  );
}
