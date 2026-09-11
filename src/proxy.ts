import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  /**
   * Tout, SAUF les ressources statiques et les images. On inclut volontairement
   * les Route Handlers d'API : la garde de premiere connexion doit s'appliquer
   * aussi a eux (ADR-006), un compte non active ne devant rien pouvoir appeler.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
