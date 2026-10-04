import 'server-only';

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { auditPlatform } from '@/lib/audit';

/**
 * Le filet de sécurité de la trace du support.
 *
 * Un administrateur de la plateforme entre normalement chez un client par le
 * bouton tracé de sa fiche (platform-schools/actions.ts) : deux clics, un motif
 * facultatif, une ligne dans le journal. Mais ce bouton n'était qu'une porte
 * parmi d'autres — un lien direct vers /e/{slug}, une adresse tapée à la main,
 * un favori — et une trace qui se contourne n'est pas une trace.
 *
 * Ici, c'est l'ARRIVÉE elle-même qui se consigne, dans la garde de l'espace
 * établissement : par où qu'il soit passé, le passage est écrit. Deux détails
 * comptent :
 *
 * - On distingue les deux portes. `platform.school_enter` est l'entrée annoncée,
 *   avec son motif ; `platform.school_enter_direct` est l'entrée sans motif,
 *   rattrapée ici. Le journal de l'école montre la différence.
 * - On ne réécrit pas la même ligne à chaque page. Une entrée déjà consignée
 *   dans la dernière heure vaut pour toute la visite — sans quoi une matinée de
 *   support noierait le journal de l'établissement sous cent lignes identiques.
 */

/** Durée pendant laquelle une entrée déjà consignée couvre la visite. */
const FENETRE_MINUTES = 60;

const ACTIONS_ENTREE = ['platform.school_enter', 'platform.school_enter_direct'];

/**
 * Consigne l'arrivée d'un administrateur de la plateforme chez un client, sauf
 * si elle l'est déjà. Appelé à chaque page de l'espace : `cache` évite de poser
 * deux fois la question dans un même rendu, et l'écriture est silencieuse —
 * cette trace ne doit jamais empêcher une page de s'afficher.
 */
export const traceSupportEntry = cache(async (userId: string, schoolId: string): Promise<void> => {
  try {
    const supabase = await createClient();
    const depuis = new Date(Date.now() - FENETRE_MINUTES * 60_000).toISOString();

    const { data: deja } = await supabase
      .from('audit_logs')
      .select('id')
      .eq('school_id', schoolId)
      .eq('actor_user_id', userId)
      .in('action', ACTIONS_ENTREE)
      .gte('created_at', depuis)
      .limit(1);

    if (deja && deja.length > 0) return;

    await auditPlatform(userId, {
      action: 'platform.school_enter_direct',
      module: 'platform',
      entityType: 'school',
      entityId: schoolId,
      schoolId,
      after: { reason: null },
    });
  } catch (error) {
    console.error('[support-trace] entree non consignee', error);
  }
});
