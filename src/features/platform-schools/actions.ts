'use server';

import { redirect } from 'next/navigation';
import { createClient, getAuthenticatedUser } from '@/lib/supabase/server';
import { auditPlatform } from '@/lib/audit';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { AuthorizationError, ConflictError } from '@/lib/errors';
import { createSchoolSchema } from './schemas';

/**
 * Creation d'un etablissement — reservee au Super Admin. La RLS de `schools`
 * exige deja is_platform_admin() a l'insertion ; on verifie aussi cote
 * application pour un message clair et un refus precoce.
 */
export async function createSchoolAction(_prev: FormState, formData: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const user = await getAuthenticatedUser();
    if (!user) throw new AuthorizationError();

    const supabase = await createClient();
    const { data: isAdmin } = await supabase.rpc('is_platform_admin' as never);
    if (isAdmin !== true) throw new AuthorizationError('Reserve aux administrateurs de la plateforme.');

    const input = createSchoolSchema.parse({
      name: formData.get('name'),
      slug: formData.get('slug'),
      shortName: formData.get('shortName') ?? '',
      schoolType: formData.get('schoolType') ?? 'SECONDARY',
      countryCode: formData.get('countryCode') ?? 'CI',
      currency: formData.get('currency') ?? 'XOF',
      locale: formData.get('locale') ?? 'fr-CI',
      timezone: formData.get('timezone') ?? 'Africa/Abidjan',
    });

    const { data, error } = await supabase
      .from('schools')
      .insert({
        name: input.name,
        slug: input.slug,
        short_name: input.shortName || null,
        school_type: input.schoolType,
        status: 'ACTIVE',
        country_code: input.countryCode,
        currency: input.currency,
        locale: input.locale,
        timezone: input.timezone,
      })
      .select('id, slug')
      .single();

    if (error) {
      if (error.code === '23505') throw new ConflictError('Ce slug est deja utilise.');
      throw error;
    }

    await auditPlatform(user.id, {
      schoolId: data.id,
      action: 'platform.schools.create',
      module: 'platform',
      entityType: 'school',
      entityId: data.id,
      after: { slug: input.slug, name: input.name },
    });

    redirect(`/e/${data.slug}`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(formData) } : s));
}
