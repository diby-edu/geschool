'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { requireAdmin } from '@/features/platform/admin';
import { requireWritable } from '@/lib/permissions';
import { runFormAction, type FormState } from '@/lib/forms';
import { ValidationError } from '@/lib/errors';
import { audit } from '@/lib/audit';
import { writePlatformSms } from './platform';
import { readSender, writeSender } from './sender';
import { buildDossier } from './dossier';
import { refreshPendingStatuses } from '@/services/sms-log';
import { grantSms } from './grants';
import { SENDER_STATUSES, senderProblem, type SenderStatus } from './sender-types';

/** Réglages SMS de l'éditeur : prix, nom d'expéditeur de secours, destinataire des dossiers. */
export async function savePlatformSmsAction(_p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const admin = await requireAdmin();
    const nombre = (k: string, max: number) => {
      const n = Number(String(fd.get(k) ?? '').replace(',', '.'));
      if (!Number.isFinite(n) || n < 0 || n > max) throw new ValidationError(`Valeur incorrecte pour « ${k} ».`);
      return n;
    };
    const fallback = String(fd.get('fallbackSender') ?? '').trim();
    const probleme = senderProblem(fallback);
    if (probleme) throw new ValidationError(`Nom d’expéditeur de la plateforme : ${probleme}`);

    await writePlatformSms(admin.userId, {
      pricePerSms: nombre('pricePerSms', 10_000),
      confirmAboveAmount: nombre('confirmAboveAmount', 10_000_000),
      monthlyQuota: Math.round(nombre('monthlyQuota', 1_000_000)),
      fallbackSender: fallback,
      senderRequestEmail: String(fd.get('senderRequestEmail') ?? '').trim().slice(0, 160),
    });
    redirect('/admin/sms?enregistre=1');
  });
}

/** Le nom d'expéditeur souhaité par un établissement. */
export async function saveSenderAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    requireWritable(ctx, 'settings.update');
    const nom = String(fd.get('name') ?? '').trim();
    const usePlatform = fd.get('usePlatform') === 'on';

    // Un nom vide est permis tant qu'on reste sous celui de la plateforme :
    // une école n'est pas obligée d'avoir le sien.
    if (nom) {
      const probleme = senderProblem(nom);
      if (probleme) throw new ValidationError(probleme);
    }

    const actuel = await readSender(ctx);
    // Changer de nom annule la validation en cours : l'opérateur a validé un
    // mot, pas un autre.
    const statut: SenderStatus = nom !== actuel.name ? 'NONE' : actuel.status;
    await writeSender(ctx, {
      name: nom,
      usePlatform,
      status: statut,
      ...(statut === 'NONE' ? { requestedOn: null, rejectionReason: null } : {}),
    });
    redirect(`/e/${slug}/parametres/sms?enregistre=1`);
  });
}

/** Marquer le dossier comme envoyé à l'opérateur. */
export async function markSenderRequestedAction(slug: string, _p: FormState): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    requireWritable(ctx, 'settings.update');
    const { row, missing } = await buildDossier(ctx);
    if (!row) {
      throw new ValidationError(
        `Dossier incomplet : ${missing.map((m) => m.field.toLowerCase()).join(', ')}. L’opérateur le refuserait.`,
      );
    }
    await writeSender(ctx, { status: 'REQUESTED', requestedOn: new Date().toISOString(), rejectionReason: null });
    await audit(ctx, { action: 'sms.sender_requested', module: 'settings', entityType: 'school', after: { sender: row['SENDER ID'] } });
    redirect(`/e/${slug}/parametres/sms?envoye=1`);
  });
}

/**
 * La réponse de l'opérateur, recopiée à la main.
 *
 * Letexto répond par e-mail et n'offre aucun moyen de connaître l'état par
 * API : quelqu'un doit donc le saisir. Autant le dire franchement à l'écran.
 */
export async function setSenderStatusAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    requireWritable(ctx, 'settings.update');
    const statut = String(fd.get('status') ?? '');
    if (!SENDER_STATUSES.includes(statut as SenderStatus)) throw new ValidationError('État inconnu.');
    const motif = String(fd.get('rejectionReason') ?? '').trim();
    if (statut === 'REJECTED' && motif.length < 3) {
      throw new ValidationError('Recopiez le motif du refus : sans lui, on ne saura pas quoi corriger.');
    }
    await writeSender(ctx, {
      status: statut as SenderStatus,
      rejectionReason: statut === 'REJECTED' ? motif : null,
    });
    await audit(ctx, { action: 'sms.sender_status', module: 'settings', entityType: 'school', after: { status: statut } });
    redirect(`/e/${slug}/parametres/sms?etat=${statut.toLowerCase()}`);
  });
}

/** Demander à l'opérateur où en sont les messages partis mais non confirmés. */
export async function refreshStatusesAction(_p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    await requireAdmin();
    const { checked, delivered, failed } = await refreshPendingStatuses();
    redirect(`/admin/sms?verifies=${checked}&livres=${delivered}&echecs=${failed}`);
  });
}

/**
 * Accorder un complement de SMS a un etablissement pour un mois donne.
 *
 * C'est l'acte commercial qui debloque une ecole dont le quota est epuise : on
 * l'enregistre depuis sa fiche de facturation, la ou se traitent ses paiements.
 */
export async function grantSmsAction(schoolId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const brut = String(fd.get('quantity') ?? '').replace(/\s/g, '');
    const quantite = Number(brut);
    if (!Number.isFinite(quantite)) throw new ValidationError('Indiquez un nombre de SMS.');
    await grantSms(
      schoolId,
      Math.round(quantite),
      String(fd.get('month') ?? ''),
      String(fd.get('reason') ?? ''),
    );
    redirect(`/admin/facturation/${schoolId}?sms=1`);
  });
}
