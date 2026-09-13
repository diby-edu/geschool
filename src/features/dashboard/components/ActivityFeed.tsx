import type { ActivityItem } from '../types';

const TONE_COLOR: Record<ActivityItem['tone'], string> = {
  brand: 'var(--color-brand)',
  good: 'var(--color-success)',
  warn: 'var(--color-warning)',
  info: 'var(--color-info)',
};

const ROLE_LABEL: Record<string, string> = {
  DIRECTOR: 'Direction',
  SCHOOL_ADMIN: 'Administration',
  CENSOR: 'Censorat',
  SECRETARY: 'Secretariat',
  SUPERVISOR: 'Vie scolaire',
  ACCOUNTANT: 'Comptabilite',
  TEACHER: 'Enseignant',
  PLATFORM_ADMIN: 'Super Admin',
};

function formatWhen(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const hours = Math.round(diffMs / 3_600_000);
  if (hours < 1) return "a l'instant";
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return `il y a ${days} j`;
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-[color:var(--muted-foreground)]">Aucune activite recente.</p>;
  }

  return (
    <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
          <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ backgroundColor: TONE_COLOR[item.tone] }} />
          <div className="min-w-0 text-sm">
            <span className="font-medium">{item.label}</span>{' '}
            <span className="text-[color:var(--muted-foreground)]">
              {item.detail ? `· ${ROLE_LABEL[item.detail] ?? item.detail} ` : ''}· {formatWhen(item.at)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
