# Gestion Scolaire

SaaS multi-tenant de gestion d'établissements scolaires. Plusieurs établissements
indépendants partagent la même plateforme, avec une isolation stricte de leurs données.

**État : lot 1 terminé** — socle technique en place. Le plan complet est dans
[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

---

## Documentation

Tout est dans [`docs/`](docs/README.md). À lire dans cet ordre :

1. [`DECISIONS.md`](docs/DECISIONS.md) — **14 arbitrages**, et les conflits du cahier des
   charges signalés puis tranchés. À lire en premier, toujours.
2. [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) — stack, arborescence, quatre barrières d'isolation
3. [`DATABASE.md`](docs/DATABASE.md) — modèle de données, RLS, migrations
4. [`RBAC.md`](docs/RBAC.md) — rôles, permissions, périmètres
5. [`IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — 13 lots, critères d'acceptation
6. [`DEPLOYMENT.md`](docs/DEPLOYMENT.md) — audit du VPS, ports réservés, procédure

---

## Démarrer

```bash
pnpm install
cp .env.example .env.local     # puis renseigner les valeurs Supabase
pnpm dev
```

Node 22+ et pnpm 11+ requis.

## Commandes

| Commande | Rôle |
|---|---|
| `pnpm dev` | Serveur de développement |
| `pnpm build` | Build de production (artefact `standalone`) |
| `pnpm verify` | Types + lint + tests — à passer avant tout commit |
| `pnpm typecheck` | TypeScript strict, sans émission |
| `pnpm lint` | ESLint, tolérance zéro avertissement |
| `pnpm test` | Tests unitaires (Vitest) |
| `pnpm test:rls` | Tests d'isolation multi-tenant (lot 2) |
| `pnpm test:e2e` | Tests de bout en bout (Playwright) |
| `pnpm db:migrate` | Applique les migrations SQL |
| `pnpm db:status` | Liste les migrations sans rien appliquer |
| `pnpm db:types` | Régénère `src/types/database.ts` depuis la base |
| `pnpm worker` | Worker pg-boss (jobs de fond) |

## Stack

Next.js 16 · React 19 · TypeScript 5.9 strict · Tailwind 4 · Supabase (PostgreSQL + RLS +
Auth + Storage) · Zod 4 · pg-boss · OR-Tools CP-SAT (service Python, lot 7) · Vitest ·
Playwright

## Règles non négociables

1. Isolation stricte des établissements, garantie par quatre couches indépendantes
2. RBAC : permission **et** périmètre, vérifiés côté serveur
3. RLS activée et forcée sur chaque table portant un `school_id`
4. `schedule_sessions` est la source de vérité unique de l'emploi du temps
5. Aucune règle pédagogique codée en dur : tout est configurable
6. Aucun secret persisté, aucun mot de passe en clair
7. La clé `service_role` reste cloisonnée — une règle ESLint le vérifie
8. Pas de bouton mort, pas de « bientôt disponible », pas de fausse donnée
9. Toute fonctionnalité déclarée livrée est réellement fonctionnelle
