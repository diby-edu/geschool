import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  /**
   * Tout, SAUF les ressources statiques, les images, et les fichiers de la
   * couche PWA (sw.js, manifeste, icones) — bug reel corrige le 2026-09-13 :
   * ces fichiers etaient rediriges vers /login pour tout visiteur anonyme
   * (307 vers /login?next=%2Fsw.js), ce qui empechait purement et simplement
   * l'enregistrement du Service Worker. Ce sont des ressources publiques par
   * nature, jamais specifiques a un utilisateur — au meme titre que
   * _next/static, elles n'ont rien a faire derriere la garde d'authentification.
   *
   * On inclut volontairement les Route Handlers d'API : la garde de premiere
   * connexion doit s'appliquer aussi a eux (ADR-006), un compte non active ne
   * devant rien pouvoir appeler.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|icon|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
