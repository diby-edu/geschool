import { NextResponse } from 'next/server';
import { requireAdmin } from '@/features/platform/admin';
import { getPlatformStats } from '@/features/platform-dashboard/stats';
import { listPlatformUsers } from '@/features/platform/users';
import { readSmsJournal } from '@/features/sms/journal';
import { buildCsv, csvCell, csvPhone } from '@/lib/csv';
import { roleLabel, type RoleCode } from '@/lib/permissions/roles';

/**
 * Les exports de l'éditeur : établissements, comptes, SMS.
 *
 * CSV au format Excel français — c'est ce que tout le monde ouvre, et le reste
 * du logiciel exporte déjà ainsi. Les lectures passent par le client RLS : un
 * visiteur qui n'est pas administrateur de la plateforme n'obtient rien.
 */

const KINDS = ['etablissements', 'comptes', 'sms'] as const;
type Kind = (typeof KINDS)[number];

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!KINDS.includes(kind as Kind)) return new NextResponse('Export inconnu', { status: 404 });

  try {
    await requireAdmin();
  } catch {
    return new NextResponse('Accès refusé', { status: 403 });
  }

  const { entetes, lignes } = await construire(kind as Kind);
  const jour = new Date().toISOString().slice(0, 10);
  return new NextResponse(buildCsv(entetes, lignes), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${kind}-${jour}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

async function construire(kind: Kind): Promise<{ entetes: string[]; lignes: string[][] }> {
  if (kind === 'etablissements') {
    const stats = await getPlatformStats();
    return {
      entetes: ['Établissement', 'Identifiant', 'État', 'Élèves', 'Comptes', 'Modules coupés', 'Dernier signe de vie'],
      lignes: stats.schools.map((s) => [
        csvCell(s.name),
        csvCell(s.slug),
        csvCell(s.status),
        csvCell(s.students),
        csvCell(s.staff),
        csvCell(s.disabledModules),
        csvCell(s.idleDays === null ? 'jamais' : `il y a ${s.idleDays} j`),
      ]),
    };
  }

  if (kind === 'comptes') {
    const users = await listPlatformUsers('', 5000);
    return {
      entetes: ['Nom', 'E-mail', 'Téléphone', 'Établissements', 'Fonctions', 'Dernière connexion'],
      lignes: users.map((u) => [
        csvCell(u.name),
        csvCell(u.email ?? ''),
        csvPhone(u.phone),
        csvCell(u.schools.map((s) => s.name).join(' | ')),
        csvCell(u.schools.flatMap((s) => s.roles.map((r) => roleLabel(r as RoleCode))).join(' | ')),
        csvCell(u.idleDays === null ? 'jamais' : `il y a ${u.idleDays} j`),
      ]),
    };
  }

  const journal = await readSmsJournal(5000);
  return {
    entetes: ['Date', 'Établissement', 'Numéro', 'Expéditeur', 'SMS facturés', 'Coût', 'État', 'Erreur'],
    lignes: journal.rows.map((r) => [
      csvCell(new Date(r.at).toLocaleString('fr-FR')),
      csvCell(r.school ?? 'Plateforme'),
      csvPhone(r.to),
      csvCell(r.sender),
      csvCell(r.parts),
      csvCell(r.cost ?? ''),
      csvCell(r.status),
      csvCell(r.error ?? ''),
    ]),
  };
}
