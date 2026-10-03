import type { Metadata } from 'next';
import Link from 'next/link';
import { getTenantContext } from '@/lib/tenant/context';
import { requirePageAccess, requireFeature } from '@/lib/permissions/guard';
import { bulletinRender } from '@/features/bulletins/render';
import { saveTemplateAction, resetTemplateAction } from '@/features/reporting/actions';
import { TemplateForm } from '@/features/reporting/components/TemplateForm';
import { PageHeader } from '@/components/layout/PageHeader';
import { Flash } from '@/components/ui/flash';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';

export const metadata: Metadata = { title: 'Modèle de bulletin' };

export default async function TemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);
  requirePageAccess(ctx, 'settings.update');
  requireFeature(ctx, 'bulletins');

  const rendu = await bulletinRender(ctx);

  return (
    <div className="space-y-6">
      <Flash searchParams={sp} />
      {sp.enregistre ? <Alert tone="success">Modèle enregistré.</Alert> : null}
      {sp.reinitialise ? <Alert tone="success">Modèle revenu à son état d’origine.</Alert> : null}

      <PageHeader
        title="Modèle de bulletin"
        description="Ce qui figure sur la page, dans quel ordre, et avec quels mots. L’aperçu suit chaque changement."
        action={
          <div className="flex gap-2">
            <ConfirmSubmit
              action={resetTemplateAction.bind(null, slug)}
              label="Modèle d’origine"
              confirmMessage="Revenir au modèle d’origine ? Vos réglages de mise en page seront perdus."
              variant="secondary"
            />
            <Link href={`/e/${slug}/bulletins`}>
              <Button variant="ghost">Retour</Button>
            </Link>
          </div>
        }
      />

      <TemplateForm
        action={saveTemplateAction.bind(null, slug)}
        template={rendu.t}
        school={rendu.school}
        tiers={rendu.tiers}
        editedOn={rendu.editedOn}
        schoolYear={rendu.schoolYear}
      />
    </div>
  );
}
