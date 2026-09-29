'use server';

import { redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/tenant/context';
import { runFormAction, type FormState } from '@/lib/forms';
import { writeSettings } from '@/features/settings/school-settings';
import { roomPolicyPatch, type CapacityRule, type RoomMode } from './policy';
import { assignRoom } from './assignments';
import { createClosure, deleteClosure, moveOccurrenceRoom } from './closures';
import { createRoomRule, deleteRoomRule } from './weekly-availability';

/** Salle habituelle d'une classe : la donner, la changer ou la retirer. */
export async function assignRoomAction(slug: string, classId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const roomId = String(fd.get('roomId') ?? '').trim();
    const r = await assignRoom(ctx, classId, roomId || null);
    const params = new URLSearchParams({ onglet: 'affectation' });
    if (r.moved > 0) params.set('deplaces', String(r.moved));
    if (r.skipped > 0) params.set('laisses', String(r.skipped));
    if (r.warning) params.set('avertissement', r.warning);
    if (r.moved === 0 && r.skipped === 0 && !r.warning) params.set('affectee', '1');
    redirect(`/e/${slug}/rooms?${params.toString()}`);
  });
}

/** Réglage de l'établissement : mode d'occupation et règle de capacité. */
export async function updateRoomPolicyAction(slug: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const mode = String(fd.get('mode') ?? 'MIXED') as RoomMode;
    const capacity = String(fd.get('capacity') ?? 'WARN') as CapacityRule;
    await writeSettings(ctx, 'schedule', roomPolicyPatch({ mode, capacity }));
    redirect(`/e/${slug}/rooms?onglet=affectation&regle=1`);
  });
}

/** Fermer une salle sur une période (travaux, examens, prêt). */
export async function createClosureAction(slug: string, roomId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const affected = await createClosure(ctx, {
      roomId,
      startsOn: String(fd.get('startsOn') ?? ''),
      endsOn: String(fd.get('endsOn') ?? ''),
      reason: String(fd.get('reason') ?? '').trim(),
    });
    redirect(`/e/${slug}/rooms/${roomId}?fermee=1&touchees=${affected}`);
  });
}

export async function deleteClosureAction(slug: string, roomId: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteClosure(ctx, id);
    redirect(`/e/${slug}/rooms/${roomId}?rouverte=1`);
  });
}

/** Changer la salle d'UNE séance datée (« mardi prochain, exceptionnellement en A9 »). */
export async function moveOccurrenceRoomAction(
  slug: string,
  roomId: string,
  occurrenceId: string,
  _p: FormState,
  fd: FormData,
): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    const target = String(fd.get('targetRoomId') ?? '').trim();
    await moveOccurrenceRoom(ctx, occurrenceId, target || null);
    redirect(`/e/${slug}/rooms/${roomId}?deplacee=1`);
  });
}

/** Indisponibilité qui revient chaque semaine (salle prêtée, club, réunion). */
export async function createRoomRuleAction(slug: string, roomId: string, _p: FormState, fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await createRoomRule(ctx, {
      roomId,
      dayOfWeek: Number(fd.get('dayOfWeek') ?? 1),
      startsAt: String(fd.get('startsAt') ?? ''),
      endsAt: String(fd.get('endsAt') ?? ''),
      reason: String(fd.get('reason') ?? '').trim(),
    });
    redirect(`/e/${slug}/rooms/${roomId}?regle=1`);
  });
}

export async function deleteRoomRuleAction(slug: string, roomId: string, id: string, _p: FormState, _fd: FormData): Promise<FormState> {
  return runFormAction(async () => {
    const ctx = await getTenantContext(slug);
    await deleteRoomRule(ctx, id);
    redirect(`/e/${slug}/rooms/${roomId}?regle_levee=1`);
  });
}
