import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type { TenantContext } from '@/lib/tenant/context';
import { buildCsv, csvCell } from '@/lib/csv';
import { toGsm } from '@/lib/sms/text';
import { readSender } from './sender';

/**
 * Le dossier de validation d'un nom d'expéditeur.
 *
 * Letexto ne valide pas par API : il faut leur envoyer un fichier, par e-mail,
 * avec dix colonnes exactes. Une seule case vide, et le dossier est refusé —
 * c'est arrivé à une demande dont l'adresse e-mail manquait.
 *
 * L'établissement ne saisit donc qu'une chose : le nom souhaité. Tout le reste
 * est repris de sa fiche, et l'application REFUSE de produire le fichier tant
 * qu'il manque quelque chose.
 */

export const DOSSIER_COLUMNS = [
  'Req N°',
  'SENDER ID',
  'Content Description',
  'Email',
  'Website du sender',
  'Adresse de l’entreprise',
  'Siège social',
  'Example - Message Content',
  'Type of Message',
  'Activité',
] as const;

export type DossierRow = Record<(typeof DOSSIER_COLUMNS)[number], string>;

export type DossierCheck = {
  row: DossierRow | null;
  /** Ce qui manque, en clair, avec l'écran où le corriger. */
  missing: { field: string; where: string }[];
};

export async function buildDossier(ctx: TenantContext, requestNumber = 1): Promise<DossierCheck> {
  const supabase = await createClient();
  const [{ data: fiche }, sender] = await Promise.all([
    supabase
      .from('schools')
      .select('name, email, website, address, city, country_code')
      .eq('id', ctx.school.id)
      .maybeSingle(),
    readSender(ctx),
  ]);

  const missing: { field: string; where: string }[] = [];
  const exige = (valeur: string | null | undefined, field: string, where: string): string => {
    const v = (valeur ?? '').trim();
    if (!v) missing.push({ field, where });
    return v;
  };

  const nom = exige(sender.name, 'Le nom d’expéditeur souhaité', 'ci-dessous');
  const email = exige(fiche?.email, 'L’adresse e-mail de l’établissement', 'Paramètres → Identité');
  // Letexto exige une vitrine publique : un site, ou à défaut une page
  // Facebook. L'adresse de l'espace de l'école ne suffit pas.
  const vitrine = exige(fiche?.website, 'Le site web ou la page Facebook', 'Paramètres → Identité');
  const adresse = exige(fiche?.address, 'L’adresse de l’établissement', 'Paramètres → Identité');
  const ville = exige(fiche?.city, 'La ville', 'Paramètres → Identité');

  if (missing.length > 0) return { row: null, missing };

  const siege = `${ville}, ${pays(fiche?.country_code)}`;
  const row: DossierRow = {
    'Req N°': String(requestNumber),
    'SENDER ID': nom,
    'Content Description':
      'Transmission des identifiants et codes de connexion au personnel de l’établissement et aux familles, ' +
      'pour l’accès à la plateforme de gestion scolaire.',
    Email: email,
    'Website du sender': vitrine,
    'Adresse de l’entreprise': adresse,
    'Siège social': siege,
    // Les exemples sont les VRAIS gabarits de l'application : l'opérateur voit
    // exactement ce qui partira, et ne peut pas refuser pour incohérence.
    'Example - Message Content': exemples(nom).join('\n'),
    'Type of Message': 'OTP / Transactional',
    Activité: 'Établissement scolaire — enseignement',
  };
  return { row, missing: [] };
}

/** Les trois exemples demandés par Letexto, tirés des messages réels. */
export function exemples(sender: string): string[] {
  return [
    `1. ${sender} : Votre compte est actif. Identifiant : ykonan. Code provisoire : 458921`,
    `2. ${sender} : Votre code de connexion est 739104, valable 15 minutes.`,
    `3. ${sender} : Votre mot de passe a ete reinitialise. Nouveau code : 284615`,
  ].map(toGsm);
}

/**
 * Le fichier à joindre à l'e-mail.
 *
 * CSV au format Excel français (séparateur `;`, UTF-8 avec BOM) : il s'ouvre
 * d'un double-clic, et un « Enregistrer sous → .xlsx » suffit si l'opérateur
 * tient au format Excel. Pas de bibliothèque supplémentaire pour une page de
 * dix colonnes envoyée trois fois par an.
 */
export function dossierCsv(rows: DossierRow[]): string {
  // `buildCsv` n'encode que l'en-tête : les cellules doivent passer par
  // `csvCell` nous-mêmes. Nos valeurs contiennent des points-virgules et des
  // sauts de ligne — sans cet encodage, le fichier serait illisible.
  return buildCsv(
    [...DOSSIER_COLUMNS],
    rows.map((r) => DOSSIER_COLUMNS.map((c) => csvCell(r[c]))),
  );
}

/** Le brouillon d'e-mail, prêt à copier. */
export function dossierEmail(schoolName: string, senderName: string): { subject: string; body: string } {
  return {
    subject: `Demande de validation de sender — ${senderName}`,
    body: [
      'Bonjour,',
      '',
      `Je vous prie de bien vouloir valider le nom d'expéditeur « ${senderName} » pour l'établissement ${schoolName}.`,
      '',
      'Vous trouverez le dossier complet en pièce jointe : description du contenu, exemples de messages, coordonnées et activité.',
      '',
      'Les messages envoyés sont exclusivement transactionnels : identifiants et codes de connexion à la plateforme de gestion scolaire.',
      '',
      'Je reste à votre disposition.',
      'Cordialement,',
    ].join('\n'),
  };
}

function pays(code: string | null | undefined): string {
  const connus: Record<string, string> = { CI: 'Côte d’Ivoire', SN: 'Sénégal', BF: 'Burkina Faso', ML: 'Mali', TG: 'Togo', BJ: 'Bénin' };
  return connus[(code ?? 'CI').toUpperCase()] ?? (code ?? '').toUpperCase();
}
