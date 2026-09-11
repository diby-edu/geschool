# Architecture générale

Plateforme SaaS multi-tenant de gestion d'établissements scolaires.
Document de référence pour la structure du code, les couches, les frontières de sécurité et le
déploiement. Les arbitrages qui ont conduit à ces choix sont dans [`DECISIONS.md`](./DECISIONS.md).

---

## 1. Vue d'ensemble

```
                         Internet
                            |
                       Nginx / Caddy         (TLS, rate limiting, en-têtes de sécurité)
                            |
        +-------------------+--------------------+
        |                                        |
   Next.js 16 (App Router)              Workers Node (PM2)
   - Server Components                  - pg-boss : jobs
   - Server Actions                     - génération EDT
   - Route Handlers                     - envois SMS d'identifiants
   - PWA hors ligne                     - occurrences, PDF, agrégats
        |                                        |
        +-------------------+--------------------+
                            |
              +-------------+--------------+
              |                            |
      Supabase (managé)          solver-service (réseau privé)
      - PostgreSQL + RLS         - FastAPI + Pydantic
      - Auth                     - OR-Tools CP-SAT
      - Storage                  - sans état, sans accès base
      - Realtime (phase 8)
```

Une **seule application** Next.js. Les « espaces » (plateforme, établissement, enseignant,
parent, élève) sont des groupes de routes de cette application, pas des applications séparées.

---

## 2. Stack

| Couche | Choix | Version cible |
|---|---|---|
| Framework | Next.js, App Router | 16.x |
| UI | React, TypeScript strict | 19.x / 5.x |
| Style | Tailwind CSS v4 | 4.x |
| Composants | shadcn/ui (Radix sous-jacent, accessible, code possédé) | — |
| Tables | TanStack Table v8 (headless, tri/filtre/pagination serveur) | 8.x |
| Formulaires | React Hook Form + `@hookform/resolvers` | 7.x |
| Validation | **Zod v4**, partagée client et serveur | 4.x |
| Base | Supabase PostgreSQL 15+, RLS activée partout | — |
| Accès base | `@supabase/supabase-js` + `@supabase/ssr` | 2.x / 0.12.x |
| Auth | Supabase Auth, email/mot de passe (email synthétique — ADR-005) | — |
| Fichiers | Supabase Storage, buckets privés | — |
| Jobs | **pg-boss** sur la base Postgres | 10.x |
| Graphiques | Recharts | 3.x |
| PDF | Chromium headless (Playwright) rendant une route HTML d'impression | — |
| i18n | next-intl, `fr` seule locale active en V1 | 4.x |
| Hors ligne | Service Worker + IndexedDB (Dexie) | — |
| Solveur | Python 3.12, FastAPI, Pydantic v2, OR-Tools CP-SAT | — |
| Tests | Vitest, Playwright, pytest, harnais RLS `pg` | — |
| Migrations | Fichiers SQL numérotés + runner `pg` maison (`scripts/migrate.mjs`) | — |

**Migrations sans Supabase CLI.** Le CLI et Docker sont absents du poste. Les migrations sont
des fichiers `supabase/migrations/NNNN_nom.sql` appliqués par un runner Node qui se connecte en
direct à Postgres, tient une table `schema_migrations`, et s'exécute dans une transaction par
fichier. Même approche que `qr-saas`, déjà éprouvée.

---

## 3. Arborescence

```
/
├─ src/
│  ├─ app/
│  │  ├─ (auth)/                     connexion, première connexion, mot de passe oublié
│  │  ├─ (platform)/admin/           espace Super Admin (hors slug établissement)
│  │  ├─ e/[slug]/                   TOUT l'espace établissement
│  │  │  ├─ layout.tsx               résolution du tenant + garde d'appartenance
│  │  │  ├─ (school)/                direction et administration
│  │  │  │   dashboard/ students/ guardians/ teachers/ classes/ groups/
│  │  │  │   subjects/ assignments/ rooms/ schedule/ grades/ attendance/
│  │  │  │   reports/ enrollment/ access/ users/ settings/
│  │  │  ├─ (teacher)/               espace enseignant
│  │  │  ├─ (parent)/                espace parent
│  │  │  └─ (student)/               espace élève
│  │  ├─ api/                        Route Handlers (webhooks, exports, PWA sync)
│  │  └─ print/                      gabarits HTML destinés au rendu PDF
│  │
│  ├─ features/                      un dossier par domaine métier
│  │  └─ <domaine>/
│  │     ├─ schemas.ts               Zod : la forme des données du domaine
│  │     ├─ queries.ts               lectures (Server Components)
│  │     ├─ actions.ts               Server Actions (écritures)
│  │     ├─ service.ts               règles métier pures, testables sans réseau
│  │     └─ components/
│  │
│  ├─ lib/
│  │  ├─ auth/                       session, première connexion, MFA
│  │  ├─ tenant/                     résolution du slug, contexte établissement
│  │  ├─ permissions/                RBAC : hasPermission, canAccess, scopes
│  │  ├─ supabase/                   client navigateur, serveur, admin (service_role)
│  │  ├─ validation/                 helpers Zod, normalisation téléphone E.164
│  │  ├─ audit/                      écriture des audit_logs
│  │  ├─ jobs/                       déclaration et clients pg-boss
│  │  ├─ sms/                        SmsService + adaptateurs de fournisseur
│  │  ├─ offline/                    file IndexedDB, idempotence, réconciliation
│  │  ├─ pdf/                        rendu Chromium
│  │  └─ errors/                     erreurs applicatives typées
│  │
│  ├─ services/                      orchestrations inter-domaines
│  │                                 (inscription → comptes → SMS, publication EDT…)
│  ├─ config/defaults/               valeurs par défaut de school_settings (ADR-012)
│  ├─ types/                         types générés depuis la base + types partagés
│  └─ workers/                       points d'entrée des workers PM2
│
├─ solver-service/                   service Python OR-Tools (voir SOLVER_API.md)
│  ├─ app/{api,models,solver}/
│  ├─ tests/
│  ├─ requirements.txt
│  └─ Dockerfile
│
├─ supabase/
│  ├─ migrations/                    NNNN_description.sql
│  └─ seed/                          rôles, permissions, packs pays
│
├─ scripts/                          migrate.mjs, seed.mjs, gen-types.mjs
├─ tests/
│  ├─ rls/                           harnais d'isolation multi-tenant
│  ├─ integration/
│  └─ e2e/                           Playwright
├─ docs/
├─ docker-compose.yml
└─ ecosystem.config.cjs              PM2 : web + workers
```

**Règle de dépendance.** `app/` dépend de `features/`, qui dépend de `lib/`. Jamais l'inverse.
`services/` peut composer plusieurs `features/`. Aucun composant React n'importe `lib/supabase/admin`.

---

## 4. Multi-tenant : les quatre barrières

L'isolation n'est jamais assurée par une seule couche. Une requête traverse quatre contrôles
indépendants, et chacun doit suffire seul.

```
1. MIDDLEWARE      slug -> school_id ; appartenance active ? sinon 404
                   n'accorde aucun droit, désigne seulement le tenant

2. CONTEXTE        getTenantContext() est la SEULE source du school_id côté serveur
                   un school_id reçu du client est ignoré, systématiquement

3. RBAC            requirePermission('students.create') puis résolution du scope
                   avant toute lecture ou écriture

4. RLS POSTGRES    dernier rempart, y compris si les couches 1-3 sont contournées
                   activée et FORCÉE sur toutes les tables tenant
```

### Contexte tenant

```ts
// src/lib/tenant/context.ts
export type TenantContext = {
  school: { id: string; slug: string; name: string; status: SchoolStatus };
  academicYear: { id: string; name: string } | null; // année active
  user: { id: string };
  membership: { id: string; roles: RoleCode[] } | null; // null si Super Admin de passage
  isPlatformAdmin: boolean;
};

export const getTenantContext = cache(async (slug: string): Promise<TenantContext> => { … });
```

`cache()` de React déduplique l'appel sur toute la durée d'un rendu : une seule requête par
requête HTTP, même si vingt composants l'utilisent.

**Interdits absolus.**
- Une Server Action ne reçoit jamais `schoolId` en paramètre depuis le client.
- Aucune requête ne s'écrit sans `.eq('school_id', ctx.school.id)`, même quand la RLS le ferait.
  La redondance est volontaire : elle protège des erreurs de policy.
- Aucun identifiant d'entité n'est utilisé sans vérifier qu'il appartient au tenant courant
  (protection IDOR, §53).

### Storage

Chemin imposé, `school_id` en **deuxième** segment :

```
schools/{school_id}/students/{student_id}/photo.jpg
schools/{school_id}/documents/{document_id}/{filename}
schools/{school_id}/reports/{academic_year_id}/{report_card_id}.pdf
```

Les policies Storage lisent `(storage.foldername(name))[2]::uuid` et appliquent exactement les
mêmes fonctions d'appartenance que les tables. Tous les buckets sont **privés** ; les fichiers
ne sont servis que par URL signée à durée courte.

---

## 5. Authentification

Trois familles d'identifiants, une seule mécanique Supabase Auth (ADR-005).

| Profil | Saisit | Identité Auth réelle |
|---|---|---|
| Personnel (admin, direction, enseignant) | email réel + mot de passe | son email |
| Parent | téléphone E.164 + mot de passe | `p.<uuid>@accounts.invalid` |
| Élève | matricule + mot de passe | `s.<uuid>@accounts.invalid` |

Le formulaire de connexion demande l'établissement (ou le déduit du slug), puis un identifiant
unique. Le serveur résout `(school_id, identifiant) -> auth_email` et appelle
`signInWithPassword`. **Aucun OTP** n'intervient jamais dans une connexion.

### Première connexion obligatoire

Tant que `account_access.must_change_password` est vrai, le middleware redirige vers
`/first-login` **quelle que soit** la route demandée, y compris les Route Handlers d'API. Le
tableau de bord est inatteignable. Après validation : nouveau secret, `must_change_password`
à faux, `activation_status = ACTIVATED`, événement `ACCOUNT_ACTIVATED` dans `access_events`,
entrée d'audit, puis redirection vers l'espace correspondant au rôle.

### MFA

TOTP obligatoire pour `PLATFORM_ADMIN` (ADR-007), proposé et activable pour `SCHOOL_ADMIN` et
`DIRECTOR`, indisponible pour les parents et élèves (contexte terrain, ADR-004).

---

## 6. Couches d'écriture

```
Composant client
      |  appel typé
Server Action  (src/features/<domaine>/actions.ts)
      |  1. getTenantContext()
      |  2. requirePermission(...) + scope
      |  3. parse Zod de l'entrée
      |  4. délégation au service
Service métier (service.ts)  — pur, sans framework, testable seul
      |
Supabase (session utilisateur, RLS active)
      |
Audit + événements de job
```

Les Route Handlers `api/` ne servent qu'à ce que les Server Actions ne savent pas faire :
webhooks entrants, téléchargements en flux, endpoints de synchronisation PWA, et une future API
mobile. La logique métier reste dans `service.ts`, jamais dupliquée — c'est ce qui rend le §65
(compatibilité mobile) réel plutôt que déclaratif.

---

## 7. Jobs asynchrones

`pg-boss` s'appuie sur la base déjà présente : pas d'infrastructure supplémentaire, files
durables, réessais avec repli exponentiel, planification cron, verrous concurrents.

| File | Déclencheur | Rôle |
|---|---|---|
| `schedule.generate` | Demande utilisateur | Prépare le `ScheduleInput`, appelle le solveur, valide, crée la version DRAFT |
| `schedule.materialize` | Publication d'une version | Génère les `session_occurrences` de la période |
| `credentials.deliver` | Création de compte ou envoi manuel | Génère le secret, met à jour Auth, envoie le SMS (ADR-006) |
| `reports.render` | Génération de bulletins | Rend les PDF via Chromium, dépose dans Storage |
| `imports.process` | Import Excel/CSV | Traite par lots, produit un rapport de lignes rejetées |
| `maintenance.daily` | Cron | Agrégats, purge des jobs, contrôles de cohérence |

Chaque job porte `school_id` et une clé d'idempotence. Le worker n'utilise `service_role` qu'à
l'intérieur du périmètre du job (ADR-013).

---

## 8. Hors ligne (ADR-009)

```
Écran d'appel / d'inscription
        |
   écrit d'abord en local          IndexedDB (Dexie)
        |                          op = { client_operation_id, type, payload, state }
   state = LOCAL_SAVED
        |
   file de sortie -> PENDING_SYNC
        |
   au retour du réseau, ou sur clic « Synchroniser »
        v
   POST /api/sync/operations   (lot, ordonné, rejouable)
        |
   serveur : UNIQUE(school_id, client_operation_id)
        |     déjà vu ? renvoyer le résultat mémorisé, ne rien recréer
        v
   state = SYNCED   |   CONFLICT (résolution présentée à l'utilisateur)
```

L'interface affiche en permanence l'état réel : nombre d'opérations en attente, date de la
dernière synchronisation réussie, et un bouton explicite. Elle n'affirme jamais qu'une donnée
est enregistrée sur le serveur tant qu'elle ne l'est pas (§77).

---

## 9. SMS

```
Application -> SmsService -> SmsProvider (interface) -> passerelle
```

`SmsService` ne connaît que l'interface. Les adaptateurs (`OrangeCiProvider`, `TwilioProvider`,
`LeTextoProvider`, `ConsoleProvider` pour le développement) sont interchangeables par variable
d'environnement. Le SMS ne sert **qu'aux identifiants** (ADR-010).

---

## 10. Sécurité

| Risque | Contre-mesure |
|---|---|
| Accès inter-établissement | Quatre barrières (§4) + suite de tests RLS dédiée |
| IDOR | Toute entité relue avec son `school_id` avant usage ; jamais de confiance en un id d'URL |
| Élévation de privilège | Permissions vérifiées côté serveur uniquement ; le client ne fait que masquer l'UI |
| Fuite de secret | `service_role` cantonnée à `lib/supabase/admin.ts` ; aucune clé privée dans un bundle client ; secrets en variables d'environnement |
| Mot de passe temporaire | Jamais persisté (ADR-006) ; jamais en log, en audit ou en analytics |
| Upload malveillant | Type MIME vérifié côté serveur par signature de fichier, taille plafonnée, extension normalisée, buckets privés |
| Rate limiting | Nginx en frontal + limiteur applicatif sur connexion, réinitialisation d'accès, envoi de SMS et génération d'EDT |
| CSRF | Server Actions protégées nativement par Next ; les Route Handlers mutants vérifient l'origine |
| Énumération de tenant | 404 et non 403 sur un slug non autorisé |
| Injection SQL | Requêtes paramétrées uniquement ; les fonctions SQL sont `SECURITY DEFINER` avec `search_path` figé |

---

## 11. Performance

- Index sur `(school_id, …)` en tête de chaque table tenant : c'est le premier prédicat de toute
  requête et de toute policy.
- Pagination serveur obligatoire au-delà de 50 lignes ; jamais de `select *` sur une table entière.
- Les fonctions RLS d'appartenance sont `STABLE` : PostgreSQL les évalue une fois par requête et
  non une fois par ligne.
- Les moyennes sont calculées par des fonctions SQL, pas dans Node. Une table de cache
  (`student_period_averages`) ne sera introduite que sur mesure démontrée.
- Zéro N+1 : les lectures liées passent par des jointures Supabase imbriquées ou des vues.
- Cible tenue : tableau de bord sous 500 ms avec 5 000 élèves.

---

## 12. Déploiement

```
docker-compose.yml
├── web            Next.js en mode standalone, port interne 3000
├── workers        même image, commande PM2 dédiée aux workers
└── solver         solver-service, exposé uniquement sur le réseau interne
```

Le solveur n'est **jamais** exposé à Internet. Authentification inter-services par secret
partagé dans un en-tête, payload plafonné, délai maximal, journaux structurés.

Si le VPS n'a pas Docker (à confirmer, Q3 de `DECISIONS.md`), repli : Next et les workers sous
PM2, le solveur sous `systemd` + `uvicorn`, tous deux liés à `127.0.0.1`.

Variables d'environnement, jamais commitées :

```
NEXT_PUBLIC_SUPABASE_URL          NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY         DATABASE_URL
SOLVER_SERVICE_URL                SOLVER_SHARED_SECRET
SMS_PROVIDER                      SMS_PROVIDER_API_KEY
APP_URL                           SESSION_SECRET
```

---

## 13. Tests

| Nature | Outil | Couvre |
|---|---|---|
| Unitaires | Vitest | Services métier purs : moyennes, arrondis, normalisation E.164, validateurs de contraintes |
| RLS | Harnais `pg` maison | Isolation tenant, scopes parent/élève/enseignant, bypass Super Admin |
| Intégration | Vitest + base de test | Server Actions de bout en bout, idempotence de la synchronisation |
| Solveur | pytest | Les 14 cas de l'additif §48, plus les jeux SMALL/MEDIUM/LARGE |
| E2E | Playwright | Connexion, première connexion, inscription complète, appel, saisie de notes, publication d'EDT |

Le harnais RLS ouvre deux connexions authentifiées comme deux utilisateurs réels de deux
établissements, et vérifie que chaque table refuse la lecture, l'écriture, la modification et la
suppression croisées. Il est exécuté sur **toutes** les tables tenant, par génération automatique
à partir du catalogue : une nouvelle table sans policy fait échouer la suite.

---

## 14. Ce que l'architecture ne fait pas, volontairement

- Pas de semaines A/B, pas d'alternance (§72).
- Pas de cahier de texte (§74).
- Pas de « dédoublement » comme concept métier : uniquement classes, groupes et cibles multiples
  de séance (§71).
- Pas d'enseignant partagé entre établissements pour la planification (§73).
- Pas de couche IA avant la phase 11, et jamais avec un accès aux données supérieur à celui de
  l'utilisateur qui la sollicite (§60).
