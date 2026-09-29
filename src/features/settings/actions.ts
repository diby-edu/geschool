'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { createClient } from '@/lib/supabase/server';
import { formValues, runFormAction, type FormState } from '@/lib/forms';
import { requireWritable } from '@/lib/permissions';
import { AuthorizationError, ValidationError } from '@/lib/errors';
import { normalizePhone } from '@/lib/auth/identifier';
import { audit } from '@/lib/audit';
import { schoolIdentitySchema } from './schemas';
import { writeSettings } from './school-settings';
import { readMatriculeMode } from './enrollment-policy-types';
import type { TenantContext } from '@/lib/tenant/context';
import { schoolTracks } from '@/features/structure/queries';
import { TRACK_LABELS, type EducationTrack } from '@/features/structure/official-tracks';

/** Enregistre l'identité et les coordonnées de l'établissement (`settings.update`, appliqué aussi par la base). */
/** Règles d'inscription : d'où vient le matricule d'un élève. */
export async function updateEnrollmentPolicyAction(slug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    requireWritable(ctx, 'settings.update');
    await writeSettings(ctx, 'academic', { matriculeMode: readMatriculeMode(fd.get('matriculeMode')) });
    redirect(`/e/${slug}/parametres/inscriptions?updated=1`);
  });
}

export async function updateIdentityAction(slug: string, _prev: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    requireWritable(ctx, 'settings.update');

    const input = schoolIdentitySchema.parse({
      name: fd.get('name'),
      shortName: fd.get('shortName') ?? '',
      directorName: fd.get('directorName') ?? '',
      registrationNumber: fd.get('registrationNumber') ?? '',
      address: fd.get('address') ?? '',
      neighborhood: fd.get('neighborhood') ?? '',
      city: fd.get('city') ?? '',
      phone: fd.get('phone') ?? '',
      email: fd.get('email') ?? '',
      website: fd.get('website') ?? '',
      educationTracks: fd.getAll('educationTracks').map(String),
    });

    let phone: string | null = null;
    if (input.phone) {
      phone = normalizePhone(input.phone, ctx.school.countryCode);
      if (!phone) throw new ValidationError('Numéro de téléphone invalide.');
    }

    const supabase = await createClient();
    await assertTracksRemovable(ctx, input.educationTracks);
    const { data, error } = await supabase
      .from('schools')
      .update({
        education_tracks: input.educationTracks,
        name: input.name,
        short_name: input.shortName || null,
        director_name: input.directorName || null,
        registration_number: input.registrationNumber || null,
        address: input.address || null,
        neighborhood: input.neighborhood || null,
        city: input.city || null,
        phone_e164: phone,
        email: input.email || null,
        website: input.website || null,
      })
      .eq('id', ctx.school.id)
      .select('id');
    if (error) throw error;
    // La RLS ne signale pas un refus en lecture/mise à jour : 0 ligne modifiée = droit absent.
    if (!data || data.length === 0) throw new AuthorizationError('Vous ne pouvez pas modifier l’identité de l’établissement.');

    await audit(ctx, { action: 'settings.identity_update', module: 'settings', entityType: 'school', entityId: ctx.school.id });
    redirect(`/e/${slug}/parametres/identite?updated=1`);
  }).then((state) => (state.error || state.fieldErrors ? { ...state, values: formValues(fd) } : state));
}

/**
 * Retirer un ordre d'enseignement casserait ce qui s'y rattache : un cycle (donc
 * ses niveaux et ses classes) ou un découpage de l'année. On refuse tant que
 * l'école s'en sert — en disant quoi supprimer d'abord. En ajouter est libre.
 */
async function assertTracksRemovable(ctx: TenantContext, next: string[]): Promise<void> {
  const current = await schoolTracks(ctx);
  const removed = current.filter((t) => !next.includes(t));
  if (removed.length === 0) return;

  const supabase = await createClient();
  for (const track of removed) {
    const { count: cycles } = await supabase
      .from('cycles')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', ctx.school.id)
      .eq('track', track);
    if (cycles && cycles > 0) {
      throw new ValidationError(
        `Impossible de retirer « ${TRACK_LABELS[track as EducationTrack]} » : ${cycles} cycle(s) en dépendent. Supprimez-les d'abord dans Structure pédagogique.`,
      );
    }
    const { count: periods } = await supabase
      .from('academic_periods')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', ctx.school.id)
      .contains('tracks', [track]);
    if (periods && periods > 0) {
      throw new ValidationError(
        `Impossible de retirer « ${TRACK_LABELS[track as EducationTrack]} » : ${periods} période(s) de l'année scolaire le visent. Supprimez-les d'abord.`,
      );
    }
  }
}
