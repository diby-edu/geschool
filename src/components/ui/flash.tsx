import { Alert } from '@/components/ui/alert';

const MESSAGES: Record<string, string> = {
  created: 'Enregistrement créé.',
  updated: 'Modifications enregistrées.',
  deleted: 'Élément supprimé.',
  configured: 'Grille horaire enregistrée : la journée est découpée en créneaux.',
  onboarded: 'Bienvenue ! Votre établissement est créé, votre essai de 30 jours a commence.',
  access_created:
    "Accès créé. Ses identifiants sont en attente : envoyez-les par SMS depuis Gestion des accès.",
  access_linked:
    "Ce numéro avait déjà un accès dans l'établissement : le rôle Enseignant lui a été ajouté. Il se connecte avec son mot de passe actuel.",
  access_linked_pending:
    "Ce numéro avait déjà un accès en attente d'activation : le rôle Enseignant lui a été ajouté. Envoyez ses identifiants depuis Gestion des accès.",
  access_already: 'Cet enseignant a déjà un accès.',
};

/**
 * Confirmation legere apres une action, portee par l'URL (?created=1). Server
 * Component : pas d'etat client, disparait a la prochaine navigation.
 */
export function Flash({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const key = Object.keys(MESSAGES).find((k) => searchParams[k] === '1');
  if (!key) return null;
  return (
    <div className="mb-4">
      <Alert tone="success">{MESSAGES[key]}</Alert>
    </div>
  );
}
