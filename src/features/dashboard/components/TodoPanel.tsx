import Link from 'next/link';
import { MODULE_LABEL, MODULE_STYLE } from '@/lib/modules';
import { ModuleChip } from './ui';
import type { TodoItem } from '../types';

const SEVERITY_COLOR: Record<TodoItem['severity'], string> = {
  critical: 'var(--color-danger)',
  warning: 'var(--color-warning)',
  info: 'var(--color-info)',
};

/** « À traiter » : chaque ligne porte le module du menu dont elle vient (même couleur que sa pastille). */
export function TodoPanel({ items }: { items: TodoItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-[color:var(--muted-foreground)]">Rien à signaler : tout est à jour.</p>;
  }

  return (
    <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
      {items.map((item) => (
        <li key={item.id} className="py-2.5 first:pt-0 last:pb-0">
          <Link href={item.href} className="flex items-center gap-3 rounded-xl hover:bg-[color:var(--color-brand-muted)]">
            {item.module ? <ModuleChip module={item.module} size={34} /> : <span className="h-8 w-1 shrink-0 rounded-full" style={{ backgroundColor: SEVERITY_COLOR[item.severity] }} />}
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold">{item.label}</p>
              <p className="truncate text-xs text-[color:var(--muted-foreground)]">{item.detail}</p>
            </div>
            {item.module ? (
              <span
                className="nav-chip shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ '--chip-bg': MODULE_STYLE[item.module].tint, '--chip-fg': MODULE_STYLE[item.module].ink, '--chip-bg-dark': MODULE_STYLE[item.module].dtint, '--chip-fg-dark': MODULE_STYLE[item.module].dink } as React.CSSProperties}
              >
                {MODULE_LABEL[item.module]}
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
