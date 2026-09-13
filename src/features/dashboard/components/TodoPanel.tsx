import Link from 'next/link';
import type { TodoItem } from '../types';

const SEVERITY_COLOR: Record<TodoItem['severity'], string> = {
  critical: 'var(--color-danger)',
  warning: 'var(--color-warning)',
  info: 'var(--color-info)',
};

export function TodoPanel({ items }: { items: TodoItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-[color:var(--muted-foreground)]">Rien a signaler : tout est a jour.</p>;
  }

  return (
    <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
      {items.map((item) => (
        <li key={item.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
          <span className="h-full min-h-8 w-1 shrink-0 self-stretch rounded-full" style={{ backgroundColor: SEVERITY_COLOR[item.severity] }} />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">{item.label}</p>
            <p className="truncate text-[color:var(--muted-foreground)]">{item.detail}</p>
          </div>
          <Link href={item.href} className="shrink-0 text-sm font-semibold text-[color:var(--color-brand)] hover:underline">
            Voir
          </Link>
        </li>
      ))}
    </ul>
  );
}
