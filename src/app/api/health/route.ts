import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Sonde de sante, consommee par la supervision du VPS et par le script de
 * deploiement (bascule du lien symbolique uniquement si la nouvelle version
 * repond).
 *
 * Elle ne rapporte QUE ce qu'elle a reellement verifie. Une sonde qui renvoie
 * « ok » sans rien controler est pire que pas de sonde du tout : elle donne
 * une fausse assurance au moment ou l'on en a le plus besoin.
 *
 * Aucune information sensible n'est exposee : ni version de dependance, ni
 * nom d'hote, ni detail d'erreur.
 */
export function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      checked: ['process'],
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
