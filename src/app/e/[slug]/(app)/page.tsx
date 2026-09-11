import { redirect } from 'next/navigation';

export default async function SchoolIndex({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // L'espace unique de la V1 est le tableau de bord ; les portails specialises
  // (enseignant, parent, eleve) partagent pour l'instant ce point d'entree,
  // dont le contenu s'adapte au role.
  redirect(`/e/${slug}/dashboard`);
}
