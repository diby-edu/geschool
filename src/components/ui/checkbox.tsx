import * as React from 'react';
import { cn } from '@/lib/utils';

export const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        'size-[18px] shrink-0 rounded-[4px] border accent-[color:var(--color-brand)]',
        'focus-visible:outline-2 focus-visible:outline-[color:var(--color-brand)]',
        'disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Checkbox.displayName = 'Checkbox';
