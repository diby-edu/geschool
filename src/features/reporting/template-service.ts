import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { requireWritable } from '@/lib/permissions';
import { audit } from '@/lib/audit';
import {
  BLOCK_IDS,
  COLUMN_IDS,
  DEFAULT_TEMPLATE,
  type BlockId,
  type BulletinTemplate,
  type ColumnId,
  type Density,
} from './template';

/**
 * Le modèle de bulletin de l'établissement.
 *
 * Rangé dans `report_card_templates` (table créée en 0023, restée vide depuis).
 * Une école qui n'a jamais ouvert l'éditeur reçoit le modèle par défaut : elle
 * n'a rien à configurer pour imprimer un bulletin correct.
 *
 * Tout ce qui sort de la colonne JSON est relu : un modèle abîmé retombe sur le
 * défaut plutôt que de produire une page vide.
 */

export type StoredTemplate = BulletinTemplate & { id: string | null; name: string };

export async function readTemplate(ctx: TenantContext): Promise<StoredTemplate> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('report_card_templates')
    .select('id, name, layout')
    .eq('school_id', ctx.school.id)
    .eq('is_default', true)
    .maybeSingle();

  if (!data) return { ...DEFAULT_TEMPLATE, id: null, name: 'Modèle par défaut' };
  return { ...clean(data.layout), id: data.id, name: data.name || 'Modèle par défaut' };
}

export async function writeTemplate(ctx: TenantContext, patch: Partial<BulletinTemplate>): Promise<void> {
  requireWritable(ctx, 'settings.update');
  const supabase = await createClient();
  const current = await readTemplate(ctx);
  const layout: BulletinTemplate = clean({ ...stripMeta(current), ...patch });

  if (current.id) {
    const { error } = await supabase
      .from('report_card_templates')
      .update({ layout: layout as never })
      .eq('school_id', ctx.school.id)
      .eq('id', current.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('report_card_templates').insert({
      school_id: ctx.school.id,
      name: 'Modèle de l’établissement',
      layout: layout as never,
      is_default: true,
    });
    if (error) throw error;
  }
  await audit(ctx, { action: 'reports.template_update', module: 'reports', entityType: 'report_card_template' });
}

/** Revenir au modèle d'origine, sans détruire l'historique du reste. */
export async function resetTemplate(ctx: TenantContext): Promise<void> {
  requireWritable(ctx, 'settings.update');
  const supabase = await createClient();
  const current = await readTemplate(ctx);
  if (!current.id) return;
  const { error } = await supabase
    .from('report_card_templates')
    .update({ layout: DEFAULT_TEMPLATE as never })
    .eq('school_id', ctx.school.id)
    .eq('id', current.id);
  if (error) throw error;
  await audit(ctx, { action: 'reports.template_reset', module: 'reports', entityType: 'report_card_template' });
}

function stripMeta(t: StoredTemplate): BulletinTemplate {
  const { id: _id, name: _name, ...rest } = t;
  return rest;
}

// -----------------------------------------------------------------------------
// Relecture — ce qui vient du JSON n'est jamais cru sur parole.
// -----------------------------------------------------------------------------

function clean(raw: unknown): BulletinTemplate {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const lignes = Array.isArray(o.headerLines)
    ? o.headerLines.filter((l): l is string => typeof l === 'string').map((l) => l.trim().slice(0, 160)).filter(Boolean)
    : DEFAULT_TEMPLATE.headerLines;

  const listeUnique = <T extends string>(v: unknown, connus: readonly T[], defaut: T[]): T[] => {
    if (!Array.isArray(v)) return defaut;
    const vus = new Set<T>();
    for (const x of v) if (connus.includes(x as T)) vus.add(x as T);
    return vus.size > 0 ? [...vus] : defaut;
  };

  const signatures = Array.isArray(o.signatures)
    ? o.signatures.filter((s): s is string => typeof s === 'string').map((s) => s.trim().slice(0, 60)).filter(Boolean).slice(0, 4)
    : DEFAULT_TEMPLATE.signatures;

  const texte = (v: unknown, defaut: string) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, 240) : defaut;

  const accent = typeof o.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(o.accent) ? o.accent : null;

  // Le tableau, la matiere et la moyenne ne se retirent pas. L'editeur le
  // refuse deja, mais un JSON abime ne doit pas produire une page vide.
  const blocks = listeUnique<BlockId>(o.blocks, BLOCK_IDS, DEFAULT_TEMPLATE.blocks);
  if (!blocks.includes('table')) blocks.push('table');
  const columns = listeUnique<ColumnId>(o.columns, COLUMN_IDS, DEFAULT_TEMPLATE.columns);
  for (const obligatoire of ['average', 'subject'] as ColumnId[]) {
    if (!columns.includes(obligatoire)) columns.unshift(obligatoire);
  }

  return {
    headerLines: lignes.slice(0, 5),
    title: texte(o.title, DEFAULT_TEMPLATE.title),
    showLogo: o.showLogo !== false,
    blocks,
    columns,
    signatures: signatures.length > 0 ? signatures : DEFAULT_TEMPLATE.signatures,
    footerLeft: texte(o.footerLeft, DEFAULT_TEMPLATE.footerLeft),
    footerRight: texte(o.footerRight, DEFAULT_TEMPLATE.footerRight),
    accent,
    density: (o.density === 'COMPACT' ? 'COMPACT' : 'NORMAL') as Density,
  };
}
