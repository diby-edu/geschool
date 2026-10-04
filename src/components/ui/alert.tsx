import { cn } from '@/lib/utils';

type Tone = 'error' | 'warning' | 'info' | 'success';

const TONES: Record<Tone, string> = {
  error: 'border-[color:var(--color-danger)] text-[color:var(--color-danger)]',
  warning: 'border-[color:var(--color-warning)] text-[color:var(--color-warning)]',
  info: 'border-[color:var(--color-info)] text-[color:var(--color-info)]',
  success: 'border-[color:var(--color-success)] text-[color:var(--color-success)]',
};

export function Alert({ tone = 'info', children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('rounded-[--radius-card] border px-3 py-2 text-sm', TONES[tone])}
    >
      {children}
    </div>
  );
}
