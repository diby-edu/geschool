import { getRequestConfig } from 'next-intl/server';

/**
 * Une seule locale active : le francais (ADR-004).
 *
 * next-intl est mis en place des maintenant, avant tout ecran, pour une raison
 * precise : sans lui, les chaines s'ecrivent en dur dans les composants et les
 * extraire apres coup coute dix fois plus cher. Le routage par locale (/fr/...)
 * n'est PAS active — il entrerait en conflit avec le prefixe /e/{slug} du
 * multi-tenant (ADR-003) sans apporter quoi que ce soit tant qu'il n'y a
 * qu'une langue.
 */

export const locale = 'fr' as const;
export const timeZone = 'Africa/Abidjan';

export default getRequestConfig(async () => ({
  locale,
  timeZone,
  messages: (await import('../../messages/fr.json')).default,
}));
