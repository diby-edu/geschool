#!/usr/bin/env bash
#
# Deploiement par artefact sur le VPS mutualise.
#
#   pnpm build && bash scripts/deploy.sh
#
# Fonctionne depuis un poste Windows (Git Bash) comme depuis Linux : transfert
# par `tar | ssh`, sans dependance a `rsync`.
#
# Le build a DEJA eu lieu (local ou CI) : ce script ne compile rien sur le
# serveur, `next build` saturerait l'unique vCPU (ADR-014).
#
# Pourquoi une install cote serveur ?
#   La sortie `.next/standalone` de Next, avec pnpm, contient un node_modules
#   fait de liens symboliques ABSOLUS vers le store pnpm du poste de dev :
#   inutilisable ailleurs. On envoie donc l'artefact SANS node_modules, avec le
#   package.json et le lockfile, puis on installe les dependances de PROD en
#   mode « hoisted » (plat) directement sur le serveur — reproductible et
#   autonome.
#
# Deploiement atomique par lien symbolique :
#   /var/www/geschool/
#     releases/<horodatage>/   versions livrees (5 conservees)
#     current -> releases/...   lien actif, lu par PM2
#     shared/.env.local         secrets, hors des releases
#
# Retour arriere = repointer le lien sur la release precedente (automatique si
# la sonde de sante echoue).

set -euo pipefail

VPS_HOST="${VPS_HOST:?VPS_HOST non defini — voir docs/DEPLOYMENT.local.md}"
APP_DIR="${APP_DIR:-/var/www/geschool}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3110/api/health}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
# Node 22 dedie a ce projet (nvm), sans toucher au Node systeme des autres sites.
NODE_BIN="${NODE_BIN:-/root/.nvm/versions/node/v22.23.1/bin}"

RELEASE="$(date +%Y%m%d%H%M%S)"
ART=".next/standalone"

say() { printf '\n==> %s\n' "$1"; }

# --- 1. Verifications locales ------------------------------------------------

[[ -d "$ART" ]] || { echo "Artefact absent : $ART — lancer 'pnpm build'." >&2; exit 1; }
[[ -f "$ART/worker.js" ]] || { echo "worker.js absent — 'pnpm build' doit lancer build:worker." >&2; exit 1; }

say "Assemblage des assets dans l'artefact"
mkdir -p "$ART/.next"
rm -rf "$ART/.next/static"; cp -r .next/static "$ART/.next/static"
[[ -d public ]] && cp -r public "$ART/public"
# Les secrets ne voyagent jamais dans l'artefact.
rm -f "$ART/.env.local"

# --- 2. Envoi ----------------------------------------------------------------

say "Envoi de la release $RELEASE"
ssh "$VPS_HOST" "mkdir -p '$APP_DIR/releases/$RELEASE' '$APP_DIR/shared'"

# Artefact SANS node_modules (installe cote serveur).
tar czf - --exclude=node_modules -C "$ART" . \
  | ssh "$VPS_HOST" "tar xzf - -C '$APP_DIR/releases/$RELEASE'"

# De quoi installer les dependances de prod.
EXTRA=(package.json pnpm-lock.yaml)
[[ -f .npmrc ]] && EXTRA+=(.npmrc)
tar czf - "${EXTRA[@]}" | ssh "$VPS_HOST" "tar xzf - -C '$APP_DIR/releases/$RELEASE'"

# Config PM2 a la racine du projet (lue au premier demarrage).
tar czf - ecosystem.config.cjs | ssh "$VPS_HOST" "tar xzf - -C '$APP_DIR'"

# --- 3. Install, bascule, reload, sonde --------------------------------------

say "Install prod (hoisted) + bascule + reload"
ssh "$VPS_HOST" bash -euo pipefail -s <<REMOTE
export PATH="$NODE_BIN:\$PATH"
APP_DIR="$APP_DIR"; RELEASE="$RELEASE"; HEALTH_URL="$HEALTH_URL"; KEEP_RELEASES="$KEEP_RELEASES"

if [[ ! -f "\$APP_DIR/shared/.env.local" ]]; then
  echo "shared/.env.local absent sur le serveur : le creer une fois depuis .env.example." >&2
  exit 1
fi

corepack enable >/dev/null 2>&1 || true
cd "\$APP_DIR/releases/\$RELEASE"

echo "-> pnpm install --prod (hoisted)"
pnpm install --prod --frozen-lockfile --node-linker=hoisted --ignore-scripts

ln -sfn "\$APP_DIR/shared/.env.local" "\$APP_DIR/releases/\$RELEASE/.env.local"

PREVIOUS=""
[[ -L "\$APP_DIR/current" ]] && PREVIOUS="\$(readlink -f "\$APP_DIR/current")"
ln -sfn "\$APP_DIR/releases/\$RELEASE" "\$APP_DIR/current"

# reload si le process existe (attend la nouvelle instance avant de retirer
# l'ancienne), sinon premier demarrage.
reload_or_start() {
  if pm2 describe "\$1" >/dev/null 2>&1; then
    pm2 reload "\$1" --update-env
  else
    pm2 start "\$APP_DIR/ecosystem.config.cjs" --only "\$1"
  fi
}
reload_or_start geschool
reload_or_start geschool-worker

# --- Sonde de sante, avec retour arriere automatique du web ---
if curl -sf --retry 15 --retry-connrefused --retry-delay 1 "\$HEALTH_URL" >/dev/null; then
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

pm2 save --force >/dev/null
REMOTE

say "Release $RELEASE deployee"

cat <<'NOTE'

Les migrations ne sont PAS jouees par ce script. Si necessaire, avant la bascule :
  ssh $VPS_HOST 'cd /var/www/geschool/current && pnpm db:check && pnpm db:migrate'
NOTE
