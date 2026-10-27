import { NextResponse } from 'next/server';
import { requireAdmin } from '@/features/platform/admin';
import { createClient } from '@/lib/supabase/server';
import { auditPlatform } from '@/lib/audit';
import { ZipStream } from '@/lib/zip-stream';

/**
 * Toutes les données d'une école en un ZIP de tableaux Excel (CSV « ; »),
 * un par sujet (lot 3, 2026-10-25). La base rend des paquets déjà mis en forme
 * (platform_export_chunk, 0144) ; le ZIP part au fil de l'eau : une grande école
 * (542 000 notes) prend deux minutes, sans que la connexion reste muette.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 900;

const LISTS: { kind: string; file: string; header: string }[] = [
  { kind: 'eleves', file: 'eleves.csv', header: 'Matricule;Nom;Prénoms;Sexe;Date de naissance;Lieu de naissance;Nationalité;Statut;Classe' },
  { kind: 'parents', file: 'parents.csv', header: 'Nom;Prénoms;Téléphone;Téléphone 2;E-mail;Profession;Statut;Enfants (matricules)' },
  { kind: 'enseignants', file: 'enseignants.csv', header: 'Matricule;Nom;Prénoms;Sexe;Téléphone;E-mail;Spécialité;Contrat;Statut;Embauche' },
  { kind: 'personnel', file: 'personnel.csv', header: 'Matricule;Nom;Prénoms;Téléphone;E-mail;Contrat;Fonctions' },
  { kind: 'classes', file: 'classes.csv', header: 'Classe;Niveau;Capacité;Année;Professeur principal;Élèves inscrits' },
  { kind: 'matieres', file: 'matieres.csv', header: 'Code;Matière;Abrégé;Coefficient;Active' },
  { kind: 'evaluations', file: 'evaluations.csv', header: 'Date;Évaluation;Matière;Classe;Période;Sur;Coefficient;Statut' },
  { kind: 'notes', file: 'notes.csv', header: 'Matricule;Élève;Date;Évaluation;Matière;Classe;Période;Note;Sur;Coefficient' },
  { kind: 'absences', file: 'absences-et-retards.csv', header: 'Date;Matricule;Élève;Statut;Minutes de retard;Cours;Commentaire' },
  { kind: 'bulletins', file: 'bulletins.csv', header: 'Matricule;Élève;Classe;Période;Moyenne;Rang;Effectif;Décision;Statut' },
];

/**
 * Un paquet reste en principe loin des 8 s de délai de la base (moins de 1 s
 * pour 8 000 lignes). Base froide ou chargée : jusqu'à 5 s mesurés, donc si un
 * paquet dépasse le délai, on le redemande deux fois plus petit.
 */
const CHUNK = 8000;
const MIN_CHUNK = 250;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let actor: string;
  try {
    actor = (await requireAdmin()).userId;
  } catch {
    return new NextResponse('Accès refusé', { status: 403 });
  }
  const supabase = await createClient();
  const { data: school } = await supabase.from('schools').select('id, slug').eq('id', id).maybeSingle();
  if (!school) return new NextResponse('École introuvable', { status: 404 });

  await auditPlatform(actor, { schoolId: id, action: 'platform.school_export', module: 'platform', entityType: 'school', entityId: id });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new ZipStream((chunk) => controller.enqueue(chunk));
      try {
        for (const list of LISTS) {
          await zip.addFile(list.file, async (put) => {
            await put(`﻿${list.header}\r\n`);
            let after: string | null = null;
            let size = CHUNK;
            for (;;) {
              const { data, error } = await supabase.rpc('platform_export_chunk' as never, {
                p_school: id,
                p_kind: list.kind,
                p_after: after,
                p_limit: size,
              } as never);
              if (error?.code === '57014' && size > MIN_CHUNK) {
                size = Math.max(MIN_CHUNK, Math.floor(size / 2));
                continue;
              }
              if (error) throw new Error(`${list.kind} : ${error.message}`);
              const r = data as unknown as { csv: string; last: string | null; n: number };
              if (r.n > 0) await put(r.csv.replace(/\n/g, '\r\n') + '\r\n');
              if (r.n < size || !r.last) break;
              after = r.last;
            }
          });
        }
        zip.finish();
        controller.close();
      } catch (e) {
        console.error('[export école]', e);
        controller.error(e);
      }
    },
  });

  const jour = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${school.slug}-donnees-${jour}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}
