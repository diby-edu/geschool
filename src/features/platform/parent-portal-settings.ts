'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { runFormAction, type FormState } from '@/lib/forms';
import { ValidationError } from '@/lib/errors';
import { auditPlatform } from '@/lib/audit';
import { requireAdmin } from './admin';

/**
 * Réglages de l'Espace Parent (0172), réservés au Super Admin : le prix par
 * enfant et les paliers de réduction de l'école, pour toutes les écoles, et
 * une règle différente possible par école (prix 0 = offert).
 */

type Tier = { minPct: number; discountPct: number };

function num(v: FormDataEntryValue | null, label: string, max: number): number | null {
  const raw = String(v ?? '').replace(/\s/g, '').replace(',', '.');
  if (raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > max) throw new ValidationError(`${label} : valeur incorrecte.`);
  return n;
}

/** Les deux paliers du formulaire (le second facultatif), croissants. */
function tiersFrom(fd: FormData): Tier[] {
  const out: Tier[] = [];
  for (const i of [1, 2]) {
    const min = num(fd.get(`min${i}`), `Palier ${i} : élèves activés`, 100);
    const pct = num(fd.get(`pct${i}`), `Palier ${i} : réduction`, 100);
    if (min === null && pct === null) continue;
    if (min === null || pct === null) throw new ValidationError(`Palier ${i} : renseignez les deux nombres, ou aucun.`);
    out.push({ minPct: min, discountPct: pct });
  }
  out.sort((a, b) => a.minPct - b.minPct);
  if (out.length === 2 && !(out[1]!.discountPct > out[0]!.discountPct)) {
    throw new ValidationError('Le second palier doit donner plus de réduction que le premier.');
  }
  return out;
}

export async function saveParentDefaultsAction(_p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const { userId } = await requireAdmin();
    const price = num(fd.get('price'), 'Prix par enfant', 1_000_000);
    if (price === null) throw new ValidationError('Indiquez le prix par enfant.');
    const settings = { pricePerChild: price, tiers: tiersFrom(fd) };
    const supabase = await createClient();
    const { error } = await supabase
      .from('platform_settings')
      .upsert({ namespace: 'parent_portal', settings, updated_at: new Date().toISOString(), updated_by: userId } as never, { onConflict: 'namespace' });
    if (error) throw error;
    await auditPlatform(userId, { action: 'platform.parent_portal_defaults', module: 'billing', after: settings });
    revalidatePath('/admin/espace-parent');
    redirect('/admin/espace-parent?enregistre=1');
  });
}

export async function saveSchoolRuleAction(_p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const { userId } = await requireAdmin();
    const schoolId = String(fd.get('school') ?? '');
    if (!/^[0-9a-f-]{36}$/.test(schoolId)) throw new ValidationError('Choisissez une école.');
    const price = num(fd.get('price'), 'Prix par enfant', 1_000_000);
    const tiers = tiersFrom(fd);
    const supabase = await createClient();
    const { error } = await supabase.from('parent_portal_rules' as never).upsert(
      {
        school_id: schoolId,
        price_per_child: price,
        tiers: tiers.length > 0 ? tiers : null,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      } as never,
      { onConflict: 'school_id' },
    );
    if (error) throw error;
    await auditPlatform(userId, { schoolId, action: 'platform.parent_portal_school_rule', module: 'billing', after: { price, tiers } });
    revalidatePath('/admin/espace-parent');
    redirect('/admin/espace-parent?enregistre=1');
  });
}

export async function removeSchoolRuleAction(schoolId: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const { userId } = await requireAdmin();
    const supabase = await createClient();
    const { error } = await supabase.from('parent_portal_rules' as never).delete().eq('school_id', schoolId);
    if (error) throw error;
    await auditPlatform(userId, { schoolId, action: 'platform.parent_portal_school_rule_removed', module: 'billing' });
    revalidatePath('/admin/espace-parent');
    redirect('/admin/espace-parent?retire=1');
  });
}
