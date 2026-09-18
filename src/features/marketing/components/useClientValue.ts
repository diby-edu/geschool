import { useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};

/**
 * Lit une valeur qui n'existe que dans le navigateur (matchMedia, userAgent...)
 * sans setState dans un effet : `serverValue` au rendu serveur et a
 * l'hydratation, la vraie valeur ensuite. `read` doit renvoyer une valeur
 * primitive stable.
 */
export function useClientValue<T extends string | number | boolean>(read: () => T, serverValue: T): T {
  return useSyncExternalStore(noopSubscribe, read, () => serverValue);
}
