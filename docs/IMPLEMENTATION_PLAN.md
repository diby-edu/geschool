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
| **2** | Base de données et RLS | 27 migrations, tests d'isolation verts | Supabase |
| **3** | Authentification et RBAC | 5 profils se connectent au bon espace | lot 2 |
| **4** | Administration : structure | classes, matières, enseignants, salles | lot 3 |
| **5** | Élèves, parents, accès | inscription → comptes → SMS de bout en bout | lot 4 |
| **6** | Emploi du temps manuel | trame saisie, validée, publiée | lot 4 |
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

## Lot 2 — Base de données et RLS

**Le lot le plus important.** Aucune interface ne s'écrit tant qu'il n'est pas verrouillé.

**Tâches**

- Migrations `0001` à `0027` de [`DATABASE.md`](./DATABASE.md) §17
- Fonctions `app.*` — toutes `STABLE`, `SECURITY DEFINER`, `search_path` figé
- RLS **activée et forcée** sur chaque table tenant, 4 policies par table
- Policies Storage sur les 3 buckets privés, mêmes fonctions que les tables
- Index de [`DATABASE.md`](./DATABASE.md) §16, en priorité
  `school_memberships (user_id, school_id, status)` dont dépend chaque policy
- Seed : 120+ permissions, 9 rôles système, pack pays `CI`
- **Harnais RLS généré depuis le catalogue Postgres** : il énumère les tables portant un
  `school_id` et vérifie que chacune possède ses 4 policies. Une table oubliée fait
  échouer la CI — c'est le garde-fou qui tient sur la durée.
- Tous les scénarios de [`RBAC.md`](./RBAC.md) §7 avec deux vrais utilisateurs de deux écoles

**Terminé quand** — la suite d'isolation passe intégralement et qu'aucune table tenant
n'échappe à la RLS.

**Point de vigilance.** Une policy mal écrite ne se voit pas : elle laisse simplement passer.
D'où la génération automatique des tests plutôt que leur écriture à la main.

---

## Lot 3 — Authentification et RBAC applicatif

**Tâches**

- Connexion à trois identifiants — email, téléphone, matricule (ADR-005)
- Résolution serveur `(school_id, identifiant) → auth_email`, jamais côté client
- Normalisation E.164, fonction pure et testée, **partagée** par formulaire, import et synchro
- Middleware : slug → tenant, appartenance active, **404** si absente
- **Première connexion imposée**, y compris sur les Route Handlers
- Mot de passe oublié ; MFA TOTP obligatoire pour les Super Admins
- `getTenantContext`, `hasPermission`, `requirePermission`, `canAccess`, résolution des scopes
- Sélecteur d'établissement pour les comptes multi-appartenance
- Coquilles des 5 espaces, avec sidebar, en-tête, fil d'Ariane
- `audit_logs` écrit dès la première mutation

**Terminé quand** — cinq profils réels se connectent, atterrissent au bon endroit, et qu'un
test automatisé prouve qu'aucun ne franchit son périmètre.

---

## Lot 4 — Administration : structure

**Tâches** — dans cet ordre, chacune étant un CRUD complet et réellement fonctionnel :

1. Établissements et paramétrage — espace Super Admin, personnalisation visuelle,
   `school_settings` typés Zod, écrans simple et avancé (§59)
2. Années scolaires, périodes, calendrier, vacances et fériés
3. Cycles, niveaux, classes, professeur principal
4. Matières, programme par niveau (`level_subjects`)
5. Enseignants, qualifications, disponibilités
6. Salles, types, équipements, disponibilités
7. Affectations d'enseignement

**Transverse** — le composant `DataTable` réutilisable : recherche, tri, filtres, pagination
**serveur**, sélection multiple, actions groupées, export, colonnes configurables. Il est
écrit une fois ici et sert partout ensuite.

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

**Contrainte VPS.** Conteneur bridé à 0,5 vCPU, `num_search_workers=1`, une génération à la
fois. Les temps mesurés sur `LARGE` détermineront s'il faut passer à 2 ou 4 vCPU.

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
