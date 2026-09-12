import 'server-only';

import { serverEnv } from '@/lib/env';

/** L'IA est-elle configurée (clé présente) ? Sinon, mode déterministe. */
export function aiConfigured(): boolean {
  return serverEnv().ANTHROPIC_API_KEY.length > 0;
}

/**
 * Complétion via l'API Messages d'Anthropic. Appelée UNIQUEMENT côté serveur,
 * sous l'identité de l'utilisateur, sur des données déjà autorisées. N'accède
 * jamais à la base. Échoue proprement pour permettre un repli déterministe.
 */
export async function anthropicComplete(system: string, user: string): Promise<string> {
  const env = serverEnv();
  if (!env.ANTHROPIC_API_KEY) throw new Error('IA non configurée.');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(env.AI_TIMEOUT_SECONDS * 1000),
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`IA indisponible (${res.status}).`);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = (data.content ?? [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('')
    .trim();
  if (!text) throw new Error('Réponse IA vide.');
  return text;
}
