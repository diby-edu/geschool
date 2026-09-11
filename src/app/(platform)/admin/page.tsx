import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Etablissements' };
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'En attente',
  ACTIVE: 'Actif',
  SUSPENDED: 'Suspendu',
  ARCHIVED: 'Archive',
};

export default async function PlatformHome() {
  const supabase = await createClient();

  // Le Super Admin voit tous les etablissements (ADR-007 + RLS)
  const { data: schools } = await supabase
    .from('schools')
    .select('id, slug, name, status')
    .order('name');

  const list = schools ?? [];
  const active = list.filter((s) => s.status === 'ACTIVE').length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Etablissements</h1>
        <p className="mt-1 text-sm text-[color:var(--muted-foreground)]">
          {list.length} au total · {active} actif{active > 1 ? 's' : ''}
        </p>
      </div>

      {list.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-[color:var(--muted-foreground)]">
              Aucun etablissement. La creation d&apos;etablissements arrive au lot 4.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {list.map((s) => (
            <li key={s.id}>
              <Card>
                <CardContent className="flex items-center justify-between py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{s.name}</p>
                    <p className="truncate text-xs text-[color:var(--muted-foreground)]">
                      /e/{s.slug}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[color:var(--muted-foreground)]">
                      {STATUS_LABEL[s.status] ?? s.status}
                    </span>
                    <Link
                      href={`/e/${s.slug}`}
                      className="text-sm text-[color:var(--color-brand)] hover:underline"
                    >
                      Ouvrir
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
