# Documentation

SaaS multi-tenant de gestion d'établissements scolaires.

## Ordre de lecture

| Document | Contenu | À lire quand |
|---|---|---|
| [`DECISIONS.md`](./DECISIONS.md) | **13 arbitrages** et les conflits du cahier des charges signalés et tranchés | En premier, toujours |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | Stack, arborescence, quatre barrières d'isolation, jobs, déploiement | Avant d'écrire la moindre ligne |
| [`DATABASE.md`](./DATABASE.md) | Modèle de données complet, RLS, index, ordre des migrations | Phase 2 |
| [`RBAC.md`](./RBAC.md) | Rôles, permissions atomiques, périmètres, matrice, tests | Phase 3 |
| [`ACCESS_MANAGEMENT.md`](./ACCESS_MANAGEMENT.md) | Comptes parents et élèves, identifiants, SMS, activation | Phase 4 |
| [`SCHEDULE_ENGINE.md`](./SCHEDULE_ENGINE.md) | Moteur d'emploi du temps, contraintes, CP-SAT, diagnostic | Phase 5 |
| [`SOLVER_API.md`](./SOLVER_API.md) | Contrat figé TypeScript ↔ Python | Phase 5 |
| [`OFFLINE_SYNC.md`](./OFFLINE_SYNC.md) | Hors connexion, idempotence, synchronisation | Phases 4 et 7 |
| [`ROADMAP.md`](./ROADMAP.md) | Phases produit, jalons, définition de « terminé » | Pour planifier |
| [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) | Plan d'exécution : 13 lots, critères d'acceptation, risques | Pour piloter |
| [`DEPLOYMENT.md`](./DEPLOYMENT.md) | Audit du VPS, ports réservés, procédure, cohabitation | Avant tout déploiement |

Variables d'environnement : [`.env.example`](../.env.example) à la racine.

## Règles non négociables

1. Une seule application, plusieurs espaces selon le rôle
2. Isolation stricte des établissements, garantie par quatre couches indépendantes
3. RBAC : permission **et** périmètre, vérifiés côté serveur
4. RLS activée et forcée sur chaque table tenant
5. `schedule_sessions` est la source de vérité unique de l'emploi du temps
6. Aucune règle pédagogique codée en dur : tout est configurable
7. Aucun secret persisté, aucun mot de passe en clair
8. Pas de dédoublement, pas de semaines A/B, pas d'alternance, pas de cahier de texte
9. Pas de bouton mort, pas de « bientôt disponible », pas de fausse donnée
10. Toute fonctionnalité déclarée livrée est réellement fonctionnelle
