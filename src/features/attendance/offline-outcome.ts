/**
 * Que faire d'un appel envoyé, selon la réponse du serveur ?
 *
 * Règle : un appel fait sans réseau n'est JAMAIS perdu.
 *  - ok      : enregistré, il quitte l'appareil ;
 *  - retry   : réseau absent, serveur indisponible -> reste en attente, renvoyé seul ;
 *  - login   : session expirée (réponse 401, ou redirection vers la connexion)
 *              -> reste en attente, l'utilisateur doit se reconnecter ;
 *  - refused : le serveur dit non pour une raison durable (cours hors créneau,
 *              appel déjà validé, séance supprimée) -> GARDÉ sur l'appareil,
 *              montré avec la raison ; seul l'utilisateur peut le retirer.
 */
export type SendOutcome =
  | { kind: 'ok'; registerId: string; submitted: boolean }
  | { kind: 'retry' }
  | { kind: 'login' }
  | { kind: 'refused'; message: string };

export type ResponseLike = {
  status: number;
  redirected: boolean;
  contentType: string | null;
  body: unknown;
};

export function classifyResponse(res: ResponseLike): SendOutcome {
  // Session expirée : le middleware redirige vers /login, et fetch suit la
  // redirection jusqu'à une page HTML.
  if (res.redirected || res.status === 401) return { kind: 'login' };
  const isJson = (res.contentType ?? '').includes('application/json');
  if (!isJson) return res.status >= 200 && res.status < 300 ? { kind: 'login' } : { kind: 'retry' };

  const body = (res.body ?? {}) as { registerId?: string; submitted?: boolean; error?: { message?: string } };
  if (res.status >= 200 && res.status < 300) {
    return body.registerId ? { kind: 'ok', registerId: body.registerId, submitted: body.submitted ?? false } : { kind: 'retry' };
  }
  if (res.status >= 500 || res.status === 408 || res.status === 429) return { kind: 'retry' };
  return { kind: 'refused', message: body.error?.message ?? "Le serveur a refusé l'appel." };
}
