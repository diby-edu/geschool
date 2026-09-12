# Plan d'implémentation

Plan d'exécution. Il détaille **comment** construire, dans quel ordre, avec quel critère
d'acceptation. La vision produit est dans [`ROADMAP.md`](./ROADMAP.md), les arbitrages dans
[`DECISIONS.md`](./DECISIONS.md), l'infrastructure dans [`DEPLOYMENT.md`](./DEPLOYMENT.md).

---

## Vue d'ensemble

| Lot | Contenu | Livrable vérifiable | Bloqué par |
|---|---|---|---|
| **0** | Documentation d'architecture | 12 documents | — · *terminé* |
| **1** | Socle technique | types + lint + tests + build verts | — · *terminé* |
| **2** | Base de données et RLS | 30 migrations, 57 tests d'isolation verts | — · *terminé* |
| **3** | Authentification et RBAC | connexion 3 identifiants, 1re connexion, RBAC, 4 e2e verts | — · *terminé* |
| **4** | Administration : structure | 8 modules CRUD livrés et vérifiés ; reste config secondaire | *en cours* |
| **5** | Élèves, parents, accès | inscription → comptes → SMS de bout en bout, vérifié | — · *cœur terminé* |
| **6** | Emploi du temps manuel | grille, éditeur, validation, publication + occurrences, vérifié | — · *terminé* |
| **7** | Solveur OR-Tools | génération automatique expliquée | lot 6 |
| **8** | Notes et évaluations | moyennes exactes, classements | lot 5 |
| **9** | Présence et hors-ligne | appel en mode avion, synchronisation | lots 6, 8 |
| **10** | Bulletins et portails | bulletin PDF, espaces parent et élève | lots 8, 9 |
| **11** | Communication | notifications in-app, annonces | lot 10 |
| **12** | SaaS | plans, abonnements, quotas, paiements | lot 11 |
| **13** | Couche IA | assistance, explications | lot 12 |

Les lots 6 et 5 sont parallélisables : ils ne partagent que le lot 4.

---

## Répartition des rôles

**Vous, en amont — fait**

1. ~~Enregistrement DNS `A` : `geschool.numerik360.com`~~ — fait le 10/09/2026
2. ~~Projet Supabase et clés~~ — fait, base jointe et vérifiée
3. ~~Dépôt git `diby-edu/geschool`~~ — fait, CI verte
4. ~~Décision sur l'upgrade CPU~~ — écartée, ADR-014

**Vous, plus tard**

5. Passer `DATABASE_URL` au Session pooler — recommandé, non bloquant (`DEPLOYMENT.md` §7)
6. Fournisseur SMS et clés *(lot 5)*
7. Secrets GitHub Actions, si vous voulez un déploiement automatique
8. Moyen de paiement des abonnements *(lot 12)*

**Moi** : tout le reste — code, migrations, tests, déploiement, documentation.

---

## Lot 1 — Socle technique · **TERMINÉ le 10/09/2026**

**Objectif.** Un projet qui démarre, se teste et se déploie. Aucun métier.

**Livré**

- [x] Next.js 16.3.4, React 19.3, TypeScript 5.9 strict intégral
      (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`)
- [x] Tailwind 4.3, jetons de design en `oklch`, thème clair et sombre, focus visible,
      `prefers-reduced-motion`
- [x] Arborescence de `ARCHITECTURE.md` §3
- [x] Trois clients Supabase : navigateur, serveur (session utilisateur), admin
- [x] **Cloisonnement du `service_role` vérifié par ESLint** — l'import hors de
      `workers/`, `services/` et `lib/audit/` fait échouer le lint (ADR-013)
- [x] `src/lib/env.ts` — variables validées par Zod, séparation publique/serveur, lecture
      des secrets paresseuse pour que le build en CI n'en ait pas besoin
- [x] `src/lib/errors/` — erreurs typées ; une ressource hors périmètre renvoie 404 et non 403
- [x] `scripts/migrate.mjs` — transaction par fichier, **somme de contrôle** refusant une
      migration modifiée après coup, verrou consultatif contre deux déploiements concurrents
- [x] `scripts/gen-types.mjs` — types régénérés depuis la base, fichier versionné
- [x] `src/lib/system/load.ts` + 6 tests — garde-fou de charge d'ADR-014
- [x] Worker pg-boss : démarrage, arrêt gracieux, aucune file simulée
- [x] next-intl, locale `fr` unique, sans routage par locale
- [x] `output: 'standalone'`, 5 en-têtes de sécurité, `X-Powered-By` supprimé
- [x] `ecosystem.config.cjs` — ports 3110 / worker, Node 22 par chemin explicite,
      mode cluster proscrit, mémoire plafonnée
- [x] `docker-compose.yml` — solveur bridé à 0,5 vCPU, `127.0.0.1` obligatoire
- [x] `scripts/deploy.sh` — déploiement atomique par lien symbolique, sonde de santé,
      **retour arrière automatique** en cas d'échec
- [x] CI GitHub Actions — vérification puis build ; le build ne tourne jamais sur le VPS
- [x] Vitest 5, Playwright (profils bureau et mobile), `.gitignore`

**Vérifié réellement**

```
pnpm typecheck   vert
pnpm lint        vert, 0 avertissement (--max-warnings=0)
pnpm test        6 tests verts
pnpm build       compilé, artefact standalone de 21 Mo
serveur standalone lancé -> / en HTTP 200, /api/health en 200,
                            5 en-têtes de sécurité présents, X-Powered-By absent
```

**Écarts assumés par rapport au plan initial**

| Sujet | Choix | Raison |
|---|---|---|
| TypeScript | **5.9.3**, et non 7.0.2 | TS 7 vient de sortir. L'adopter au premier jour, sur le compilateur de tout le projet, ajoute du risque sans bénéfice. Migration à réévaluer plus tard. |
| ESLint | **9.39**, et non 10.10 | `eslint-config-next` ne teste que la plage `>=9`. |
| `@tanstack/react-table` | **v9** | v8 était indiquée dans la documentation ; v9 est la version courante. |
| shadcn/ui | **reporté au lot 3** | Ses composants n'ont d'utilité qu'avec de vrais écrans. Les dépendances (`clsx`, `tailwind-merge`, `cva`, `lucide-react`) et l'utilitaire `cn()` sont déjà en place. |
| Hooks de pré-commit | **non installés** | `pnpm verify` couvre le besoin, et la CI est bloquante. Un hook sera ajouté si des commits non vérifiés apparaissent. |

**Mise en service du 11/09/2026**

- Dépôt `diby-edu/geschool` — poussé, branche `main`, **dépôt public** (choix assumé).
- **CI verte** : les deux jobs passent et l'artefact `standalone` est produit et archivé.
  Un correctif a été nécessaire : `pnpm/action-setup` refuse de démarrer quand la version
  est déclarée à la fois dans son input et dans `packageManager` de `package.json`.
- Les données d'infrastructure ont été **sorties du dépôt** avant le premier push, le dépôt
  étant public : adresse du VPS, compte d'accès, inventaire nominatif des services voisins
  et référence du projet Supabase vivent désormais dans `docs/DEPLOYMENT.local.md`, exclu
  par `.gitignore`. `scripts/deploy.sh` exige maintenant `VPS_HOST` par variable
  d'environnement au lieu de la coder en dur.
- Base Supabase jointe et vérifiée : PostgreSQL 17.6, schéma `public` vide, `pgcrypto`
  déjà présente. Prête pour le lot 2.

---

## Lot 2 — Base de données et RLS · **TERMINÉ le 11/09/2026**

**Le lot le plus important.** Aucune interface ne s'écrit tant qu'il n'est pas verrouillé.

**Livré**

- [x] **30 migrations** appliquées sur Supabase — liste réelle dans
      [`DATABASE.md`](./DATABASE.md) §17
- [x] **83 tables**, dont **74 tenant** ; **70 énumérations**
- [x] **RLS activée et forcée sur 100 % des tables** de `public`, 4 policies par table tenant
- [x] **39 fonctions `app.*`** : sécurité en `STABLE` + `SECURITY DEFINER` + `search_path`
      figé ; calcul des moyennes en `SECURITY INVOKER` pour subir la RLS de l'appelant
- [x] Périmètres **dérivés** du métier : parent ← `student_guardians`, élève ← soi-même,
      enseignant ← `teaching_assignments` + professeur principal
- [x] Stockage : 3 buckets **privés** (`documents`, `avatars`, `reports`), taille et types MIME
      plafonnés, lecture d'un fichier **héritée de la visibilité** de sa ligne `documents`
- [x] Seed : **131 permissions**, **9 rôles système**, 347 attributions, plan `STARTER`
- [x] Une seule génération d'emploi du temps à la fois sur la plateforme, garantie par un
      index unique partiel et non par une convention (ADR-014)
- [x] Journal d'audit **immuable** pour tout client
- [x] Types TypeScript générés par un **générateur maison** lisant `pg_catalog`
- [x] Job CI `rls`, actif dès qu'un secret `DATABASE_URL_TEST` est configuré

**Vérifié réellement — 57 tests contre la vraie base**

```
Couverture (9)   aucune table tenant sans RLS complète ; RLS forcée partout ;
                 fonctions de sécurité STABLE/DEFINER/search_path ; fonctions de calcul
                 non DEFINER ; vues en security_invoker ; PARENT et STUDENT sans
                 aucune permission ; buckets privés ; 4 policies sur storage.objects
Isolation (36)   A ne lit, n'écrit, ne modifie, ne supprime rien de B ; IDOR ;
                 parent : son enfant oui, le camarade de classe non ; notes visibles
                 seulement une fois publiées ; élève : soi-même uniquement ;
                 enseignant : ses classes ; Super Admin : tout ; établissement suspendu
                 en lecture seule ; audit_logs inaltérable
Stockage (12)    photos, documents et bulletins cloisonnés ; dépôt refusé hors du
                 préfixe schools/{id}/ ; chemin mal formé refusé sans erreur
```

**Trois défauts trouvés par les tests, avant toute mise en production**

| Défaut | Gravité | Correctif |
|---|---|---|
| La vue `v_lateness_records` s'exécutait avec les droits de son propriétaire et **contournait la RLS** : tout utilisateur aurait lu les retards de tous les établissements | Critique — fuite inter-tenant | `security_invoker = true` (0021), et un test vérifie désormais toutes les vues |
| Récursion infinie entre les policies `grades` et `assessments` | Majeure — déni de service sur toutes les notes | Fonctions `SECURITY DEFINER` de rupture de cycle (0029) |
| Le CLI Supabase ne démarre pas sur ce poste Windows | Bloquant pour les types | Générateur maison, sans dépendance |

**Point de vigilance tenu.** Une policy mal écrite ne se voit pas, elle laisse passer. Les deux
premiers défauts ci-dessus en sont exactement l'illustration : ni l'un ni l'autre n'aurait
produit d'erreur visible à l'écran.

---

## Lot 3 — Authentification et RBAC applicatif · **TERMINÉ le 11/09/2026**

**Livré**

- [x] **Connexion à trois identifiants** — email (personnel, `/login`), téléphone et matricule
      (parents, élèves, `/e/{slug}/login`), résolus vers l'email Auth synthétique (ADR-005)
- [x] Résolution **côté serveur uniquement**, via `service_role` et `app.resolve_login_email`,
      avec réponse générique et tentative même sur échec (anti-énumération)
- [x] Normalisation E.164 pure et testée (12 tests), partagée entre formulaire, import et synchro
- [x] `proxy.ts` (ex-`middleware.ts`, renommé pour Next 16) : rafraîchit la session,
      **impose la première connexion** globalement — y compris les Route Handlers —, renvoie
      un non-authentifié vers `/login`
- [x] Première connexion : nouveau mot de passe, drapeau `must_change_password` levé dans le
      **JWT** (app_metadata, donc lisible sans requête) et reflété dans `account_access`,
      événement `ACCOUNT_ACTIVATED`
- [x] Mot de passe oublié par email (personnel), callback `/auth/callback`
- [x] `getTenantContext` (mis en cache par requête) → `hasPermission`, `requirePermission`,
      `requireWritable`, périmètres dérivés
- [x] Espace établissement gardé (404 pour un non-membre), espace Super Admin gardé,
      dispatcher racine, sélecteur multi-établissement
- [x] Tableau de bord **adapté au rôle et filtré par RLS** : personnel → statistiques,
      enseignant → ses classes, parent/élève → son périmètre
- [x] `audit()` cloisonné (`service_role`), masquage des champs sensibles
- [x] Pages 404 et frontière d'erreur

**Vérifié réellement**

```
pnpm verify   types + lint + 18 tests unitaires verts
pnpm test:rls 57 tests d'isolation verts (migrations 0031-0033 incluses)
navigateur    admin email -> vue personnel (1/1/1) ; parent par « 01 01 01 01 01 »
              -> normalisation E.164 -> première connexion imposée -> vue « son enfant »
              uniquement ; parent sur /admin -> 404
pnpm test:e2e 4 parcours Playwright verts (redirection, connexion, erreur générique, 404)
```

**Écarts assumés**

| Sujet | Choix | Raison |
|---|---|---|
| **MFA TOTP** | Reportée | Supabase Auth la fournit nativement (enrôlement/défi) ; l'ajouter proprement — enrôlement, écran de défi, rattrapage — est un incrément à part. Les comptes Super Admin restent à protéger avant la vraie production ; noté au lot 10 (SaaS/sécurité). |
| **`canAccess` (périmètre objet)** | Fourni au niveau base | Les périmètres sont déjà appliqués par la RLS (fonctions `app.*`). Le helper applicatif `canAccess`/`requireAccess` sera ajouté au lot 4, quand des écrans manipuleront des identifiants d'objets à vérifier avant écriture. |
| Portails distincts enseignant/parent/élève | Un seul tableau de bord adaptatif | Le contenu s'adapte déjà au rôle. Des routes `(teacher)`/`(parent)`/`(student)` séparées n'ont d'intérêt qu'avec des écrans propres, aux lots 8-10. |

**Deux défauts trouvés par la vérification navigateur, avant tout commit**

| Défaut | Correctif |
|---|---|
| `supabase.rpc()` cherche dans `public` ; les fonctions vivent dans `app` → rôles et permissions vides (« Membre » au lieu d'« Administrateur », mauvaise vue), Super Admin non reconnu | Passerelles `public` minimales (0032, 0033) |
| Redirection post-connexion **côté client** (useEffect + router) non fiable — ne suivait pas la redirection serveur en cascade | Redirection **côté serveur** (`redirect()`) dans les actions |

---

## Lot 4 — Administration : structure · **EN COURS** (11/09/2026)

**Mécanique transverse livrée** — le patron CRUD réutilisé par tous les modules :
tableau serveur (recherche, tri par en-tête, pagination — aucune donnée au-delà de la page
n'atteint le navigateur), convention de formulaire (Zod partagé, erreurs par champ,
redirection serveur, bandeau de confirmation), garde de page par permission (404), navigation
filtrée (un module n'apparaît que si l'utilisateur y a droit **et** que la page existe),
primitives UI. Chaque écriture est cloisonnée par `ctx.school.id` (IDOR) et auditée.

| # | Module | État |
|---|---|---|
| 1 | **Création d'établissement** par le Super Admin | **fait** (partie 3) — vérifié en navigateur |
| 1 | Paramétrage `school_settings`, personnalisation visuelle | à faire |
| 2 | **Années scolaires + périodes** — activer/clôturer/rouvrir | **fait** — invariant « 1 seule courante » confirmé en base |
| 2 | Calendrier, vacances, fériés | à faire |
| 3 | **Cycles, niveaux, classes** + professeur principal | **fait** — vérifié en navigateur |
| 4 | **Matières** | **fait** — vérifié (code normalisé, conflit d'unicité) |
| 4 | **Programme par niveau** (`level_subjects`) | **fait** (partie 4) — coefficients + volumes, vérifié |
| 5 | **Enseignants** — téléphone E.164, archivage logique | **fait** |
| 5 | Qualifications (`teacher_subjects`), disponibilités | à faire |
| 6 | **Salles + types de salle** | **fait** — vérifié (salle rattachée à un type) |
| 6 | Équipements, disponibilités des salles | à faire |
| 7 | **Affectations d'enseignement** (`teaching_assignments`) | **fait** (partie 4) — unicité vérifiée |
| — | Import Excel/CSV avec assistant | à faire |

**Vérifié en navigateur** : création de matière (`fr` → `FR`), conflit de code, type + salle,
bascule d'année courante (invariant confirmé en base), classe avec niveau et PP + comptage
d'inscrits, création d'établissement par le Super Admin puis accès à son espace.

Trois commits : `feat(admin)` matières+salles, `feat(admin)` années+structure+classes+
enseignants, `feat(platform)` création d'établissement. CI verte à chaque fois.

**Reste à faire pour clôturer le lot** : affectations d'enseignement (le dernier lien
structurel), programme par niveau, paramétrage `school_settings`, et les compléments
secondaires (calendrier, qualifications, disponibilités, équipements, import).

**Terminé quand** — un établissement se configure de bout en bout sans toucher au code.

---

## Lot 5 — Élèves, responsables, gestion des accès

Application intégrale de [`ACCESS_MANAGEMENT.md`](./ACCESS_MANAGEMENT.md).

**Tâches**

- Élèves : dossier complet, matricule séquentiel atomique, photo, historique
- Responsables avec **rechercher-ou-créer** sur `(school_id, phone_e164)`
- Relation élève ↔ responsables, plusieurs des deux côtés
- Groupes pédagogiques et affectation des élèves
- **Orchestration d'inscription** en transaction unique : élève → inscription → responsables
  → comptes → `account_access` → `credential_deliveries`
- Écran de confirmation affichant l'état **réel** des comptes
- Module « Gestion des accès » : indicateurs cliquables, filtres, envoi simple, envoi groupé
  asynchrone, réinitialisation, désactivation, historique
- `SmsService` + `ConsoleProvider`, puis l'adaptateur du fournisseur retenu
- Worker `credentials.deliver` — secret généré **à l'envoi** (ADR-006)
- Import Excel/CSV : assistant de correspondance de colonnes, validation, prévisualisation,
  rapport de lignes rejetées

**Terminé quand** — le scénario complet de l'additif §39 se déroule : un élève inscrit crée
deux comptes parents distincts, un deuxième enfant réutilise les mêmes comptes, une
réinitialisation n'affecte pas l'autre parent, et aucun secret n'apparaît nulle part.

---

## Lot 6 — Emploi du temps manuel

**Volontairement avant le solveur.** Un emploi du temps saisi à la main et correctement validé
est déjà utilisable. Cela évite surtout de découvrir tard que le validateur et le solveur ne
disent pas la même chose.

**Tâches**

- Configuration horaire : jours ouvrés, grille de créneaux **par jour**, durées
- Exigences pédagogiques, cibles multiples, co-enseignement
- Registre de contraintes, écrans de configuration simple et avancée
- **Validateur indépendant TypeScript** — les 4 non-chevauchements, le recouvrement
  groupe/classe, capacités, types de salle, disponibilités
- Éditeur : glisser-déposer, changement de salle et d'enseignant, verrouillage, duplication,
  validation instantanée avec conflit lisible
- Vues classe, enseignant, groupe, salle, établissement, jour, semaine
- Impression et export PDF
- Versions : DRAFT → VALIDATED → PUBLISHED → ARCHIVED, comparaison
- Publication et matérialisation en `session_occurrences`

**Terminé quand** — un emploi du temps complet se saisit, se valide, se publie, et les cas
3, 4, 5, 9 et 12 des tests de l'additif §48 passent sur le validateur.

---

## Lot 7 — Solveur OR-Tools

**Tâches** — sous-phases de l'additif §60 :

| # | Contenu |
|---|---|
| 7.1 | `solver-service` : FastAPI, `/health`, Pydantic, Dockerfile, tests de contrat |
| 7.2 | Contrats croisés Zod ↔ Pydantic, JSON Schema vérifié en CI |
| 7.3 | Pré-contrôle arithmétique de faisabilité (TypeScript) |
| 7.4 | Génération des candidats, contraintes dures **unaires** uniquement |
| 7.5 | Modèle CP-SAT : `IntervalVar` + `NoOverlap` sur les 4 ressources |
| 7.6 | Contraintes dures complètes, recouvrement groupe/classe, simultanéité |
| 7.7 | Contraintes souples, pondération, objectif, score explicable |
| 7.8 | Séances verrouillées, occupations fixes, génération partielle |
| 7.9 | Diagnostic d'infaisabilité : noyau CP-SAT + traduction en français |
| 7.10 | Job asynchrone pg-boss, progression par étapes réelles |
| 7.11 | Écran de génération et écran de résultat |
| 7.12 | Les 14 tests de l'additif §48, jeux SMALL / MEDIUM / LARGE |

**Terminé quand** — une génération produit une version DRAFT valide, le validateur du lot 6
la confirme indépendamment, et un cas infaisable produit une explication en français citant
des noms réels.

**Contrainte VPS.** Conteneur bridé, `num_search_workers=1`, une génération à la
fois (index partiel `generation_jobs_single_running`). Les temps mesurés sur `LARGE`
détermineront s'il faut passer à 2 ou 4 vCPU.

**État — livré (contrat v1.0.0)** ✅

- 7.1 `solver-service` FastAPI (`/health`, `/solve`, `/diagnose`), Pydantic, Dockerfile,
  `docker-compose` (127.0.0.1 only), 18 tests pytest. ✅
- 7.3 Pré-contrôle arithmétique (enseignant / classe / domaine vide), avant tout appel solveur. ✅
- 7.4 Génération des candidats (dispos enseignant, jours, tenue dans la journée) — unaires. ✅
- 7.5 Modèle CP-SAT `IntervalVar` + `NoOverlap` enseignant / classe / groupe / salle. ✅
- 7.6 (partiel) recouvrement groupe/classe multi-classes (§30, §16), co-enseignement. ✅
- 7.8 Séances verrouillées + occupations fixes (paramètres du contrat). ✅
- 7.9 Diagnostic d'infaisabilité : noyau CP-SAT (hypothèses) + traduction française (noms réels). ✅
- 7.11 Écrans : exigences (synchro depuis les affectations + édition), génération, résultat,
  historique des jobs. ✅
- Interface `ScheduleSolver` + `OrToolsSolver` (client HTTP, revalidation Zod), fabrique `getSolver()`. ✅
- Vérifié de bout en bout (Supabase réel + service OR-Tools réel) : synchro → génération OPTIMAL
  → version DRAFT « Aucun conflit » confirmée par le validateur indépendant ; cas sur-contraint →
  diagnostic « Enseignant … : 40 créneaux nécessaires, 20 disponibles ». ✅

**Reporté — contrat v1.1** (voir `docs/SOLVER_API.md` §10) : 7.7 contraintes souples / objectif /
score, 7.2 garde-fou JSON Schema en CI, 7.10 job **asynchrone** pg-boss (la génération est
aujourd'hui **synchrone et bornée**, adaptée au mono-vCPU), 7.12 jeux SMALL/MEDIUM/LARGE complets,
`allowedDurations`, endpoint `/validate`.

---

## Lot 8 — Notes et évaluations

**Tâches**

- Barèmes configurables, bandes de notation lettrée, `/20` comme simple défaut
- Types d'évaluation paramétrables
- Évaluations, saisie de notes unitaire et en masse par classe
- **Fonctions SQL de calcul** : moyennes pondérées, arrondis, note éliminatoire,
  compensation, traitement des absences, classements par matière et généraux
- Validation puis publication des notes ; verrouillage pour l'enseignant après validation
- Vues enseignant, direction, parent, élève

**Terminé quand** — les moyennes d'une classe réelle sont exactes à l'arrondi près, et
qu'un enseignant ne peut modifier ni les notes d'un collègue, ni une note déjà validée.

**Point de vigilance.** Les règles de moyenne varient d'un établissement à l'autre. Tout passe
par `school_settings.grading`, rien n'est codé en dur. Les tests couvrent chaque combinaison
d'arrondi et de compensation.

---

## Lot 9 — Présence et fonctionnement hors ligne

**Tâches**

- Appel rattaché aux `session_occurrences`, écran enseignant « mes cours du jour »
- Statuts configurables, retards avec durée, commentaires
- Justificatifs et circuit d'approbation
- **PWA** : service worker, cache 7 jours du périmètre RBAC de l'enseignant
- File IndexedDB, états `LOCAL_SAVED` → `PENDING_SYNC` → `SYNCED`, bouton « Synchroniser »
- Endpoint `/api/sync/operations`, idempotence par `UNIQUE(school_id, client_operation_id)`
- Résolution de conflit présentée à l'utilisateur, jamais d'écrasement automatique
- Inscription hors ligne (rejoint le lot 5), matricule attribué par le serveur
- Tableaux de bord d'absences, alertes d'absentéisme

**Terminé quand** — un appel se fait en mode avion, se synchronise au retour du réseau, et
dix rejeux ne créent qu'un seul enregistrement.

---

## Lot 10 — Bulletins, conseils, portails

**Tâches**

- Modèles de bulletin configurables, éditeur de gabarit
- Génération avec **gel des instantanés** (nom de matière, nom d'enseignant, moyennes)
- Rendu PDF Chromium depuis les routes `/print`, dépôt dans Storage
- Conseils de classe : préparation, statistiques, appréciations, décisions, distinctions
- Publication et mise à disposition
- Portails **parent** et **élève** complets
- Tableaux de bord de tous les rôles, avec graphiques
- Exports Excel, CSV, PDF respectant les permissions

**Terminé quand** — un bulletin trimestriel exact est publié, et un parent le consulte pour
ses enfants et uniquement pour eux.

**Contrainte VPS.** `PDF_MAX_CONCURRENCY=1`. Une classe de 60 bulletins se génère en tâche de
fond avec une barre de progression réelle, pas dans une requête HTTP.

---

## Lot 11 — Communication

Notifications `IN_APP`, centre de notifications, préférences, annonces ciblées par rôle,
niveau et classe, puis push web. Messagerie directe si le besoin se confirme.

Rappel ADR-010 : **aucun** événement scolaire ne part en SMS.

---

## Lot 12 — SaaS

Plans, quotas, fonctionnalités par plan, dérogations par établissement, abonnements, relevés
de consommation, paiements, suspension et réactivation automatiques, tableau de bord Super
Admin, support.

---

## Lot 13 — Couche IA

Explication de statistiques, analyse des conflits d'emploi du temps, propositions
d'appréciations, détection d'anomalies, assistant d'administration.

**Contrainte absolue** — exécution sous l'identité de l'utilisateur, uniquement sur des données
déjà retournées par des requêtes autorisées. Ni `service_role`, ni accès direct à la base.

---

## Méthode, à chaque lot

1. Inspecter l'existant avant de modifier
2. Proposer l'approche si elle s'écarte des documents
3. Implémenter par incréments cohérents, un commit par ensemble logique
4. Tester : unitaire, RLS, intégration, e2e selon le lot
5. `pnpm typecheck`, `pnpm lint`
6. Vérifier RBAC, RLS et isolation tenant
7. Résumer les changements

Format de commit : `feat(schedule): add hard constraints`, `fix(rls): prevent cross-school access`.

---

## Risques identifiés

| Risque | Probabilité | Impact | Traitement |
|---|---|---|---|
| **1 vCPU saturé par le solveur** | élevée | 8 sites de production ralentis | Bridage Docker, file singleton, upgrade recommandé (`DEPLOYMENT.md` §2) |
| Policy RLS oubliée sur une table | moyenne | fuite inter-établissement | Tests générés depuis le catalogue : impossible d'oublier sans casser la CI |
| Divergence validateur TS ↔ solveur Python | moyenne | emploi du temps invalide publié | Validation indépendante bloquante, mêmes cas testés des deux côtés |
| Doublons de comptes parents | moyenne | parents en double, SMS en double | Unicité en base, rechercher-ou-créer, idempotence sur `client_operation_id` |
| Fuite du mot de passe temporaire | faible | compromission de comptes | Jamais persisté, généré à l'envoi (ADR-006), liste de refus dans l'audit |
| Règles de moyenne inadaptées à un établissement | élevée | bulletins faux | Tout configurable, aucune règle en dur, tests par combinaison |
| Dérive de périmètre du solveur | élevée | lot 7 sans fin | Sous-phases 7.1 à 7.12 avec critère de sortie explicite |
| Build saturant le VPS en heure de pointe | moyenne | ralentissement visible | Build en heures creuses, ou build local puis envoi de l'artefact |

---

## Prochaine action

Le lot 1 peut démarrer dès que j'ai **l'URL du dépôt git**. Le lot 2 démarre dès que j'ai les
**quatre valeurs Supabase**. À défaut, je peux commencer le lot 1 en local et initialiser le
dépôt plus tard, sans rien perdre.
