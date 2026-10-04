import Link from 'next/link';

/**
 * Le bandeau du support.
 *
 * Un administrateur de la plateforme a TOUS les droits dans n'importe quel
 * etablissement : il peut valider un bulletin, supprimer un eleve, changer un
 * reglage — sans etre membre et sans que rien ne le distingue a l'ecran.
 *
 * Ce bandeau le distingue. Il reste visible tant qu'on est chez le client,
 * parce qu'on oublie vite dans quelle maison on se trouve.
 */
export function SupportBanner({ schoolName }: { schoolName: string }) {
  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[--radius-card] border px-3 py-2 text-sm"
      style={{ borderColor: 'var(--color-warning)', color: 'var(--color-warning)' }}
      role="status"
    >
      <span>
        Vous êtes chez <strong>{schoolName}</strong> en tant qu’administrateur de la plateforme. Vos actions y sont
        enregistrées dans le journal de l’établissement.
      </span>
      <Link href="/admin" className="underline">
        Revenir à la plateforme
      </Link>
    </div>
  );
}
