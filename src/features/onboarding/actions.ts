'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { runFormAction, formValues, type FormState } from '@/lib/forms';
import { registerSchool } from '@/services/onboarding';
import { registerSchoolSchema } from './schemas';

/** IP de l'appelant, depuis l'en-tete transmis par nginx (reverse proxy). */
async function callerIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || 'unknown';
}

export async function registerSchoolAction(_prev: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const parsed = registerSchoolSchema.parse({
      name: fd.get('name'),
      city: fd.get('city'),
      neighborhood: fd.get('neighborhood'),
      autoGenerateCode: fd.get('autoGenerateCode') === 'on' || fd.get('autoGenerateCode') === 'true',
      registrationNumber: fd.get('registrationNumber') ?? '',
      educationTracks: fd.getAll('educationTracks'),
      modules: fd.getAll('modules'),
      parentPortalEnabled: fd.get('parentPortalEnabled') === 'on' || fd.get('parentPortalEnabled') === 'true',
      firstName: fd.get('firstName'),
      lastName: fd.get('lastName'),
      phone: fd.get('phone'),
      email: fd.get('email'),
      password: fd.get('password'),
      confirmPassword: fd.get('confirmPassword'),
    });

    const logo = fd.get('logo');

    const result = await registerSchool({
      ipAddress: await callerIp(),
      school: {
        name: parsed.name,
        city: parsed.city,
        neighborhood: parsed.neighborhood,
        registrationNumber: parsed.autoGenerateCode ? null : parsed.registrationNumber || null,
        educationTracks: parsed.educationTracks,
        logo: logo instanceof File && logo.size > 0 ? logo : null,
      },
      modules: parsed.modules,
      parentPortalEnabled: parsed.parentPortalEnabled,
      director: {
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        phone: parsed.phone,
        email: parsed.email,
        password: parsed.password,
      },
    });

    // Connecte le directeur avec le client normal (jamais le client service
    // role au-dela de la creation) — meme convention que loginWithEmail.
    const supabase = await createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: parsed.email,
      password: parsed.password,
    });
    if (signInError) {
      // Le compte existe bel et bien : on renvoie vers la connexion plutot
      // que d'echouer sans explication.
      redirect(`/e/${result.slug}/login`);
    }

    // Directement /dashboard (pas /e/{slug} seul) : ce dernier redirige lui-meme
    // vers /dashboard (src/app/e/[slug]/(app)/page.tsx) SANS reporter la query
    // string, ce qui effacerait ?onboarded=1 en cours de route.
    redirect(`/e/${result.slug}/dashboard?onboarded=1`);
  }).then((s) => (s.error || s.fieldErrors ? { ...s, values: formValues(fd) } : s));
}
