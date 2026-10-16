/**
 * Mémoire courte d'un calcul coûteux, côté serveur.
 *
 * Pour un agrégat lourd et lent à changer (moyennes par classe d'un grand
 * établissement : 175 000 notes à relire), affiché sur un écran qui se recharge
 * tout seul. Pendant `ttlMs`, la même clé rend le même résultat ; deux demandes
 * simultanées n'en lancent qu'un seul calcul. Une erreur n'est jamais gardée.
 *
 * La clé doit contenir TOUT ce qui change le résultat, l'utilisateur compris
 * quand le calcul dépend de ses droits.
 */
type Entry<T> = { at: number; value: Promise<T> };

export function createShortMemo<T>(ttlMs: number, now: () => number = Date.now) {
  const store = new Map<string, Entry<T>>();
  return function memo(key: string, compute: () => Promise<T>): Promise<T> {
    const t = now();
    const hit = store.get(key);
    if (hit && t - hit.at < ttlMs) return hit.value;
    // Ménage des entrées périmées, pour que la mémoire ne grossisse pas.
    for (const [k, e] of store) if (t - e.at >= ttlMs) store.delete(k);
    const value = compute();
    store.set(key, { at: t, value });
    value.catch(() => {
      if (store.get(key)?.value === value) store.delete(key);
    });
    return value;
  };
}
