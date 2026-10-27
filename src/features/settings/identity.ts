import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { AuthorizationError, ValidationError } from '@/lib/errors';
import { normalizePhone } from '@/lib/auth/identifier';
import { audit } from '@/lib/audit';
import type { TenantContext } from '@/lib/tenant/context';
import { schoolTracks } from '@/features/structure/queries';
import { TRACK_LABELS, type EducationTrack } from '@/features/structure/official-tracks';
import { schoolIdentitySchema } from './schemas';

/**
 * Enregistre l'identité et les coordonnées de l'établissement. Partagé par la
 * page Paramètres de l'école (`settings.update`) et la fiche école du Super
 * Admin (lot 3) : mêmes règles, même contrôle des ordres d'enseignement.
 * Hors du fichier 'use server' : le contexte ne doit jamais venir du navigateur.
 */
export async function saveSchoolIdentity(ctx: TenantContext, fd: FormData): Promise<void> {
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
