#!/usr/bin/env bash
#
# Deploiement par artefact sur le VPS mutualise.
#
#   bash scripts/deploy.sh
#
# Le build a DEJA eu lieu (en local ou en CI). Ce script ne compile rien sur le
# serveur : `next build` saturerait l'unique vCPU plusieurs minutes et
# ralentirait les huit sites en production (ADR-014).
#
# Deploiement atomique par lien symbolique :
#
#   /var/www/geschool/
#     releases/<horodatage>/     versions livrees
#     current -> releases/...    lien actif, lu par PM2
#     shared/.env.local          secrets, hors des releases
#
# Retour arriere = repointer le lien sur la release precedente.

set -euo pipefail

VPS_HOST="${VPS_HOST:?VPS_HOST non defini — voir docs/DEPLOYMENT.local.md}"
APP_DIR="${APP_DIR:-/var/www/geschool}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3110/api/health}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"

RELEASE="$(date +%Y%m%d%H%M%S)"
LOCAL_ARTIFACT=".next/standalone"

say() { printf '\n==> %s\n' "$1"; }

# --- 1. Verifications locales ------------------------------------------------

if [[ ! -d "$LOCAL_ARTIFACT" ]]; then
  echo "Artefact absent : $LOCAL_ARTIFACT" >&2
  echo "Lancer d'abord : pnpm build" >&2
  exit 1
fi

if [[ ! -d "$LOCAL_ARTIFACT/.next/static" ]]; then
  say "Assemblage des assets dans l'artefact"
  mkdir -p "$LOCAL_ARTIFACT/.next"
  cp -r .next/static "$LOCAL_ARTIFACT/.next/static"
  [[ -d public ]] && cp -r public "$LOCAL_ARTIFACT/public"
fi

# Le secret ne voyage jamais dans l'artefact : il vit dans shared/ sur le VPS.
rm -f "$LOCAL_ARTIFACT/.env.local"

# --- 2. Envoi ----------------------------------------------------------------

say "Envoi de la release $RELEASE"
ssh "$VPS_HOST" "mkdir -p '$APP_DIR/releases/$RELEASE' '$APP_DIR/shared'"

rsync -az --delete \
  "$LOCAL_ARTIFACT/" \
  "$VPS_HOST:$APP_DIR/releases/$RELEASE/"

# --- 3. Bascule --------------------------------------------------------------

say "Bascule et redemarrage"
ssh "$VPS_HOST" bash -euo pipefail -s <<REMOTE
APP_DIR="$APP_DIR"
RELEASE="$RELEASE"
HEALTH_URL="$HEALTH_URL"
KEEP_RELEASES="$KEEP_RELEASES"

if [[ ! -f "\$APP_DIR/shared/.env.local" ]]; then
  echo "shared/.env.local absent sur le serveur." >&2
  echo "Le creer une fois depuis .env.example, puis relancer." >&2
  exit 1
fi

ln -sfn "\$APP_DIR/shared/.env.local" "\$APP_DIR/releases/\$RELEASE/.env.local"

PREVIOUS=""
if [[ -L "\$APP_DIR/current" ]]; then
  PREVIOUS="\$(readlink -f "\$APP_DIR/current")"
fi

ln -sfn "\$APP_DIR/releases/\$RELEASE" "\$APP_DIR/current"

# reload et non restart : PM2 attend que la nouvelle instance reponde avant de
# retirer l'ancienne. Sur un vCPU unique, c'est aussi ce qui evite un pic.
pm2 reload geschool --update-env
pm2 reload geschool-worker --update-env

# --- Controle de sante, avec retour arriere automatique ---
if curl -sf --retry 15 --retry-connrefused --retry-delay 1 "\$HEALTH_URL" > /dev/null; then
  echo "Sonde de sante : OK"
else
  echo "Sonde de sante EN ECHEC — retour arriere" >&2
  if [[ -n "\$PREVIOUS" ]]; then
    ln -sfn "\$PREVIOUS" "\$APP_DIR/current"
    pm2 reload geschool --update-env
    echo "Revenu sur \$PREVIOUS" >&2
  fi
  exit 1
fi

# Purge des anciennes releases
cd "\$APP_DIR/releases"
ls -1dt */ 2>/dev/null | tail -n "+\$((KEEP_RELEASES + 1))" | xargs -r rm -rf
echo "Releases conservees : \$(ls -1d */ 2>/dev/null | wc -l)"

pm2 save --force > /dev/null
REMOTE

say "Release $RELEASE deployee"

# --- 4. Rappel ---------------------------------------------------------------
cat <<'NOTE'

Les migrations ne sont PAS jouees par ce script : elles doivent l'etre
sciemment, et avant la bascule si elles sont incompatibles avec la version
precedente.

  ssh VPS 'cd /var/www/geschool/current && pnpm db:migrate'
NOTE
