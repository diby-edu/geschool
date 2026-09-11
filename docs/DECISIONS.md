# Registre des décisions d'architecture (ADR)

> Ce document est la **source de vérité des arbitrages**. Toute décision ultérieure qui
> contredit une entrée ci-dessous doit d'abord amender cette entrée.

---

## Contexte initial (inspection du 10/09/2026)

| Élément | Constat |
|---|---|
| `H:\SAAS ESTION SCOLAIRE` | Dossier vide. **Projet greenfield**, aucun code, aucun schéma, aucun projet Supabase existant. |
| Node / npm / pnpm / git | 24.11.1 / 11.6.2 / 11.1.1 / 2.52 |
| Python | 3.12.10 (natif Windows) |
| Docker / WSL / Supabase CLI / psql | **Absents** |
| Référence interne réutilisable | `C:\Users\konoi\qr-saas` : Next 16 + React 19 + `@supabase/ssr` + Tailwind 4 + Playwright + next-intl + migrations SQL versionnées par un runner `pg` maison. |

Conséquence : aucune contrainte de rétrocompatibilité. Le §67 du cahier des charges
(« ne pas réécrire de fichiers fonctionnels ») s'appliquera à partir de la phase 2.

---

## ADR-001 — Hébergement : VPS Linux, Docker + PM2 · ACCEPTÉE

**Décision.** Déploiement auto-hébergé sur VPS Linux. Pas de plateforme serverless.

**Pourquoi.** La génération d'emploi du temps peut durer 30 à 300 secondes (ADR-008) et le
service solveur est un conteneur Python. Aucun plafond d'exécution, réseau privé entre
services, cron natif, coût prévisible.

**Conséquences.**
- Le solveur tourne en **job asynchrone** dès la V1, pas en requête HTTP synchrone.
- La file de jobs est **`pg-boss`** (adossée à Postgres) : pas de Redis à opérer.
- La génération PDF utilise **Chromium headless** (fidélité HTML/CSS des bulletins).
- Docker et WSL sont absents de la machine de développement : en local le service Python
  tourne en `venv` + `uvicorn`, Docker n'intervient qu'au déploiement.

---

## ADR-002 — Emploi du temps : trame hebdomadaire + occurrences datées · ACCEPTÉE

**Problème.** Le §21 décrit `schedule_sessions` comme une grille hebdomadaire, le §40 exige
que l'appel soit rattaché à une séance **datée**. Les deux sont incompatibles en l'état.

**Décision.** Deux niveaux distincts :

```
schedule_sessions      TRAME  « Mardi, créneau 3, Maths, 4e3, Prof X, Salle 12 »
        |                     ~250 lignes par établissement et par version
        |  projection sur le calendrier scolaire
        v
session_occurrences    OCCURRENCE DATÉE  « Mardi 14 octobre 2026, 08:00-09:50 »
                       générée à la publication, vacances et fériés exclus
```

- `schedule_sessions` reste la **source de vérité** de la structure (additif solveur §24).
- `session_occurrences` porte le **réel** : annulation d'un cours, remplacement ponctuel
  d'un enseignant, déplacement d'une seule séance, salle exceptionnelle.
- L'appel, les absences et les retards s'attachent à l'**occurrence**, jamais à la trame.

**Rejeté.** Sessions datées uniquement (40 000+ lignes/an/école, la notion de version publiée
disparaît). Trame seule (annulations et remplacements non modélisables).

---

## ADR-003 — Isolation tenant par chemin d'URL · ACCEPTÉE

**Décision.** Un seul domaine. Toutes les routes établissement sont préfixées :
`https://app.exemple.com/e/{slug}/...`

**Pourquoi.** Un seul certificat, pas de DNS wildcard, cookies de session simples,
environnement local trivial. Le slug est **résolu et vérifié côté serveur** à chaque requête ;
il n'est jamais une preuve d'autorisation, seulement une désignation.

**Conséquences.**
- Le middleware résout `slug -> school_id`, puis vérifie l'appartenance active de l'utilisateur.
- Un slug inconnu, ou connu mais sans appartenance, renvoie **404** et jamais 403 : ne pas
  révéler l'existence d'un établissement à qui n'y appartient pas.
- Un utilisateur rattaché à plusieurs établissements bascule en changeant de slug.

---

## ADR-004 — Contexte cible : Afrique francophone · ACCEPTÉE

**Décision.** Valeurs par défaut orientées Afrique de l'Ouest et Centrale francophone :
notation `/20` avec coefficients et mentions, trimestres, matricule élève, rôles
`DIRECTEUR` / `CENSEUR` / `ÉDUCATEUR` / `SURVEILLANT`, devise XOF, téléphones E.164 (`+225…`),
locale `fr-CI`, fuseau `Africa/Abidjan`.

**Non négociable.** Ce ne sont que des **valeurs par défaut de seed**, jamais des règles codées
en dur. Un établissement peut tout redéfinir (§57). Les packs pays supplémentaires seront des
jeux de seed, pas du code.

---

## ADR-005 — Identités : email synthétique, identifiant humain distinct · ACCEPTÉE

**Conflit réel signalé.** L'additif « comptes » impose :
- identifiant parent = **numéro de téléphone**, unique **par établissement** :
  `UNIQUE(school_id, normalized_phone)` ;
- identifiant élève = **matricule**, unique par établissement ;
- **aucun OTP** à la connexion.

Or Supabase Auth impose une unicité **globale** du téléphone sur tout le projet, et son
fournisseur `phone` est conçu pour l'OTP. Deux établissements ayant le même parent entreraient
en collision, et l'authentification par téléphone imposerait l'OTP explicitement refusé.

**Décision.** L'identité Supabase Auth est un **email synthétique non routable**, invisible de
l'utilisateur. L'identifiant humain vit dans notre schéma.

```
Parent     saisit  +2250101010101 + mot de passe
           serveur résout (school_id, phone) -> p.<uuid>@accounts.invalid
           supabase.auth.signInWithPassword({ email: synthétique, password })

Élève      saisit  ELV-2026-008742 + mot de passe
           serveur résout (school_id, matricule) -> s.<uuid>@accounts.invalid

Personnel  email réel + mot de passe (inchangé)
```

**Conséquences.**
- `UNIQUE(school_id, login_identifier)` est respecté à la lettre.
- Aucun SMS n'est nécessaire *pour se connecter*. Le SMS ne sert qu'à transmettre le secret
  initial (additif §11), exactement comme demandé.
- Le domaine `.invalid` est réservé par la RFC 2606 : aucun message ne pourra jamais y être
  livré, donc aucune fuite possible.
- **Compromis assumé** : un parent ayant des enfants dans deux établissements du réseau aura
  deux comptes distincts. C'est la conséquence directe du `UNIQUE(school_id, phone)` exigé.
  Réversible plus tard sans casse, via une table de liaison d'identités.

---

## ADR-006 — Le mot de passe temporaire est généré à l'envoi, jamais avant · ACCEPTÉE

**Problème.** L'additif exige un mot de passe temporaire transmis par SMS **et** interdit tout
stockage en clair (§21). Or un SMS en attente d'envoi doit bien contenir ce secret.

**Décision.** Le secret n'est **jamais persisté, sous aucune forme**. Il est créé au moment
exact du traitement de l'envoi.

```
Création du compte    mot de passe aléatoire 32 octets, jeté immédiatement
                      must_change_password = true, activation NOT_ACTIVATED
                      ligne credential_deliveries au statut PENDING, sans secret

Traitement de l'envoi le worker génère le secret temporaire en mémoire
                      Admin API Supabase : mise à jour du mot de passe
                      rendu du SMS, envoi, le secret sort de la mémoire
                      statut SENT. Aucune trace en base, en log, en audit
```

Un échec définitif ne rejoue pas l'ancien secret : un renvoi en régénère un neuf. Cela satisfait
à la fois le mode automatique et le mode manuel (additif §17).

---

## ADR-007 — Super Admin : accès total permanent, lecture et écriture · ACCEPTÉE

**Décision (choix explicite du porteur du projet).** Le Super Admin plateforme dispose d'un
accès complet en lecture **et en écriture** sur tous les établissements, sans session de support
ni limitation de durée. Techniquement, `app.is_platform_admin()` court-circuite toutes les
policies RLS.

**Risque signalé, accepté.** Un unique compte compromis expose l'intégralité des établissements,
et un établissement ne peut pas distinguer une écriture de la plateforme d'une écriture de son
propre personnel sans consulter le journal.

**Garde-fous conservés**, qui relèvent des §52 et §53 du cahier des charges et non de l'arbitrage :
- **MFA obligatoire** sur tout compte `PLATFORM_ADMIN` (§53, « MFA pour rôles sensibles ») ;
- **journalisation intégrale** de toute action plateforme dans `audit_logs`, avec le drapeau
  `actor_is_platform_admin` ;
- le rôle est attribué exclusivement par migration ou par un autre Super Admin, jamais depuis
  l'interface d'un établissement.

---

## ADR-008 — Solveur : OR-Tools CP-SAT en service Python, derrière une abstraction · ACCEPTÉE

**Décision.** Conforme à l'additif solveur. `ScheduleSolver` est une interface TypeScript,
`OrToolsSolver` l'implémente en appelant un service **FastAPI + OR-Tools CP-SAT** sur le réseau
privé. Aucun module métier n'appelle Python directement.

**Amendements techniques apportés à l'additif**, détaillés dans `SCHEDULE_ENGINE.md` :

1. **Diagnostic d'infaisabilité (additif §29).** C'est le point le plus difficile du projet.
   CP-SAT ne dit pas *pourquoi* c'est infaisable. Deux mécanismes combinés :
   - un **pré-contrôle arithmétique en TypeScript** avant tout appel au solveur (volumes contre
     disponibilités, créneaux contre séances requises, capacité des salles obligatoires). Il
     capte la grande majorité des cas réels avec une explication parfaite et instantanée ;
   - pour le reste, un **second solve dédié sans objectif**, où chaque contrainte dure relaxable
     est posée derrière un littéral d'hypothèse, puis lecture du noyau d'infaisabilité via
     `SufficientAssumptionsForInfeasibility`. Séparer ce solve du solve d'optimisation évite
     toute interaction entre hypothèses et fonction objectif.

2. **Pré-filtrage des candidats (additif §8) : à limiter.** Ne pré-filtrer que sur les contraintes
   dures **unaires** : indisponibilité enseignant, jours et plages autorisés, type de salle,
   capacité. Ne jamais pré-filtrer sur des interactions entre séances, c'est le travail du
   solveur et l'élagage anticipé supprimerait des solutions valides.

3. **Réduire les variables en pré-affectant ce qui est déjà déterminé.** L'enseignant vient de
   `teaching_assignments`, la durée vient de `teaching_requirements`. Le solveur ne décide donc
   que du **créneau de départ** et de la **salle**. Modélisation en `IntervalVar` + `NoOverlap`
   par ressource (enseignant, classe, groupe, salle) : c'est l'idiome CP-SAT, et il absorbe
   nativement les durées variables.

4. **Asynchrone dès le départ**, et non « synchrone d'abord ». Sur VPS le coût est nul
   (`pg-boss` + worker PM2) et rendre asynchrone après coup coûterait cher.

5. **Le service Python reste sans état.** Il ne connaît ni Supabase ni le métier. Il reçoit un
   `ScheduleInput` normalisé et rend un `ScheduleSolution`. Contrat figé dans `SOLVER_API.md`.

---

## ADR-009 — Fonctionnement hors connexion : appel et inscription · ACCEPTÉE

**Décision.** PWA avec **écriture locale durable** et synchronisation différée, sur deux modules
seulement.

| Module | Hors ligne | Justification |
|---|---|---|
| Appel et absences | **Oui, complet** | Se fait en classe, réseau souvent absent (exigence explicite) |
| Inscription élève | **Oui, complet** | Saisie en salle d'inscription (additif comptes §28) |
| Tout le reste | Non | Consultation en ligne. Le hors-ligne ajouterait un risque de divergence sans bénéfice |

- File locale IndexedDB, bouton **« Synchroniser »** explicite en plus de la synchronisation
  automatique au retour du réseau, avec un état lisible :
  `LOCAL_SAVED` -> `PENDING_SYNC` -> `SYNCED`.
- **Idempotence obligatoire** : chaque opération porte un `client_operation_id` (UUID généré sur
  l'appareil). Le serveur déduplique via `UNIQUE(school_id, client_operation_id)` et renvoie le
  résultat existant plutôt que de recréer (additif §29).
- Une inscription synchronisée ne prétend jamais que les comptes serveur existent tant que la
  synchronisation n'a pas abouti.

---

## ADR-010 — Le SMS n'est pas le canal de notification scolaire · ACCEPTÉE

**Conflit signalé et tranché.** Le §44 du cahier des charges liste SMS et WhatsApp parmi les
canaux de notification. L'additif comptes (§13 et §35) l'interdit formellement. Par la règle de
priorité de l'additif (§37), **l'additif l'emporte**.

- Notifications scolaires (note, absence, bulletin, annonce, changement d'emploi du temps) :
  canal **`IN_APP`** en V1, **`PUSH`** ensuite.
- **SMS** : réservé à la transmission des identifiants et aux réinitialisations d'accès.
- L'énumération `notification_channel` conserve `SMS`, `WHATSAPP` et `EMAIL` pour l'avenir, mais
  ces canaux sont désactivés par configuration et aucun code de la V1 ne les emprunte.

---

## ADR-011 — Source de vérité unique : trois tables du cahier des charges écartées · ACCEPTÉE

Le §56 liste des tables qui, prises littéralement, violeraient le §3 (« source de vérité unique »).

| Table listée | Décision | Raison |
|---|---|---|
| `lateness_records` | **Écartée** | Un retard est un `attendance_records.status = LATE` avec `minutes_late`. Une table séparée créerait deux vérités sur la présence. Une **vue** `v_lateness_records` restitue la lecture attendue. |
| `grading_periods` | **Fusionnée** dans `academic_periods` | Un trimestre est une période académique, le drapeau `is_grading_period` suffit. Deux tables désynchroniseraient le calendrier et les bulletins. |
| `messages` | **Reportée** en phase 9 | La V1 livre `announcements` + `notifications`. Une messagerie directe est un module à part entière, la créer vide serait une coquille (§77). |

---

## ADR-012 — Configuration : table générique typée par Zod · ACCEPTÉE

**Décision.** `school_settings(school_id, namespace, settings jsonb)`, une ligne par domaine :
`academic`, `grading`, `attendance`, `schedule`, `reporting`, `notifications`, `access`.

- Les **valeurs par défaut vivent dans le code** (`src/config/defaults/*.ts`), la base ne stocke
  que les **écarts**. La lecture est une fusion profonde défaut puis override.
- Chaque namespace est validé par un **schéma Zod** en écriture et en lecture : le `jsonb` n'est
  jamais un fourre-tout non typé.
- Ajouter un paramètre revient à éditer un schéma Zod, **sans migration**. C'est ce qui rend le
  §57 (« configuration maximale ») tenable dans la durée.

---

## ADR-013 — Le service role Supabase n'est pas le mode de fonctionnement normal · ACCEPTÉE

**Décision.** Le code serveur utilise **la session de l'utilisateur** (clé `anon` + cookies
`@supabase/ssr`) pour toute opération métier. La RLS s'applique donc **aussi** au code serveur,
en défense en profondeur derrière les vérifications RBAC applicatives.

La clé `service_role` est réservée à une liste fermée d'opérations, toutes regroupées dans
`src/lib/supabase/admin.ts` et journalisées : création de comptes Auth, réinitialisation de mot
de passe, workers `pg-boss`, publication d'un emploi du temps, tâches planifiées, import de masse.

**Pourquoi.** C'est le seul moyen d'éviter la dérive classique où tout finit par passer en
`service_role` et où la RLS devient décorative.

---

## ADR-014 — Rester sur le VPS actuel : 1 vCPU est une contrainte de conception · ACCEPTÉE

**Décision (choix explicite du porteur du projet, 10/09/2026).** Pas d'upgrade du VPS. Le
projet se construit et se déploie sur la machine existante — 1 vCPU, 3,8 Go de RAM, 10
applications PM2 déjà en place. L'upgrade se fera plus tard, quand la charge réelle le
justifiera. La majorité des applications hébergées ne sont pas encore ouvertes au grand public.

**Conséquence.** Le budget CPU cesse d'être un réglage d'exploitation pour devenir une
**contrainte d'architecture permanente**. Elle est intégrée aux choix suivants, dès maintenant
et non « à optimiser plus tard ».

| Décision imposée par la contrainte | Détail |
|---|---|
| **Le build ne se fait pas sur le VPS** | `next build` sature l'unique cœur plusieurs minutes. Le build tourne en CI (GitHub Actions), et le déploiement ne fait qu'envoyer l'artefact `standalone` déjà compilé. C'est le gain le plus important, et il est gratuit. |
| **Solveur bridé en dur** | Conteneur `--cpus=0.5 --memory=1g`, `Nice=10`, `num_search_workers=1`. Ces valeurs sont des défauts du dépôt, pas des réglages à ne pas oublier. |
| **Une génération à la fois, globalement** | File pg-boss en singleton sur toute la plateforme, pas par établissement. |
| **Report sous charge** | Avant de démarrer une génération, le worker lit `/proc/loadavg`. Si la charge à 1 minute dépasse un seuil configurable, le job est différé de quelques minutes au lieu d'être lancé. Les autres sites passent avant. |
| **PDF en série** | `PDF_MAX_CONCURRENCY=1`, génération des bulletins en tâche de fond avec progression réelle. Un Chromium à la fois, jamais deux. |
| **Mémoire plafonnée** | `max_memory_restart: "400M"` sur l'app web, `"250M"` sur le worker. 2,5 Go disponibles à partager avec 10 applications. |
| **Pas de mode cluster PM2** | Une seule instance. Le cluster multiplierait la mémoire sans bénéfice sur un seul cœur. |

**Ce que la contrainte ne dégrade pas.** L'isolation, la sécurité, la RLS, le modèle de
données et l'exhaustivité fonctionnelle sont indépendants du CPU. Seuls les **temps de
génération d'emploi du temps** et de **rendu de bulletins en masse** s'allongent.

**Seuil de réévaluation.** À surveiller, sans agir avant : charge à 1 minute durablement
au-dessus de 1,5, ou une génération `LARGE` dépassant 5 minutes. Les mesures du lot 7
donneront le chiffre réel.

---

## Points à trancher avant la phase 5

| # | Sujet | Impact |
|---|---|---|
| Q1 | **Fournisseur SMS** : Orange SMS CI, LeTexto, Twilio, autre, et budget par message | Un adaptateur `SmsProvider` est prêt. Le choix ne bloque que la mise en production réelle des envois. |
| Q2 | **Moyen de paiement des abonnements** : Mobile Money (CinetPay, PayDunya, Flutterwave), virement, ou espèces saisies par le Super Admin | Phase 10. Le schéma `payments` est déjà agnostique. |
| Q3 | **Docker sur le VPS cible** | Absent de la machine de développement. Le service solveur tourne en `venv` en local. Il faut confirmer que le VPS dispose de Docker, sinon prévoir `systemd` + `uvicorn`. |
