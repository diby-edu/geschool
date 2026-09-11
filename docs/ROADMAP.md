# Feuille de route

Ordre de développement. Chaque phase se termine par un incrément **réellement fonctionnel** :
pas de bouton mort, pas de « bientôt disponible », pas de donnée fictive présentée comme réelle
(§77). Ce qui n'est pas encore livré est absent de l'interface, pas grisé.

Convention de commit : `type(scope): description` — `feat(schedule): add hard constraints`.

---

## Phase 0 — Fondations · *terminée*

- [x] Inspection du projet et de la machine
- [x] `docs/DECISIONS.md` — 13 arbitrages, conflits du cahier des charges signalés
- [x] `docs/ARCHITECTURE.md`
- [x] `docs/DATABASE.md`
- [x] `docs/RBAC.md`
- [x] `docs/SCHEDULE_ENGINE.md`
- [x] `docs/SOLVER_API.md`
- [x] `docs/ACCESS_MANAGEMENT.md`
- [x] `docs/OFFLINE_SYNC.md`
- [x] `docs/ROADMAP.md`

---

## Phase 1 — Socle technique

Initialiser sans coder de métier.

- Next.js 16, TypeScript strict, Tailwind 4, ESLint, Prettier
- shadcn/ui, thème et jetons de design, mode sombre
- `@supabase/ssr` : clients navigateur, serveur, admin cloisonné (ADR-013)
- Runner de migrations `scripts/migrate.mjs` + `schema_migrations`
- Génération des types depuis la base
- Vitest, Playwright, harnais RLS
- `docker-compose.yml`, `ecosystem.config.cjs`, variables d'environnement documentées
- Git, `.gitignore`, hooks de pré-commit, CI

**Terminée quand** : `pnpm dev` démarre, `pnpm test` passe, une migration vide s'applique et se
rejoue sans effet.

---

## Phase 2 — Base de données et sécurité

Le cœur. Rien ne se construit dessus tant qu'elle n'est pas verrouillée.

- Migrations `0001` à `0027` de `DATABASE.md`
- Fonctions `app.*` de sécurité, toutes `STABLE` et `SECURITY DEFINER`
- RLS activée **et forcée** sur chaque table tenant, quatre policies par table
- Policies Storage alignées sur les mêmes fonctions
- Seed : permissions, rôles système, pack pays `CI`
- **Suite de tests RLS générée depuis le catalogue** : une table sans policy fait échouer la CI
- Tous les scénarios du §69 et de `RBAC.md` §7

**Terminée quand** : la suite d'isolation passe intégralement et qu'aucune table tenant n'échappe
à la RLS. Aucune interface n'est écrite avant ce point.

---

## Phase 3 — Authentification et RBAC applicatif

- Connexion à trois identifiants : email, téléphone, matricule (ADR-005)
- Résolution `(school_id, identifiant) -> auth_email`
- Middleware : slug -> tenant, appartenance, 404 si absent
- **Première connexion imposée**, y compris sur les Route Handlers
- Mot de passe oublié, MFA TOTP pour les rôles sensibles
- `getTenantContext`, `hasPermission`, `requirePermission`, `canAccess`, résolution des scopes
- Sélecteur d'établissement pour les comptes multi-appartenance
- Coquilles des espaces : plateforme, établissement, enseignant, parent, élève
- `audit_logs` opérationnel dès la première écriture

**Terminée quand** : cinq profils réels se connectent, atterrissent au bon endroit, et qu'aucun
ne voit quoi que ce soit hors de son périmètre.

---

## Phase 4 — Administration de l'établissement

Le chemin complet du §79, jusqu'aux salles.

1. Établissements et paramétrage — Super Admin, personnalisation visuelle, `school_settings`
2. Années scolaires, périodes, calendrier, vacances et fériés
3. Cycles, niveaux, classes
4. Matières, programme par niveau
5. Enseignants, qualifications, disponibilités
6. **Élèves et responsables** avec l'orchestration complète d'`ACCESS_MANAGEMENT.md`
7. Groupes pédagogiques et affectation des élèves
8. Affectations d'enseignement
9. Salles, types, équipements, disponibilités
10. Module **Gestion des accès** : indicateurs, filtres, envoi simple et groupé, réinitialisation
11. Import Excel/CSV avec assistant de correspondance de colonnes et prévisualisation
12. Tableaux : recherche, tri, filtres, pagination serveur, sélection multiple, export

**Terminée quand** : un établissement se configure de bout en bout sans toucher au code, et
qu'un élève inscrit déclenche réellement la création des comptes et l'envoi des identifiants.

---

## Phase 5 — Emploi du temps

La phase la plus longue. Sous-phases de l'additif solveur §60.

| # | Contenu |
|---|---|
| 5.1 | Configuration horaire, grille de créneaux, jours ouvrés |
| 5.2 | Exigences pédagogiques, cibles multiples, co-enseignement |
| 5.3 | Registre de contraintes, interface de configuration simple et avancée |
| 5.4 | **Validateur indépendant TypeScript** et détection de conflits — avant tout solveur |
| 5.5 | Éditeur manuel : glisser-déposer, verrouillage, validation instantanée |
| 5.6 | Vues classe, enseignant, groupe, salle, établissement, jour, semaine, impression, PDF |
| 5.7 | Service Python : squelette FastAPI, `/health`, contrat Pydantic, tests de contrat |
| 5.8 | Modèle CP-SAT de base : intervalles, non-chevauchement des quatre ressources |
| 5.9 | Contraintes dures complètes, y compris recouvrement groupe/classe |
| 5.10 | Contraintes souples, pondération, objectif, score |
| 5.11 | Séances verrouillées, occupations fixes, génération partielle |
| 5.12 | Pré-contrôle de faisabilité et diagnostic d'infaisabilité en français |
| 5.13 | Job asynchrone, progression par étapes, écran de génération |
| 5.14 | Versions : DRAFT, VALIDATED, PUBLISHED, ARCHIVED, comparaison |
| 5.15 | Publication et matérialisation en `session_occurrences` |
| 5.16 | Les 14 tests de l'additif §48, jeux SMALL / MEDIUM / LARGE |

**Ordre volontaire** : 5.4 et 5.5 avant le solveur. Un emploi du temps saisi à la main et
correctement validé est déjà utilisable ; la génération automatique est un accélérateur, pas
un prérequis. Cela évite aussi de découvrir tard que le validateur et le solveur divergent.

**Terminée quand** : un établissement génère, corrige, valide et publie un emploi du temps
complet, et que chaque conflit est expliqué en français.

---

## Phase 6 — Évaluations et notes

- Barèmes configurables, `/20` n'étant qu'un défaut
- Types d'évaluation paramétrables
- Évaluations, saisie de notes, saisie en masse par classe
- Fonctions SQL de moyennes : coefficients, arrondis, éliminatoire, compensation, absences
- Classements par matière et généraux
- Validation puis publication des notes
- Vues enseignant, direction, parent, élève

**Terminée quand** : les moyennes d'une classe réelle sont exactes, arrondi compris, et que
l'enseignant ne peut pas modifier les notes d'un collègue.

---

## Phase 7 — Présence

- Appel rattaché aux `session_occurrences`
- Écran enseignant : cours du jour, classe ou groupe, liste des élèves
- Statuts configurables, retards avec durée
- Justificatifs et circuit d'approbation
- **Mode hors ligne complet** avec file de synchronisation et bouton explicite (ADR-009)
- Tableaux de bord des absences, alertes d'absentéisme
- Vues parent et élève

**Terminée quand** : un appel se fait avion activé, se synchronise au retour du réseau, et qu'un
rejeu ne crée aucun doublon.

---

## Phase 8 — Bulletins, conseils, portails

- Modèles de bulletin configurables par établissement
- Génération, gel des instantanés, PDF Chromium, dépôt dans Storage
- Conseils de classe : préparation, statistiques, appréciations, décisions, distinctions
- Publication et mise à disposition des bulletins
- Finalisation des portails **parent** et **élève**
- Tableaux de bord de tous les rôles, avec graphiques
- Exports Excel, CSV, PDF respectant les permissions

**Terminée quand** : un bulletin trimestriel complet et exact est publié, et qu'un parent le
consulte pour ses enfants — et uniquement pour eux.

---

## Phase 9 — Communication

- Notifications `IN_APP` : note publiée, absence, retard, bulletin, annonce, changement d'EDT
- Centre de notifications, préférences par utilisateur
- Annonces ciblées par rôle, niveau, classe
- Push web (service worker déjà présent depuis la phase 7)
- Messagerie directe, si le besoin est confirmé

Rappel ADR-010 : **aucun** événement scolaire ne part en SMS. Le SMS reste réservé aux
identifiants.

---

## Phase 10 — SaaS

- Plans, quotas, fonctionnalités par plan, dérogations par établissement
- Abonnements : essai, actif, impayé, suspendu, résilié
- Relevés de consommation : élèves, utilisateurs, stockage, SMS
- Paiements : Mobile Money, virement, espèces — selon Q2 de `DECISIONS.md`
- Suspension et réactivation automatiques d'un établissement
- Tableau de bord Super Admin : établissements, revenus, activité, alertes, erreurs
- Support et consultation des journaux

---

## Phase 11 — Couche IA

Après sécurisation complète des données, jamais avant.

- Explication de statistiques et de résultats
- Analyse des conflits d'emploi du temps en langage naturel
- Propositions d'appréciations de bulletin, toujours révisables
- Détection d'anomalies : chute de moyenne, absentéisme, incohérences
- Assistant d'administration

**Contrainte absolue.** L'IA s'exécute sous l'identité de l'utilisateur et ne reçoit que les
données déjà retournées par des requêtes autorisées. Ni `service_role`, ni accès direct à la
base, ni contournement du RBAC, de la RLS ou de l'isolation tenant.

---

## Jalons

| Jalon | Contenu | Ce qu'un établissement peut faire |
|---|---|---|
| **M1** | Phases 1-3 | Se connecter, avec une isolation prouvée par les tests |
| **M2** | Phase 4 | Tout configurer : classes, élèves, parents, enseignants, comptes, accès |
| **M3** | Phase 5 | Construire et publier son emploi du temps |
| **M4** | Phases 6-7 | Noter et faire l'appel, y compris hors connexion |
| **M5** | Phase 8 | Éditer les bulletins, ouvrir les portails parent et élève |
| **M6** | Phases 9-10 | Communiquer, et la plateforme peut être commercialisée |
| **M7** | Phase 11 | Assistance intelligente |

M2 correspond au chemin complet du §79 jusqu'aux salles. M5 est le premier jalon où
l'établissement peut se passer entièrement de son ancien système.

---

## Règles de travail (§67)

Avant chaque modification d'ampleur :

1. inspecter le projet et les fichiers concernés
2. comprendre l'architecture en place
3. identifier les dépendances et les impacts
4. proposer l'approche
5. implémenter
6. tester
7. corriger
8. vérifier TypeScript, puis le lint
9. vérifier la sécurité : RBAC, RLS, isolation tenant
10. résumer les changements

Ne pas réécrire un fichier qui fonctionne. Ne pas créer de doublon. Ne pas supprimer une
fonctionnalité sans justification. Toujours une source de vérité unique.
