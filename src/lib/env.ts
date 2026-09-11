import { z } from 'zod';

/**
 * Validation des variables d'environnement.
 *
 * Deux schemas separes, et cette separation est une frontiere de securite :
 *
 *   publicEnv  variables NEXT_PUBLIC_*, envoyees au navigateur. Aucun secret.
 *   serverEnv  secrets. Toute lecture depuis le navigateur leve une erreur.
 *
 * Les variables NEXT_PUBLIC_ sont ecrites litteralement (process.env.NEXT_PUBLIC_X)
 * et non par destructuration : c'est la seule forme que Next.js sait remplacer a
 * la compilation.
 */

// ---------------------------------------------------------------------------
// Public — sur le navigateur comme sur le serveur
// ---------------------------------------------------------------------------

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_PLATFORM_NAME: z.string().min(1).default('Gestion Scolaire'),
  // Public par nature : un DSN Sentry n'est pas un secret.
  NEXT_PUBLIC_SENTRY_DSN: z.union([z.url(), z.literal('')]).default(''),
});

function readPublicEnv() {
  const parsed = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_PLATFORM_NAME: process.env.NEXT_PUBLIC_PLATFORM_NAME,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  });

  if (!parsed.success) {
    throw new Error(
      `Variables d'environnement publiques invalides ou manquantes :\n${formatIssues(parsed.error)}\n\nCopier .env.example vers .env.local et completer.`,
    );
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Serveur — secrets, jamais exposes
// ---------------------------------------------------------------------------

const boolish = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true');

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  DATABASE_URL: z.string().startsWith('postgresql://'),

  AUTH_SYNTHETIC_EMAIL_DOMAIN: z.string().min(3).default('accounts.invalid'),
  PLATFORM_ADMIN_EMAILS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),

  DEFAULT_COUNTRY_CODE: z.string().length(2).default('CI'),
  DEFAULT_LOCALE: z.string().default('fr-CI'),
  DEFAULT_TIMEZONE: z.string().default('Africa/Abidjan'),
  DEFAULT_CURRENCY: z.string().length(3).default('XOF'),
  DEFAULT_PHONE_COUNTRY: z.string().length(2).default('CI'),

  SOLVER_SERVICE_URL: z.url().default('http://127.0.0.1:8000'),
  SOLVER_SHARED_SECRET: z.string().default(''),
  SOLVER_DEFAULT_TIMEOUT_SECONDS: z.coerce.number().int().min(10).max(900).default(120),
  SOLVER_MAX_CONCURRENT_JOBS: z.coerce.number().int().min(1).max(8).default(1),
  SOLVER_MAX_LOAD_AVERAGE: z.coerce.number().min(0).default(1.2),
  SOLVER_LOAD_RETRY_DELAY_SECONDS: z.coerce.number().int().min(30).default(180),

  PGBOSS_SCHEMA: z.string().default('pgboss'),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  WORKER_ENABLED: boolish.default(false),

  SMS_PROVIDER: z.enum(['console', 'orange_ci', 'letexto', 'twilio']).default('console'),
  SMS_API_KEY: z.string().default(''),
  SMS_API_SECRET: z.string().default(''),
  SMS_SENDER_ID: z.string().default(''),
  SMS_WEBHOOK_SECRET: z.string().default(''),
  SMS_MAX_PER_MINUTE: z.coerce.number().int().min(0).default(20),
  SMS_MAX_PER_DAY: z.coerce.number().int().min(0).default(2000),

  CHROMIUM_EXECUTABLE_PATH: z.string().default(''),
  PDF_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),

  CRON_SECRET: z.string().default(''),
  RATE_LIMIT_LOGIN_PER_15MIN: z.coerce.number().int().min(1).default(10),
  RATE_LIMIT_PASSWORD_RESET_PER_HOUR: z.coerce.number().int().min(1).default(5),
  RATE_LIMIT_SYNC_PER_MINUTE: z.coerce.number().int().min(1).default(60),
  UPLOAD_MAX_SIZE_MB: z.coerce.number().int().min(1).max(50).default(10),

  STORAGE_BUCKET_DOCUMENTS: z.string().default('documents'),
  STORAGE_BUCKET_AVATARS: z.string().default('avatars'),
  STORAGE_BUCKET_REPORTS: z.string().default('reports'),
  STORAGE_SIGNED_URL_TTL: z.coerce.number().int().min(60).default(900),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Sentry. Tout est facultatif : sans DSN, le suivi d'erreurs est simplement
  // inactif et rien ne casse. SENTRY_AUTH_TOKEN ne sert qu'au build (envoi des
  // source maps) et n'est jamais lu a l'execution.
  SENTRY_AUTH_TOKEN: z.string().default(''),
  SENTRY_ORG: z.string().default(''),
  SENTRY_PROJECT: z.string().default(''),
});

let serverCache: z.infer<typeof serverSchema> | null = null;

function readServerEnv() {
  if (typeof window !== 'undefined') {
    throw new Error(
      "serverEnv a ete lu depuis le navigateur. C'est une fuite de secret : utiliser publicEnv.",
    );
  }

  if (serverCache) return serverCache;

  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Variables d'environnement serveur invalides ou manquantes :\n${formatIssues(parsed.error)}\n\nCopier .env.example vers .env.local et completer.`,
    );
  }

  serverCache = parsed.data;
  return serverCache;
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => `  - ${i.path.join('.') || '(racine)'} : ${i.message}`)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Acces
// ---------------------------------------------------------------------------

/** Variables publiques. Lecture immediate : elles doivent toujours etre presentes. */
export const publicEnv = readPublicEnv();

/**
 * Variables serveur. Lecture PARESSEUSE : `next build` ne dispose pas des
 * secrets de production, et un acces au chargement du module ferait echouer le
 * build en CI. Elles ne sont lues qu'a la premiere requete reelle.
 */
export function serverEnv(): z.infer<typeof serverSchema> {
  return readServerEnv();
}

export type PublicEnv = typeof publicEnv;
export type ServerEnv = z.infer<typeof serverSchema>;
