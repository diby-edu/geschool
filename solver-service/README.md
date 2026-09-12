# solver-service

Service d'ordonnancement d'emploi du temps (OR-Tools CP-SAT), derrière l'interface
`ScheduleSolver` de l'application. Voir le contrat complet : [`docs/SOLVER_API.md`](../docs/SOLVER_API.md).

Le service ne connaît **ni Supabase, ni le métier, ni les identifiants réels** : il reçoit un
problème en indices compacts et rend une solution en indices. Il n'écoute que sur le réseau privé,
protégé par un secret partagé.

## Développement local

```bash
cd solver-service
python -m venv .venv
.venv/Scripts/pip install -r requirements-dev.txt      # Windows
# source .venv/bin/activate && pip install -r requirements-dev.txt   # Linux/macOS

# Lancer le service (secret facultatif en local : vide = pas d'auth)
SOLVER_SHARED_SECRET=dev-local-solver-secret .venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8110

# Tests
.venv/Scripts/python -m pytest
```

Côté application, pointer `.env.local` vers le service :

```
SOLVER_SERVICE_URL=http://127.0.0.1:8110
SOLVER_SHARED_SECRET=dev-local-solver-secret
```

## Endpoints

| Méthode | Chemin | Rôle |
|---|---|---|
| `GET`  | `/health`   | vivacité + versions (OR-Tools, Python, contrat) |
| `POST` | `/solve`    | résolution complète (ou diagnostic si infaisable) |
| `POST` | `/diagnose` | diagnostic d'infaisabilité seul |

Authentification : en-tête `X-Solver-Secret` (comparaison à temps constant). Si
`SOLVER_SHARED_SECRET` est vide, l'authentification est désactivée (développement uniquement).

## Déploiement (VPS)

```bash
SOLVER_SHARED_SECRET=... docker compose up -d --build
```

Le port est publié **uniquement sur `127.0.0.1:8110`** (ne jamais utiliser `8110:8110`, cela
contournerait UFW — ADR-014). Le conteneur tourne en utilisateur non privilégié, système de fichiers
en lecture seule, sans aucune variable Supabase.

## Structure

```
app/
  models.py   contrat Pydantic (miroir du Zod côté TypeScript)
  solver.py   modèle CP-SAT (intervalles + NoOverlap par ressource, noyau d'infaisabilité)
  main.py     application FastAPI (auth, /health, /solve, /diagnose)
tests/        pytest (moteur + HTTP)
```
