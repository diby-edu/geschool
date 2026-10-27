#!/usr/bin/env node
/**
 * Créer un compte Super Admin depuis la ligne de commande, SANS être connecté.
 *
 *   pnpm admin:create <email> <prénom> <nom>
 *   ex. pnpm admin:create kono@numerik360.com Arnaud KONO
 *
 * Même chose que la page « Administrateurs → Créer un compte Super Admin »,
 * pour le cas où plus aucun Super Admin ne peut se connecter (mot de passe
 * perdu). La clé de service de .env.local est nécessaire : seul quelqu'un qui a
 * le projet sur sa machine peut le faire.
 *
 * - E-mail sans compte : le compte est créé avec un mot de passe temporaire,
 *   affiché UNE fois ici ; à la première connexion, la personne choisit le sien.
 * - E-mail qui a déjà un compte : il reçoit seulement les droits (son mot de
 *   passe ne change pas).
 * La création est inscrite au journal de la plateforme.
 */
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomInt } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const f of ['.env.local', '.env']) {
  const p = join(root, f);
  if (existsSync(p)) process.loadEnvFile(p);
}

const [emailArg, firstName, ...rest] = process.argv.slice(2);
const lastName = rest.join(' ').trim();
const email = (emailArg ?? '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !firstName || !lastName) {
  console.error('Utilisation : pnpm admin:create <email> <prénom> <nom>');
  console.error('Exemple     : pnpm admin:create kono@numerik360.com Arnaud KONO');
  process.exit(1);
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être dans .env.local.');
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { persistSession: false } });

// Même alphabet que lib/sms (pas de 0/O, 1/I/L : lisible au téléphone).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const tempPassword = () => Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

const { data: existing, error: lookupError } = await db.from('users').select('id').ilike('auth_email', email).maybeSingle();
if (lookupError) {
  console.error('Lecture impossible :', lookupError.message);
  process.exit(1);
}

let userId = existing?.id ?? null;
let password = null;
if (!userId) {
  password = tempPassword();
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `${firstName} ${lastName}`, first_name: firstName, last_name: lastName },
    app_metadata: { must_change_password: true },
  });
  if (error || !data.user) {
    console.error('Création du compte impossible :', error?.message ?? 'inconnu');
    process.exit(1);
  }
  userId = data.user.id;
}

const { error: grantError } = await db
  .from('platform_admins')
  .upsert({ user_id: userId, is_active: true, revoked_at: null, granted_by: null, note: 'Créé en ligne de commande' }, { onConflict: 'user_id' });
if (grantError) {
  console.error('Attribution des droits impossible :', grantError.message);
  process.exit(1);
}

await db.from('audit_logs').insert({
  school_id: null,
  actor_user_id: null,
  actor_is_platform_admin: true,
  action: password ? 'platform.admin_create' : 'platform.admin_grant',
  module: 'platform',
  entity_type: 'user',
  entity_id: userId,
  after: { email, newAccount: password !== null, via: 'ligne de commande' },
});

console.log('');
console.log(`✓ ${email} est maintenant Super Admin.`);
if (password) {
  console.log('');
  console.log(`  Mot de passe temporaire : ${password}`);
  console.log('  Note-le maintenant : il ne sera plus affiché.');
  console.log('  Connexion : onglet « Avec un e-mail ». Un nouveau mot de passe sera demandé.');
} else {
  console.log('  Ce compte existait déjà : il garde son mot de passe actuel.');
}
console.log('');
