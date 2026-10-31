import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { saveParentDefaultsAction, saveSchoolRuleAction, removeSchoolRuleAction } from '@/features/platform/parent-portal-settings';
import { DefaultsForm, SchoolRuleForm } from '@/features/platform/components/ParentPortalForms';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { SimpleSubmit } from '@/components/ui/simple-submit';

export const metadata: Metadata = { title: 'Espace Parent' };
export const dynamic = 'force-dynamic';

type Tier = { minPct: number; discountPct: number };
const money = (n: number) => `${Math.round(n).toLocaleString('fr-FR')} F`;
const tiersText = (t: Tier[]) => (t.length ? t.map((x) => `${x.minPct} % → ${x.discountPct} %`).join(' · ') : 'aucun');

/**
 * Espace Parent, réglages du Super Admin (maquette espace-parent v3, partie 3) :
 * prix par enfant et paliers de réduction pour toutes les écoles, règle propre
 * à une école, et ce que chaque école a déjà rapporté.
 */
export default async function PlatformParentPortalPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: settings }, { data: rules }, { data: schools }, { data: access }] = await Promise.all([
    supabase.from('platform_settings').select('settings').eq('namespace', 'parent_portal').maybeSingle(),
    supabase.from('parent_portal_rules' as never).select('school_id, price_per_child, tiers'),
    supabase.from('schools').select('id, name').order('name'),
    supabase.from('student_parent_access' as never).select('school_id, amount').gte('valid_until', today),
  ]);
  const s = (settings?.settings ?? {}) as { pricePerChild?: number; tiers?: Tier[] };
  const price = Number(s.pricePerChild ?? 2000);
  const tiers = (s.tiers ?? []).map((t) => ({ minPct: Number(t.minPct), discountPct: Number(t.discountPct) }));
  const schoolList = (schools ?? []) as { id: string; name: string }[];
  const nameOf = new Map(schoolList.map((x) => [x.id, x.name]));
  const ruleRows = ((rules ?? []) as { school_id: string; price_per_child: number | null; tiers: Tier[] | null }[]).sort((a, b) =>
    (nameOf.get(a.school_id) ?? '').localeCompare(nameOf.get(b.school_id) ?? '', 'fr'),
  );
  const bySchool = new Map<string, { n: number; total: number }>();
  for (const a of (access ?? []) as { school_id: string; amount: number }[]) {
    const x = bySchool.get(a.school_id) ?? { n: 0, total: 0 };
    x.n += 1;
    x.total += Number(a.amount);
    bySchool.set(a.school_id, x);
  }
  const totalKids = [...bySchool.values()].reduce((n, x) => n + x.n, 0);
  const totalMoney = [...bySchool.values()].reduce((n, x) => n + x.total, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Espace Parent" description="Payé par les parents, par enfant et par année scolaire. Sans paiement, un parent ne voit aucune information sur l’enfant." />
      {sp.enregistre ? <Alert tone="success">Réglages enregistrés.</Alert> : null}
      {sp.retire ? <Alert tone="success">Règle de l’école retirée : elle suit maintenant les réglages de toutes les écoles.</Alert> : null}

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-[color:var(--muted-foreground)]">Enfants activés cette année</p>
            <p className="text-2xl font-extrabold">{totalKids.toLocaleString('fr-FR')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3">
            <p className="text-xs text-[color:var(--muted-foreground)]">Encaissé auprès des parents</p>
            <p className="text-2xl font-extrabold">{money(totalMoney)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="space-y-3 py-4">
          <h2 className="font-bold">Toutes les écoles</h2>
          <DefaultsForm action={saveParentDefaultsAction} price={price} tiers={tiers} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 py-4">
          <h2 className="font-bold">Règle différente pour une école</h2>
          {ruleRows.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[color:var(--muted-foreground)]">
                <tr>
                  <th className="py-1.5">École</th>
                  <th className="py-1.5">Prix / enfant</th>
                  <th className="py-1.5">Paliers</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ruleRows.map((r) => (
                  <tr key={r.school_id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                    <td className="py-2 font-medium">{nameOf.get(r.school_id) ?? '—'}</td>
                    <td className="py-2">{r.price_per_child === null ? `${money(price)} (comme toutes)` : Number(r.price_per_child) === 0 ? 'Offert' : money(Number(r.price_per_child))}</td>
                    <td className="py-2">{r.tiers ? tiersText(r.tiers) : `${tiersText(tiers)} (comme toutes)`}</td>
                    <td className="py-2 text-right">
                      <SimpleSubmit action={removeSchoolRuleAction.bind(null, r.school_id)} label="Retirer" small />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-[color:var(--muted-foreground)]">Aucune : toutes les écoles suivent les réglages ci-dessus.</p>
          )}
          <div className="border-t pt-3" style={{ borderColor: 'var(--border)' }}>
            <p className="mb-2 text-sm font-semibold">Ajouter ou modifier la règle d’une école</p>
            <SchoolRuleForm action={saveSchoolRuleAction} schools={schoolList} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="py-4">
          <h2 className="mb-2 font-bold">Par école</h2>
          {bySchool.size === 0 ? (
            <p className="text-sm text-[color:var(--muted-foreground)]">Aucun enfant activé pour le moment.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[color:var(--muted-foreground)]">
                <tr>
                  <th className="py-1.5">École</th>
                  <th className="py-1.5">Enfants activés</th>
                  <th className="py-1.5">Encaissé</th>
                </tr>
              </thead>
              <tbody>
                {[...bySchool.entries()]
                  .sort((a, b) => b[1].total - a[1].total)
                  .map(([id, x]) => (
                    <tr key={id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="py-2">{nameOf.get(id) ?? '—'}</td>
                      <td className="py-2">{x.n.toLocaleString('fr-FR')}</td>
                      <td className="py-2">{money(x.total)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
