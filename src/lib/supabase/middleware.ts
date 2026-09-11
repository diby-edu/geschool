import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { publicEnv } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Rafraichit la session Supabase a chaque requete et applique les gardes
 * grossieres d'authentification. Les controles FINS (appartenance a
 * l'etablissement, permissions) restent dans les layouts et les Server Actions
 * (ARCHITECTURE.md §4) : le middleware ne fait qu'aiguiller.
 *
 * `getUser()` valide le jeton aupres de Supabase et rafraichit le cookie ; ne
 * jamais le remplacer par `getSession()`, qui ne verifie rien.
 */

// Prefixes accessibles sans session
const PUBLIC_PREFIXES = ['/login', '/first-login', '/mot-de-passe-oublie', '/api/health', '/auth'];

function isPublicPath(pathname: string): boolean {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  // Premiere connexion imposee : tant que must_change_password est vrai, tout
  // est inatteignable sauf la page de definition du mot de passe et la
  // deconnexion (ADR-006). Le drapeau vient du JWT (app_metadata), donc aucun
  // acces base ici.
  const mustChange = user?.app_metadata?.must_change_password === true;
  if (user && mustChange && pathname !== '/first-login' && !pathname.startsWith('/auth')) {
    const url = request.nextUrl.clone();
    url.pathname = '/first-login';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Route protegee sans session -> connexion, avec retour prevu
  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  // Deja connecte et deja a jour : la page de connexion n'a plus lieu d'etre
  if (user && !mustChange && (pathname === '/login' || pathname === '/first-login')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}
