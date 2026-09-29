import type { Metadata } from 'next';
import { getTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { signAvatarUrls } from '@/lib/storage/avatars';
import { roleLabel, type RoleCode } from '@/lib/permissions/roles';
import { saveOwnPhotoAction, removeOwnPhotoAction } from '@/features/profile/actions';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Flash } from '@/components/ui/flash';
import { ConfirmSubmit } from '@/components/ui/confirm-submit';
import { PhotoForm } from '@/features/profile/components/PhotoForm';

export const metadata: Metadata = { title: 'Mon profil' };

/** Ma photo et mes informations : ce que les autres voient de moi dans l'application. */
export default async function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getTenantContext(slug);

  const supabase = await createClient();
  const { data: me } = await supabase.from('users').select('avatar_url, contact_email, phone_e164').eq('id', ctx.user.id).maybeSingle();
  const photoUrl = me?.avatar_url ? ((await signAvatarUrls([me.avatar_url])).get(me.avatar_url) ?? null) : null;
  const roles = ctx.membership?.roles ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Flash searchParams={sp} />
      <PageHeader title="Mon profil" description="Votre photo apparaît en haut à droite de l’application." />

      <Card>
        <CardContent className="space-y-4 py-5">
          <PhotoForm action={saveOwnPhotoAction.bind(null, slug)} photoUrl={photoUrl} name={ctx.user.displayName} />
          {photoUrl ? (
            <ConfirmSubmit
              action={removeOwnPhotoAction.bind(null, slug)}
              label="Retirer ma photo"
              variant="secondary"
              confirmMessage="Retirer votre photo ? Vos initiales seront affichées à la place."
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-1.5 py-5 text-sm">
          <p>
            <span className="text-[color:var(--muted-foreground)]">Nom : </span>
            <b>{ctx.user.displayName}</b>
          </p>
          <p>
            <span className="text-[color:var(--muted-foreground)]">Fonction : </span>
            {roles.length > 0 ? roles.map((r) => roleLabel(r as RoleCode)).join(' · ') : ctx.isPlatformAdmin ? 'Super Admin' : 'Membre'}
          </p>
          <p>
            <span className="text-[color:var(--muted-foreground)]">Identifiant de connexion : </span>
            {ctx.user.email || me?.phone_e164 || '—'}
          </p>
          <p className="pt-2 text-xs text-[color:var(--muted-foreground)]">
            Votre nom et votre numéro sont gérés par l’établissement : demandez au secrétariat ou à la direction pour les
            corriger.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
