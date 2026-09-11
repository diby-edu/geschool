import * as React from 'react';
import { cn } from '@/lib/utils';

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'h-10 w-full rounded-[--radius-card] border bg-[color:var(--surface)] px-3 text-sm',
      'text-[color:var(--foreground)]',
      'focus-visible:outline-2 focus-visible:outline-[color:var(--color-brand)]',
      'disabled:opacity-50',
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = 'Select';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full rounded-[--radius-card] border bg-[color:var(--surface)] px-3 py-2 text-sm',
      'text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)]',
      'focus-visible:outline-2 focus-visible:outline-[color:var(--color-brand)]',
      'disabled:opacity-50',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';
