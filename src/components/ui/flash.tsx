import { Alert } from '@/components/ui/alert';

const MESSAGES: Record<string, string> = {
  created: 'Enregistrement cree.',
  updated: 'Modifications enregistrees.',
  deleted: 'Element supprime.',
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
