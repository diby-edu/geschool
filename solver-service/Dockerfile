# Service solveur — image minimale, utilisateur non privilégié (docs/SOLVER_API.md §11).
#
# N'embarque AUCUNE variable Supabase : le solveur n'a structurellement aucun
# moyen d'atteindre la base. Il n'écoute que sur le réseau interne ; la
# publication de port se fait côté hôte en 127.0.0.1 uniquement (ADR-014).
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dépendances d'abord : la couche est mise en cache tant que requirements ne change pas.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Utilisateur non privilégié.
RUN useradd --create-home --uid 10001 solver
USER solver

EXPOSE 8110

# Le port interne du conteneur ; la limitation à 127.0.0.1 se fait à la publication.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8110", "--workers", "1"]
