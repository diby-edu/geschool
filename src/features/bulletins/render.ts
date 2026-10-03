import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { readTemplate } from '@/features/reporting/template-service';
import { readReportingSettings } from '@/features/reporting/settings';
import type { BulletinSchool } from './components/BulletinView';
import type { BulletinTemplate } from '@/features/reporting/template';
import type { Tier } from '@/features/reporting/config';

/**
 * Tout ce qu'il faut pour DESSINER un bulletin, réuni en une fois.
 *
 * Deux écrans l'affichent — l'administration et la famille — et ils doivent
 * voir exactement la même page. Assembler ici évite qu'un des deux oublie le
 * logo ou les paliers.
 */

export type BulletinRender = {
  t: BulletinTemplate;
  school: BulletinSchool;
  tiers: Tier[];
  editedOn: string;
  schoolYear: string;
};

export async function bulletinRender(ctx: TenantContext): Promise<BulletinRender> {
  const supabase = await createClient();
  const [template, reporting, { data: fiche }] = await Promise.all([
    readTemplate(ctx),
    readReportingSettings(ctx),
    supabase
      .from('schools')
      .select('city, address, phone_e164, registration_number, logo_url, primary_color')
      .eq('id', ctx.school.id)
      .maybeSingle(),
  ]);

  return {
    t: template,
    school: {
      name: ctx.school.name,
      city: fiche?.city ?? null,
      address: fiche?.address ?? null,
      phone: fiche?.phone_e164 ?? null,
      registrationNumber: fiche?.registration_number ?? null,
      logoUrl: fiche?.logo_url ?? ctx.school.logoUrl,
      // La couleur du bulletin suit celle de l'établissement tant que le
      // modèle n'en impose pas une autre.
      accent: fiche?.primary_color ?? ctx.school.primaryColor ?? '#1b5e3f',
    },
    tiers: reporting.subjectTiers,
    editedOn: new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: ctx.school.timezone,
    }).format(new Date()),
    schoolYear: ctx.academicYear?.name ?? '',
  };
}
