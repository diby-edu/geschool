'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTenantContext, yearCookieName } from '@/lib/tenant/context';
import { availableSpaces, spaceCookie } from './spaces';
import { createClient } from '@/lib/supabase/server';
import type { FormState } from '@/lib/forms';

/** Change d'espace et retient le choix sur cet appareil (cookie de confort, 400 jours). */
export async function switchSpaceAction(slug: string, space: string, _fd: FormData): Promise<void> {
  const ctx = await getTenantContext(slug);
  // Un espace qui n'est pas ouvert a l'utilisateur est simplement ignore.
  if ((availableSpaces(ctx) as string[]).includes(space)) {
    (await cookies()).set(spaceCookie(slug), space, {
      path: '/',
      maxAge: 60 * 60 * 24 * 400,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }
  redirect(`/e/${slug}/dashboard`);
}

/**
 * Année scolaire affichée. Le choix vaut pour cet établissement, sur cet
 * appareil ; une année qui n'est pas la sienne est ignorée. Revenir à l'année en
 * cours retire simplement le choix.
 */
export async function switchYearAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  const ctx = await getTenantContext(slug);
  const yearId = String(fd.get('yearId') ?? '');
  const back = String(fd.get('back') ?? '');
  const supabase = await createClient();
  const { data: year } = await supabase
    .from('academic_years')
    .select('id, is_current')
    .eq('school_id', ctx.school.id)
    .eq('id', yearId)
    .maybeSingle();

  const jar = await cookies();
  if (!year || year.is_current) jar.delete(yearCookieName(slug));
  else {
    jar.set(yearCookieName(slug), year.id, { path: '/', maxAge: 60 * 60 * 24 * 400, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  }
  // L'année change ce que TOUT l'espace affiche : on relit la page d'où l'on vient.
  redirect(back.startsWith(`/e/${slug}`) ? back : `/e/${slug}/dashboard`);
}
