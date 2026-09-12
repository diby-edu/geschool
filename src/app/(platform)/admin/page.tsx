import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';

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
    .order('name') as { data: { id: string; slug: string; name: string; status: string }[] | null };

  const list = schools ?? [];
  const active = list.filter((s) => s.status === 'ACTIVE').length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Etablissements"
        description={`${list.length} au total · ${active} actif${active > 1 ? 's' : ''}`}
        action={
          <Link href="/admin/schools/new">
            <Button>Nouvel etablissement</Button>
          </Link>
        }
      />

      {list.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-[color:var(--muted-foreground)]">
              Aucun etablissement. Creez-en un pour commencer.
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
                      href={`/admin/facturation/${s.id}`}
                      className="text-sm text-[color:var(--color-brand)] hover:underline"
                    >
                      Facturation
                    </Link>
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
