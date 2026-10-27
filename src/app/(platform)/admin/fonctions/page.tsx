import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/features/platform/admin';
import { listFunctionTemplates, templatePermissionCodes } from '@/features/platform/functions';
import { createFunctionAction, pushFunctionsAction, saveTemplateAction } from '@/features/platform/functions-actions';
import { KeepForm } from '@/features/platform/components/KeepForm';
import { PERMISSION_GROUPS } from '@/lib/permissions/catalog';
import { PageHeader } from '@/components/layout/PageHeader';
import { Alert } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { SimpleSubmit } from '@/components/ui/simple-submit';
import { BlocHead, Card, Pill } from '@/features/dashboard/components/ui';

export const metadata: Metadata = { title: 'Modèles des fonctions — plateforme' };
export const dynamic = 'force-dynamic';

/**
 * Modèles des fonctions (lot 6, maquette docs/maquettes/super-admin-reglages.html) :
 * les fonctions données à chaque nouvelle école et leurs droits de départ.
 * Chaque école les ajuste ensuite chez elle (page Rôles).
 */
export default async function FunctionTemplatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const sp = await searchParams;
  const templates = await listFunctionTemplates();
  const nouvelle = sp.f === 'nouvelle';
  const current = nouvelle ? null : (templates.find((t) => t.code === sp.f) ?? templates.find((t) => t.code !== 'SCHOOL_ADMIN') ?? null);
  const checked = current && current.code !== 'SCHOOL_ADMIN' ? new Set(await templatePermissionCodes(current.code)) : new Set<string>();
  const schoolsTotal = Math.max(0, ...templates.map((t) => t.schools));
  const enregistre = typeof sp.enregistre === 'string' ? sp.enregistre : null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Modèles des fonctions"
        description="Les fonctions données à chaque nouvelle école, avec leurs droits de départ. Chaque école peut ensuite les ajuster chez elle."
      />
      {enregistre === 'nouvelles' ? <Alert tone="success">Modèle enregistré : il vaut pour les nouvelles écoles.</Alert> : null}
      {enregistre?.startsWith('ecoles-') ? (
        <Alert tone="success">Modèle enregistré, et les droits cochés ont été ajoutés dans {enregistre.slice(7)} école(s) existante(s).</Alert>
      ) : null}
      {sp.cree ? <Alert tone="success">Fonction créée. Réglez ses droits ci-dessous.</Alert> : null}
      {sp.donnee ? <Alert tone="success">Fonctions données aux écoles qui ne les avaient pas.</Alert> : null}

      <div className="flex flex-wrap gap-2">
        {templates.map((t) => (
          <Link
            key={t.code}
            href={`/admin/fonctions?f=${t.code}`}
            className={`rounded-xl border px-3 py-1.5 text-sm ${current?.code === t.code ? 'border-[color:var(--color-brand)] bg-[color:var(--color-brand)] font-bold text-white' : 'bg-[color:var(--surface)]'}`}
          >
            {t.label}
            {t.custom ? ' ✦' : ''}
          </Link>
        ))}
        <Link
          href="/admin/fonctions?f=nouvelle"
          className={`rounded-xl border border-dashed px-3 py-1.5 text-sm font-bold ${nouvelle ? 'bg-[color:var(--color-brand)] text-white' : 'text-[color:var(--color-brand)]'}`}
        >
          + Nouvelle fonction
        </Link>
      </div>

      {nouvelle ? (
        <Card>
          <BlocHead title="Nouvelle fonction" sub="Par exemple « Bibliothécaire ». Elle sera donnée aux nouvelles écoles, et au choix aux écoles existantes." />
          <KeepForm action={createFunctionAction} submit="Créer la fonction" className="mt-4 space-y-3">
            <Field label="Nom" htmlFor="name" required>
              <Input id="name" name="name" required minLength={2} maxLength={60} />
            </Field>
            <Field label="Description (facultatif)" htmlFor="description">
              <Input id="description" name="description" maxLength={300} />
            </Field>
            <Field label="Partir des droits de" htmlFor="copyFrom">
              <select id="copyFrom" name="copyFrom" className="h-10 w-full rounded-[--radius-card] border bg-[color:var(--surface)] px-3 text-sm">
                <option value="">Aucun droit (je les coche ensuite)</option>
                {templates
                  .filter((t) => t.code !== 'SCHOOL_ADMIN')
                  .map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.label}
                    </option>
                  ))}
              </select>
            </Field>
            <fieldset className="space-y-1 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="scope" value="new" defaultChecked /> Seulement pour les nouvelles écoles
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="scope" value="existing" /> Aussi pour les écoles existantes ({schoolsTotal})
              </label>
            </fieldset>
          </KeepForm>
        </Card>
      ) : current ? (
        <Card>
          <BlocHead
            title={current.label}
            sub={
              current.code === 'SCHOOL_ADMIN'
                ? 'Le fondateur a toujours tous les droits : rien à régler.'
                : `${checked.size} droit(s) de départ · présente dans ${current.schools} école(s)`
            }
            right={current.custom ? <Pill tone="info">Créée par la plateforme</Pill> : null}
          />
          {current.custom && current.schools < schoolsTotal ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <span>{schoolsTotal - current.schools} école(s) existante(s) n’ont pas encore cette fonction.</span>
              <SimpleSubmit action={pushFunctionsAction.bind(null, current.code)} label="La leur donner" small />
            </div>
          ) : null}
          {current.code !== 'SCHOOL_ADMIN' ? (
            <KeepForm action={saveTemplateAction.bind(null, current.code)} submit="Enregistrer le modèle" className="mt-4">
              <div className="space-y-5">
                {PERMISSION_GROUPS.map((g) => (
                  <fieldset key={g.id}>
                    <legend className="mb-2 text-sm font-extrabold">{g.label}</legend>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {g.items.map((p) => (
                        <label key={p.code} className="flex items-start gap-2 text-sm">
                          <input type="checkbox" name="perm" value={p.code} defaultChecked={checked.has(p.code)} className="mt-1" />
                          <span>
                            {p.label}
                            {p.hint ? <span className="block text-xs text-[color:var(--muted-foreground)]">{p.hint}</span> : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
              <fieldset className="mt-5 space-y-1 rounded-2xl border p-4 text-sm" style={{ borderColor: 'var(--border)' }}>
                <legend className="px-1 font-extrabold">Quand j’enregistre</legend>
                <label className="flex items-center gap-2">
                  <input type="radio" name="scope" value="new" defaultChecked /> Seulement pour les nouvelles écoles
                </label>
                <label className="flex items-start gap-2">
                  <input type="radio" name="scope" value="existing" className="mt-1" />
                  <span>
                    Aussi pour les écoles existantes{' '}
                    <span className="text-[color:var(--muted-foreground)]">(les droits cochés y sont ajoutés à cette fonction ; aucun droit n’y est retiré)</span>
                  </span>
                </label>
              </fieldset>
            </KeepForm>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
