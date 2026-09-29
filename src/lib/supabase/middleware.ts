import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { publicEnv } from '@/lib/env';
import { getClaimsWithRetry, getUserWithRetry } from '@/lib/supabase/get-user';
import { supabaseFetch } from '@/lib/supabase/limited-fetch';
import type { Database } from '@/types/database';

/**
 * Rafraichit la session Supabase a chaque requete et applique les gardes
 * grossieres d'authentification. Les controles FINS (appartenance a
 * l'etablissement, permissions) restent dans les layouts et les Server Actions
 * (ARCHITECTURE.md §4) : le middleware ne fait qu'aiguiller.
 *
 * `getClaims()` verifie la signature du jeton (localement avec une cle
 * asymetrique, sans appel reseau) et rafraichit le cookie ; ne jamais le
 * remplacer par `getSession()`, qui ne verifie rien. Il ne voit pas une session
 * coupee dont le jeton n'a pas expire : l'espace etablissement le refait
 * (app_context), et les pages de connexion passent par `getUser()` (ci-dessous).
 */

// Prefixes accessibles sans session
const PUBLIC_PREFIXES = ['/login', '/first-login', '/mot-de-passe-oublie', '/api/health', '/auth', '/hors-ligne', '/inscription'];

function isPublicPath(pathname: string): boolean {
  // La racine est la vitrine publique (marketing) : elle-meme decide, cote
  // page, d'afficher la landing (visiteur anonyme) ou d'aiguiller (session
  // active). Correspondance exacte uniquement : ne rend public aucune page
  // sous /quoi-que-ce-soit.
  if (pathname === '/') return true;
  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  // Page de connexion propre a un etablissement : /e/{slug}/login
  if (/^\/e\/[^/]+\/login$/.test(pathname)) return true;
  return false;
}

export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { fetch: supabaseFetch },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const claims = await getClaimsWithRetry(supabase);

  const { pathname, search } = request.nextUrl;

  // Premiere connexion imposee : tant que must_change_password est vrai, tout
  // est inatteignable sauf la page de definition du mot de passe et la
  // deconnexion (ADR-006). Le drapeau vient du JWT (app_metadata), donc aucun
  // acces base ici ; un drapeau pose APRES l'emission du jeton est rattrape par
  // le layout de l'espace etablissement (app_context le lit a la source).
  const mustChange = claims?.app_metadata?.must_change_password === true;
  if (claims && mustChange && pathname !== '/first-login' && !pathname.startsWith('/auth')) {
    const url = request.nextUrl.clone();
    url.pathname = '/first-login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Route protegee sans session -> connexion, avec retour prevu
  if (!claims && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  // Deja connecte et deja a jour : la page de connexion n'a plus lieu d'etre.
  // Verification complete ici (pages rares) : un jeton encore valide dont la
  // session a ete coupee (acces suspendu) renverrait sinon la personne vers « / »
  // a chaque tentative de reconnexion, jusqu'a l'expiration du jeton.
  if (claims && !mustChange && (pathname === '/login' || pathname === '/first-login')) {
    const user = await getUserWithRetry(supabase);
    if (user && user.app_metadata?.must_change_password !== true) {
      const url = request.nextUrl.clone();
      url.pathname = '/';
      url.search = '';
      return NextResponse.redirect(url);
    }
  }

  return response;
}
